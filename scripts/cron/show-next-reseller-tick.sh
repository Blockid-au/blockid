#!/bin/bash
# show-next-reseller-tick.sh — Live display of the reseller-goal-loop cron.
#
# Shows:
#   • current UTC + AEST time
#   • when the next tick will fire (parsed from the live crontab entry)
#   • what the last tick actually did (phase picked, elapsed, deploy result)
#   • the last claude-CLI response snippet (so blockers are visible)
#   • auto-stopped state if the goal is complete
#
# Usage:
#   bash scripts/cron/show-next-reseller-tick.sh           # human view
#   bash scripts/cron/show-next-reseller-tick.sh --json    # machine view
#   bash scripts/cron/show-next-reseller-tick.sh --watch   # refresh every 5s
#
# Also usable via alias in ~/.bashrc:
#   alias next-tick='bash /home/dovanlong/blockid.au/scripts/cron/show-next-reseller-tick.sh'

set -eu

MODE="${1:-human}"

# ────────────────────────────────────────────────────────────────────────────
# Watch mode — repeat the human view every 5s. Ctrl-C exits.
# ────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "--watch" ]; then
  while true; do
    clear
    bash "$0"
    sleep 5
  done
fi

REPO=/home/dovanlong/blockid.au
LOG=/tmp/blockid-reseller-loop.log
HISTORY="$REPO/web/content/reports/reseller-goal-history.jsonl"
DONE_MARKER=/tmp/blockid-reseller-goal-done

# ────────────────────────────────────────────────────────────────────────────
# Auto-stop detection.
# ────────────────────────────────────────────────────────────────────────────
if [ -f "$DONE_MARKER" ]; then
  MARK="$(cat "$DONE_MARKER" 2>/dev/null || echo unknown)"
  cat <<EOF
─── Reseller goal loop — COMPLETE ───
  Goal reached at: $MARK
  Cron entry has been auto-removed. Loop no longer fires.
  See: $HISTORY
EOF
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Live cron parse (default */5 * * * * — expressed in the running crontab).
# ────────────────────────────────────────────────────────────────────────────
CRON_ENTRY="$(crontab -l 2>/dev/null | grep -E 'reseller-goal-loop\.mjs' | grep -v '^#' | head -1 || true)"
if [ -z "$CRON_ENTRY" ]; then
  echo "reseller-goal-loop is NOT in crontab (not installed OR auto-stopped)."
  exit 0
fi
MIN_SPEC="$(echo "$CRON_ENTRY" | awk '{print $1}')"

# ────────────────────────────────────────────────────────────────────────────
# Compute next tick from */N or explicit spec.
# ────────────────────────────────────────────────────────────────────────────
NOW_UTC="$(date -u +%s)"
NOW_UTC_HHMM="$(date -u +%H:%M:%S)"
NOW_AEST_HHMM="$(TZ=Australia/Sydney date +%H:%M:%S)"
CURRENT_MINUTE="$(date -u +%M | sed 's/^0//')"
CURRENT_MINUTE="${CURRENT_MINUTE:-0}"
CURRENT_SECOND="$(date -u +%S | sed 's/^0//')"
CURRENT_SECOND="${CURRENT_SECOND:-0}"

case "$MIN_SPEC" in
  \*/*)
    STEP="${MIN_SPEC#*/}"
    NEXT_MINUTE=$(( ((CURRENT_MINUTE / STEP) + 1) * STEP ))
    [ "$NEXT_MINUTE" -ge 60 ] && NEXT_MINUTE=$(( NEXT_MINUTE - 60 ))
    ;;
  \*) NEXT_MINUTE=$(( (CURRENT_MINUTE + 1) % 60 )) ;;
  *) NEXT_MINUTE="$MIN_SPEC" ;;
esac

DELTA_SECS_TO_NEXT_MIN=$(( 60 - CURRENT_SECOND ))
MIN_DELTA=$(( NEXT_MINUTE - CURRENT_MINUTE - 1 ))
[ "$MIN_DELTA" -lt 0 ] && MIN_DELTA=$(( MIN_DELTA + 60 ))
SECS_UNTIL=$(( DELTA_SECS_TO_NEXT_MIN + MIN_DELTA * 60 ))
NEXT_TS_UTC=$(( NOW_UTC + SECS_UNTIL ))
NEXT_HHMM_UTC="$(date -u -d "@$NEXT_TS_UTC" +%H:%M)"
NEXT_HHMM_AEST="$(TZ=Australia/Sydney date -d "@$NEXT_TS_UTC" +%H:%M)"

# ────────────────────────────────────────────────────────────────────────────
# Parse recent tick history: is a tick running now? What did the last one do?
# ────────────────────────────────────────────────────────────────────────────
LAST_TICK_ID=""
LAST_TICK_START=""
LAST_TICK_END=""
LAST_DISPATCH_ELAPSED=""
LAST_DEPLOY_STAGE=""
LAST_DEPLOY_STATUS=""
LAST_BLOCKER_MSG=""

