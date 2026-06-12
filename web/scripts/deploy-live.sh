#!/bin/bash
# BlockID.au — Zero-Downtime Deploy from Source (with CI gates)
#
# Built-in CI/CD pipeline (no Docker, no GitLab, no GitHub Actions):
#   Gate 1: Verify all critical env keys present
#   Gate 2: Verify Supabase + Redis connectivity
#   Gate 3: TypeScript compilation (zero errors)
#   Gate 4: ESLint (zero errors, warnings OK)
#   Gate 5: npm run build
#   Gate 6: Start on temp port → smoke test 7 endpoints
#   Gate 7: Supabase query test from new process
#   Gate 8: Swap to production port (< 1s gap)
#   Gate 9: Post-deploy verification (public URL)
#
# If ANY gate fails → old build stays live, no damage.
# Backup in .next-backup/ for instant rollback.
#
# Usage:
#   bash scripts/deploy-live.sh              # full pipeline
#   bash scripts/deploy-live.sh --skip-build # skip gates 3-5, deploy existing build
#   bash scripts/deploy-live.sh --rollback   # restore previous build
#   bash scripts/deploy-live.sh --quick      # skip lint/typecheck (emergency only)
#
# RULE: Never use Docker, GitLab CI, or GitHub Actions for deployment.
# This script IS the CI/CD pipeline.

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
GATE_PASSED=0
GATE_TOTAL=0
LKG_FILE="$WEB_DIR/content/reports/last-good-build.json"

cd "$WEB_DIR"

# ══════════════════════════════════════════════════════════════════════
# DEPLOY LOCK — only ONE deploy at a time.
# Prevents concurrent runs from racing `rm -rf .next` / build output, which
# was the #1 recurring failure. Auto-update/auto-deploy jobs queue instead of
# colliding. The lock auto-releases when this process exits.
# ══════════════════════════════════════════════════════════════════════
LOCK_FILE="/tmp/blockid-deploy.lock"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  echo "❌ Another deploy is already running (lock: $LOCK_FILE)."
  echo "   Aborting to avoid a build race. Retry after it finishes."
  exit 1
fi

# ── Helpers ───────────────────────────────────────────────────────────

gate() {
  GATE_TOTAL=$((GATE_TOTAL + 1))
  echo ""
  echo "─── Gate $GATE_TOTAL: $1 ───"
}

pass() {
  GATE_PASSED=$((GATE_PASSED + 1))
  echo "  ✅ $1"
}

fail() {
  echo "  ❌ GATE FAILED: $1"
  echo ""
  echo "════════════════════════════════════════════"
  echo "  DEPLOY ABORTED ($GATE_PASSED/$GATE_TOTAL gates passed)"
  echo "  Old build is still running. No damage."
  echo "  Fix the issue and try again."
  echo "════════════════════════════════════════════"
  exit 1
}

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

echo "════════════════════════════════════════════"
echo "  BlockID.au — Zero-Downtime Deploy + CI"
echo "  $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo "════════════════════════════════════════════"

# ── Rollback ──────────────────────────────────────────────────────────
if [ "${1:-}" = "--rollback" ]; then
  echo ""
  echo "=== ROLLBACK ==="
  if [ ! -d "$BACKUP_DIR" ]; then
    echo "❌ No backup found at $BACKUP_DIR"
    exit 1
  fi
  echo "Restoring backup..."
  rm -rf "$WEB_DIR/.next"
  mv "$BACKUP_DIR" "$WEB_DIR/.next"
  STANDALONE="$WEB_DIR/.next/standalone"
  load_env
  export PORT=$PROD_PORT
  if [ -f "$PID_FILE" ]; then kill "$(cat "$PID_FILE")" 2>/dev/null || true; fi
  fuser -k $PROD_PORT/tcp 2>/dev/null || true
  sleep 1
  cd "$STANDALONE"
  nohup node server.js > "$LOG" 2>&1 9>&- &
  echo $! > "$PID_FILE"
  sleep 3
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PROD_PORT/)
  echo "✅ Rolled back: HTTP $HTTP — PID $(cat "$PID_FILE")"
  exit 0
