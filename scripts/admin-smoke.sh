#!/bin/sh

set -eu

API_URL="${API_URL:-http://localhost:4000}"
ADMIN_PHONE="${DREAMSPACE_ADMIN_SMOKE_PHONE:-18800000000}"
VIEWER_PHONE="${DREAMSPACE_ADMIN_VIEWER_SMOKE_PHONE:-18800000001}"
USER_PHONE="${DREAMSPACE_SMOKE_PHONE:-13800138000}"
EXPECT_OBJECT_STORAGE_MODE="${DREAMSPACE_EXPECT_OBJECT_STORAGE_MODE:-local}"
TODAY=$(date -u +%Y-%m-%d)
TEMP_DIR=$(mktemp -d)
ADMIN_COOKIE_JAR="$TEMP_DIR/admin-cookies.txt"
USER_COOKIE_JAR="$TEMP_DIR/user-cookies.txt"
VIEWER_COOKIE_JAR="$TEMP_DIR/viewer-cookies.txt"

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
anonymous_reconciliation_status=$(curl -sS -o "$TEMP_DIR/anonymous-reconciliation.json" \
  -w '%{http_code}' "$API_URL/admin/tasks/reconciliation/runs")
[ "$anonymous_reconciliation_status" = "401" ]

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

dashboard=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/dashboard/summary")
[ "$(printf '%s' "$dashboard" | jq -er '.window.timezone')" = "Asia/Shanghai" ]
[ "$(printf '%s' "$dashboard" | jq -er '.revenue.available')" = "true" ]
orders=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/billing/orders?page=1&pageSize=20")
[ "$(printf '%s' "$orders" | jq -er '.page')" = "1" ]
[ "$(printf '%s' "$orders" | jq -er '.items | type')" = "array" ]
roles=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/roles")
owner_role_id=$(printf '%s' "$roles" | jq -er '.items[] | select(.code == "owner") | .id')
[ -n "$owner_role_id" ]
printf '%s\n' "[admin-smoke] dashboard summary and role permissions passed"

accounts=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/admin-users?query=ADM-SMOKE&page=1&pageSize=20")
viewer_role_id=$(printf '%s' "$accounts" | jq -er '.roles[] | select(.code == "viewer") | .id')
if [ "$(printf '%s' "$accounts" | jq -er '.total')" = "0" ]; then
  account_payload=$(jq -cn --arg roleId "$viewer_role_id" '{
    employeeNo:"ADM-SMOKE",
    displayName:"管理端冒烟账号",
    phone:"18800000999",
    roleIds:[$roleId],
    reason:"管理端自动化冒烟测试"
  }')
  managed_account=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
    "$API_URL/admin/admin-users" -H 'Content-Type: application/json' --data "$account_payload")
  managed_account_id=$(printf '%s' "$managed_account" | jq -er '.id')
  [ "$(printf '%s' "$managed_account" | jq -er '.status')" = "invited" ]
else
  managed_account_id=$(printf '%s' "$accounts" | jq -er '.items[0].id')
fi

action_payload='{"reason":"管理端自动化冒烟测试"}'
activated_account=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/admin-users/$managed_account_id/activate" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$activated_account" | jq -er '.status')" = "active" ]
suspended_account=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/admin-users/$managed_account_id/suspend" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$suspended_account" | jq -er '.status')" = "suspended" ]
curl -fsS -b "$ADMIN_COOKIE_JAR" -o /dev/null -X POST \
  "$API_URL/admin/admin-users/$managed_account_id/activate" \
  -H 'Content-Type: application/json' --data "$action_payload"
revoked_sessions=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/admin-users/$managed_account_id/revoke-sessions" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$revoked_sessions" | jq -er '.revokedSessionCount >= 0')" = "true" ]
printf '%s\n' "[admin-smoke] administrator account lifecycle and session revocation passed"

users=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/users?query=$USER_PHONE&page=1&pageSize=20")
[ "$(printf '%s' "$users" | jq -er '.total')" = "1" ]
managed_user_id=$(printf '%s' "$users" | jq -er '.items[0].id')
[ "$(printf '%s' "$users" | jq -er '.items[0].phoneMasked')" = "138****8000" ]

