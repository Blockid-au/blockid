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

# G30 ownership admission precedes HTTP, secrets, probes and lock acquisition.
# These exact legacy endpoints can mutate source/releases or delete caches.
case "$ENDPOINT" in
  agent-orchestrator|agent-auto-improve|agent-deploy|agent-healthcheck|agent-guardian)
    G30_CONTROL="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/docs/plans/g30-execution-control.json"
    G30_DECISION=$(python3 - "$G30_CONTROL" <<'G30_PY'
import json, sys
try:
    with open(sys.argv[1]) as handle:
        value = json.load(handle)
    valid = (isinstance(value, dict) and type(value.get("version")) is int
             and value["version"] == 1 and value.get("owner") == "g30"
             and value.get("source_of_truth") == "docs/plans/SOURCE-OF-TRUTH.md"
             and value.get("status") in ("active", "released"))
    print(value["status"] if valid else "invalid")
except Exception:
    print("invalid")
G30_PY
    ) || G30_DECISION=invalid
    if [ "$G30_DECISION" != released ]; then
      # A truthful deferral, not HTTP success or a fabricated health sample.
      printf '%s %s: deferred (G30 ownership %s; no HTTP request)\n' "$(date -u '+%m-%d %H:%M')" "$ENDPOINT" "$G30_DECISION" >> /tmp/blockid-cron.log
      exit 0
    fi
    ;;
esac
# END G30 cron ownership admission

# Per-job lockfile — prevents overlapping runs of the same endpoint (a slow
# svi-index-populate must not stack). Silent skip on contention (exit 0 so
# cron doesn't spam), and cap wall time at 90s regardless of anything below.
LOCK_FILE="/tmp/blockid-cron.$ENDPOINT.lock"
exec 9>"$LOCK_FILE" 2>/dev/null || true
if command -v flock >/dev/null 2>&1; then
  if ! flock -n 9; then
    echo "$(date -u '+%m-%d %H:%M') $ENDPOINT: skip (previous run still holding lock)" >> /tmp/blockid-cron.log
    exit 0
  fi
fi
# Parse optional --timeout (seconds the endpoint may run; default 60 → 90 s
# watchdog). G15-R3.5: honoured up to TIMEOUT_MAX_S=600 — several jobs declare
# --timeout 300 and must not be clipped; anything higher is clamped so one
# runaway endpoint can never hold a per-job lock across many cron ticks.
TIMEOUT=60
TIMEOUT_MAX_S=600
shift
while [ $# -gt 0 ]; do
  case "$1" in
    --timeout) TIMEOUT="$2"; shift 2 ;;
    *) shift ;;
  esac
done
case "$TIMEOUT" in
  ''|*[!0-9]*) TIMEOUT=60 ;;
esac
[ "$TIMEOUT" -lt 1 ] && TIMEOUT=60
[ "$TIMEOUT" -gt "$TIMEOUT_MAX_S" ] && TIMEOUT=$TIMEOUT_MAX_S

# Resolve once before the POST. A switch/invalid state defers this tick;
# preserved old instances may finish a request already admitted before cutover.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STATE_HELPER="$WEB_DIR/scripts/g30-serving-state.py"
if ! ORIGIN_PORT=$(python3 "$STATE_HELPER" --web "$WEB_DIR" --port 2>/dev/null); then
  echo "$(date -u '+%m-%d %H:%M') $ENDPOINT: deferred (serving state invalid or switching)" >> /tmp/blockid-cron.log
  exit 0