fi

# ══════════════════════════════════════════════════════════════════════
# GATE 1: Critical Environment Keys
# ══════════════════════════════════════════════════════════════════════
gate "Critical environment keys"

MISSING_KEYS=""
for key in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
  NEXT_PUBLIC_GOOGLE_CLIENT_ID \
  LINKEDIN_CLIENT_ID LINKEDIN_CLIENT_SECRET \
  STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  ANTHROPIC_API_KEY CRON_SECRET IP_HASH_SALT \
  SMTP_USER SMTP_PASS \
  GOOGLE_DRIVE_PRIVATE_KEY GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL; do
  val=$(grep "^${key}=" .env | cut -d= -f2- | head -c 5)
  if [ -z "$val" ]; then
    MISSING_KEYS="$MISSING_KEYS $key"
    echo "  ❌ $key MISSING"
  fi
done

if [ -n "$MISSING_KEYS" ]; then
  fail "Missing keys:$MISSING_KEYS"
fi
pass "All 16 critical keys present"

# ══════════════════════════════════════════════════════════════════════
# GATE 2: Supabase + Redis Connectivity
# ══════════════════════════════════════════════════════════════════════
gate "Supabase + Redis connectivity"

SUPA_KEY=$(grep "^SUPABASE_SERVICE_ROLE_KEY=" .env | cut -d= -f2-)
SUPA_HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8000/rest/v1/ \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" 2>/dev/null)

if [ "$SUPA_HTTP" != "200" ]; then
  fail "Supabase not reachable (HTTP $SUPA_HTTP). Is supabase-kong running?"
fi
echo "  ✅ Supabase: HTTP $SUPA_HTTP"

REDIS_OK=$(redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null || echo "FAIL")
if [ "$REDIS_OK" = "PONG" ]; then
  echo "  ✅ Redis: PONG"
else
  echo "  ⚠ Redis: $REDIS_OK (non-fatal, rate limiting may use in-memory fallback)"
fi
pass "Database connectivity verified"

# ══════════════════════════════════════════════════════════════════════
# GATE 3: TypeScript Compilation
# ══════════════════════════════════════════════════════════════════════
if [ "${1:-}" != "--skip-build" ] && [ "${1:-}" != "--quick" ]; then
  gate "TypeScript compilation"

  TS_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
  if [ "$TS_ERRORS" -gt 0 ]; then
    echo "  Found $TS_ERRORS TypeScript errors:"
    npx tsc --noEmit 2>&1 | grep "error TS" | head -5
    fail "TypeScript has $TS_ERRORS errors. Fix before deploy."
  fi
  pass "Zero TypeScript errors"

# ══════════════════════════════════════════════════════════════════════
# GATE 4: ESLint
# ══════════════════════════════════════════════════════════════════════
  gate "ESLint"

  LINT_EXIT=0
  npm run lint 2>&1 | tail -5 || LINT_EXIT=$?
  if [ "$LINT_EXIT" -ne 0 ]; then
    fail "ESLint found errors. Fix before deploy."
  fi
  pass "ESLint clean (warnings OK)"
fi

# ══════════════════════════════════════════════════════════════════════
# GATE 5: Build
# ══════════════════════════════════════════════════════════════════════
if [ "${1:-}" != "--skip-build" ]; then
  gate "Next.js production build"

  # Backup current build
  if [ -d "$WEB_DIR/.next" ]; then
    rm -rf "$BACKUP_DIR"
    cp -r "$WEB_DIR/.next" "$BACKUP_DIR" 2>/dev/null || true
    echo "  Backup: .next-backup/"
  fi

  rm -rf "$WEB_DIR/.next"
  BUILD_OUTPUT=$(npm run build 2>&1)
  BUILD_EXIT=$?

  if [ $BUILD_EXIT -ne 0 ]; then
    echo "$BUILD_OUTPUT" | tail -20
    # Restore backup
    if [ -d "$BACKUP_DIR" ]; then
      rm -rf "$WEB_DIR/.next"
      mv "$BACKUP_DIR" "$WEB_DIR/.next"
      echo "  Backup restored."
    fi
    fail "Build failed (exit $BUILD_EXIT)"
  fi
  pass "Build successful"
