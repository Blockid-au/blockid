#!/usr/bin/env bash
# -----------------------------------------------------------------------------
# BlockID — production deploy helper.
#
# Run from the project root or anywhere — the script cd's to the repo root
# (the parent of this script's own directory) before invoking docker compose.
#
#   ./infra/deploy.sh
#
# Make executable once: chmod +x infra/deploy.sh
# -----------------------------------------------------------------------------
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo "==> [1/5] Pulling latest source"
git pull --ff-only

echo "==> [2/5] Pulling base images (caddy, etc.)"
docker compose pull

echo "==> [3/5] Building web image"
docker compose build web

echo "==> [4/5] Bringing the stack up"
docker compose up -d

echo "==> [5/6] Service status"
docker compose ps

echo "==> [6/6] Purging Cloudflare cache"
bash scripts/purge-cloudflare-cache.sh || echo "Cloudflare purge failed; stack is still running."
