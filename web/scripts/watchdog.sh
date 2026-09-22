#!/bin/bash
# BlockID.au Watchdog — auto-restart if process dead or unhealthy
# Cron: */2 * * * *
# Cost: ~5ms CPU per check when healthy

PID_FILE="/tmp/blockid-production.pid"
LOG="/tmp/blockid-watchdog.log"
PORT=4001

# Quick check: PID alive AND HTTP 200?
STRIKE_FILE="/tmp/blockid-watchdog.strike"
PID_ALIVE=0
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    PID_ALIVE=1
    # 10 s budget (was 5): a build/vitest gate pushes load to 10–18 and a
    # healthy server answers slowly — that is not "dead".
    HTTP=$(curl -sf --connect-timeout 3 --max-time 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
    if [ "$HTTP" = "200" ]; then rm -f "$STRIKE_FILE"; exit 0; fi
  fi
fi

# G15 review 2026-09-18: the watchdog kill -9'd a LIVE server three times
# during the 08:00 deploy (http=000 only because the box was at load 18) and
# the same pattern explains 2026-09-17 08:02–08:08. Rules:
#   • pid alive but slow/unhealthy → never kill on the first strike; a second
#     consecutive strike (≥ 2 min) restarts. During an active deploy never kill
#     a live pid at all — deploy-live.sh owns the swap and rolls back itself.
#   • pid dead / port empty → restart immediately, deploy or not (the swap
#     will replace it; a dead server is downtime NOW).
DEPLOY_ACTIVE=0; flock -n /tmp/blockid-deploy.lock true 2>/dev/null || DEPLOY_ACTIVE=1
if [ "$PID_ALIVE" = "1" ]; then
  if [ "$DEPLOY_ACTIVE" = "1" ]; then
    echo "$(date '+%m-%d %H:%M') slow/unhealthy (http=${HTTP:-000}) but pid $PID alive during a deploy — not restarting" >> "$LOG"
    exit 0
  fi
  if [ ! -f "$STRIKE_FILE" ]; then
    date -u +%s > "$STRIKE_FILE"
    echo "$(date '+%m-%d %H:%M') strike 1: pid $PID alive, http=${HTTP:-000} — re-check next tick before restarting" >> "$LOG"
    exit 0
  fi
fi
# G30/O07: hold the SAME deploy lock throughout a recovery, including
# dead-PID recovery. A point-in-time lock check permits a swap/restart race.
exec 201>/tmp/blockid-deploy.lock
if ! flock -n 201; then
  echo "$(date '+%m-%d %H:%M') recovery deferred — deploy/recovery owns lock" >> "$LOG"
  exit 0
fi
# State may have changed while the initial probes were running.
if [ -f "$PID_FILE" ]; then
  PID=$(cat "$PID_FILE")
  if kill -0 "$PID" 2>/dev/null; then
    HTTP=$(curl -sf --connect-timeout 3 --max-time 10 -o /dev/null -w "%{http_code}" "http://127.0.0.1:$PORT/" 2>/dev/null)
    if [ "$HTTP" = "200" ]; then rm -f "$STRIKE_FILE"; exit 0; fi
  fi
fi
rm -f "$STRIKE_FILE"

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
PORT_OWNER="$(ss -ltnp 2>/dev/null | grep ":$PORT " | grep -oP 'pid=\K[0-9]+' | head -1)"
MEM_PCT="$(free 2>/dev/null | awk '/Mem:/ {printf "%d", $3*100/$2}')"
LOAD_1="$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"
OOM_HIT="$( (dmesg -T 2>/dev/null || journalctl -k --since '-15min' --no-pager 2>/dev/null) | grep -iE 'out of memory|oom-kill|killed process' | tail -1 | head -c 200 )"
RSS_KB="$( [ -n "$OLD_PID" ] && ps -o rss= -p "$OLD_PID" 2>/dev/null | tr -d ' ' || echo "" )"
mkdir -p "$WEB_DIR/content/reports" 2>/dev/null
if command -v jq >/dev/null 2>&1; then
  jq -cn --arg ts "$TS_ISO" --arg http "${HTTP:-000}" --arg old_pid "$OLD_PID" --argjson pid_alive "$PID_ALIVE" \
    --arg port_owner "$PORT_OWNER" --arg rss_kb "$RSS_KB" --arg mem_pct "$MEM_PCT" --arg load_1 "$LOAD_1" \
    --argjson deploy_active "$DEPLOY_ACTIVE" --arg oom "$OOM_HIT" --arg tail "$(tail -n 40 "$PROD_LOG" 2>/dev/null | head -c 3000)" \
    '{ts:$ts,http:$http,old_pid:$old_pid,pid_alive:$pid_alive,port_owner:$port_owner,rss_kb:$rss_kb,mem_pct:$mem_pct,load_1:$load_1,deploy_active:$deploy_active,oom:$oom,log_tail:$tail}' \
    >> "$WEB_DIR/content/reports/watchdog-restarts.jsonl" 2>/dev/null
fi
echo "  why: http=${HTTP:-000} pid_alive=$PID_ALIVE port_owner=${PORT_OWNER:-none} rss_kb=${RSS_KB:-?} mem=${MEM_PCT:-?}% load=${LOAD_1:-?} deploy_active=$DEPLOY_ACTIVE oom=${OOM_HIT:+yes}" >> "$LOG"
if [ "$DEPLOY_ACTIVE" = "0" ] && [ -f /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh ]; then
  # shellcheck source=/dev/null
  ( . /home/dovanlong/blockid.au/scripts/lib/ops-alert.sh 2>/dev/null && \
    ops_alert "🚨 Watchdog restarted production" "http=${HTTP:-000} pid_alive=$PID_ALIVE rss_kb=${RSS_KB:-?} mem=${MEM_PCT:-?}% load=${LOAD_1:-?} oom=${OOM_HIT:-none}" ) >/dev/null 2>&1 201>&- &
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

nohup node server.js >> /data/logs/blockid-production.log 2>&1 201>&- &   # G15-R2 log home
echo $! > "$PID_FILE"

# Verify restart succeeded
sleep 3
HTTP=$(curl -sf --connect-timeout 3 --max-time 10 -o /dev/null -w "%{http_code}" http://127.0.0.1:$PORT/ 2>/dev/null)
echo "  → PID $(cat "$PID_FILE") HTTP $HTTP" >> "$LOG"

[ "$HTTP" = "200" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null
