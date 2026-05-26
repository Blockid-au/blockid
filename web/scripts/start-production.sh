#!/bin/bash
# Start BlockID.au production server (standalone, no Docker)
#
# Usage: bash scripts/start-production.sh
# Stop:  bash scripts/stop-production.sh  (or: fuser -k 4001/tcp)

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$WEB_DIR/.next/standalone"
LOG="/tmp/blockid-production.log"
PID_FILE="/tmp/blockid-production.pid"

# Stop existing
if [ -f "$PID_FILE" ]; then
  kill "$(cat "$PID_FILE")" 2>/dev/null || true
  rm -f "$PID_FILE"
fi
fuser -k 4001/tcp 2>/dev/null || true
sleep 1

# Verify build exists
if [ ! -f "$STANDALONE/server.js" ]; then
  echo "No standalone build found. Running: npm run build"
  cd "$WEB_DIR" && npm run build
  cp -r "$WEB_DIR/.next/static" "$STANDALONE/.next/static"
  cp -r "$WEB_DIR/public" "$STANDALONE/public"
  cp "$WEB_DIR/ai-worker.mjs" "$STANDALONE/ai-worker.mjs" 2>/dev/null || true
fi

# Load .env safely via node (handles all special chars: <>, quotes, $, etc.)
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
    const val = trimmed.slice(idx + 1);
    // Single-quote the value to prevent shell interpretation
    const escaped = val.replace(/'/g, \"'\\\\\\\"'\\\\\\\"'\");
    console.log('export ' + key + \"='\" + escaped + \"'\");
  }
")"

# Override runtime vars
export PORT=4001
export HOSTNAME=0.0.0.0
export NODE_ENV=production
# Standalone runs on host — use localhost instead of Docker hostname
export SUPABASE_URL=http://127.0.0.1:8000

echo "Starting BlockID.au production on port 4001..."
nohup node server.js > "$LOG" 2>&1 &
echo $! > "$PID_FILE"

sleep 3
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:4001/)
if [ "$HTTP" = "200" ]; then
  echo "✅ Live: HTTP $HTTP — PID $(cat "$PID_FILE")"
  echo "   Log: $LOG"
else
  echo "❌ Failed: HTTP $HTTP"
  tail -20 "$LOG"
  exit 1
fi
