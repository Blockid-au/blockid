#!/bin/bash
# BlockID.au Watchdog — lightweight, zero-cost auto-restart
# Cron: */2 * * * * (every 2 min, not every 1 min — saves CPU)
# Total cost: ~5ms CPU per check (just kill -0 + curl)

PID_FILE="/tmp/blockid-production.pid"
LOG="/tmp/blockid-watchdog.log"

# Quick check: PID alive?
[ -f "$PID_FILE" ] && kill -0 "$(cat "$PID_FILE")" 2>/dev/null && \
  curl -sf --connect-timeout 3 --max-time 5 -o /dev/null http://127.0.0.1:4001/ && exit 0

# Dead or unhealthy — restart
echo "$(date '+%H:%M') restart" >> "$LOG"
# Truncate log if > 50KB
[ -f "$LOG" ] && [ "$(wc -c < "$LOG")" -gt 51200 ] && tail -20 "$LOG" > "${LOG}.tmp" && mv "${LOG}.tmp" "$LOG"

fuser -k 4001/tcp 2>/dev/null; sleep 1
cd /home/dovanlong/blockid.au/web/.next/standalone || exit 1

# Inline env load — no Node.js, pure bash, near-zero cost
export PORT=4001 HOSTNAME=0.0.0.0 NODE_ENV=production
export SUPABASE_URL=http://127.0.0.1:8000 REDIS_URL=redis://127.0.0.1:6379
while IFS='=' read -r k v; do
  [ -z "$k" ] && continue
  v="${v#\"}"; v="${v%\"}" ; v="${v#\'}"; v="${v%\'}"
  export "$k=$v" 2>/dev/null
done < <(grep -v '^\s*#\|^\s*$' /home/dovanlong/blockid.au/web/.env)
# Re-apply host overrides (must come AFTER .env load)
export SUPABASE_URL=http://127.0.0.1:8000 REDIS_URL=redis://127.0.0.1:6379

nohup node server.js >> /tmp/blockid-production.log 2>&1 &
echo $! > "$PID_FILE"
