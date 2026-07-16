#!/usr/bin/env bash
# verify-equity-gate.sh — CI guard against the equity path talking directly
# to the blockchain / tokenization surfaces. All such flows MUST route
# through /lib/legal/gates.ts assertLegalReviewPassed() so counsel review
# gates any on-chain write.

set -euo pipefail

ROOT="/home/dovanlong/blockid.au"
EQUITY_PATHS=(
  "${ROOT}/web/src/app/workspace/equity-offer"
  "${ROOT}/web/src/app/api/equity"
)

HITS=""
for p in "${EQUITY_PATHS[@]}"; do
  if [[ -d "$p" ]]; then
    FOUND=$(grep -rn --include='*.ts' --include='*.tsx' -lE '(blockchain-sync|tokenization)' "$p" 2>/dev/null || true)
    if [[ -n "$FOUND" ]]; then
      HITS+="${FOUND}"$'\n'
    fi
  fi
done

if [[ -n "$HITS" ]]; then
  echo "FAIL Equity path directly imports blockchain - must go through /lib/legal/gates.ts assertLegalReviewPassed()"
  echo "$HITS"
  exit 1
fi

echo "OK No direct blockchain imports from equity path"
