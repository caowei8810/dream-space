#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ -f "$ROOT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  . "$ROOT_DIR/.env"
  set +a
fi

POSTGRES_BIN="/opt/homebrew/opt/postgresql@17/bin"
POSTGRES_PORT="${DREAMSPACE_POSTGRES_PORT:-5432}"
DB_ROLE="dreamspace"
DB_NAME="dreamspace"
DB_PASSWORD="${DREAMSPACE_DB_PASSWORD:-}"

REDIS_RUNTIME_DIR="$ROOT_DIR/.local/redis"
REDIS_CONFIG="$ROOT_DIR/infrastructure/local/redis.conf"
REDIS_PID="$REDIS_RUNTIME_DIR/redis.pid"
REDIS_LOG="$REDIS_RUNTIME_DIR/redis.log"

MINIO_RUNTIME_DIR="$ROOT_DIR/.local/minio"
MINIO_DATA_DIR="$MINIO_RUNTIME_DIR/data"
MINIO_PID="$MINIO_RUNTIME_DIR/minio.pid"
MINIO_LOG="$MINIO_RUNTIME_DIR/minio.log"
MINIO_MC_CONFIG="$MINIO_RUNTIME_DIR/mc"
MINIO_ENV_FILE="$MINIO_RUNTIME_DIR/runtime.env"
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
  elif command -v "$1" >/dev/null 2>&1; then
    command -v "$1"
  else
    echo "缺少 PostgreSQL 命令：$1" >&2
    echo "请先执行：brew install postgresql@17" >&2
    exit 1
  fi
}

wait_for_postgres() {
  PSQL=$(postgres_command psql)
  attempts=0
  until "$PSQL" -d postgres -tAc "SELECT 1" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "PostgreSQL 启动超时，请检查：brew services list" >&2
      exit 1
    fi
    sleep 1
  done
}

start_postgres() {
  require_command brew brew
  if ! brew services list | awk '$1 == "postgresql@17" && $2 == "started" { found = 1 } END { exit !found }'; then
    brew services start postgresql@17
  fi
  wait_for_postgres

  PSQL=$(postgres_command psql)
  CREATEUSER=$(postgres_command createuser)
  CREATEDB=$(postgres_command createdb)

  if ! "$PSQL" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '$DB_ROLE'" | grep -q 1; then
    "$CREATEUSER" --login "$DB_ROLE"
  fi
  if [ -n "$DB_PASSWORD" ]; then
    "$PSQL" -d postgres -v ON_ERROR_STOP=1 -v db_password="$DB_PASSWORD" >/dev/null <<'SQL'
ALTER ROLE dreamspace WITH PASSWORD :'db_password';
SQL
  fi

  if ! "$PSQL" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$DB_NAME'" | grep -q 1; then
    "$CREATEDB" --owner="$DB_ROLE" "$DB_NAME"
  fi
}

stop_postgres() {
  if command -v brew >/dev/null 2>&1; then
    brew services stop postgresql@17 >/dev/null
  fi
}

start_redis() {
  require_command redis-server redis
  require_command redis-cli redis
  mkdir -p "$REDIS_RUNTIME_DIR"

  if redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; then
    return
  fi

  redis-server "$REDIS_CONFIG" \
    --dir "$REDIS_RUNTIME_DIR" \
    --pidfile "$REDIS_PID" \
    --logfile "$REDIS_LOG"

  attempts=0
  until redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 20 ]; then
      echo "Redis 启动超时，日志：$REDIS_LOG" >&2
      tail -n 40 "$REDIS_LOG" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
}

stop_redis() {
  if [ -f "$REDIS_PID" ]; then
    redis-cli -h 127.0.0.1 -p 6379 shutdown save >/dev/null 2>&1 || true
    rm -f "$REDIS_PID"
  fi
}

load_or_create_minio_credentials() {
  if [ -n "$MINIO_ROOT_USER" ] && [ -n "$MINIO_ROOT_PASSWORD" ]; then
    return
  fi
  if [ -f "$MINIO_ENV_FILE" ]; then
    # shellcheck disable=SC1090
    . "$MINIO_ENV_FILE"
    MINIO_ROOT_USER="$DREAMSPACE_MINIO_ROOT_USER"
    MINIO_ROOT_PASSWORD="$DREAMSPACE_MINIO_ROOT_PASSWORD"
    return
  fi

  require_command openssl openssl
  MINIO_ROOT_USER="dreamspace-$(openssl rand -hex 6)"
  MINIO_ROOT_PASSWORD="$(openssl rand -hex 16)"
  umask 077
  {
    echo "DREAMSPACE_MINIO_ROOT_USER=$MINIO_ROOT_USER"
    echo "DREAMSPACE_MINIO_ROOT_PASSWORD=$MINIO_ROOT_PASSWORD"
  } >"$MINIO_ENV_FILE"
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
  mkdir -p "$MINIO_DATA_DIR" "$MINIO_MC_CONFIG"
  load_or_create_minio_credentials

  if ! curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null 2>&1; then
    MINIO_ROOT_USER="$MINIO_ROOT_USER" MINIO_ROOT_PASSWORD="$MINIO_ROOT_PASSWORD" \
      nohup minio server --address ":9000" --console-address ":9001" "$MINIO_DATA_DIR" \
      >"$MINIO_LOG" 2>&1 &
    echo $! >"$MINIO_PID"
  fi

  attempts=0
  until curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 30 ]; then
      echo "MinIO 启动超时，日志：$MINIO_LOG" >&2
      tail -n 40 "$MINIO_LOG" 2>/dev/null || true
      exit 1
    fi
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
  "$(postgres_command pg_isready)" -h 127.0.0.1 -p "$POSTGRES_PORT"
  redis-cli -h 127.0.0.1 -p 6379 ping
  curl -fsS "$MINIO_ENDPOINT/minio/health/live" >/dev/null
  echo "MinIO ready: $MINIO_ENDPOINT bucket=$MINIO_BUCKET"
}

start_all() {
  start_postgres
  start_redis
  start_minio
  status
}

stop_all() {
  stop_minio
  stop_redis
  stop_postgres
}

case "${1:-}" in
  up)
    start_all
    ;;
  down)
    stop_all
    ;;
  restart)
    stop_all
    start_all
    ;;
  status)
    status
    ;;
  *)
    echo "用法：$0 {up|down|restart|status}"
    exit 1
    ;;
esac
