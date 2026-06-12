#!/bin/bash
# BlockID.au — Cron Runner with Logging + Telegram Alert
#
# Usage: bash scripts/cron-runner.sh <endpoint-name> [--timeout 60]
#   e.g. bash scripts/cron-runner.sh svi-snapshot
#        bash scripts/cron-runner.sh publish-insight --timeout 120
#
# Features:
#   - Logs every run to /tmp/blockid-cron.log (with result + duration)
#   - Logs structured JSON to content/reports/cron-health.jsonl
#   - Sends Telegram alert on FAILURE (not on success)
#   - Auto-rotates log at 200KB
#   - Exit 0 always (cron doesn't retry on failure — we handle it)

set -u

ENDPOINT="${1:-}"
if [ -z "$ENDPOINT" ]; then
  echo "Usage: bash scripts/cron-runner.sh <endpoint-name>"
  exit 0
fi

# Parse optional --timeout
TIMEOUT=60
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done

# Config
CRON_SECRET="${CRON_SECRET:-4b76f13574efd401640cb5dce996f01aa8b8169c02cb1b1949ceb6354ee15f32}"
BASE="http://127.0.0.1:4001/api/cron"
LOG="/tmp/blockid-cron.log"
HEALTH_LOG="/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl"
TELEGRAM_BOT="8866491988:AAF24ixnoNFzubydEARc28klTd0lw1V5fCk"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID:-539796782}"

# Rotate log at 200KB
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 200000 ]; then
  tail -100 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

# Ensure health log directory exists
mkdir -p "$(dirname "$HEALTH_LOG")"

# Run the endpoint
TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
TS_SHORT=$(date -u '+%m-%d %H:%M')
START_NS=$(date +%s%N)

BODY=$(curl -s -X POST "$BASE/$ENDPOINT" \
  -H "Authorization: Bearer $CRON_SECRET" \
  --connect-timeout 5 \
  --max-time "$TIMEOUT" 2>&1)
CURL_EXIT=$?

END_NS=$(date +%s%N)
DURATION_MS=$(( (END_NS - START_NS) / 1000000 ))

# Parse result
if [ $CURL_EXIT -ne 0 ]; then
  STATUS="error"
  DETAIL="curl exit $CURL_EXIT (timeout or connection refused)"
elif echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
  STATUS="ok"
  DETAIL=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); del d['ok']; print(json.dumps(d))" 2>/dev/null | head -c 200)
elif echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'Rate limited' in d.get('error','') or 'resetIn' in d else 1)" 2>/dev/null; then
  STATUS="rate_limited"
  DETAIL=$(echo "$BODY" | head -c 200)
else
  STATUS="fail"
  DETAIL=$(echo "$BODY" | head -c 200)
fi

# Log to text file
echo "$TS_SHORT $ENDPOINT: $STATUS (${DURATION_MS}ms)" >> "$LOG"

# Log to structured health file
echo "{\"ts\":\"$TS\",\"endpoint\":\"$ENDPOINT\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION_MS,\"detail\":$(echo "$DETAIL" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo "\"\"")}" >> "$HEALTH_LOG"

# Alert on failure via Telegram (rate_limited is expected, not a failure)
if [ "$STATUS" != "ok" ] && [ "$STATUS" != "rate_limited" ]; then
  MSG="⚠️ *Cron Failed*: \`$ENDPOINT\`
⏰ $TS
⏱️ ${DURATION_MS}ms
❌ $STATUS: $(echo "$DETAIL" | head -c 100)"

  curl -s "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
    -d "chat_id=$TELEGRAM_CHAT" \
    -d "text=$MSG" \
    -d "parse_mode=Markdown" \
    -d "disable_web_page_preview=true" > /dev/null 2>&1
fi

exit 0
