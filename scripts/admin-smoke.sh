#!/bin/sh

set -eu

API_URL="${API_URL:-http://localhost:4000}"
ADMIN_PHONE="${DREAMSPACE_ADMIN_SMOKE_PHONE:-18800000000}"
USER_PHONE="${DREAMSPACE_SMOKE_PHONE:-13800138000}"
TEMP_DIR=$(mktemp -d)
ADMIN_COOKIE_JAR="$TEMP_DIR/admin-cookies.txt"
USER_COOKIE_JAR="$TEMP_DIR/user-cookies.txt"

cleanup() {
  rm -rf "$TEMP_DIR"
}
trap cleanup EXIT INT TERM

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "缺少命令：$1"
    exit 1
  fi
}

login_user() {
  code_body=$(curl -fsS -X POST "$API_URL/auth/codes" \
    -H 'Content-Type: application/json' \
    --data "{\"phone\":\"$USER_PHONE\"}")
  challenge_id=$(printf '%s' "$code_body" | jq -er '.challengeId')
  curl -fsS -c "$USER_COOKIE_JAR" -o /dev/null -X POST "$API_URL/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"phone\":\"$USER_PHONE\",\"challengeId\":\"$challenge_id\",\"code\":\"123456\",\"version\":\"2026-08-03\",\"termsAccepted\":true,\"privacyAccepted\":true,\"aiTermsAccepted\":true}"
}

require_command curl
require_command jq

anonymous_status=$(curl -sS -o "$TEMP_DIR/anonymous.json" -w '%{http_code}' \
  "$API_URL/admin/tasks")
[ "$anonymous_status" = "401" ]

login_user
normal_user_status=$(curl -sS -b "$USER_COOKIE_JAR" -o "$TEMP_DIR/normal-user.json" \
  -w '%{http_code}' "$API_URL/admin/tasks")
[ "$normal_user_status" = "401" ]
printf '%s\n' "[admin-smoke] isolated admin guard passed"

code_body=$(curl -fsS -X POST "$API_URL/admin/auth/codes" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$ADMIN_PHONE\"}")
challenge_id=$(printf '%s' "$code_body" | jq -er '.challengeId')
demo_code=$(printf '%s' "$code_body" | jq -er '.demoCode')
[ "$demo_code" = "123456" ]

login_headers="$TEMP_DIR/login-headers.txt"
login_status=$(curl -sS -D "$login_headers" -c "$ADMIN_COOKIE_JAR" \
  -o "$TEMP_DIR/login.json" -w '%{http_code}' \
  -X POST "$API_URL/admin/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$ADMIN_PHONE\",\"challengeId\":\"$challenge_id\",\"code\":\"123456\"}")
[ "$login_status" = "200" ]
grep -qi 'dreamspace_admin_session=' "$login_headers"
grep -qi 'HttpOnly' "$login_headers"
grep -qi 'SameSite=Lax' "$login_headers"

session_before=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/auth/session")
[ "$(printf '%s' "$session_before" | jq -er '.authenticated')" = "true" ]
[ "$(printf '%s' "$session_before" | jq -er '.user.permissions | index("tasks:read") != null')" = "true" ]
printf '%s\n' "[admin-smoke] isolated login and session passed"

tasks=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/tasks?status=succeeded&model=image-4.7&createdFrom=2026-08-03&createdTo=2026-08-03&page=1&pageSize=20")
[ "$(printf '%s' "$tasks" | jq -er '.page')" = "1" ]
[ "$(printf '%s' "$tasks" | jq -er '.pageSize')" = "20" ]
[ "$(printf '%s' "$tasks" | jq -er '.total >= 1')" = "true" ]
task_id=$(printf '%s' "$tasks" | jq -er '.items[0].id')

task=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/tasks/$task_id")
[ "$(printf '%s' "$task" | jq -er '.id')" = "$task_id" ]
[ "$(printf '%s' "$task" | jq -er '.results | length >= 1')" = "true" ]
[ "$(printf '%s' "$task" | jq -er '.userPhoneMasked | test("^[0-9]{3}\\*{4}[0-9]{4}$")')" = "true" ]
printf '%s\n' "[admin-smoke] task filters, pagination and detail passed"

logout_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" \
  -o /dev/null -w '%{http_code}' -X POST "$API_URL/admin/auth/logout")
[ "$logout_status" = "204" ]
session_after=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/auth/session" | jq -r '.authenticated')
[ "$session_after" = "false" ]
after_logout_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o "$TEMP_DIR/after-logout.json" \
  -w '%{http_code}' "$API_URL/admin/tasks")
[ "$after_logout_status" = "401" ]

printf '%s\n' \
  "Admin smoke passed: anonymous=401 normal-user=401 login=200 task-list=200 detail=200 logout=204 after-logout=401"
