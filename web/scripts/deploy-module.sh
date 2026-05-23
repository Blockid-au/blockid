#!/bin/bash
# BlockID.au Module Deploy Script
#
# Deploy a specific module without rebuilding everything.
# For now, this does a full rebuild (monolith) but the structure
# is ready for per-module containers when we split.
#
# Usage:
#   bash scripts/deploy-module.sh              # Full deploy (all modules)
#   bash scripts/deploy-module.sh web          # Web + auth + billing only
#   bash scripts/deploy-module.sh ai           # AI routes only (future)
#   bash scripts/deploy-module.sh cron         # Cron jobs only (future)
#   bash scripts/deploy-module.sh --hot-reload # Quick restart without rebuild

set -e
cd "$(dirname "$0")/.."

MODULE="${1:-all}"

echo "============================================"
echo "  BlockID.au — Module Deploy: ${MODULE}"
echo "============================================"

case "$MODULE" in
  "--hot-reload"|"hot"|"restart")
    echo "⚡ Hot reload: restarting container without rebuild..."
    docker restart deploy-blockid-production
    sleep 5
    echo "✅ Container restarted"
    curl -s -o /dev/null -w "Health: HTTP %{http_code}\n" https://blockid.au/
    exit 0
    ;;

  "static"|"css"|"images")
    echo "📁 Static files: no rebuild needed (served via nginx/volume mount)"
    echo "   Files in web/public/ are live immediately."
    exit 0
    ;;

  "config"|"env")
    echo "🔧 Config change: restart container to pick up new .env values"
    docker restart deploy-blockid-production
    sleep 5
    echo "✅ Container restarted with updated config"
    exit 0
    ;;

  *)
    echo "🔨 Full build: all modules"
    echo ""

    # Backup .env
    cp .env ".env.backup.$(date +%Y%m%d-%H%M%S)"

    # Verify keys
    MISSING=0
    for key in SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY NEXT_PUBLIC_GOOGLE_CLIENT_ID STRIPE_SECRET_KEY ANTHROPIC_API_KEY CRON_SECRET; do
      val=$(grep "^${key}=" .env | cut -d= -f2-)
      if [ -z "$val" ]; then echo "  ❌ $key MISSING"; MISSING=1; fi
    done
    if [ "$MISSING" -eq 1 ]; then echo "❌ ABORTED: Fix .env"; exit 1; fi

    # Build
    echo "Building Docker image..."
    docker build -t blockid-production . || { echo "❌ Build failed"; exit 1; }

    # Deploy
    echo "Deploying..."
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

    sleep 10

    # Verify
    STATUS=$(docker ps --filter name=deploy-blockid-production --format "{{.Status}}")
    HTTP=$(curl -s -o /dev/null -w "%{http_code}" https://blockid.au/)
    echo ""
    echo "✅ Deploy complete"
    echo "   Container: $STATUS"
    echo "   Homepage: HTTP $HTTP"
    ;;
esac
