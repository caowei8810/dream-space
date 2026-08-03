#!/bin/sh

set -eu

API_URL="${API_URL:-http://localhost:4000}"
TEST_PHONE="${DREAMSPACE_GENERATION_PHONE:-13800138000}"
OTHER_PHONE="${DREAMSPACE_GENERATION_OTHER_PHONE:-13900139000}"
IDEMPOTENCY_KEY="${DREAMSPACE_GENERATION_IDEMPOTENCY_KEY:-generation-smoke-v1}"
TEMP_DIR=$(mktemp -d)
COOKIE_JAR="$TEMP_DIR/cookies.txt"
OTHER_COOKIE_JAR="$TEMP_DIR/other-cookies.txt"

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

login() {
  phone="$1"
  cookie_jar="$2"
  code_body=$(curl -fsS -X POST "$API_URL/auth/codes" \
    -H 'Content-Type: application/json' \
    --data "{\"phone\":\"$phone\"}")
  challenge_id=$(printf '%s' "$code_body" | jq -er '.challengeId')
  curl -fsS -c "$cookie_jar" -o /dev/null -X POST "$API_URL/auth/login" \
    -H 'Content-Type: application/json' \
    --data "{\"phone\":\"$phone\",\"challengeId\":\"$challenge_id\",\"code\":\"123456\",\"version\":\"2026-08-03\",\"termsAccepted\":true,\"privacyAccepted\":true,\"aiTermsAccepted\":true}"
}

require_command curl
require_command jq

anonymous_status=$(curl -sS -o "$TEMP_DIR/anonymous.json" -w '%{http_code}' \
  "$API_URL/generation/quota")
[ "$anonymous_status" = "401" ]
printf '%s\n' "[generation-smoke] anonymous guard passed"

login "$TEST_PHONE" "$COOKIE_JAR"
quota_before=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/quota")
available_before=$(printf '%s' "$quota_before" | jq -er '.available')
used_before=$(printf '%s' "$quota_before" | jq -er '.used')
printf '%s\n' "[generation-smoke] login and quota passed"

payload=$(jq -cn --arg key "$IDEMPOTENCY_KEY" '{
  idempotencyKey:$key,
  sessionId:null,
  prompt:"雨后的玻璃花房，柔和自然光，电影感构图",
  model:"image-4.7",
  ratio:"1:1",
  resolution:"2K",
  imageCount:1,
  referenceImageUrls:[]
}')
first_status=$(curl -sS -b "$COOKIE_JAR" -o "$TEMP_DIR/first.json" -w '%{http_code}' \
  -X POST "$API_URL/generation/tasks" \
  -H 'Content-Type: application/json' \
  --data "$payload")
if [ "$first_status" != "201" ]; then
  printf '%s' "[generation-smoke] first request failed: status=$first_status body="
  jq -c '{statusCode,error,message}' "$TEMP_DIR/first.json"
  exit 1
fi
first_response=$(jq -c '.' "$TEMP_DIR/first.json")
task_id=$(printf '%s' "$first_response" | jq -er '.task.id')
session_id=$(printf '%s' "$first_response" | jq -er '.session.id')
first_replayed=$(printf '%s' "$first_response" | jq -r '.replayed')

replay_status=$(curl -sS -b "$COOKIE_JAR" -o "$TEMP_DIR/replay.json" -w '%{http_code}' \
  -X POST "$API_URL/generation/tasks" \
  -H 'Content-Type: application/json' \
  --data "$payload")
if [ "$replay_status" != "201" ]; then
  printf '%s' "[generation-smoke] replay request failed: status=$replay_status body="
  jq -c '{statusCode,error,message}' "$TEMP_DIR/replay.json"
  exit 1
fi
replay_response=$(jq -c '.' "$TEMP_DIR/replay.json")
[ "$(printf '%s' "$replay_response" | jq -er '.task.id')" = "$task_id" ]
[ "$(printf '%s' "$replay_response" | jq -er '.replayed')" = "true" ]

mismatch_payload=$(printf '%s' "$payload" | jq -c '.prompt = "同一幂等键下的不同提示词"')
mismatch_status=$(curl -sS -b "$COOKIE_JAR" -o "$TEMP_DIR/mismatch.json" -w '%{http_code}' \
  -X POST "$API_URL/generation/tasks" \
  -H 'Content-Type: application/json' \
  --data "$mismatch_payload")
