#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME_DIR="$ROOT_DIR/.local/redis"
REDIS_CONFIG="$ROOT_DIR/infrastructure/local/redis.conf"
REDIS_PID="$RUNTIME_DIR/redis.pid"
REDIS_LOG="$RUNTIME_DIR/redis.log"
POSTGRES_BIN="/opt/homebrew/opt/postgresql@17/bin"
DB_ROLE="dreamspace"
DB_NAME="dreamspace"
DB_PASSWORD="${DREAMSPACE_DB_PASSWORD:-}"

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

status() {
  PG_ISREADY=$(postgres_command pg_isready)
  "$PG_ISREADY" -h 127.0.0.1 -p 5432
  redis-cli -h 127.0.0.1 -p 6379 ping
}

case "${1:-}" in
  up)
    start_postgres
    start_redis
    status
    ;;
  down)
    stop_redis
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