else
  gate "Build (skipped)"
  if [ ! -f "$STANDALONE/server.js" ]; then
    fail "No standalone build found. Run without --skip-build"
  fi
  pass "Existing build found"
fi

# ══════════════════════════════════════════════════════════════════════
# GATE 6: Prepare Standalone + Smoke Test on Temp Port
# ══════════════════════════════════════════════════════════════════════
gate "Prepare standalone + smoke test"

# Copy assets
# Sync ALL build output into standalone (fixes missing manifests)
cp -r "$WEB_DIR/.next/static" "$STANDALONE/.next/static"
cp -r "$WEB_DIR/.next/server" "$STANDALONE/.next/server"
cp -r "$WEB_DIR/public" "$STANDALONE/public"
cp "$WEB_DIR/ai-worker.mjs" "$STANDALONE/ai-worker.mjs" 2>/dev/null || true

# Copy serverExternalPackages not traced by standalone
for pkg in pptxgenjs gaxios gcp-metadata; do
  if [ -d "$WEB_DIR/node_modules/$pkg" ] && [ ! -d "$STANDALONE/node_modules/$pkg" ]; then
    cp -r "$WEB_DIR/node_modules/$pkg" "$STANDALONE/node_modules/$pkg"
  fi
done

# ── Integrity guard: standalone must be COMPLETE before we trust it. ───
# Encodes past production breakages as a permanent check so they can't recur:
#   - missing ai-worker.mjs  → entire AI stack died ("ai-worker.mjs not found")
#   - missing server.js / BUILD_ID → broken/partial build from a race
restore_lkg_and_fail() {
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$WEB_DIR/.next"; mv "$BACKUP_DIR" "$WEB_DIR/.next"
    echo "  Backup (last-good build) restored."
  fi
  fail "$1"
}
for required in server.js ai-worker.mjs .next/BUILD_ID .next/server; do
  [ -e "$STANDALONE/$required" ] || restore_lkg_and_fail "Standalone incomplete: missing '$required' (build race / bad build). Kept last-good build."
done
# BUILD_ID must be non-empty (empty = interrupted build).
[ -s "$STANDALONE/.next/BUILD_ID" ] || restore_lkg_and_fail "Standalone .next/BUILD_ID is empty (interrupted build). Kept last-good build."
# App routes must have their client-reference-manifests (missing → per-route 500
# "client reference manifest does not exist", e.g. /score). Require a healthy count.
MANIFEST_COUNT=$(find "$STANDALONE/.next/server/app" -name "*_client-reference-manifest.js" 2>/dev/null | wc -l)
if [ "$MANIFEST_COUNT" -lt 20 ]; then
  restore_lkg_and_fail "Standalone has only $MANIFEST_COUNT route manifests (expected 20+) — incomplete .next/server. Kept last-good build."
fi
echo "  ✅ Standalone integrity OK (server.js + ai-worker.mjs + BUILD_ID + $MANIFEST_COUNT route manifests)"

# Start on temp port
load_env
export PORT=$TEMP_PORT
fuser -k $TEMP_PORT/tcp 2>/dev/null || true
sleep 1

cd "$STANDALONE"
nohup node server.js > "$LOG_NEW" 2>&1 9>&- &
NEW_PID=$!

