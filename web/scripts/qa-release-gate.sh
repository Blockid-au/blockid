#!/usr/bin/env bash
# qa-release-gate.sh
#
# Pre-deploy orchestrator. Runs each check in order; exits non-zero on the
# first failure (unless the step is soft — see notes below).
#
# Steps:
#   a) web/scripts/ci-grep-gate.sh          (existing)
#   b) web/scripts/verify-equity-gate.sh    (blockchain/tokenization guard)
#   c) npx tsc --noEmit                     (web/)
#   d) npm test -- --run                    (Vitest; soft: warn if missing)
#   e) npx playwright test tests/e2e/regression/
#         (skipped when STAGED=1 — journeys need Stripe test mode & are
#          intentionally not run here)
#   f) node web/scripts/verify-audit-chain.ts   (soft: skip if missing)
#
# Flags:
#   --dry-run    Print each step's command without executing it.
#
# Env:
#   STAGED=1     Skip Playwright regression (fast pre-push mode).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DIR="${REPO_ROOT}/web"

DRY_RUN=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    -h|--help)
      sed -n '2,25p' "$0"
      exit 0
      ;;
    *)
      printf 'unknown flag: %s\n' "$arg" >&2
      exit 2
      ;;
  esac
done

BOLD='\033[1m'
RED='\033[31m'
GREEN='\033[32m'
YELLOW='\033[33m'
CYAN='\033[36m'
RESET='\033[0m'

step_no=0
overall_fail=0

header() {
  step_no=$((step_no + 1))
  printf '\n%b[%d/6] %s%b\n' "${BOLD}${CYAN}" "$step_no" "$1" "$RESET"
}

ok() {
  printf '  %bPASS%b %s\n' "$GREEN" "$RESET" "$1"
}

fail_mark() {
  printf '  %bFAIL%b %s\n' "$RED" "$RESET" "$1"
  overall_fail=1
}

warn() {
  printf '  %bWARN%b %s\n' "$YELLOW" "$RESET" "$1"
}

# run <label> <command...>
# Executes the command (or prints it under --dry-run). On failure, marks the
# overall run as failed but keeps going so the caller sees every issue.
run() {
  local label="$1"; shift
  printf '  %b$%b %s\n' "$BOLD" "$RESET" "$*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    ok "${label} (dry-run)"
    return 0
  fi
  if "$@"; then
    ok "$label"
    return 0
  else
    fail_mark "$label"
    return 1
  fi
}

# run_soft <label> <command...> — same as run() but a failure only warns.
run_soft() {
  local label="$1"; shift
  printf '  %b$%b %s\n' "$BOLD" "$RESET" "$*"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    ok "${label} (dry-run)"
    return 0
  fi
  if "$@"; then
    ok "$label"
  else
    warn "$label (soft failure — not blocking)"
  fi
}

# ---------------------------------------------------------------------------
# a) ci-grep-gate
# ---------------------------------------------------------------------------
header "ci-grep-gate"
if [[ -f "${WEB_DIR}/scripts/ci-grep-gate.sh" ]]; then
  run "ci-grep-gate" bash "${WEB_DIR}/scripts/ci-grep-gate.sh" || true
else
  warn "web/scripts/ci-grep-gate.sh missing — skipping"
fi

# ---------------------------------------------------------------------------
# b) verify-equity-gate
# ---------------------------------------------------------------------------
header "verify-equity-gate"
run "verify-equity-gate" bash "${WEB_DIR}/scripts/verify-equity-gate.sh" || true

# ---------------------------------------------------------------------------
# c) tsc --noEmit
# ---------------------------------------------------------------------------
header "typecheck (tsc --noEmit)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  printf '  %b$%b (cd %s && npx tsc --noEmit)\n' "$BOLD" "$RESET" "$WEB_DIR"
  ok "tsc (dry-run)"
else
  if (cd "$WEB_DIR" && npx tsc --noEmit); then
    ok "tsc --noEmit"
  else
    fail_mark "tsc --noEmit"
  fi
fi

# ---------------------------------------------------------------------------
# d) vitest (soft: warn if the script/config is missing)
# ---------------------------------------------------------------------------
header "unit tests (vitest)"
if [[ ! -f "${WEB_DIR}/package.json" ]]; then
  warn "web/package.json missing — skipping"
else
  if grep -q '"test"' "${WEB_DIR}/package.json"; then
    if [[ "$DRY_RUN" -eq 1 ]]; then
      printf '  %b$%b (cd %s && npm test -- --run)\n' "$BOLD" "$RESET" "$WEB_DIR"
      ok "vitest (dry-run)"
    else
      if (cd "$WEB_DIR" && npm test -- --run); then
        ok "vitest"
      else
        fail_mark "vitest"
      fi
    fi
  else
    warn 'no "test" script in web/package.json — skipping vitest'
  fi
fi

# ---------------------------------------------------------------------------
# e) playwright regression (skip when STAGED=1)
# ---------------------------------------------------------------------------
header "playwright regression"
if [[ "${STAGED:-0}" == "1" ]]; then
  warn "STAGED=1 — skipping playwright regression"
else
  if [[ "$DRY_RUN" -eq 1 ]]; then
    printf '  %b$%b (cd %s && npx playwright test tests/e2e/regression/)\n' \
      "$BOLD" "$RESET" "$WEB_DIR"
    ok "playwright regression (dry-run)"
  else
    if (cd "$WEB_DIR" && npx playwright test tests/e2e/regression/); then
      ok "playwright regression"
    else
      fail_mark "playwright regression"
    fi
  fi
fi

# ---------------------------------------------------------------------------
# f) verify-audit-chain (soft)
# ---------------------------------------------------------------------------
header "verify-audit-chain"
AUDIT="${WEB_DIR}/scripts/verify-audit-chain.ts"
if [[ -f "$AUDIT" ]]; then
  run_soft "verify-audit-chain" node "$AUDIT"
else
  warn "web/scripts/verify-audit-chain.ts missing — skipping"
fi

# ---------------------------------------------------------------------------
# Summary
# ---------------------------------------------------------------------------
printf '\n'
if [[ "$overall_fail" -eq 0 ]]; then
  printf '%b%bqa-release-gate: OK%b — release may proceed.\n' \
    "$BOLD" "$GREEN" "$RESET"
  exit 0
fi
printf '%b%bqa-release-gate: FAIL%b — fix failing steps before deploy.\n' \
  "$BOLD" "$RED" "$RESET"
exit 1
