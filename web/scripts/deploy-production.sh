#!/bin/bash
# BlockID.au Production Deploy Script
#
# This script ensures:
# 1. .env backup before every deploy
# 2. All critical keys are verified
# 3. Docker build includes .env for NEXT_PUBLIC_* inlining
# 4. .env is NOT in final runtime image (multi-stage)
# 5. Runtime secrets injected via --env-file
#
# Usage: bash scripts/deploy-production.sh

set -e
cd "$(dirname "$0")/.."

echo "============================================"
echo "  BlockID.au — Production Deploy"
echo "============================================"
echo ""

# Step 1: Backup .env
BACKUP=".env.backup.$(date +%Y%m%d-%H%M%S)"
cp .env "$BACKUP"
echo "✅ Backup: $BACKUP"

# Step 2: Verify critical keys
echo ""
echo "=== Verifying critical keys ==="
MISSING=0
for key in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY \
  NEXT_PUBLIC_GOOGLE_CLIENT_ID GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET \
  GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET \
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  ANTHROPIC_API_KEY GOOGLE_GEMINI_API_KEY \
  SMTP_USER SMTP_PASS \
  NEXT_PUBLIC_GA_MEASUREMENT_ID NEXT_PUBLIC_GTM_ID \
  CRON_SECRET IP_HASH_SALT; do
  val=$(grep "^${key}=" .env | cut -d= -f2-)
  if [ -n "$val" ]; then
    echo "  ✅ $key"
  else
    echo "  ❌ $key EMPTY — DEPLOY BLOCKED!"
    MISSING=1
  fi
done

if [ "$MISSING" -eq 1 ]; then
  echo ""
  echo "❌ DEPLOY ABORTED: Critical keys missing. Fix .env first."
  exit 1
fi

# Step 3: Build
echo ""
echo "=== Building Docker image ==="
echo "  .env included in build context for NEXT_PUBLIC_* inlining"
echo "  .env NOT in final runtime image (multi-stage build)"
docker build -t blockid-production .

# Step 4: Deploy
echo ""
echo "=== Deploying ==="
docker rm -f deploy-blockid-production 2>/dev/null || true
docker run -d \
  --name deploy-blockid-production \
  --restart unless-stopped \
  --network supabase_default \
  -p 127.0.0.1:4001:3000 \
  --env-file .env \
  -v "$(pwd)/public/uploads:/app/public/uploads" \
  -v "$(pwd)/content:/app/content" \
  -v "$HOME/.claude:/home/node/.claude:ro" \
  blockid-production

# Step 5: Wait for health
echo ""
echo "=== Waiting for container health ==="
for i in 1 2 3 4 5 6; do
  sleep 5
  STATUS=$(docker ps --filter name=deploy-blockid-production --format "{{.Status}}" 2>/dev/null)
  if echo "$STATUS" | grep -q "healthy"; then
    echo "  ✅ Container healthy: $STATUS"
    break
  fi
  echo "  ⏳ $STATUS"
done

# Step 6: Verify
echo ""
echo "=== Verifying deployment ==="
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" https://blockid.au/ 2>&1)
echo "  Homepage: HTTP $HTTP_CODE"
AUTH_OK=$(curl -s https://blockid.au/api/auth/me | python3 -c "import sys,json; print(json.load(sys.stdin).get('ok','error'))" 2>/dev/null)
echo "  Auth API: $AUTH_OK"

echo ""
echo "============================================"
echo "  ✅ DEPLOY COMPLETE"
echo "  Backup: $BACKUP"
echo "  Image: blockid-production:latest"
echo "============================================"