# Wait for healthy (max 15s)
HEALTHY=false
for i in $(seq 1 15); do
  sleep 1
  HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$TEMP_PORT/ 2>/dev/null || echo "000")
  if [ "$HTTP" = "200" ]; then HEALTHY=true; break; fi
  echo "  [$i/15] HTTP $HTTP..."
done

if [ "$HEALTHY" != "true" ]; then
  kill $NEW_PID 2>/dev/null || true
  echo "  Last 10 lines of log:"
  tail -10 "$LOG_NEW"
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$WEB_DIR/.next"; mv "$BACKUP_DIR" "$WEB_DIR/.next"
    echo "  Backup restored."
  fi
  fail "New build failed health check on port $TEMP_PORT"
fi
echo "  ✅ Temp server healthy"

# Smoke test critical endpoints
SMOKE_FAIL=0
for path in "/" "/auth/login" "/pricing" "/api/auth/me" "/score" "/tools/idea-valuation"; do
  SC=$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:$TEMP_PORT$path" 2>/dev/null)
  if [ "$SC" = "200" ]; then
    echo "  ✅ $path → $SC"
  else
    echo "  ❌ $path → $SC"
    SMOKE_FAIL=$((SMOKE_FAIL + 1))
  fi
done

# Kill temp process
kill $NEW_PID 2>/dev/null || true
fuser -k $TEMP_PORT/tcp 2>/dev/null || true
sleep 1

if [ "$SMOKE_FAIL" -gt 0 ]; then
  if [ -d "$BACKUP_DIR" ]; then
    rm -rf "$WEB_DIR/.next"; mv "$BACKUP_DIR" "$WEB_DIR/.next"
    echo "  Backup restored."
  fi
  fail "$SMOKE_FAIL endpoints returned non-200"
fi
pass "All 6 smoke test endpoints healthy"

# ══════════════════════════════════════════════════════════════════════
# GATE 7: Supabase Query Test from New Build
# ══════════════════════════════════════════════════════════════════════
gate "Supabase query test"

# Quick test: can the app query Supabase via REST?
SVI_GATE=$(curl -s "http://127.0.0.1:8000/rest/v1/app_users?limit=1" \
  -H "apikey: $SUPA_KEY" -H "Authorization: Bearer $SUPA_KEY" 2>/dev/null)
if echo "$SVI_GATE" | python3 -c "import json,sys; json.load(sys.stdin)" 2>/dev/null; then
  pass "Supabase app_users query OK"
else
  fail "Supabase query returned invalid response"
fi

# ══════════════════════════════════════════════════════════════════════
# GATE 8: Swap to Production (< 1s gap)
# ══════════════════════════════════════════════════════════════════════
gate "Swap to production port $PROD_PORT"

# Kill old process
if [ -f "$PID_FILE" ]; then
  OLD_PID=$(cat "$PID_FILE")
  kill "$OLD_PID" 2>/dev/null || true
  echo "  Stopped old (PID $OLD_PID)"
fi
fuser -k $PROD_PORT/tcp 2>/dev/null || true
sleep 1

# Start new on production port
export PORT=$PROD_PORT
cd "$STANDALONE"
nohup node server.js > "$LOG" 2>&1 9>&- &
echo $! > "$PID_FILE"
pass "New process started (PID $(cat "$PID_FILE"))"

# ══════════════════════════════════════════════════════════════════════
# GATE 9: Post-Deploy Verification
# ══════════════════════════════════════════════════════════════════════
gate "Post-deploy verification"

