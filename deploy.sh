#!/bin/bash
# ═══════════════════════════════════════════════════════════════
# BlockID.au — Direct Deploy Script
#
# Build and run directly from source on this server.
# No GitLab CI, no Docker registry, no artifact transfer.
#
# Usage:
#   ./deploy.sh              # Build + deploy production
#   ./deploy.sh --restart    # Restart only (no rebuild)
#   ./deploy.sh --status     # Show container status
# ═══════════════════════════════════════════════════════════════

set -e

PROJECT_DIR="/home/dovanlong/blockid.au"
WEB_DIR="${PROJECT_DIR}/web"
CONTAINER="deploy-blockid-production"
IMAGE="blockid/web:latest"
PORT="4001"
NETWORK="supabase_default"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

log() { echo -e "${GREEN}✓${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1"; }

# ── Status only ──
if [ "$1" = "--status" ]; then
  echo "=== BlockID Container Status ==="
  docker ps --filter "name=blockid" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" 2>/dev/null
  echo ""
  ENV_COUNT=$(docker exec $CONTAINER env 2>/dev/null | grep -c "=" || echo "0")
  echo "Env vars: $ENV_COUNT"
  curl -s -o /dev/null -w "Site: HTTP %{http_code}\n" "https://blockid.au" -A "Mozilla/5.0" 2>/dev/null || echo "Site: unreachable"
  exit 0
fi

cd "$WEB_DIR"

# ── Build (skip if --restart) ──
if [ "$1" != "--restart" ]; then
  echo "═══════════════════════════════════════"
  echo "  BlockID.au — Building from source"
  echo "═══════════════════════════════════════"

  # Verify .env exists
  if [ ! -f .env ]; then
    err ".env file not found at $WEB_DIR/.env"
    exit 1
  fi
  ENV_COUNT=$(grep -c "=" .env)
  log ".env loaded ($ENV_COUNT vars)"

  # Build Docker image from local source
  # --no-cache ensures NEXT_PUBLIC_* from .env are baked into the JS bundle.
  # Without it, Docker layer cache may serve stale builds with wrong keys.
  echo ""
  echo "Building Docker image (--no-cache)..."
  docker build --no-cache -t "$IMAGE" . 2>&1 | tail -5
  log "Image built: $IMAGE"
fi

# ── Deploy ──
echo ""
echo "Deploying..."

# Stop old container
docker rm -f "$CONTAINER" 2>/dev/null || true

# Start new container with --env-file from source .env
docker run -d \
  --name "$CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK" \
  -p "127.0.0.1:${PORT}:3000" \
  --env-file "${WEB_DIR}/.env" \
  -e PORT=3000 \
  -e HOSTNAME=0.0.0.0 \
  -e OLLAMA_ENABLED=true \
  -e OLLAMA_HOST=http://172.19.0.1:11434 \
  -e OLLAMA_MODEL=qwen2.5:3b \
  -v /home/dovanlong/.claude/.credentials.json:/home/node/.claude/.credentials.json:ro \
  -v /home/dovanlong/.codex/auth.json:/home/node/.codex/auth.json:ro \
  -v "${WEB_DIR}/content:/app/content" \
  -v "${PROJECT_DIR}/uploads:/app/uploads" \
  "$IMAGE" >/dev/null

log "Container started: $CONTAINER"

# ── Health check ──
echo ""
echo "Waiting for healthy..."
for i in $(seq 1 20); do
  STATUS=$(docker inspect --format="{{.State.Health.Status}}" "$CONTAINER" 2>/dev/null || echo "starting")
  if [ "$STATUS" = "healthy" ]; then
    log "Container healthy!"
    break
  fi
  [ "$i" = "20" ] && warn "Container not healthy after 40s (status: $STATUS)"
  sleep 2
done

# ── Verify ──
echo ""
ENV_COUNT=$(docker exec "$CONTAINER" env 2>/dev/null | grep -c "=" || echo "0")
log "$ENV_COUNT env vars loaded"

# Spot check critical vars
MISSING=""
for v in SUPABASE_URL STRIPE_SECRET_KEY ANTHROPIC_API_KEY CRON_SECRET; do
  VAL=$(docker exec "$CONTAINER" sh -c "echo \${$v}" 2>/dev/null)
  [ -z "$VAL" ] && MISSING="$MISSING $v"
done
[ -n "$MISSING" ] && warn "Missing vars:$MISSING" || log "All critical env vars present"

SITE_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "https://blockid.au" -A "Mozilla/5.0" 2>/dev/null || echo "???")
log "Site: HTTP $SITE_STATUS"

echo ""
echo "═══════════════════════════════════════"
echo "  Deploy complete!"
echo "═══════════════════════════════════════"
