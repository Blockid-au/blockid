#!/bin/bash
# Uptime watchdog for blockid.au (T0229, v2.14.1).
#
# Runs every minute from cron. Hits https://blockid.au and reacts to failure
# with a graduated response:
#
#   1 fail   → log only
#   3 fails  → kill stale next-server + Telegram alert
#   5 fails  → automatic rollback via deploy-live.sh --rollback
#
# State (consecutive failure counter) lives in /tmp/blockid-uptime-state.
# Telegram alerts are throttled so the same incident only pages once.
#
# Cron entry (install with crontab -e):
#   * * * * * bash /home/dovanlong/blockid.au/web/scripts/uptime-watcher.sh
#
# Logs: /tmp/blockid-uptime.log (rotated at 100KB).

set -u

# Primary site to probe — pass alternate URL via $1 if invoking multiple times
URL="${1:-https://blockid.au}"
URL_SLUG=$(echo "$URL" | sed 's|^https\?://||; s|[/.]|-|g')
STATE_FILE="/tmp/uptime-state-${URL_SLUG}"
LOG="/tmp/uptime-${URL_SLUG}.log"
PID_FILE="/tmp/blockid-production.pid"
DEPLOY_DIR="/home/dovanlong/blockid.au/web"

# Read CRON_SECRET + TELEGRAM creds from .env (we only need TELEGRAM here)
TG_BOT="${TELEGRAM_BOT_TOKEN:-$(grep "^TELEGRAM_BOT_TOKEN=" "$DEPLOY_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')}"
TG_CHAT="${TELEGRAM_CHAT_ID:-$(grep "^TELEGRAM_CHAT_ID=" "$DEPLOY_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')}"

now() { date -u '+%Y-%m-%dT%H:%M:%SZ'; }
log() { echo "$(now) $*" >> "$LOG"; }

# Rotate log at 100KB to avoid unbounded growth
if [ -f "$LOG" ] && [ "$(stat -c%s "$LOG" 2>/dev/null || echo 0)" -gt 102400 ]; then
  tail -200 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"
fi

# Read state: {consecutive_fails, last_alert_ts, last_action}
if [ -f "$STATE_FILE" ]; then
  FAILS=$(grep -o '"consecutive_fails":[0-9]*' "$STATE_FILE" | cut -d: -f2)
  LAST_ALERT=$(grep -o '"last_alert_ts":[0-9]*' "$STATE_FILE" | cut -d: -f2)
  LAST_ACTION=$(grep -o '"last_action":"[^"]*"' "$STATE_FILE" | cut -d\" -f4)
else
  FAILS=0
  LAST_ALERT=0
  LAST_ACTION="none"
fi
FAILS=${FAILS:-0}
LAST_ALERT=${LAST_ALERT:-0}
LAST_ACTION=${LAST_ACTION:-none}

# Probe — give it 8s. blockid.au should respond in <500ms p95.
CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 8 "$URL")
NOW_TS=$(date +%s)

# Extended probe: verify the first CSS asset referenced in the HTML also loads.
# Catches the 2026-07-16 outage class where HTML rendered but /_next/static/*.css
# 404'd → unstyled site. Only run if the primary probe passes (else HTML would be empty).
CSS_CODE=""
if [ "$CODE" = "200" ]; then
  FIRST_CSS=$(curl -s --max-time 5 "$URL" | grep -oE 'href="/_next/static/[^"]+\.css"' | head -1 | sed 's/href="//;s/"//')
  if [ -n "$FIRST_CSS" ]; then
    CSS_CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "${URL%/}$FIRST_CSS")
    if [ "$CSS_CODE" != "200" ]; then
      # Downgrade HTML pass to failure — site is up but visually broken
      CODE="css_$CSS_CODE"
    fi
  fi
fi

# Healthy path
if [ "$CODE" = "200" ]; then
  if [ "$FAILS" -gt 0 ]; then
    log "RECOVERED after $FAILS consecutive fail(s) — last action: $LAST_ACTION"
    # Reset state
    cat > "$STATE_FILE" <<EOF
{"consecutive_fails":0,"last_alert_ts":$NOW_TS,"last_action":"recovered"}
EOF
    # Optional recovery ping (only if we previously alerted)
    if [ "$LAST_ACTION" != "none" ] && [ "$LAST_ACTION" != "recovered" ] && [ -n "$TG_BOT" ] && [ -n "$TG_CHAT" ]; then
      curl -s "https://api.telegram.org/bot${TG_BOT}/sendMessage" \
        -d "chat_id=$TG_CHAT" \
        -d "text=✅ blockid.au RECOVERED · last action: $LAST_ACTION" \
        > /dev/null 2>&1
    fi
  fi
  exit 0
fi

# Failure path — increment and act
FAILS=$((FAILS + 1))
log "FAIL #$FAILS: HTTP $CODE from $URL"

# Decide action based on consecutive fail count
ACTION="none"
ALERT_NOW=false

if [ "$FAILS" -eq 3 ]; then
  ACTION="restart_attempted"
  ALERT_NOW=true

  # G30/O07: an external/CDN failure must not directly kill a healthy
  # origin. The watchdog verifies local health and serializes any recovery
  # against deployment; it also loads the correct runtime environment.
  ACTION="watchdog_requested"
  if timeout 45 bash "$DEPLOY_DIR/scripts/watchdog.sh" >> "$LOG" 2>&1; then
    log "Origin watchdog completed; external recovery remains unverified until next probe"
  else
    ACTION="watchdog_failed"
    log "Origin watchdog failed/timed out; no recovery success claimed"
  fi

elif [ "$FAILS" -ge 5 ] && [ "$LAST_ACTION" != "rollback_attempted" ]; then
  # Do not roll back healthy origin code for a CDN/DNS/network failure.
  ORIGIN_CODE=$(curl -s --connect-timeout 2 --max-time 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4001/ 2>/dev/null || true)
  ALERT_NOW=true
  if [ "$ORIGIN_CODE" = "200" ]; then
    ACTION="external_failure_origin_healthy"
    log "External probe failed but origin is healthy — application rollback suppressed"
  else
    ACTION="rollback_attempted"
    log "5+ external failures plus unhealthy origin — requesting serialized rollback"
    nohup bash "$DEPLOY_DIR/scripts/deploy-live.sh" --rollback > /tmp/blockid-rollback.log 2>&1 &
    log "Rollback dispatched; success remains unverified until recovery probes"
  fi
fi

# Throttle Telegram so the same incident only pages once per 15 min
COOLDOWN=$((15 * 60))
if [ "$ALERT_NOW" = true ] && [ -n "$TG_BOT" ] && [ -n "$TG_CHAT" ] && [ "$((NOW_TS - LAST_ALERT))" -gt $COOLDOWN ]; then
  MSG="🔴 *blockid.au DOWN*
Consecutive fails: $FAILS
HTTP: $CODE
Action: \`$ACTION\`
Time: $(now)"
  curl -s "https://api.telegram.org/bot${TG_BOT}/sendMessage" \
    -d "chat_id=$TG_CHAT" \
    -d "text=$MSG" \
    -d "parse_mode=Markdown" \
    > /dev/null 2>&1
  LAST_ALERT=$NOW_TS
  log "Telegram alert sent (action=$ACTION)"
fi

# Persist state
cat > "$STATE_FILE" <<EOF
{"consecutive_fails":$FAILS,"last_alert_ts":$LAST_ALERT,"last_action":"$ACTION"}
EOF

exit 0
