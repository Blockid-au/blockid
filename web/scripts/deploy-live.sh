#!/bin/bash
# BlockID.au — Zero-Downtime Deploy from Source
#
# Strategy:
#   1. Build new version in .next/
#   2. Prepare standalone in .next/standalone/
#   3. Start new process on temp port 4099
#   4. Health check new process
#   5. If healthy: kill old → start new on port 4001 (< 1s gap)
#   6. If unhealthy: keep old running, report error
#
# Backup: previous build saved in .next-backup/ for instant rollback
#
# Usage:
#   bash scripts/deploy-live.sh          # full build + deploy
#   bash scripts/deploy-live.sh --skip-build  # deploy existing build
#   bash scripts/deploy-live.sh --rollback    # restore previous build
#
# Never use Docker, GitLab CI, or GitHub Actions for deployment.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
STANDALONE="$WEB_DIR/.next/standalone"
BACKUP_DIR="$WEB_DIR/.next-backup"
LOG="/tmp/blockid-production.log"
LOG_NEW="/tmp/blockid-production-new.log"
PID_FILE="/tmp/blockid-production.pid"
TEMP_PORT=4099
PROD_PORT=4001

cd "$WEB_DIR"

# ── Helper: load .env safely ──────────────────────────────────────────
load_env() {
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
  ")"
  export NODE_ENV=production
  export HOSTNAME=0.0.0.0
  export SUPABASE_URL=http://127.0.0.1:8000
  export REDIS_URL=redis://127.0.0.1:6379
}

# ── Rollback ──────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  echo "=== ROLLBACK ==="
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ No backup found at $BACKUP_DIR"
    exit 1
  fi
  echo "Restoring backup..."
  rm -rf "$WEB_DIR/.next"
  mv "$BACKUP_DIR" "$WEB_DIR/.next"
  # Restart with restored build
  load_env
  export PORT=$PROD_PORT
  if [ -f "$PID_FILE" ]; then
    kill "$(cat "$PID_FILE")" 2>/dev/null || true
  fi
  fuser -k $PROD_PORT/tcp 2>/dev/null || true
  sleep 1
  cd "$STANDALONE"
  nohup node server.js > "$LOG" 2>&1 &
  echo $! > "$PID_FILE"
  sleep 3
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PROD_PORT/)
  echo "✅ Rolled back: HTTP $HTTP — PID $(cat "$PID_FILE")"
  exit 0
fi

echo "============================================"
echo "  BlockID.au — Zero-Downtime Deploy"
echo "============================================"
echo ""

# ── Step 1: Build ─────────────────────────────────────────────────────
if [ "${1:-}" != "--skip-build" ]; then
  echo "=== Step 1: Building from source ==="

  # Backup current build
  if [ -d "$WEB_DIR/.next/standalone/server.js" ] 2>/dev/null || [ -d "$WEB_DIR/.next" ]; then
    rm -rf "$BACKUP_DIR"
    cp -r "$WEB_DIR/.next" "$BACKUP_DIR" 2>/dev/null || true
    echo "  Backup saved to .next-backup/"
  fi

  rm -rf "$WEB_DIR/.next"
  npm run build
  echo "  ✅ Build complete"
else
  echo "=== Step 1: Skipping build (--skip-build) ==="
  if [ ! -f "$STANDALONE/server.js" ]; then
    echo "❌ No standalone build found. Run without --skip-build"
    exit 1
  fi
fi

# ── Step 2: Prepare standalone ────────────────────────────────────────
echo ""
echo "=== Step 2: Preparing standalone ==="
cp -r "$WEB_DIR/.next/static" "$STANDALONE/.next/static"
cp -r "$WEB_DIR/public" "$STANDALONE/public"
cp "$WEB_DIR/ai-worker.mjs" "$STANDALONE/ai-worker.mjs" 2>/dev/null || true

# Copy serverExternalPackages not traced by standalone
for pkg in pptxgenjs gaxios gcp-metadata; do
  if [ -d "$WEB_DIR/node_modules/$pkg" ] && [ ! -d "$STANDALONE/node_modules/$pkg" ]; then
    cp -r "$WEB_DIR/node_modules/$pkg" "$STANDALONE/node_modules/$pkg"
  fi
done
echo "  ✅ Static assets + external packages copied"

# ── Step 3: Health check new build on temp port ──────────────────────
echo ""
echo "=== Step 3: Testing new build on port $TEMP_PORT ==="
load_env
export PORT=$TEMP_PORT

fuser -k $TEMP_PORT/tcp 2>/dev/null || true
sleep 1

cd "$STANDALONE"
nohup node server.js > "$LOG_NEW" 2>&1 &
NEW_PID=$!

# Wait for new process to be ready (max 15s)
HEALTHY=false
for i in $(seq 1 15); do
  sleep 1
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$TEMP_PORT/ 2>/dev/null || echo "000")
  if [ "$HTTP" = "200" ]; then
    HEALTHY=true
    echo "  ✅ New build healthy on port $TEMP_PORT (attempt $i)"
    break
  fi
  echo "  [$i/15] HTTP $HTTP — waiting..."
done

# Kill temp process
kill $NEW_PID 2>/dev/null || true
fuser -k $TEMP_PORT/tcp 2>/dev/null || true
sleep 1

if [ "$HEALTHY" != "true" ]; then
  echo ""
  echo "❌ New build FAILED health check!"
  echo "   Last 20 lines of log:"
  tail -20 "$LOG_NEW"
  echo ""
  echo "   Old build is still running. No changes made."
  echo "   Fix the issue and try again."
  # Restore backup if we built
  if [ "${1:-}" != "--skip-build" ] && [ -d "$BACKUP_DIR" ]; then
    echo "   Restoring backup..."
    rm -rf "$WEB_DIR/.next"
    mv "$BACKUP_DIR" "$WEB_DIR/.next"
  fi
  exit 1
fi

# ── Step 4: Swap (< 1s downtime) ─────────────────────────────────────
echo ""
echo "=== Step 4: Swapping to production (port $PROD_PORT) ==="

# Kill old process
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  echo "  Stopped old process (PID $OLD_PID)"
fi
fuser -k $PROD_PORT/tcp 2>/dev/null || true
sleep 1

# Start new process on production port
export PORT=$PROD_PORT
cd "$STANDALONE"
nohup node server.js > "$LOG" 2>&1 &
echo $! > "$PID_FILE"

# ── Step 5: Verify production ─────────────────────────────────────────
sleep 3
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PROD_PORT/)
HTTPS=$(curl -s -o /dev/null -w "%{http_code}" https://blockid.au/ 2>/dev/null || echo "skip")

echo ""
echo "============================================"
if [ "$HTTP" = "200" ]; then
  echo "  ✅ DEPLOY SUCCESS"
  echo "  PID: $(cat "$PID_FILE")"
  echo "  Local: HTTP $HTTP"
  echo "  Public: HTTP $HTTPS"
  echo "  Log: $LOG"
  echo "  Rollback: bash scripts/deploy-live.sh --rollback"
else
  echo "  ❌ DEPLOY FAILED on production port"
  echo "  HTTP: $HTTP"
  tail -20 "$LOG"
  echo ""
  echo "  Run: bash scripts/deploy-live.sh --rollback"
fi
echo "============================================"
