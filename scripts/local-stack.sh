#!/bin/sh

set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
RUNTIME_DIR="$ROOT_DIR/.local/apps"
PNPM="pnpm --config.verify-deps-before-run=warn"

mkdir -p "$RUNTIME_DIR"

wait_for_url() {
  name="$1"
  url="$2"
  log_file="$3"
  attempts=0
  until curl -fsS "$url" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      echo "$name 启动超时，日志：$log_file" >&2
      tail -n 60 "$log_file" 2>/dev/null || true
      exit 1
    fi
    sleep 1
  done
}

is_running() {
  pid_file="$1"
  [ -f "$pid_file" ] && kill -0 "$(cat "$pid_file")" >/dev/null 2>&1
}

start_app() {
  name="$1"
  package_name="$2"
  pid_file="$RUNTIME_DIR/$name.pid"
  log_file="$RUNTIME_DIR/$name.log"
  if is_running "$pid_file"; then
    return
  fi
  rm -f "$pid_file"
  (
    cd "$ROOT_DIR"
    nohup sh -c "exec $PNPM --filter $package_name dev" >"$log_file" 2>&1 &
    echo $! >"$pid_file"
  )
}

stop_process_tree() {
  pid="$1"
  children=$(pgrep -P "$pid" 2>/dev/null || true)
  kill "$pid" >/dev/null 2>&1 || true
  for child in $children; do
    stop_process_tree "$child"
  done
  attempts=0
  while kill -0 "$pid" >/dev/null 2>&1 && [ "$attempts" -lt 20 ]; do
    attempts=$((attempts + 1))
    sleep 0.1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}

stop_app() {
  name="$1"
  pid_file="$RUNTIME_DIR/$name.pid"
  if is_running "$pid_file"; then
    stop_process_tree "$(cat "$pid_file")"
  fi
  rm -f "$pid_file"
  stop_orphaned_app "$name"
}

stop_orphaned_app() {
  name="$1"
  case "$name" in
    api|worker)
      pattern="$ROOT_DIR/apps/$name/node_modules/.bin/../tsx/dist/cli.mjs watch src/main.ts"
      ;;
    web|admin)
      pattern="$ROOT_DIR/apps/$name/node_modules/.bin/../next/dist/bin/next dev"
      ;;
    *)
      return
      ;;
  esac
  for child in $(pgrep -f "$pattern" 2>/dev/null || true); do
    parent=$(ps -o ppid= -p "$child" 2>/dev/null | tr -d ' ')
    if [ -n "$parent" ] && [ "$parent" -gt 1 ]; then
      stop_process_tree "$parent"
    else
      stop_process_tree "$child"
    fi
  done
}

prepare_database() {
  cd "$ROOT_DIR/packages/db"
  PATH="$ROOT_DIR/packages/db/node_modules/.bin:$ROOT_DIR/node_modules/.bin:$PATH"
  export PATH
  node node_modules/prisma/build/index.js generate --config prisma.config.ts >/dev/null
  node node_modules/prisma/build/index.js migrate deploy --config prisma.config.ts
  node node_modules/prisma/build/index.js db seed --config prisma.config.ts
}

start_stack() {
  trap 'exit 130' INT TERM
  trap 'exit_code=$?; trap - EXIT INT TERM; if [ "$exit_code" -ne 0 ]; then echo "启动失败，正在回收已启动进程" >&2; stop_stack || true; fi; exit "$exit_code"' EXIT
  "$ROOT_DIR/scripts/local-services.sh" up
  prepare_database
  start_app api @dream-space/api
  wait_for_url API http://localhost:4000/health "$RUNTIME_DIR/api.log"
  start_app worker @dream-space/worker
  start_app web @dream-space/web
  start_app admin @dream-space/admin
  wait_for_url 用户端 http://localhost:3000/generate "$RUNTIME_DIR/web.log"
  wait_for_url 管理端 http://localhost:3001/tasks "$RUNTIME_DIR/admin.log"
  status_stack
  trap - EXIT INT TERM
}

stop_stack() {
  stop_app admin
  stop_app web
  stop_app worker
  stop_app api
  "$ROOT_DIR/scripts/local-services.sh" down
}

status_app() {
  name="$1"
  url="$2"
  pid_file="$RUNTIME_DIR/$name.pid"
  if curl -fsS "$url" >/dev/null 2>&1; then
    if is_running "$pid_file"; then
      echo "$name ready: $url"
    else
      echo "$name ready (external dev session): $url"
    fi
    return
  fi
  echo "$name unavailable: $url" >&2
  return 1
}

status_worker() {
  pid_file="$RUNTIME_DIR/worker.pid"
  if is_running "$pid_file"; then
    echo "worker running: pid=$(cat "$pid_file")"
    return
  fi
  pattern="$ROOT_DIR/apps/worker/node_modules/.bin/../tsx/dist/cli.mjs watch src/main.ts"
  if pgrep -f "$pattern" >/dev/null 2>&1; then
    echo "worker running (external dev session)"
    return
  fi
  echo "worker unavailable" >&2
  return 1
}

status_stack() {
  failed=0
  "$ROOT_DIR/scripts/local-services.sh" status || failed=1
  status_app api http://localhost:4000/health || failed=1
  status_worker || failed=1
  status_app web http://localhost:3000/generate || failed=1
  status_app admin http://localhost:3001/tasks || failed=1
  return "$failed"
}

case "${1:-}" in
  up)
    start_stack
    ;;
  down)
    stop_stack
    ;;
  restart)
    stop_stack
    start_stack
    ;;
  status)
    status_stack
    ;;
  logs)
    tail -n 80 "$RUNTIME_DIR"/*.log
    ;;
  *)
    echo "用法：$0 {up|down|restart|status|logs}"
    exit 1
    ;;
esac
