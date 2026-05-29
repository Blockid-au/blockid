#!/bin/bash
# BlockID.au Production Watchdog
# Run via cron every 1 minute: * * * * * /home/dovanlong/blockid.au/web/scripts/watchdog.sh
#
# Checks:
# 1. Is the production process alive? (PID file check)
# 2. Does the homepage respond HTTP 200? (health check)
# 3. If dead or unhealthy → auto-restart from existing build
#
# Logs to /tmp/blockid-watchdog.log (rotated by size)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PID_FILE="/tmp/blockid-production.pid"
LOG="/tmp/blockid-watchdog.log"
PROD_PORT=4001
MAX_LOG_SIZE=1048576  # 1MB

# Rotate log if too large
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null)" -gt "$MAX_LOG_SIZE" ]; then
  mv "$LOG" "${LOG}.old"
fi

TS=$(date '+%Y-%m-%d %H:%M:%S')

# Check 1: Is process alive?
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    # Process alive — check HTTP health
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 --max-time 10 http://127.0.0.1:$PROD_PORT/ 2>/dev/null || echo "000")
    if [ "$HTTP" = "200" ]; then
      # All good — silent (don't spam log)
      exit 0
    else
      echo "$TS WARN: Process alive (PID $PID) but HTTP $HTTP — restarting" >> "$LOG"
      kill "$PID" 2>/dev/null
      sleep 2
    fi
  else
    echo "$TS WARN: PID $PID dead — restarting" >> "$LOG"
  fi
else
  echo "$TS WARN: No PID file — starting" >> "$LOG"
fi

# Check if port is still occupied by something else
fuser -k $PROD_PORT/tcp 2>/dev/null
sleep 1

# Restart using start-production.sh (uses existing build, no rebuild)
STANDALONE="$WEB_DIR/.next/standalone"
if [ ! -f "$STANDALONE/server.js" ]; then
  echo "$TS ERROR: No standalone build found at $STANDALONE/server.js — cannot restart" >> "$LOG"
  exit 1
fi

# Load env
cd "$STANDALONE"
eval "$(node -e "
  const fs = require('fs');
  const lines = fs.readFileSync('$WEB_DIR/.env', 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx);
    let val = trimmed.slice(idx + 1);
    if ((val.startsWith('\"') && val.endsWith('\"')) || (val.startsWith(\"'\") && val.endsWith(\"'\"))) {
      val = val.slice(1, -1);
    }
    const escaped = val.replace(/'/g, \"'\\\\\\\"'\\\\\\\"'\");
    console.log('export ' + key + \"='\" + escaped + \"'\");
  }
" 2>/dev/null)"

export PORT=$PROD_PORT
export HOSTNAME=0.0.0.0
export NODE_ENV=production
export SUPABASE_URL=http://127.0.0.1:8000
export REDIS_URL=redis://127.0.0.1:6379

nohup node server.js >> /tmp/blockid-production.log 2>&1 &
echo $! > "$PID_FILE"

sleep 3
HTTP=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 http://127.0.0.1:$PROD_PORT/ 2>/dev/null || echo "000")
if [ "$HTTP" = "200" ]; then
  echo "$TS OK: Restarted successfully — PID $(cat "$PID_FILE") HTTP $HTTP" >> "$LOG"
else
  echo "$TS ERROR: Restart failed — PID $(cat "$PID_FILE") HTTP $HTTP" >> "$LOG"
fi
