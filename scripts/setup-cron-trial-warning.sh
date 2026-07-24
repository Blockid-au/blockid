#!/usr/bin/env bash
#
# setup-cron-trial-warning.sh — idempotently append the hourly trial-charge
# warning cron entry to the current user's crontab.
#
# Exit codes:
#   0  entry already present (no change) or added successfully
#   1  crontab command missing or CRON_SECRET env var not set
#   2  crontab update failed
#
# Usage:
#   CRON_SECRET=xxxx ./scripts/setup-cron-trial-warning.sh
#
# The founder runs this manually; the deploy pipeline does NOT touch host
# crontabs. See docs/ops/crontab-setup.md for the full runbook.

set -euo pipefail

CRON_LINE='0 * * * * curl -sS -H "Authorization: Bearer $CRON_SECRET" https://blockid.au/api/cron/trial-charge-warning > /var/log/blockid-cron.log 2>&1'
CRON_MARKER="/api/cron/trial-charge-warning"

if ! command -v crontab >/dev/null 2>&1; then
  echo "error: crontab binary not found on PATH" >&2
  exit 1
fi

if [[ -z "${CRON_SECRET:-}" ]]; then
  echo "warning: CRON_SECRET env var is not set in the current shell." >&2
  echo "         The appended cron line references \$CRON_SECRET literally;" >&2
  echo "         crontab expands it from the daemon's environment. Make sure" >&2
  echo "         CRON_SECRET is exported in /etc/environment or the appropriate" >&2
  echo "         crond wrapper." >&2
fi

# Snapshot current crontab (crontab -l returns 1 when no crontab exists — tolerate that).
CURRENT="$(crontab -l 2>/dev/null || true)"

if grep -Fq "$CRON_MARKER" <<<"$CURRENT"; then
  echo "trial-charge-warning cron already present — no change."
  exit 0
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

if [[ -n "$CURRENT" ]]; then
  printf '%s\n' "$CURRENT" >"$TMP"
fi
printf '%s\n' "$CRON_LINE" >>"$TMP"

if crontab "$TMP"; then
  echo "installed trial-charge-warning hourly cron entry."
  exit 0
fi

echo "error: crontab install failed" >&2
exit 2
