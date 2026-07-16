#!/usr/bin/env bash
# CI gate: no hard-coded plan comparisons in application source.
#
# Enforces the entitlement rule from CTO spec §3: every access decision must
# route through `can(user, feature)` (see web/src/lib/entitlements.ts). Direct
# string comparisons like `plan === "growth"` bypass the plans matrix and
# grandfather map, so they regress the moment we rename or repackage a SKU.
#
# Exemptions (matched per-line):
#   - lines containing LEGACY_PLAN_MAP / LEGACY_PLANS / LEGACY_FEATURE_FALLBACK
#     (the mapping table itself)
#   - lines containing the word `legacy` (case-insensitive comment marker)
#   - lines carrying a `// TODO(entitlement)` or `{/* TODO(entitlement) */}`
#     escape hatch, documented per file
#
# Exit 1 on violation so the check runs green only when every hit is either
# routed through can() or explicitly annotated.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/web/src"

PATTERN='plan\s*===\s*"(growth|scale|enterprise|founding50|pilot|accelerator|growth_annual)"'

HITS=$(grep -rnE --include='*.ts' --include='*.tsx' "$PATTERN" "$SRC" \
  | grep -viE 'LEGACY_PLAN|legacy|TODO\(entitlement\)' \
  || true)

if [[ -n "$HITS" ]]; then
  echo "FAIL: hard-coded plan comparisons found (route via can(user, feature)):" >&2
  echo "$HITS" >&2
  exit 1
fi

echo "OK: no hard-coded plan comparisons"
