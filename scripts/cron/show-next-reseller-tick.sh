#!/bin/bash
# show-next-reseller-tick.sh — Display current time + next reseller-goal-loop
# cron tick on the terminal. Reads the live crontab entry to derive the
# schedule (default */5 * * * *).
#
# Usage:
#   bash scripts/cron/show-next-reseller-tick.sh
#   bash scripts/cron/show-next-reseller-tick.sh --json
#
# Also usable as a shell alias:
#   alias next-tick='bash /home/dovanlong/blockid.au/scripts/cron/show-next-reseller-tick.sh'

set -eu

NOW_UTC="$(date -u +%s)"
NOW_UTC_HHMM="$(date -u +%H:%M:%S)"
NOW_AEST_HHMM="$(TZ=Australia/Sydney date +%H:%M:%S)"

# Read the live crontab entry for reseller-goal-loop. Fall back to */5 if
# the entry isn't installed (loop may have auto-stopped on completion).
CRON_ENTRY="$(crontab -l 2>/dev/null | grep -E 'reseller-goal-loop\.mjs' | grep -v '^#' | head -1 || true)"
if [ -z "$CRON_ENTRY" ]; then
  echo "reseller-goal-loop is NOT in crontab (either not installed or auto-stopped on goal completion)"
  if [ -f /tmp/blockid-reseller-goal-done ]; then
    MARKER="$(cat /tmp/blockid-reseller-goal-done 2>/dev/null || true)"
    echo "  Completion marker present: $MARKER"
  fi
  exit 0
fi

# Extract the minute spec (first field). For */N compute next boundary; for
# an explicit list handle it; for a single minute compute distance to it.
MIN_SPEC="$(echo "$CRON_ENTRY" | awk '{print $1}')"

CURRENT_MINUTE="$(date -u +%M | sed 's/^0//')"
CURRENT_MINUTE="${CURRENT_MINUTE:-0}"
CURRENT_SECOND="$(date -u +%S | sed 's/^0//')"
CURRENT_SECOND="${CURRENT_SECOND:-0}"

NEXT_MINUTE=""
case "$MIN_SPEC" in
  \*/*)
    STEP="${MIN_SPEC#*/}"
    # Round CURRENT_MINUTE up to next multiple of STEP.
    NEXT_MINUTE=$(( ((CURRENT_MINUTE / STEP) + 1) * STEP ))
    if [ "$NEXT_MINUTE" -ge 60 ]; then
      NEXT_MINUTE=$(( NEXT_MINUTE - 60 ))
    fi
    ;;
  \*)
    NEXT_MINUTE=$(( CURRENT_MINUTE + 1 ))
    if [ "$NEXT_MINUTE" -ge 60 ]; then NEXT_MINUTE=0; fi
    ;;
  *)
    # Explicit minute — use verbatim (rare in our case)
    NEXT_MINUTE="$MIN_SPEC"
    ;;
esac

# Compute seconds until next tick.
DELTA_SECS_TO_NEXT_MIN=$(( 60 - CURRENT_SECOND ))
MIN_DELTA=$(( NEXT_MINUTE - CURRENT_MINUTE - 1 ))
if [ "$MIN_DELTA" -lt 0 ]; then MIN_DELTA=$(( MIN_DELTA + 60 )); fi
SECS_UNTIL=$(( DELTA_SECS_TO_NEXT_MIN + MIN_DELTA * 60 ))

NEXT_TS_UTC="$(( NOW_UTC + SECS_UNTIL ))"
NEXT_HHMM_UTC="$(date -u -d "@$NEXT_TS_UTC" +%H:%M)"
NEXT_HHMM_AEST="$(TZ=Australia/Sydney date -d "@$NEXT_TS_UTC" +%H:%M)"

# Also report last-known tick (from history JSONL) so the user sees loop
# activity end-to-end.
LAST_TICK="$(tail -n 1 /home/dovanlong/blockid.au/web/content/reports/reseller-goal-history.jsonl 2>/dev/null || echo '{}')"

if [ "${1:-}" = "--json" ]; then
  printf '{"now_utc":"%s","now_aest":"%s","next_utc":"%s","next_aest":"%s","seconds_until":%d,"cron_entry":"%s"}\n' \
    "$NOW_UTC_HHMM" "$NOW_AEST_HHMM" "$NEXT_HHMM_UTC" "$NEXT_HHMM_AEST" "$SECS_UNTIL" "$(echo "$CRON_ENTRY" | tr -d '"')"
else
  cat <<EOF
─── Reseller goal loop — next tick ───
  Now:       ${NOW_UTC_HHMM} UTC  (${NOW_AEST_HHMM} AEST)
  Next tick: ${NEXT_HHMM_UTC} UTC  (${NEXT_HHMM_AEST} AEST)
  ETA:       ${SECS_UNTIL}s
  Cron:      ${CRON_ENTRY:0:120}...
  Last log:  ${LAST_TICK:0:200}
EOF
fi
