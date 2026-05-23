#!/usr/bin/env bash
# Purge Cloudflare cache for blockid.au.
#
# Usage:
#   npm run cache:purge
#   bash scripts/purge-cloudflare-cache.sh
#   bash scripts/purge-cloudflare-cache.sh https://blockid.au/ https://blockid.au/score
#
# Required in .env:
#   CLOUDFLARE_API_TOKEN
#   CLOUDFLARE_ZONE_ID

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

if [ -z "$CLOUDFLARE_API_TOKEN" ] || [ -z "$CLOUDFLARE_ZONE_ID" ]; then
  echo "Cloudflare purge skipped: CLOUDFLARE_API_TOKEN or CLOUDFLARE_ZONE_ID is missing."
  exit 1
fi

if [ "$#" -gt 0 ]; then
  PAYLOAD="$(node -e 'console.log(JSON.stringify({ files: process.argv.slice(1) }))' "$@")"
  echo "Purging Cloudflare cache for $# URL(s)..."
else
  PAYLOAD='{"purge_everything":true}'
  echo "Purging all Cloudflare cache for blockid.au..."
fi

RESPONSE="$(curl -sS --max-time 30 \
  "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/purge_cache" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD")"

node -e '
const response = JSON.parse(process.argv[1]);
if (!response.success) {
  console.error("Cloudflare purge failed:");
  for (const error of response.errors || []) {
    console.error(`- ${error.code || "error"}: ${error.message || "Unknown error"}`);
  }
  process.exit(1);
}
console.log("Cloudflare cache purged.");
' "$RESPONSE"
