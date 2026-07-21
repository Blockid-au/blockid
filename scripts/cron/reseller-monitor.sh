#!/bin/bash
# reseller-monitor.sh — snapshot the reseller-goal-loop state to a well-known
# file every minute so anyone (bash user, admin dashboard, monitoring tool)
# can see what the loop just did / is doing / will do next.
#
# Outputs:
#   1. /tmp/blockid-reseller-monitor.txt   — always-current human snapshot
#   2. web/content/reports/reseller-monitor.jsonl — append-only JSONL history
#
# Wired into system crontab: * * * * * bash scripts/cron/reseller-monitor.sh
# Runs once per minute; auto-stops (no-op) once the goal is complete.

set -eu

REPO=/home/dovanlong/blockid.au
OUT_TXT=/tmp/blockid-reseller-monitor.txt
OUT_JSONL="$REPO/web/content/reports/reseller-monitor.jsonl"
DONE_MARKER=/tmp/blockid-reseller-goal-done

mkdir -p "$(dirname "$OUT_JSONL")"

if [ -f "$DONE_MARKER" ]; then
  MARK="$(cat "$DONE_MARKER" 2>/dev/null || echo unknown)"
  cat > "$OUT_TXT" <<EOF
─── Reseller goal loop — COMPLETE ───
  Goal reached at: $MARK
  Monitor is auto-stopping.
EOF
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"stage\":\"goal_complete\",\"completed_at\":\"$MARK\"}" >> "$OUT_JSONL"

  # Auto-stop: strip our own crontab entry so we don't waste ticks on a
  # completed goal. Mirror of the loop's own auto-stop (see
  # scripts/cron/reseller-goal-loop.mjs "Goal completion detector").
  # Idempotent: on the very next `crontab` install both cron entries could
  # come back — that is fine and matches the user's intent
  # ("automatically stop cron check when the cron completes its task").
  crontab -l 2>/dev/null | grep -v "reseller-monitor.sh" | crontab - 2>/dev/null || true
  exit 0
fi

bash "$REPO/scripts/cron/show-next-reseller-tick.sh" > "$OUT_TXT" 2>&1

STATE_JSON="$(bash "$REPO/scripts/cron/show-next-reseller-tick.sh" --json 2>/dev/null || echo '{}')"
HEAD_SHA="$(cd "$REPO" && git rev-parse --short HEAD 2>/dev/null || echo unknown)"
LAST_LOG_LINE="$(tail -n 1 "$REPO/web/content/reports/reseller-goal-history.jsonl" 2>/dev/null | tr -d '\n' || echo '')"

python3 - "$STATE_JSON" "$HEAD_SHA" "$LAST_LOG_LINE" >> "$OUT_JSONL" 2>/dev/null <<'PY' || true
import json, sys, datetime
state_json, head_sha, last_log = sys.argv[1], sys.argv[2], sys.argv[3]
try:
    state = json.loads(state_json) if state_json.strip() else {}
except Exception:
    state = {}
try:
    last_log_obj = json.loads(last_log) if last_log.strip() else {}
except Exception:
    last_log_obj = {}
row = {
    "monitor_ts": datetime.datetime.now(datetime.timezone.utc).isoformat().replace("+00:00", "Z"),
    "head_sha": head_sha,
    **state,
    "last_log": last_log_obj,
}
print(json.dumps(row))
PY

SIZE=$(stat -c %s "$OUT_JSONL" 2>/dev/null || echo 0)
if [ "$SIZE" -gt 512000 ]; then
  tail -n 1000 "$OUT_JSONL" > "$OUT_JSONL.tmp" && mv "$OUT_JSONL.tmp" "$OUT_JSONL"
fi