[ "$mismatch_status" = "409" ]
[ "$(jq -er '.code' "$TEMP_DIR/mismatch.json")" = "IDEMPOTENCY_KEY_REUSED" ]
printf '%s\n' "[generation-smoke] idempotency replay and mismatch guard passed"

status=""
task_response=""
for _attempt in $(seq 1 60); do
  task_response=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/tasks/$task_id")
  status=$(printf '%s' "$task_response" | jq -er '.status')
  [ "$status" = "succeeded" ] && break
  [ "$status" = "failed" ] && break
  sleep 0.5
done
[ "$status" = "succeeded" ]
[ "$(printf '%s' "$task_response" | jq -er '.results | length')" = "1" ]
printf '%s\n' "[generation-smoke] worker result passed"

quota_after=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/quota")
available_after=$(printf '%s' "$quota_after" | jq -er '.available')
used_after=$(printf '%s' "$quota_after" | jq -er '.used')
reserved_after=$(printf '%s' "$quota_after" | jq -er '.reserved')
[ "$reserved_after" = "0" ]
if [ "$first_replayed" = "false" ]; then
  [ "$available_after" -eq $((available_before - 1)) ]
  [ "$used_after" -eq $((used_before + 1)) ]
else
  [ "$available_after" -eq "$available_before" ]
  [ "$used_after" -eq "$used_before" ]
fi
printf '%s\n' "[generation-smoke] quota settlement passed"

curl -fsS -N -b "$COOKIE_JAR" -H 'Last-Event-ID: 0' \
  "$API_URL/generation/tasks/$task_id/events" > "$TEMP_DIR/events.txt"
grep -q 'event: task.queued' "$TEMP_DIR/events.txt"
grep -q 'event: task.generating' "$TEMP_DIR/events.txt"
grep -q 'event: task.succeeded' "$TEMP_DIR/events.txt"
printf '%s\n' "[generation-smoke] SSE replay passed"

session_response=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/sessions/$session_id")
[ "$(printf '%s' "$session_response" | jq -er '.tasks[0].id')" = "$task_id" ]
[ "$(printf '%s' "$session_response" | jq -er '.tasks[0].results | length')" = "1" ]
printf '%s\n' "[generation-smoke] session timeline passed"

cancel_key="$IDEMPOTENCY_KEY-cancel"
cancel_quota_before=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/quota" | jq -er '.available')
cancel_payload=$(jq -cn --arg key "$cancel_key" '{
  idempotencyKey:$key,
  sessionId:null,
  prompt:"需要取消的生成任务",
  model:"image-4.7",
  ratio:"1:1",
  resolution:"2K",
  imageCount:2,
  referenceImageUrls:[]
}')
cancel_created=$(curl -fsS -b "$COOKIE_JAR" -X POST "$API_URL/generation/tasks" \
  -H 'Content-Type: application/json' \
  --data "$cancel_payload")
cancel_task_id=$(printf '%s' "$cancel_created" | jq -er '.task.id')
cancel_response=$(curl -fsS -b "$COOKIE_JAR" -X POST \
  "$API_URL/generation/tasks/$cancel_task_id/cancel")
[ "$(printf '%s' "$cancel_response" | jq -er '.status')" = "cancelled" ]
sleep 1.25
cancel_task=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/tasks/$cancel_task_id")
[ "$(printf '%s' "$cancel_task" | jq -er '.status')" = "cancelled" ]
cancel_quota=$(curl -fsS -b "$COOKIE_JAR" "$API_URL/generation/quota")
[ "$(printf '%s' "$cancel_quota" | jq -er '.available')" -eq "$cancel_quota_before" ]
[ "$(printf '%s' "$cancel_quota" | jq -er '.reserved')" = "0" ]
curl -fsS -N -b "$COOKIE_JAR" -H 'Last-Event-ID: 0' \
  "$API_URL/generation/tasks/$cancel_task_id/events" > "$TEMP_DIR/cancel-events.txt"
grep -q 'event: task.cancelled' "$TEMP_DIR/cancel-events.txt"
printf '%s\n' "[generation-smoke] cancellation and quota release passed"

login "$OTHER_PHONE" "$OTHER_COOKIE_JAR"
ownership_status=$(curl -sS -b "$OTHER_COOKIE_JAR" -o "$TEMP_DIR/ownership.json" \
  -w '%{http_code}' "$API_URL/generation/tasks/$task_id")
[ "$ownership_status" = "404" ]

printf '%s\n' \
  "Generation smoke passed: anonymous=401 task=$status cancel=cancelled idempotent=true mismatch=409 results=1 quota=$available_after/100 sse=replayed ownership=404"
