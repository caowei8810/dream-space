#!/bin/sh

set -eu

API_URL="${API_URL:-http://localhost:4000}"
TEST_PHONE="${DREAMSPACE_SMOKE_PHONE:-13800138000}"
TEMP_DIR=$(mktemp -d)
COOKIE_JAR="$TEMP_DIR/cookies.txt"
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

require_command curl
require_command jq

code_body=$(curl -fsS -X POST "$API_URL/auth/codes" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$TEST_PHONE\"}")
challenge_id=$(printf '%s' "$code_body" | jq -er '.challengeId')
demo_code=$(printf '%s' "$code_body" | jq -er '.demoCode')
[ "$demo_code" = "123456" ]

invalid_status=$(curl -sS -o "$TEMP_DIR/invalid.json" -w '%{http_code}' \
  -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$TEST_PHONE\",\"challengeId\":\"$challenge_id\",\"code\":\"123456\",\"version\":\"2026-08-03\",\"termsAccepted\":true,\"privacyAccepted\":false,\"aiTermsAccepted\":true}")
[ "$invalid_status" = "400" ]

wrong_status=$(curl -sS -o "$TEMP_DIR/wrong.json" -w '%{http_code}' \
  -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$TEST_PHONE\",\"challengeId\":\"$challenge_id\",\"code\":\"654321\",\"version\":\"2026-08-03\",\"termsAccepted\":true,\"privacyAccepted\":true,\"aiTermsAccepted\":true}")
[ "$wrong_status" = "401" ]

login_headers="$TEMP_DIR/login-headers.txt"
login_status=$(curl -sS -D "$login_headers" -c "$COOKIE_JAR" -o "$TEMP_DIR/login.json" -w '%{http_code}' \
  -X POST "$API_URL/auth/login" \
  -H 'Content-Type: application/json' \
  --data "{\"phone\":\"$TEST_PHONE\",\"challengeId\":\"$challenge_id\",\"code\":\"123456\",\"version\":\"2026-08-03\",\"termsAccepted\":true,\"privacyAccepted\":true,\"aiTermsAccepted\":true}")
[ "$login_status" = "200" ]
grep -qi 'HttpOnly' "$login_headers"
grep -qi 'SameSite=Lax' "$login_headers"

session_before=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/auth/session" | jq -r '.authenticated')
[ "$session_before" = "true" ]
logout_status=$(curl -sS -b "$COOKIE_JAR" -c "$COOKIE_JAR" -o /dev/null -w '%{http_code}' -X POST "$API_URL/auth/logout")
[ "$logout_status" = "204" ]
session_after=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/auth/session" | jq -r '.authenticated')
[ "$session_after" = "false" ]

printf '%s\n' "Auth smoke passed: agreements=400 wrong-code=401 login=200 session=true logout=204 session=false"
