#!/usr/bin/env bash
# Purge Cloudflare cache for the blockid.au zone, and — when the SVI zone
# id is configured — the startupvalueindex.com zone as well.
#
# Environment (loaded from process env or web/.env):
#   CLOUDFLARE_API_TOKEN     Cloudflare token with cache-purge scope on
#                            every zone this script touches. (required)
#   CLOUDFLARE_ZONE_ID       blockid.au zone id. (required)
#   CLOUDFLARE_ZONE_ID_SVI   startupvalueindex.com zone id. Optional —
#                            when unset, only the blockid.au zone is
#                            purged; the SVI purge is skipped, not
#                            failed.
#
# Usage:
#   npm run cache:purge
#   bash scripts/purge-cloudflare-cache.sh
#   bash scripts/purge-cloudflare-cache.sh https://blockid.au/ https://blockid.au/score
#
# When URL args are passed, each zone gets a `files` purge for exactly
# those URLs — the SVI zone will 404 on a blockid.au path, which is
# harmless (Cloudflare accepts unmatched URLs silently). With no args,
# every zone is `purge_everything`.

set -euo pipefail

cd "$(dirname "$0")/.."

env_value() {
  local key="$1"
  local value="${!key:-}"

  if [ -z "$value" ] && [ -f ".env" ]; then
    value="$(grep -E "^${key}=" .env | tail -n 1 | cut -d= -f2- || true)"
    value="${value%\"}"
    value="${value#\"}"
    value="${value%\'}"
    value="${value#\'}"
  fi

  printf '%s' "$value"
}

CLOUDFLARE_API_TOKEN="$(env_value CLOUDFLARE_API_TOKEN)"
CLOUDFLARE_ZONE_ID="$(env_value CLOUDFLARE_ZONE_ID)"
CLOUDFLARE_ZONE_ID_SVI="$(env_value CLOUDFLARE_ZONE_ID_SVI)"

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "Cloudflare purge skipped: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID is missing."
  exit 1
fi

if [ "$#" -gt 0 ]; then
  PAYLOAD="$(node -e 'console.log(JSON.stringify({ files: process.argv.slice(1) }))' "$@")"
  MODE_LABEL="$# URL(s)"
else
  PAYLOAD='{"purge_everything":true}'
  MODE_LABEL="all cached URLs"
fi

purge_zone() {
  local zone_label="$1"
  local zone_id="$2"

  echo "Purging Cloudflare cache for ${zone_label} (${MODE_LABEL})..."

  local response
  response="$(curl -sS --max-time 30 \
    "https://api.cloudflare.com/client/v4/zones/${zone_id}/purge_cache" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$PAYLOAD")"

  node -e '
  const label = process.argv[1];
  const response = JSON.parse(process.argv[2]);
  if (!response.success) {
    console.error(`Cloudflare purge failed for ${label}:`);
    for (const error of response.errors || []) {
      console.error(`- ${error.code || "error"}: ${error.message || "Unknown error"}`);
    }
    process.exit(1);
  }
  console.log(`Cloudflare cache purged for ${label}.`);
  ' "$zone_label" "$response"
}

purge_zone "blockid.au" "$CLOUDFLARE_ZONE_ID"

if [ -n "$CLOUDFLARE_ZONE_ID_SVI" ]; then
  purge_zone "startupvalueindex.com" "$CLOUDFLARE_ZONE_ID_SVI"
else
  echo "Skipping startupvalueindex.com purge: CLOUDFLARE_ZONE_ID_SVI not set."
fi