fi
RUN_RELEASE=""
if [ -e "$WEB_DIR/content/reports/g30-serving-state.json" ] || [ -L "$WEB_DIR/content/reports/g30-serving-state.json" ]; then
  if ! SERVING_SNAPSHOT=$(python3 "$STATE_HELPER" --web "$WEB_DIR" --snapshot 2>/dev/null) || \
      ! RUN_RELEASE=$(printf '%s' "$SERVING_SNAPSHOT" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["phase"]=="stable" and str(d["active"]["port"])==sys.argv[1]; print(d["active"]["releasePath"])' "$ORIGIN_PORT" 2>/dev/null); then
    echo "$(date -u '+%m-%d %H:%M') $ENDPOINT: deferred (serving instance changed before admission)" >> /tmp/blockid-cron.log
    exit 0
  fi
else
  RUN_RELEASE="$(readlink -f "$WEB_DIR/.next-current" 2>/dev/null || true)"
fi

# Overall watchdog: hard-kill this process tree so a hung curl+retry can never
# block the next cron tick. Sized from --timeout (curl budget + 30 s for the
# retry/Telegram tail) — a fixed 90 s used to kill every cron that legitimately
# ran longer (evaluation-batch-runner, report pipelines with --timeout 300).
# Ceiling: 600 + 30 s.
WATCHDOG_S=$((TIMEOUT + 30))
( sleep "$WATCHDOG_S" && kill -TERM -$$ 2>/dev/null ) &
WATCHDOG_PID=$!
trap 'kill $WATCHDOG_PID 2>/dev/null' EXIT  # retain lock inode for queued cron invocations

# Secrets are read from the gitignored .env (never hardcoded in committed
# scripts). An already-exported env var wins; otherwise we pull the single key
# out of .env without sourcing the whole (not-shell-safe) file.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
env_val() { grep -E "^$1=" "$WEB_DIR/.env" "$WEB_DIR/.env.runtime" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^"//' -e 's/"$//'; }

# Config
CRON_SECRET="${CRON_SECRET:-$(env_val CRON_SECRET)}"
BASE="http://127.0.0.1:$ORIGIN_PORT/api/cron"

# Fail LOUD if CRON_SECRET is missing — otherwise every cron silently 401s
# and health-log fills with useless "Unauthorized" rows. Manual testers /
# setup-cron.sh must see this immediately.
if [ -z "${CRON_SECRET:-}" ]; then
  TS_ERR=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
  mkdir -p "$(dirname "/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl")"
  echo "{\"ts\":\"$TS_ERR\",\"endpoint\":\"$ENDPOINT\",\"status\":\"fail\",\"duration_ms\":0,\"detail\":\"CRON_SECRET missing from env — cron-runner cannot authenticate\"}" \
    >> /home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl
  echo "[cron-runner] FATAL: CRON_SECRET not set in web/.env or web/.env.runtime" >&2
  exit 2
fi
LOG="/tmp/blockid-cron.log"
HEALTH_LOG="/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl"
TELEGRAM_BOT="${TELEGRAM_BOT_TOKEN:-$(env_val TELEGRAM_BOT_TOKEN)}"
TELEGRAM_CHAT="${TELEGRAM_CHAT_ID:-$(env_val TELEGRAM_CHAT_ID)}"

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

# Send exactly once: transport timeout/non-JSON can follow a committed write.
# Do not replay an ambiguous POST; the endpoint's next scheduled tick and
# durable idempotency/reconciliation own recovery.
ATTEMPT=0
while :; do
  ATTEMPT=$((ATTEMPT + 1))
  BODY=$(curl -s -X POST "$BASE/$ENDPOINT" \
    -H "Authorization: Bearer $CRON_SECRET" \
    --connect-timeout 5 \
    --max-time "$TIMEOUT" 2>&1)
  CURL_EXIT=$?

  # Parse result
  if [ $CURL_EXIT -ne 0 ]; then
    STATUS="error"
    DETAIL="curl exit $CURL_EXIT (timeout or connection refused)"
  elif echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if d.get('ok') else 1)" 2>/dev/null; then
    STATUS="ok"
    # Endpoints can return noop:true to signal "no work done — skip health-log write"
    # (e.g. blockchain-sync with no pending transactions). Avoids ~290 noise lines/day.
    NOOP=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); print('1' if d.get('noop') else '0')" 2>/dev/null || echo "0")
    DETAIL=$(echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); del d['ok']; print(json.dumps(d))" 2>/dev/null | head -c 200)
  elif echo "$BODY" | python3 -c "import sys,json; d=json.load(sys.stdin); exit(0 if 'Rate limited' in d.get('error','') or 'resetIn' in d else 1)" 2>/dev/null; then
    STATUS="rate_limited"
    DETAIL=$(echo "$BODY" | head -c 200)
  elif echo "$BODY" | python3 -c "import sys,json; json.load(sys.stdin)" 2>/dev/null; then
    STATUS="fail"   # valid JSON ok:false → real app failure, report it
    DETAIL=$(echo "$BODY" | head -c 200)
  else
    STATUS="transient"   # non-JSON (HTML/empty) → server mid-restart/deploy
    DETAIL=$(echo "$BODY" | head -c 120)
  fi

  # An uncertain transport outcome is recorded, never blindly retried.
  [ "$STATUS" = "transient" ] && STATUS="fail"
  break
done

END_NS=$(date +%s%N)
DURATION_MS=$(( (END_NS - START_NS) / 1000000 ))

