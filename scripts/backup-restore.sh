#!/bin/sh

set -eu

usage() {
  echo "Usage: $0 backup|verify|restore BACKUP_DIR [--confirm]" >&2
  exit 2
}

command_name="${1:-}"
backup_dir="${2:-}"
[ -n "$command_name" ] && [ -n "$backup_dir" ] || usage
case "$command_name" in
  backup|verify|restore) ;;
  *) usage ;;
esac
case "$backup_dir" in
  /*) ;;
  *) echo "BACKUP_DIR must be an absolute path" >&2; exit 2 ;;
esac

DATABASE_URL="${DATABASE_URL:-${DREAMSPACE_DATABASE_URL:-}}"
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL is required" >&2; exit 2; }

db_dump="$backup_dir/postgres.dump"
object_dir="$backup_dir/objects"
manifest="$backup_dir/objects.sha256"
references="$backup_dir/database-object-keys.txt"

require_command() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing command: $1" >&2; exit 2; }
}

backup_database() {
  require_command pg_dump
  require_command psql
  if [ -e "$backup_dir" ] && [ -n "$(find "$backup_dir" -mindepth 1 -print -quit)" ]; then
    echo "backup directory must be empty: $backup_dir" >&2
    exit 2
  fi
  mkdir -p "$backup_dir"
  umask 077
  pg_dump --format=custom --file="$db_dump" "$DATABASE_URL"
  psql "$DATABASE_URL" --no-psqlrc --tuples-only --no-align --command '
    SELECT "objectKey" FROM "ReferenceUpload" WHERE "deletedAt" IS NULL
    UNION SELECT "objectKey" FROM "GenerationResult" WHERE "objectKey" IS NOT NULL
    UNION SELECT "thumbnailObjectKey" FROM "GenerationResult" WHERE "thumbnailObjectKey" IS NOT NULL
    ORDER BY 1
  ' >"$references"
}

backup_objects() {
  if [ "${OBJECT_STORAGE_MODE:-local}" = "local" ]; then
    local_dir="${LOCAL_STORAGE_DIR:-}"
    [ -n "$local_dir" ] && [ -d "$local_dir" ] || return 0
    mkdir -p "$object_dir"
    cp -R "$local_dir"/. "$object_dir"/
    return 0
  fi
  require_command mc
  : "${S3_ENDPOINT:?S3_ENDPOINT is required for S3 backups}"
  : "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required for S3 backups}"
  : "${S3_SECRET_KEY:?S3_SECRET_KEY is required for S3 backups}"
  : "${S3_BUCKET:?S3_BUCKET is required for S3 backups}"
  mkdir -p "$object_dir"
  mc alias set dreamspace-backup "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
  mc mirror --overwrite "dreamspace-backup/$S3_BUCKET" "$object_dir"
}

write_manifest() {
  require_command shasum
  mkdir -p "$object_dir"
  : >"$manifest"
  (cd "$object_dir" && find . -type f -exec shasum -a 256 {} \;) >"$manifest"
}

verify_backup() {
  require_command pg_restore
  [ -s "$db_dump" ] || { echo "missing PostgreSQL dump: $db_dump" >&2; exit 1; }
  pg_restore --list "$db_dump" >/dev/null
  [ -f "$manifest" ] || { echo "missing object manifest: $manifest" >&2; exit 1; }
  (cd "$object_dir" && shasum -a 256 -c "$manifest")
  [ -f "$references" ] || { echo "missing database object references: $references" >&2; exit 1; }
  while IFS= read -r object_key; do
    [ -n "$object_key" ] || continue
    case "$object_key" in
      /*|../*|*/../*|*/..) echo "unsafe object key in database: $object_key" >&2; exit 1 ;;
    esac
    [ -f "$object_dir/$object_key" ] || {
      echo "database object is missing from backup: $object_key" >&2
      exit 1
    }
  done <"$references"
  echo "backup verified: $backup_dir"
}

restore_backup() {
  [ "${3:-}" = "--confirm" ] || { echo "restore requires --confirm" >&2; exit 2; }
  require_command pg_restore
  verify_backup
  if [ "${OBJECT_STORAGE_MODE:-local}" = "local" ]; then
    local_dir="${LOCAL_STORAGE_DIR:-}"
    [ -n "$local_dir" ] || { echo "LOCAL_STORAGE_DIR is required for local object restore" >&2; exit 2; }
    if [ -e "$local_dir" ] && [ -n "$(find "$local_dir" -mindepth 1 -print -quit)" ]; then
      echo "local restore target must be empty: $local_dir" >&2
      exit 2
    fi
  fi
  pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" "$db_dump"
  if [ "${OBJECT_STORAGE_MODE:-local}" = "local" ]; then
    mkdir -p "$local_dir"
    cp -R "$object_dir"/. "$local_dir"/
  else
    require_command mc
    : "${S3_ENDPOINT:?S3_ENDPOINT is required for S3 restore}"
    : "${S3_ACCESS_KEY:?S3_ACCESS_KEY is required for S3 restore}"
    : "${S3_SECRET_KEY:?S3_SECRET_KEY is required for S3 restore}"
    : "${S3_BUCKET:?S3_BUCKET is required for S3 restore}"
    mc alias set dreamspace-restore "$S3_ENDPOINT" "$S3_ACCESS_KEY" "$S3_SECRET_KEY" >/dev/null
    mc mirror --overwrite "$object_dir" "dreamspace-restore/$S3_BUCKET"
  fi
  echo "backup restored: $backup_dir"
}

case "$command_name" in
  backup)
    backup_database
    backup_objects
    write_manifest
    verify_backup
    ;;
  verify) verify_backup ;;
  restore) restore_backup "$@" ;;
esac
