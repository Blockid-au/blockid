#!/bin/bash
# BlockID.au Watchdog — auto-restart if process dead or unhealthy
# Cron: */2 * * * *
# Cost: ~5ms CPU per check when healthy

PID_FILE="/tmp/blockid-production.pid"
LOG="/tmp/blockid-watchdog.log"
PORT=4001

# Quick check: PID alive AND HTTP 200?
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    HTTP=$(curl -sf --connect-timeout 3 --max-time 5 -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
    [ "$HTTP" = "200" ] && exit 0
  fi
fi

# Dead or unhealthy — force kill everything on port and restart
echo "$(date '+%m-%d %H:%M') restart" >> "$LOG"
# Truncate log if > 50KB
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 51200 ] && tail -20 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"

# Aggressive cleanup: kill by PID, then by port, then wait
[ -f "$PID_FILE" ] && kill -9 "$(cat "$PID_FILE")" 2>/dev/null
fuser -k $PORT/tcp 2>/dev/null
sleep 2
# Double-check port is free
fuser -k -9 $PORT/tcp 2>/dev/null
sleep 1

STANDALONE="/home/dovanlong/blockid.au/web/.next/standalone"
[ -f "$STANDALONE/server.js" ] || exit 1

cd "$STANDALONE"
export PORT=$PORT HOSTNAME=0.0.0.0 NODE_ENV=production
export SUPABASE_URL=http://127.0.0.1:8000 REDIS_URL=redis://127.0.0.1:6379
while IFS='=' read -r k v; do
  [ -z "$k" ] && continue
  v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
  export "$k=$v" 2>/dev/null
done < <(grep -v '^\s*#\|^\s*$' /home/dovanlong/blockid.au/web/.env)
export SUPABASE_URL=http://127.0.0.1:8000 REDIS_URL=redis://127.0.0.1:6379
# Override PORT again — .env may contain PORT=3000 (for Docker) which must not win here
export PORT=4001

nohup node server.js >> /tmp/blockid-production.log 2>&1 &
echo $! > "$PID_FILE"

# Verify restart succeeded
sleep 3
HTTP=$(curl -sf --connect-timeout 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
echo "  → PID $(cat "$PID_FILE") HTTP $HTTP" >> "$LOG"