restricted_user=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/users/$managed_user_id/restrict" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$restricted_user" | jq -er '.status')" = "restricted" ]
restricted_generation_status=$(curl -sS -b "$USER_COOKIE_JAR" \
  -o "$TEMP_DIR/restricted-generation.json" -w '%{http_code}' \
  -X POST "$API_URL/generation/tasks" -H 'Content-Type: application/json' --data '{}')
[ "$restricted_generation_status" = "403" ]

banned_user=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/users/$managed_user_id/ban" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$banned_user" | jq -er '.status')" = "banned" ]
banned_session_status=$(curl -sS -b "$USER_COOKIE_JAR" \
  -o "$TEMP_DIR/banned-session.json" -w '%{http_code}' "$API_URL/generation/quota")
[ "$banned_session_status" = "401" ]
banned_code_status=$(curl -sS -o "$TEMP_DIR/banned-code.json" -w '%{http_code}' \
  -X POST "$API_URL/auth/codes" -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$USER_PHONE\"}")
[ "$banned_code_status" = "403" ]

active_user=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/users/$managed_user_id/activate" \
  -H 'Content-Type: application/json' --data "$action_payload")
[ "$(printf '%s' "$active_user" | jq -er '.status')" = "active" ]
login_user
active_session_status=$(curl -sS -b "$USER_COOKIE_JAR" \
  -o "$TEMP_DIR/active-session.json" -w '%{http_code}' "$API_URL/generation/quota")
[ "$active_session_status" = "200" ]
printf '%s\n' "[admin-smoke] registered user visibility, restriction, ban and recovery passed"

tasks=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/tasks?status=succeeded&model=image-4.7&createdFrom=2026-01-01&createdTo=$TODAY&page=1&pageSize=20")
[ "$(printf '%s' "$tasks" | jq -er '.page')" = "1" ]
[ "$(printf '%s' "$tasks" | jq -er '.pageSize')" = "20" ]
[ "$(printf '%s' "$tasks" | jq -er '.total >= 1')" = "true" ]
task_id=$(printf '%s' "$tasks" | jq -er '.items[0].id')

task=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/tasks/$task_id")
[ "$(printf '%s' "$task" | jq -er '.id')" = "$task_id" ]
[ "$(printf '%s' "$task" | jq -er '.results | length >= 1')" = "true" ]
[ "$(printf '%s' "$task" | jq -er '.userPhoneMasked | test("^[0-9]{3}\\*{4}[0-9]{4}$")')" = "true" ]
result_url=$(printf '%s' "$task" | jq -er '.results[0].imageUrl')
thumbnail_url=$(printf '%s' "$task" | jq -er '.results[0].thumbnailUrl')
result_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o /dev/null -D "$TEMP_DIR/result-headers.txt" \
  -w '%{http_code}' "$result_url")
thumbnail_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o /dev/null \
  -w '%{http_code}' "$thumbnail_url")
if [ "$EXPECT_OBJECT_STORAGE_MODE" = "s3" ]; then
  [ "$result_status" = "302" ]
  [ "$thumbnail_status" = "302" ]
  grep -qi '^location: .*X-Amz-' "$TEMP_DIR/result-headers.txt"
  grep -qi 'X-Amz-Expires=300' "$TEMP_DIR/result-headers.txt"
else
  [ "$result_status" = "200" ]
  [ "$thumbnail_status" = "200" ]
fi
curl -fsSL -b "$ADMIN_COOKIE_JAR" -o "$TEMP_DIR/admin-result.webp" "$result_url"
[ -s "$TEMP_DIR/admin-result.webp" ]
printf '%s\n' "[admin-smoke] task filters, pagination, detail and protected assets passed"

reconciliation=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/tasks/reconciliation/runs")
[ "$(printf '%s' "$reconciliation" | jq -er '.items | type')" = "array" ]
printf '%s\n' "[admin-smoke] quota reconciliation visibility passed"

candidates=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/inspiration-candidates?page=1&pageSize=100")
[ "$(printf '%s' "$candidates" | jq -er '.items | type')" = "array" ]
candidate_result_id=""
for result_id in $(printf '%s' "$candidates" | jq -r '.items[].resultId'); do
  candidate_asset_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o /dev/null -w '%{http_code}' \
    "$API_URL/admin/inspiration-candidates/$result_id/content")
  if [ "$candidate_asset_status" = "200" ] || [ "$candidate_asset_status" = "302" ]; then
    candidate_result_id="$result_id"
    break
  fi
