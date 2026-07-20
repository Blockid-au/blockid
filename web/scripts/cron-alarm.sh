#!/bin/bash
# BlockID.au — Cron Health Alarm
#
# Runs every 30 min. Reads content/reports/cron-health.jsonl, finds the latest
# entry per unique endpoint, and appends an incident line to
# content/reports/cron-incidents.jsonl when:
#   • latest status is "fail" (or "error"), OR
#   • latest entry is older than 2x the endpoint's expected interval.
#
# Expected intervals are declared inline (EXPECTED_INTERVAL_MIN) — kept close
# to setup-cron.sh so bumps to schedule cadence stay in sync.
#
# Idempotent: only writes a new incident if the last incident for the same
# endpoint+reason was more than 30 min ago (avoids duplicate spam every tick).

set -u

HEALTH_LOG="/home/dovanlong/blockid.au/web/content/reports/cron-health.jsonl"
INCIDENTS="/home/dovanlong/blockid.au/web/content/reports/cron-incidents.jsonl"

command -v jq >/dev/null 2>&1 || { echo "[cron-alarm] jq missing"; exit 2; }
[ -s "$HEALTH_LOG" ] || { echo "[cron-alarm] health log empty — nothing to do"; exit 0; }

mkdir -p "$(dirname "$INCIDENTS")"
touch "$INCIDENTS"

# endpoint => expected interval in minutes (2x = stale threshold)
declare -A EXPECTED_INTERVAL_MIN=(
  [svi-index-populate]=10
  [email-drip]=15
  [agent-guardian]=10
  [blockchain-sync]=15
  [ai-health]=180
  [performance-audit]=60
  [trial-end-reminder]=60
  [dunning-retry]=360
)

NOW_EPOCH=$(date -u +%s)
NOW_ISO=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

# Pull the latest line per endpoint (last write wins, jsonl is append-only).
LATEST_JSON=$(
  tail -n 4000 "$HEALTH_LOG" \
    | jq -c 'select(.endpoint and .ts and .status)' 2>/dev/null \
    | awk -F'"endpoint":"' '{split($2, a, "\""); print a[1]"\t"$0}' \
    | sort -k1,1 -k2,2 \
    | awk -F'\t' '!seen[$1]++ {print $2}' \
    | tac
)

# Guard: nothing parsable → exit clean
[ -z "$LATEST_JSON" ] && exit 0

# Preload recent incidents (last 100) so we can dedupe.
RECENT_INCIDENTS=$(tail -n 100 "$INCIDENTS" 2>/dev/null)

record_incident() {
  local endpoint="$1" reason="$2" note="$3"
  # Dedup: skip if same endpoint+reason recorded within last 30 min.
  if [ -n "$RECENT_INCIDENTS" ]; then
    local last_ts
    last_ts=$(echo "$RECENT_INCIDENTS" | jq -r --arg e "$endpoint" --arg r "$reason" \
      'select(.endpoint==$e and .reason==$r) | .ts' 2>/dev/null | tail -1)
    if [ -n "$last_ts" ]; then
      local last_epoch
      last_epoch=$(date -u -d "$last_ts" +%s 2>/dev/null || echo 0)
      if [ $((NOW_EPOCH - last_epoch)) -lt 1800 ]; then
        return 0
      fi
    fi
  fi
  jq -nc --arg ts "$NOW_ISO" --arg e "$endpoint" --arg r "$reason" --arg n "$note" \
    '{ts:$ts, endpoint:$e, reason:$r, note:$n}' >> "$INCIDENTS"
}

while IFS= read -r line; do
  [ -z "$line" ] && continue
  endpoint=$(echo "$line" | jq -r '.endpoint // empty' 2>/dev/null)
  status=$(echo "$line" | jq -r '.status // empty' 2>/dev/null)
  ts=$(echo "$line" | jq -r '.ts // empty' 2>/dev/null)
  [ -z "$endpoint" ] || [ -z "$ts" ] && continue

  # Rule 1: latest status is failure
  if [ "$status" = "fail" ] || [ "$status" = "error" ]; then
    detail=$(echo "$line" | jq -r '.detail // ""' 2>/dev/null | head -c 160)
    record_incident "$endpoint" "failing" "latest status=$status; $detail"
    continue
  fi

  # Rule 2: stale (older than 2x expected interval)
  interval="${EXPECTED_INTERVAL_MIN[$endpoint]:-}"
  [ -z "$interval" ] && continue

  ts_epoch=$(date -u -d "$ts" +%s 2>/dev/null || echo 0)
  [ "$ts_epoch" = "0" ] && continue
  age_min=$(( (NOW_EPOCH - ts_epoch) / 60 ))
  stale_min=$(( interval * 2 ))
  if [ "$age_min" -gt "$stale_min" ]; then
    record_incident "$endpoint" "stale" "no health entry for ${age_min}m (expected every ${interval}m)"
  fi
done <<< "$LATEST_JSON"

exit 0