if [ -s "$HISTORY" ]; then
  # Last tick id (may still be running if end row absent).
  LAST_TICK_ID="$(tac "$HISTORY" | grep -oP '"tick_id":"[^"]+"' | head -1 | cut -d'"' -f4)"
  if [ -n "$LAST_TICK_ID" ]; then
    LAST_TICK_START="$(grep -F "$LAST_TICK_ID" "$HISTORY" | grep '"stage":"tick_start"' | tail -1)"
    LAST_TICK_END="$(grep -F "$LAST_TICK_ID" "$HISTORY" | grep '"stage":"tick_end"' | tail -1)"
    LAST_DISPATCH_ELAPSED="$(grep -F "$LAST_TICK_ID" "$HISTORY" | grep '"stage":"delegated_dispatch"' | grep -oP '"elapsed_ms":\d+' | tail -1 | cut -d: -f2)"
    LAST_DEPLOY_STAGE="$(grep -F "$LAST_TICK_ID" "$HISTORY" | grep -oP '"stage":"auto_deploy_[a-z_]+"' | tail -1 | cut -d'"' -f4)"
    LAST_DEPLOY_STATUS="$(grep -F "$LAST_TICK_ID" "$HISTORY" | grep '"stage":"auto_deploy_finished"' | grep -oP '"status":-?\d+' | tail -1 | cut -d: -f2)"
  fi
fi

# ────────────────────────────────────────────────────────────────────────────
# Extract last claude-CLI response snippet from the log (non-JSON prose).
# This shows what phase was picked + any blockers verbatim.
# ────────────────────────────────────────────────────────────────────────────
LAST_PROSE="$(grep -v '^{' "$LOG" 2>/dev/null | grep -v '^❌' | tail -14 | head -12 || true)"

# ────────────────────────────────────────────────────────────────────────────
# Determine tick state: running vs idle vs blocked.
# ────────────────────────────────────────────────────────────────────────────
TICK_STATE="idle"
if [ -n "$LAST_TICK_START" ] && [ -z "$LAST_TICK_END" ]; then
  TICK_STATE="RUNNING (started at ${LAST_TICK_ID})"
elif [ "$LAST_DEPLOY_STATUS" = "1" ]; then
  TICK_STATE="last tick deploy FAILED (build race or gate error)"
elif [ -n "$LAST_TICK_END" ]; then
  TICK_STATE="idle — last tick ended cleanly"
fi

# ────────────────────────────────────────────────────────────────────────────
# JSON output for scripts.
# ────────────────────────────────────────────────────────────────────────────
if [ "$MODE" = "--json" ]; then
  printf '{"now_utc":"%s","next_utc":"%s","seconds_until":%d,"tick_state":"%s","last_tick_id":"%s","last_dispatch_ms":%s,"last_deploy_stage":"%s","last_deploy_status":%s}\n' \
    "$NOW_UTC_HHMM" "$NEXT_HHMM_UTC" "$SECS_UNTIL" "$TICK_STATE" "${LAST_TICK_ID:-}" "${LAST_DISPATCH_ELAPSED:-0}" "${LAST_DEPLOY_STAGE:-none}" "${LAST_DEPLOY_STATUS:-0}"
  exit 0
fi

# ────────────────────────────────────────────────────────────────────────────
# Human view.
# ────────────────────────────────────────────────────────────────────────────
STATUS_FILE=/tmp/blockid-reseller-loop.status
LIVE_STAGE="idle"
LIVE_SUMMARY=""
if [ -f "$STATUS_FILE" ]; then
  LIVE_STAGE="$(grep -oP '"current_stage":\s*"[^"]*"' "$STATUS_FILE" | head -1 | cut -d'"' -f4)"
  # Extract a short summary if the last entry had a 'label' or 'phase' or similar
  LIVE_LABEL="$(grep -oP '"label":\s*"[^"]*"' "$STATUS_FILE" | head -1 | cut -d'"' -f4)"
  LIVE_HEAD="$(grep -oP '"head":\s*"[^"]*"' "$STATUS_FILE" | head -1 | cut -d'"' -f4)"
  LIVE_REASON="$(grep -oP '"reason":\s*"[^"]*"' "$STATUS_FILE" | head -1 | cut -d'"' -f4)"
  [ -n "$LIVE_LABEL" ] && LIVE_SUMMARY="${LIVE_SUMMARY} label=$LIVE_LABEL"
  [ -n "$LIVE_HEAD" ] && LIVE_SUMMARY="${LIVE_SUMMARY} head=$LIVE_HEAD"
  [ -n "$LIVE_REASON" ] && LIVE_SUMMARY="${LIVE_SUMMARY} reason=$LIVE_REASON"
fi

cat <<EOF

═══════════════════════════════════════════════════════════════════════
  Reseller Goal Loop — Live Status
═══════════════════════════════════════════════════════════════════════

  🕐  Now:            ${NOW_UTC_HHMM} UTC   (${NOW_AEST_HHMM} AEST)
  ⏭   Next tick:      ${NEXT_HHMM_UTC} UTC   (${NEXT_HHMM_AEST} AEST)     [in ${SECS_UNTIL}s]
  📍  State:          ${TICK_STATE}
  🎯  Current stage:  ${LIVE_STAGE}${LIVE_SUMMARY}

  🔁  Last tick:      ${LAST_TICK_ID:-none yet}
  ⏱   Dispatch time:  ${LAST_DISPATCH_ELAPSED:-0} ms   ($(( ${LAST_DISPATCH_ELAPSED:-0} / 1000 ))s)
  🚀  Auto-deploy:    ${LAST_DEPLOY_STAGE:-skipped}   (status=${LAST_DEPLOY_STATUS:-n/a})

─── What the loop did in the last tick (verbatim from claude CLI) ─────
EOF

if [ -n "$LAST_PROSE" ]; then
  echo "$LAST_PROSE" | sed 's/^/  │  /'
else
  echo "  (no prose response — loop may have exited quickly or is running now)"
fi

cat <<EOF

─── Live crons ────────────────────────────────────────────────────────
$(crontab -l | grep -E '(reseller|goal-loop|credit-reset|clear-commissions)' | grep -v '^#' | sed 's/^/  /')

  Logs:      $LOG
             $HISTORY

═══════════════════════════════════════════════════════════════════════
EOF