done
if [ -z "$candidate_result_id" ]; then
  candidate_result_id=$(printf '%s' "$task" | jq -er '.results[0].id')
  echo "没有可用于发布冒烟的审核通过用户图片，已验证候选池接口。"
else
  published=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
    "$API_URL/admin/inspiration-candidates/$candidate_result_id/publish")
  inspiration_id=$(printf '%s' "$published" | jq -er '.id')
  [ "$(printf '%s' "$published" | jq -er '.sourceResultId')" = "$candidate_result_id" ]
  published_public_status=$(curl -sS -o "$TEMP_DIR/published-public.json" -w '%{http_code}' \
    "$API_URL/inspirations/$(printf '%s' "$published" | jq -er '.slug')")
  [ "$published_public_status" = "200" ]
  published_asset_status=$(curl -sS -o "$TEMP_DIR/published-inspiration.webp" -w '%{http_code}' \
    "$API_URL/inspirations/assets/$(printf '%s' "$published" | jq -er '.slug')/content")
  [ "$published_asset_status" = "200" ]
  [ -s "$TEMP_DIR/published-inspiration.webp" ]
  unpublished=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
    "$API_URL/admin/inspirations/$inspiration_id/unpublish")
  [ "$(printf '%s' "$unpublished" | jq -er '.status')" = "archived" ]
fi
legacy_create_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o "$TEMP_DIR/legacy-create.json" \
  -w '%{http_code}' -X POST "$API_URL/admin/inspirations" \
  -H 'Content-Type: application/json' --data '{"title":"不应创建"}')
[ "$legacy_create_status" = "404" ]
printf '%s\n' "[admin-smoke] user-generated candidate curation, publish guard and legacy-create removal passed"

viewer_code_body=$(curl -fsS -X POST "$API_URL/admin/auth/codes" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$VIEWER_PHONE\"}")
viewer_challenge_id=$(printf '%s' "$viewer_code_body" | jq -er '.challengeId')
curl -fsS -c "$VIEWER_COOKIE_JAR" -o /dev/null -X POST "$API_URL/admin/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$VIEWER_PHONE\",\"challengeId\":\"$viewer_challenge_id\",\"code\":\"123456\"}"
viewer_read_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-list.json" \
  -w '%{http_code}' "$API_URL/admin/inspirations?page=1&pageSize=1")
[ "$viewer_read_status" = "200" ]
viewer_write_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-write.json" \
  -w '%{http_code}' -X POST "$API_URL/admin/inspiration-candidates/$candidate_result_id/publish" \
  -H 'Content-Type: application/json' --data '{"title":"越权","category":"photography","sortOrder":0}')
[ "$viewer_write_status" = "403" ]
viewer_accounts_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-accounts.json" \
  -w '%{http_code}' "$API_URL/admin/admin-users?page=1&pageSize=1")
[ "$viewer_accounts_status" = "403" ]
viewer_users_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-users.json" \
  -w '%{http_code}' "$API_URL/admin/users?page=1&pageSize=1")
[ "$viewer_users_status" = "403" ]
viewer_dashboard_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-dashboard.json" \
  -w '%{http_code}' "$API_URL/admin/dashboard/summary")
[ "$viewer_dashboard_status" = "200" ]
viewer_roles_status=$(curl -sS -b "$VIEWER_COOKIE_JAR" -o "$TEMP_DIR/viewer-roles.json" \
  -w '%{http_code}' "$API_URL/admin/roles")
[ "$viewer_roles_status" = "403" ]
printf '%s\n' "[admin-smoke] viewer read=200 write=403 passed"

logout_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -c "$ADMIN_COOKIE_JAR" \
  -o /dev/null -w '%{http_code}' -X POST "$API_URL/admin/auth/logout")
[ "$logout_status" = "204" ]
session_after=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/auth/session" | jq -r '.authenticated')
[ "$session_after" = "false" ]
after_logout_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" -o "$TEMP_DIR/after-logout.json" \
  -w '%{http_code}' "$API_URL/admin/tasks")
[ "$after_logout_status" = "401" ]

printf '%s\n' \
  "Admin smoke passed: anonymous=401 normal-user=401 login=200 accounts=200/403 tasks=200 assets=$result_status/$thumbnail_status inspiration-candidates=200 legacy-create=404 viewer=200/403 logout=204 after-logout=401"
