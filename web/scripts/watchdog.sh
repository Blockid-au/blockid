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

# G15 follow-up (2026-09-18): record WHY before we kill anything — the
# 2026-09-17 08:02–08:08 UTC quadruple restart left no trace. One JSON row per
# restart in content/reports/watchdog-restarts.jsonl (read by /api/status and
# the error digest) + the last 40 production-log lines + an OOM check, then an
# ops alert (Telegram → e-mail fallback).
WEB_DIR="/home/dovanlong/blockid.au/web"
PROD_LOG="/data/logs/blockid-production.log"
[ -f "$PROD_LOG" ] || PROD_LOG="/tmp/blockid-production.log"
TS_ISO="$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
OLD_PID="$( [ -f "$PID_FILE" ] && cat "$PID_FILE" || echo "" )"
PID_ALIVE=0; [ -n "$OLD_PID" ] && kill -0 "$OLD_PID" 2>/dev/null && PID_ALIVE=1
PORT_OWNER="$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)"
MEM_PCT="$(free 2>/dev/null | awk '/Mem:/ {printf "%d", $3*100/$2}')"
LOAD_1="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"
OOM_HIT="$( (dmesg -T 2>/dev/null || journalctl -k --since '-15min' --no-pager 2>/dev/null) | grep -iE 'out of memory|oom-kill|killed process' | tail -1 | head -c 200 )"
RSS_KB="$( [ -n "$OLD_PID" ] && ps -o rss= -p "$OLD_PID" 2>/dev/null | tr -d ' ' || echo "" )"
DEPLOY_ACTIVE=0; flock -n /tmp/blockid-deploy.lock true 2>/dev/null || DEPLOY_ACTIVE=1
TAIL_LOG="$(tail -n 40 "$PROD_LOG" 2>/dev/null | tr -d '\r' | sed 's/"/\\"/g' | tr '\n' '\t' | head -c 3000)"
mkdir -p "$WEB_DIR/content/reports" 2>/dev/null
printf '{"ts":"%s","http":"%s","old_pid":"%s","pid_alive":%s,"port_owner":"%s","rss_kb":"%s","mem_pct":"%s","load_1":"%s","deploy_active":%s,"oom":"%s","log_tail":"%s"}\n' \
  "$TS_ISO" "${HTTP:-000}" "$OLD_PID" "$PID_ALIVE" "$PORT_OWNER" "$RSS_KB" "$MEM_PCT" "$LOAD_1" "$DEPLOY_ACTIVE" "$(printf '%s' "$OOM_HIT" | sed 's/"/\\"/g')" "$TAIL_LOG" \
  >> "$WEB_DIR/content/reports/watchdog-restarts.jsonl" 2>/dev/null
echo "  why: http=${HTTP:-000} pid_alive=$PID_ALIVE port_owner=${PORT_OWNER:-none} rss_kb=${RSS_KB:-?} mem=${MEM_PCT:-?}% load=${LOAD_1:-?} deploy_active=$DEPLOY_ACTIVE oom=${OOM_HIT:+yes}" >> "$LOG"
if [ "$DEPLOY_ACTIVE" = "0" ] && [ -f /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh ]; then
  # shellcheck source=/dev/null
  . /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh 2>/dev/null && \
    ops_alert "🚨 Watchdog restarted production" "http=${HTTP:-000} pid_alive=$PID_ALIVE rss_kb=${RSS_KB:-?} mem=${MEM_PCT:-?}% load=${LOAD_1:-?} oom=${OOM_HIT:-none}" || true
fi
# Truncate log if > 50KB
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 51200 ] && tail -20 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"

# Aggressive cleanup: kill by PID, then by port, then wait
[ -f "$PID_FILE" ] && kill -9 "$(cat "$PID_FILE")" 2>/dev/null
fuser -k $PORT/tcp 2>/dev/null
sleep 2
# Double-check port is free
fuser -k -9 $PORT/tcp 2>/dev/null
sleep 1

# Restart from the immutable CURRENT release (releases/<BUILD_ID>), NOT from
# .next/standalone — a build does `rm -rf .next`, so standalone can vanish
# mid-deploy. The release symlink always points at a complete, frozen build.
CURRENT_LINK="/home/dovanlong/blockid.au/web/.next-current"
RELEASE="$(readlink -f "$CURRENT_LINK" 2>/dev/null)"
[ -n "$RELEASE" ] && [ -f "$RELEASE/server.js" ] || RELEASE="/home/dovanlong/blockid.au/web/.next/standalone"
[ -f "$RELEASE/server.js" ] || exit 1

cd "$RELEASE"
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

nohup node server.js >> /data/logs/blockid-production.log 2>&1 &   # G15-R2 log home
echo $! > "$PID_FILE"

# Verify restart succeeded
sleep 3
HTTP=$(curl -sf --connect-timeout 3 -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
echo "  → PID $(cat "$PID_FILE") HTTP $HTTP" >> "$LOG"
