#!/usr/bin/env bash
# verify-equity-gate.sh
#
# CI invariant: no file under web/src/app/api/equity/** or
# web/src/app/workspace/equity-offer/** may reference "blockchain-sync" or
# "tokenization" without also gating the flow behind a
# `legal_review_passed=true` check in the same file.
#
# Every equity->chain path must call assertLegalReview(...) (from
# /lib/legal/gates.ts) BEFORE emitting an on-chain write. Missing that gate
# ships un-vetted token/blockchain code from behind the equity workspace.
#
# Note: caller must ensure this script is executable (chmod +x). Write tool
# cannot set the executable bit; run `chmod +x web/scripts/verify-equity-gate.sh`
# after checkout / on first use.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SEARCH_ROOTS=(
  "${REPO_ROOT}/web/src/app/api/equity"
  "${REPO_ROOT}/web/src/app/workspace/equity-offer"
)

RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
BOLD='\033[1m'
RESET='\033[0m'

offenders=0
tmpfile="$(mktemp)"
trap 'rm -f "$tmpfile"' EXIT

for root in "${SEARCH_ROOTS[@]}"; do
  if [[ ! -d "$root" ]]; then
    continue
  fi

  # Enumerate every source file with a chain/token reference.
  while IFS= read -r -d '' file; do
    if grep -qE '(blockchain-sync|tokenization)' "$file"; then
      if ! grep -q 'legal_review_passed' "$file"; then
        # Record every offending line in this file.
        grep -nE '(blockchain-sync|tokenization)' "$file" \
          | while IFS= read -r hit; do
              line_no="${hit%%:*}"
              rest="${hit#*:}"
              printf '%s\t%s\t%s\n' "$file" "$line_no" "$rest" >> "$tmpfile"
            done
        offenders=$((offenders + 1))
      fi
    fi
  done < <(find "$root" -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.mjs' \) -print0)
done

if [[ -s "$tmpfile" ]]; then
  printf '%b%bverify-equity-gate: FAIL%b\n' "$BOLD" "$RED" "$RESET"
  printf '%bEquity path references blockchain/tokenization without a legal_review_passed gate.%b\n' "$YELLOW" "$RESET"
  printf '%bAdd `assertLegalReview(ctx)` (from web/src/lib/legal/gates.ts) before the on-chain write.%b\n\n' "$YELLOW" "$RESET"

  while IFS=$'\t' read -r file line_no snippet; do
    printf '  %b%s%b:%b%s%b  %s\n' \
      "$BOLD" "$file" "$RESET" \
      "$BOLD" "$line_no" "$RESET" \
      "$snippet"
  done < "$tmpfile"

  printf '\n%b%d offending file(s).%b Fix by wrapping the emit with:\n' "$RED" "$offenders" "$RESET"
  printf '    await assertLegalReview({ startupId, actor: session.user.id });\n'
  exit 1
fi

printf '%b%bverify-equity-gate: OK%b — no ungated blockchain/tokenization references in equity path.\n' \
  "$BOLD" "$GREEN" "$RESET"
exit 0