# Detect deploy in flight (scripts/deploy-live.sh holds /tmp/blockid-deploy.lock via flock).
# We check BEFORE log writes so a deploy blip never becomes a persistent "fail" entry.
DEPLOY_ACTIVE=false
if command -v flock >/dev/null 2>&1 && ! flock -n /tmp/blockid-deploy.lock -c true 2>/dev/null; then
  DEPLOY_ACTIVE=true
fi

# Demote fail/error → deploy_blip during active deploy. Server restart blips are
# expected, not real failures — they used to leave "fail" rows that triggered
# DANGER alerts for hours after the deploy.
if [ "$DEPLOY_ACTIVE" = true ] && { [ "$STATUS" = "fail" ] || [ "$STATUS" = "error" ]; }; then
  STATUS="deploy_blip"
fi

# Log to text file (always — useful for grep/debugging)
NOOP_TAG=""
[ "${NOOP:-0}" = "1" ] && NOOP_TAG=" [noop]"
echo "$TS_SHORT $ENDPOINT: $STATUS${NOOP_TAG} (${DURATION_MS}ms)" >> "$LOG"

# Log to structured health file — skip when:
#   • noop:true (no transaction = no record), OR
#   • deploy_blip (transient server-restart artefact)
if [ "${NOOP:-0}" != "1" ] && [ "$STATUS" != "deploy_blip" ]; then
  echo "{\"ts\":\"$TS\",\"endpoint\":\"$ENDPOINT\",\"status\":\"$STATUS\",\"duration_ms\":$DURATION_MS,\"detail\":$(echo "$DETAIL" | python3 -c "import sys,json; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo "\"\"")}" >> "$HEALTH_LOG"
fi

# Post-hook: for publish-insight, sync newly written content back to the
# source tree so it survives the next deploy (releases are ephemeral).
if [ "$ENDPOINT" = "publish-insight" ] && [ "$STATUS" = "ok" ]; then
  SOURCE_INSIGHTS="$WEB_DIR/content/insights"
  # Read from the instance that handled this POST, even if a newer release
  # became active while it ran. LKG is not necessarily the serving instance.
  RELEASE_INSIGHTS="$RUN_RELEASE/content/insights"
  if [ -n "$RUN_RELEASE" ] && [ -d "$RELEASE_INSIGHTS" ]; then
    for f in "$RELEASE_INSIGHTS"/*.md; do
      base=$(basename "$f")
      [ ! -f "$SOURCE_INSIGHTS/$base" ] && cp "$f" "$SOURCE_INSIGHTS/$base"
    done
    cp "$RELEASE_INSIGHTS/manifest.json" "$SOURCE_INSIGHTS/manifest.json" 2>/dev/null || true
    cp "$RELEASE_INSIGHTS/topic-queue.json" "$SOURCE_INSIGHTS/topic-queue.json" 2>/dev/null || true
    # Stage and commit if anything changed (silent — no deploy triggered here)
    cd "$WEB_DIR" && git add content/insights/ 2>/dev/null && \
      git diff --cached --quiet || \
      git commit -m "feat(auto): publish SEO article via cron" --no-verify 2>/dev/null || true
    cd - > /dev/null 2>&1 || true
  fi
fi

# Alert on failure via Telegram (rate_limited and deploy_blip are expected, not failures).
if [ "$STATUS" != "ok" ] && [ "$STATUS" != "rate_limited" ] && [ "$STATUS" != "deploy_blip" ]; then
  if [ "$DEPLOY_ACTIVE" = true ]; then
    log "$ENDPOINT failed during active deploy — alert suppressed (expected restart blip)"
  else
    MSG="⚠️ *Cron Failed*: \`$ENDPOINT\`
⏰ $TS
⏱️ ${DURATION_MS}ms
❌ $STATUS: $(echo "$DETAIL" | head -c 100)"

    TG_OK=$(curl -s "https://api.telegram.org/bot${TELEGRAM_BOT}/sendMessage" \
      -d "chat_id=$TELEGRAM_CHAT" \
      -d "text=$MSG" \
      -d "parse_mode=Markdown" \
      -d "disable_web_page_preview=true" 2>/dev/null | grep -o '"ok":true' || true)
    # G15 review 2026-09-18: Telegram token is 401 → e-mail fallback (ADMIN_EMAIL).
    if [ -z "$TG_OK" ]; then
      printf '%s' "$MSG" | node "$(dirname "$0")/ops-alert-email.mjs" "Cron failed: $ENDPOINT" >/dev/null 2>&1 || true
    fi
  fi
fi

exit 0
