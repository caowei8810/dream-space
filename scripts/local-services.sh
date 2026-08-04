#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi
RUNTIME_DIR="$ROOT_DIR/.local/redis"
REDIS_CONFIG="$ROOT_DIR/infrastructure/local/redis.conf"
REDIS_PID="$RUNTIME_DIR/redis.pid"
REDIS_LOG="$RUNTIME_DIR/redis.log"
POSTGRES_BIN="/opt/homebrew/opt/postgresql@17/bin"
DB_ROLE="dreamspace"
DB_NAME="dreamspace"
DB_PASSWORD="${DREAMSPACE_DB_PASSWORD:-}"
MINIO_RUNTIME_DIR="$ROOT_DIR/.local/minio"
MINIO_DATA_DIR="$MINIO_RUNTIME_DIR/data"
MINIO_PID="$MINIO_RUNTIME_DIR/minio.pid"
MINIO_LOG="$MINIO_RUNTIME_DIR/minio.log"
MINIO_MC_CONFIG="$MINIO_RUNTIME_DIR/mc"
MINIO_ENDPOINT="${DREAMSPACE_MINIO_ENDPOINT:-http://127.0.0.1:9000}"
MINIO_BUCKET="${DREAMSPACE_MINIO_BUCKET:-dreamspace-local}"
MINIO_ROOT_USER="${DREAMSPACE_MINIO_ROOT_USER:-${S3_ACCESS_KEY:-}}"
MINIO_ROOT_PASSWORD="${DREAMSPACE_MINIO_ROOT_PASSWORD:-${S3_SECRET_KEY:-}}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    echo "请先执行：brew install $2"
    exit 1
  fi
}

postgres_command() {
  if [ -x "$POSTGRES_BIN/$1" ]; then
    echo "$POSTGRES_BIN/$1"
  else
    command -v "$1"
  fi
}

start_postgres() {
  require_command brew brew
  if ! brew services list | awk '$1 == "postgresql@17" && $2 == "started" { found = 1 } END { exit !found }'; then
    brew services start postgresql@17
  fi

  PSQL=$(postgres_command psql)
  CREATEUSER=$(postgres_command createuser)
  CREATEDB=$(postgres_command createdb)

  until "$PSQL" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; do
    sleep 1
  done

  if ! "$PSQL" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'" | grep -q 1; then
    "$CREATEUSER" --login "$DB_ROLE"
  fi
  if [ -n "$DB_PASSWORD" ]; then
    "$PSQL" -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE $DB_ROLE WITH PASSWORD '$DB_PASSWORD'" >/dev/null
  fi

  if ! "$PSQL" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    "$CREATEDB" --owner="$DB_ROLE" "$DB_NAME"
  fi
}

start_redis() {
  require_command redis-server redis
  require_command redis-cli redis
  mkdir -p "$RUNTIME_DIR"

  if redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    return
  fi

  redis-server "$REDIS_CONFIG" \
    --dir "$RUNTIME_DIR" \
    --pidfile "$REDIS_PID" \
    --logfile "$REDIS_LOG"

  until redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; do
    sleep 1
  done
}

stop_redis() {
  if [ -f "$REDIS_PID" ]; then
    redis-cli -h 127.0.0.1 -p 6379 shutdown save >/dev/null 2>&1 || true
  fi
}

configure_minio() {
  MC_CONFIG_DIR="$MINIO_MC_CONFIG" mc alias set dreamspace "$MINIO_ENDPOINT" \
    "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null
  MC_CONFIG_DIR="$MINIO_MC_CONFIG" mc mb --ignore-existing "dreamspace/$MINIO_BUCKET" >/dev/null
}

start_minio() {
  require_command minio minio
  require_command mc minio-mc
  require_command curl curl
  if [ -z "$MINIO_ROOT_USER" ] || [ -z "$MINIO_ROOT_PASSWORD" ]; then
    echo "缺少 MinIO 本地凭据：请在未提交的 .env 中设置 S3_ACCESS_KEY 和 S3_SECRET_KEY"
    exit 1
  fi
  mkdir -p "$MINIO_DATA_DIR" "$MINIO_MC_CONFIG"

  if ! curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null 2>&1; then
    MINIO_ROOT_USER="$MINIO_ROOT_USER" MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
      nohup minio server --address ":9000" --console-address ":9001" "$MINIO_DATA_DIR" \
      >"$MINIO_LOG" 2>&1 &
    echo $! >"$MINIO_PID"
  fi

  until curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null 2>&1; do
    sleep 1
  done
  configure_minio
}

stop_minio() {
  if [ -f "$MINIO_PID" ]; then
    pid=$(cat "$MINIO_PID")
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid"
    fi
    rm -f "$MINIO_PID"
  fi
}

status() {
  PG_ISREADY=$(postgres_command pg_isready)
  "$PG_ISREADY" -h 127.0.0.1 -p 5432
  redis-cli -h 127.0.0.1 -p 6379 ping
  curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null
  echo "MinIO ready: $MINIO_ENDPOINT bucket=$MINIO_BUCKET"
}

case "${1:-}" in
  up)
    start_postgres
    start_redis
    start_minio
    status
    ;;
  down)
    stop_redis
    stop_minio
    brew services stop postgresql@17
    ;;
  status)
    status
    ;;
  *)
    echo "用法：$0 {up|down|status}"
    exit 1
    ;;
esac
