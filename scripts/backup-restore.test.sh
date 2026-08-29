#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
TEST_DIR=$(mktemp -d "${TMPDIR:-/tmp}/dreamspace-backup-test.XXXXXX")
trap 'rm -rf "$TEST_DIR"' EXIT INT TERM

bin_dir="$TEST_DIR/bin"
source_dir="$TEST_DIR/source"
backup_dir="$TEST_DIR/backup"
restore_dir="$TEST_DIR/restore"
mkdir -p "$bin_dir" "$source_dir/references/user-1" "$source_dir/results/task-1"
printf 'reference' >"$source_dir/references/user-1/input.webp"
printf 'result' >"$source_dir/results/task-1/0.webp"

printf '%s\n' '#!/bin/sh' 'for arg in "$@"; do case "$arg" in --file=*) dump=${arg#--file=} ;; esac; done' 'printf dump >"$dump"' >"$bin_dir/pg_dump"
printf '%s\n' '#!/bin/sh' 'printf "%s\n" references/user-1/input.webp results/task-1/0.webp' >"$bin_dir/psql"
printf '%s\n' '#!/bin/sh' 'if [ "${1:-}" = "--list" ]; then test -s "$2"; exit; fi' 'printf restored >"$RESTORE_LOG"' >"$bin_dir/pg_restore"
chmod +x "$bin_dir/pg_dump" "$bin_dir/psql" "$bin_dir/pg_restore"

run() {
  PATH="$bin_dir:$PATH" DATABASE_URL=postgresql://example/test OBJECT_STORAGE_MODE=local \
    LOCAL_STORAGE_DIR="${LOCAL_STORAGE_DIR:-$source_dir}" RESTORE_LOG="$TEST_DIR/restore.log" \
    sh "$ROOT_DIR/scripts/backup-restore.sh" "$@"
}

run backup "$backup_dir" >/dev/null
run verify "$backup_dir" >/dev/null
[ -s "$backup_dir/postgres.dump" ]
[ -s "$backup_dir/objects.sha256" ]
[ -s "$backup_dir/database-object-keys.txt" ]

mv "$backup_dir/objects/results/task-1/0.webp" "$TEST_DIR/missing.webp"
if run verify "$backup_dir" >/dev/null 2>&1; then
  echo "verify accepted a missing database object" >&2
  exit 1
fi
mv "$TEST_DIR/missing.webp" "$backup_dir/objects/results/task-1/0.webp"

if run restore "$backup_dir" >/dev/null 2>&1; then
  echo "restore did not require explicit confirmation" >&2
  exit 1
fi

printf occupied >"$restore_dir"
if (LOCAL_STORAGE_DIR="$restore_dir" run restore "$backup_dir" --confirm) >/dev/null 2>&1; then
  echo "restore accepted a non-empty object target" >&2
  exit 1
fi
rm "$restore_dir"
mkdir -p "$restore_dir"
PATH="$bin_dir:$PATH" DATABASE_URL=postgresql://example/test OBJECT_STORAGE_MODE=local \
  LOCAL_STORAGE_DIR="$restore_dir" RESTORE_LOG="$TEST_DIR/restore.log" \
  sh "$ROOT_DIR/scripts/backup-restore.sh" restore "$backup_dir" --confirm >/dev/null
[ -f "$restore_dir/references/user-1/input.webp" ]
[ -f "$restore_dir/results/task-1/0.webp" ]
[ -f "$TEST_DIR/restore.log" ]

echo "backup/restore script tests passed"
