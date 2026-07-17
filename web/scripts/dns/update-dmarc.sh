#!/usr/bin/env bash
# Config-driven DMARC record updater for a Cloudflare-managed zone.
#
# T-1011 (docs/IMPLEMENTATION-PLAN-v3.1-amended.md): once the
# `dmarc-reports@blockid.au` distribution alias is provisioned in Google
# Workspace (Admin -> Directory -> Groups), re-enable aggregate + forensic
# reporting at p=none for a 30-day observation window with:
#
#   DMARC_RUA="mailto:dmarc-reports@blockid.au" \
#   DMARC_RUF="mailto:dmarc-reports@blockid.au" \
#   DMARC_FO=1 \
#     bash web/scripts/dns/update-dmarc.sh
#
# Do NOT run this until the alias exists and has received a test message —
# Cloudflare will accept the record but reports bounce silently, which is
# how we lost the previous 30-day visibility window (see ciso-review §4).
#
# Reads config from web/.env (via web/scripts/cron-runner.sh convention).
# Nothing about the record shape is hard-coded — every knob comes from an
# env var so future policy changes (relaxed / strict / different report
# addresses / different fo mode) don't need code edits.
#
# Env vars (all except CF_DNS_API_TOKEN + CF_ZONE_ID + DMARC_RECORD_ID
# have safe defaults; empty strings for rua/ruf drop the tag entirely):
#
#   CF_DNS_API_TOKEN      — Cloudflare API token with Zone:DNS:Edit
#   CF_ZONE_ID            — Cloudflare zone id
#   DMARC_RECORD_ID       — existing _dmarc TXT record id
#   DMARC_HOSTNAME        — record name (default: _dmarc.<DOMAIN>)
#   DOMAIN                — base domain (default: blockid.au)
#   DMARC_POLICY          — p= value: none | quarantine | reject (default: none)
#   DMARC_SUBDOMAIN_POLICY — sp= value (default: unset — inherits p)
#   DMARC_PCT             — pct= value 0-100 (default: unset)
#   DMARC_RUA             — aggregate report address (empty = omit tag)
#   DMARC_RUF             — forensic report address (empty = omit tag)
#   DMARC_FO              — fo= value 0/1/d/s (default: 1 when RUA/RUF set)
#   DMARC_ADKIM DMARC_ASPF — alignment modes r|s (default: unset)
#   DRY_RUN=1             — print the payload without hitting Cloudflare
#
# Usage:
#   bash web/scripts/dns/update-dmarc.sh
#   DRY_RUN=1 bash web/scripts/dns/update-dmarc.sh
#
# Exit codes: 0 = updated, 1 = config error, 2 = Cloudflare API error.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/home/dovanlong/blockid.au/web/.env}"
if [ -f "$ENV_FILE" ]; then
  # Load only the KEY=VALUE lines we recognise. .env holds unquoted JSON in
  # some values that trips `source`; a targeted grep keeps this safe.
  while IFS='=' read -r key value; do
    case "$key" in
      CF_DNS_API_TOKEN|CLOUDFLARE_DNS_API_TOKEN|CF_ZONE_ID|CLOUDFLARE_ZONE_ID|\
      DMARC_RECORD_ID|DOMAIN|DMARC_HOSTNAME|DMARC_POLICY|\
      DMARC_SUBDOMAIN_POLICY|DMARC_PCT|DMARC_RUA|DMARC_RUF|DMARC_FO|\
      DMARC_ADKIM|DMARC_ASPF)
        # strip surrounding quotes if present
        value="${value%\"}"; value="${value#\"}"; value="${value%\'}"; value="${value#\'}"
        export "$key=$value"
        ;;
    esac
  done < <(grep -E '^[A-Z_]+=' "$ENV_FILE" 2>/dev/null || true)
fi

CF_DNS_API_TOKEN="${CF_DNS_API_TOKEN:-${CLOUDFLARE_DNS_API_TOKEN:-}}"
CF_ZONE_ID="${CF_ZONE_ID:-${CLOUDFLARE_ZONE_ID:-}}"
DMARC_RECORD_ID="${DMARC_RECORD_ID:-}"
DOMAIN="${DOMAIN:-blockid.au}"
DMARC_HOSTNAME="${DMARC_HOSTNAME:-_dmarc.${DOMAIN}}"
DMARC_POLICY="${DMARC_POLICY:-none}"
DMARC_SUBDOMAIN_POLICY="${DMARC_SUBDOMAIN_POLICY:-}"
DMARC_PCT="${DMARC_PCT:-}"
DMARC_RUA="${DMARC_RUA:-}"
DMARC_RUF="${DMARC_RUF:-}"
DMARC_FO="${DMARC_FO:-1}"
DMARC_ADKIM="${DMARC_ADKIM:-}"
DMARC_ASPF="${DMARC_ASPF:-}"

require() {
  if [ -z "${!1:-}" ]; then
    echo "ERROR: env var $1 is required" >&2
    exit 1
  fi
}
require CF_DNS_API_TOKEN
require CF_ZONE_ID
require DMARC_RECORD_ID

# Compose the record according to RFC 7489. Empty values omit their tag.
RECORD="v=DMARC1; p=${DMARC_POLICY}"
[ -n "$DMARC_SUBDOMAIN_POLICY" ] && RECORD="${RECORD}; sp=${DMARC_SUBDOMAIN_POLICY}"
[ -n "$DMARC_PCT" ]              && RECORD="${RECORD}; pct=${DMARC_PCT}"
[ -n "$DMARC_RUA" ]              && RECORD="${RECORD}; rua=${DMARC_RUA}"
[ -n "$DMARC_RUF" ]              && RECORD="${RECORD}; ruf=${DMARC_RUF}"
if [ -n "$DMARC_RUA$DMARC_RUF" ]; then
  RECORD="${RECORD}; fo=${DMARC_FO}"
fi
[ -n "$DMARC_ADKIM" ] && RECORD="${RECORD}; adkim=${DMARC_ADKIM}"
[ -n "$DMARC_ASPF" ]  && RECORD="${RECORD}; aspf=${DMARC_ASPF}"

PAYLOAD=$(printf '{"type":"TXT","name":"%s","content":"%s","ttl":3600}' \
  "$DMARC_HOSTNAME" "$RECORD")

echo "Planned DMARC record for ${DMARC_HOSTNAME}:"
echo "  ${RECORD}"

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 — not updating Cloudflare."
  exit 0
fi

RESPONSE=$(curl -sS -X PUT \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${DMARC_RECORD_ID}" \
  -H "Authorization: Bearer ${CF_DNS_API_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "${PAYLOAD}")

if ! echo "$RESPONSE" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('success') else 1)"; then
  echo "Cloudflare API error:" >&2
  echo "$RESPONSE" | python3 -m json.tool >&2 || echo "$RESPONSE" >&2
  exit 2
fi

echo "DMARC record updated successfully."
echo "Verify with: dig +short TXT ${DMARC_HOSTNAME} @1.1.1.1"
