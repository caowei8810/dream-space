#!/bin/sh

set -eu

API_URL="${API_URL:-http://localhost:4000}"
ADMIN_PHONE="${DREAMSPACE_ADMIN_SMOKE_PHONE:-18800000000}"
VIEWER_PHONE="${DREAMSPACE_ADMIN_VIEWER_SMOKE_PHONE:-18800000001}"
USER_PHONE="${DREAMSPACE_SMOKE_PHONE:-13800138000}"
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
  "$API_URL/admin/tasks?status=succeeded&model=image-4.7&createdFrom=$TODAY&createdTo=$TODAY&page=1&pageSize=20")
[ "$(printf '%s' "$tasks" | jq -er '.page')" = "1" ]
[ "$(printf '%s' "$tasks" | jq -er '.pageSize')" = "20" ]
[ "$(printf '%s' "$tasks" | jq -er '.total >= 1')" = "true" ]
task_id=$(printf '%s' "$tasks" | jq -er '.items[0].id')

task=$(curl -fsS -b "$ADMIN_COOKIE_JAR" "$API_URL/admin/tasks/$task_id")
[ "$(printf '%s' "$task" | jq -er '.id')" = "$task_id" ]
[ "$(printf '%s' "$task" | jq -er '.results | length >= 1')" = "true" ]
[ "$(printf '%s' "$task" | jq -er '.userPhoneMasked | test("^[0-9]{3}\\*{4}[0-9]{4}$")')" = "true" ]
printf '%s\n' "[admin-smoke] task filters, pagination and detail passed"

inspiration_payload=$(jq -cn '{
  slug:"b5-smoke-inspiration",
  title:"B5 管理端 smoke 灵感",
  prompt:"雨后的玻璃花房，柔和自然光，电影感构图",
  category:"photography",
  imageUrl:"/inspiration/photography-01.webp",
  thumbnailUrl:"/inspiration/photography-01.webp",
  width:810,
  height:1080,
  modelName:"image-4.7",
  ratio:"3:4",
  resolutionLabel:"810 × 1080",
  authorDisplayName:"运营精选",
  sourceType:"internal",
  sourceName:"造梦空间",
  sourceUrl:null,
  licenseBasis:"内部生成素材",
  isAiGenerated:true,
  likeCount:0,
  sortOrder:999
}')
managed=$(curl -fsS -b "$ADMIN_COOKIE_JAR" \
  "$API_URL/admin/inspirations?query=b5-smoke-inspiration&page=1&pageSize=20")
if [ "$(printf '%s' "$managed" | jq -er '.total')" = "0" ]; then
  managed_item=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST "$API_URL/admin/inspirations" \
    -H 'Content-Type: application/json' --data "$inspiration_payload")
  inspiration_id=$(printf '%s' "$managed_item" | jq -er '.id')
  [ "$(printf '%s' "$managed_item" | jq -er '.status')" = "draft" ]
else
  inspiration_id=$(printf '%s' "$managed" | jq -er '.items[0].id')
  curl -fsS -b "$ADMIN_COOKIE_JAR" -o /dev/null -X PATCH \
    "$API_URL/admin/inspirations/$inspiration_id" \
    -H 'Content-Type: application/json' --data "$inspiration_payload"
fi

curl -fsS -b "$ADMIN_COOKIE_JAR" -o /dev/null -X POST \
  "$API_URL/admin/inspirations/$inspiration_id/unpublish"
draft_public_status=$(curl -sS -o "$TEMP_DIR/draft-public.json" -w '%{http_code}' \
  "$API_URL/inspirations/b5-smoke-inspiration")
[ "$draft_public_status" = "404" ]

published=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/inspirations/$inspiration_id/publish")
[ "$(printf '%s' "$published" | jq -er '.status')" = "published" ]
published_public_status=$(curl -sS -o "$TEMP_DIR/published-public.json" -w '%{http_code}' \
  "$API_URL/inspirations/b5-smoke-inspiration")
[ "$published_public_status" = "200" ]

unpublished=$(curl -fsS -b "$ADMIN_COOKIE_JAR" -X POST \
  "$API_URL/admin/inspirations/$inspiration_id/unpublish")
[ "$(printf '%s' "$unpublished" | jq -er '.status')" = "archived" ]
unpublished_public_status=$(curl -sS -o "$TEMP_DIR/unpublished-public.json" -w '%{http_code}' \
  "$API_URL/inspirations/b5-smoke-inspiration")
[ "$unpublished_public_status" = "404" ]

invalid_inspiration_status=$(curl -sS -b "$ADMIN_COOKIE_JAR" \
  -o "$TEMP_DIR/invalid-inspiration.json" -w '%{http_code}' \
  -X POST "$API_URL/admin/inspirations" \
  -H 'Content-Type: application/json' --data '{"slug":"x"}')
[ "$invalid_inspiration_status" = "400" ]
printf '%s\n' "[admin-smoke] inspiration create, update, publish, unpublish and validation passed"

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
  -w '%{http_code}' -X POST "$API_URL/admin/inspirations/$inspiration_id/publish")
[ "$viewer_write_status" = "403" ]
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
  "Admin smoke passed: anonymous=401 normal-user=401 login=200 tasks=200 inspiration-crud=200 validation=400 public=404/200/404 viewer=200/403 logout=204 after-logout=401"