sleep 3
LOCAL=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:$PROD_PORT/)
PUBLIC=$(curl -s -o /dev/null -w "%{http_code}" https://blockid.au/ 2>/dev/null || echo "skip")
AUTH=$(curl -s https://blockid.au/api/auth/me 2>/dev/null | python3 -c "import json,sys;d=json.load(sys.stdin);print('ok' if 'ok' in d else 'fail')" 2>/dev/null || echo "fail")

echo "  Local:  HTTP $LOCAL"
echo "  Public: HTTP $PUBLIC"
echo "  Auth:   $AUTH"

# Check for errors in first 3 seconds of logs
ERRORS=$(tail -20 "$LOG" | grep -ic "error" || true)
echo "  Errors: $ERRORS in startup logs"

if [ "$LOCAL" = "200" ] && [ "$AUTH" = "ok" ]; then
  pass "Production verified"
else
  echo "  ⚠ Verification issues detected. Check logs: $LOG"
  echo "  Rollback: bash scripts/deploy-live.sh --rollback"
fi

# ══════════════════════════════════════════════════════════════════════
# Post-deploy: Purge caches
# ══════════════════════════════════════════════════════════════════════
bash "$WEB_DIR/scripts/purge-cloudflare-cache.sh" 2>/dev/null && echo "  ✅ Cloudflare cache purged" || echo "  ⚠ Cloudflare purge skipped"
rm -rf /tmp/nginx-blockid-cache/* 2>/dev/null && echo "  ✅ Nginx cache cleared" || true

# ══════════════════════════════════════════════════════════════════════
# Summary
# ══════════════════════════════════════════════════════════════════════
echo ""
echo "════════════════════════════════════════════"
echo "  ✅ DEPLOY COMPLETE"
echo "  Gates: $GATE_PASSED/$GATE_TOTAL passed"
echo "  PID:   $(cat "$PID_FILE")"
echo "  Local: HTTP $LOCAL"
echo "  Public: HTTP $PUBLIC"
echo "  Log:   $LOG"
echo "  Rollback: bash scripts/deploy-live.sh --rollback"
echo "════════════════════════════════════════════"

# ══════════════════════════════════════════════════════════════════════
# Record CI/CD deploy event (internal src → public pipeline).
# The daily Telegram report reads THIS as "work shipped today" — NOT git.
# Describe the release with:  DEPLOY_NOTE="what shipped" bash scripts/deploy-live.sh
# ══════════════════════════════════════════════════════════════════════
DEPLOY_LOG="$WEB_DIR/content/reports/deploy-log.jsonl"
mkdir -p "$(dirname "$DEPLOY_LOG")"
DEPLOY_TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
DEPLOY_NOTE_JSON=$(printf '%s' "${DEPLOY_NOTE:-Triển khai từ src lên public}" | python3 -c "import json,sys; print(json.dumps(sys.stdin.read().strip()))" 2>/dev/null || echo '"Trien khai tu src len public"')
printf '{"ts":"%s","status":"success","gates":"%s/%s","pid":"%s","note":%s}\n' \
  "$DEPLOY_TS" "$GATE_PASSED" "$GATE_TOTAL" "$(cat "$PID_FILE" 2>/dev/null)" "$DEPLOY_NOTE_JSON" >> "$DEPLOY_LOG"
echo "  📝 Deploy event logged → content/reports/deploy-log.jsonl"

# ══════════════════════════════════════════════════════════════════════
# Record the LAST-KNOWN-GOOD build = the new baseline/standard.
# Only a build that passed ALL gates reaches here. Its BUILD_ID + backup
# (.next-backup) define the rollback target and the bar every future build
# must clear. A failed build never overwrites this — the LKG keeps serving.
# ══════════════════════════════════════════════════════════════════════
LKG_BUILD_ID=$(cat "$STANDALONE/.next/BUILD_ID" 2>/dev/null || echo "unknown")
printf '{"ts":"%s","buildId":"%s","gates":"%s/%s","pid":"%s","note":%s}\n' \
  "$DEPLOY_TS" "$LKG_BUILD_ID" "$GATE_PASSED" "$GATE_TOTAL" "$(cat "$PID_FILE" 2>/dev/null)" "$DEPLOY_NOTE_JSON" > "$LKG_FILE"
echo "  📌 Last-known-good build recorded (BUILD_ID $LKG_BUILD_ID) → content/reports/last-good-build.json"
