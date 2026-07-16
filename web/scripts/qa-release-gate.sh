#!/usr/bin/env bash
# QA release gate — orchestrates the pre-deploy checks.
#
#   1. Seed QA test users (idempotent).
#   2. Run Playwright journeys (5 canonical flows).
#   3. Run Playwright regression suite (menu, gates, disclaimers, homepage).
#   4. Print pass/fail summary.
#
# Exit non-zero on any failure. Wired into deploy-live.sh pre-flight.
#
# Env:
#   PLAYWRIGHT_BASE_URL   default http://localhost:3000
#   QA_SKIP_SEED=1        skip the seed step (already run)
#   QA_ONLY=journeys|regression   run only one suite

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEB_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${WEB_DIR}"

: "${PLAYWRIGHT_BASE_URL:=http://localhost:3000}"
export PLAYWRIGHT_BASE_URL

FAIL=0
SEED_STATUS="skipped"
JOURNEYS_STATUS="skipped"
REGRESSION_STATUS="skipped"

log() { printf '[qa-gate] %s\n' "$*"; }
step_ok() { printf '  \033[32mPASS\033[0m %s\n' "$*"; }
step_fail() { printf '  \033[31mFAIL\033[0m %s\n' "$*"; FAIL=1; }

log "base url        : ${PLAYWRIGHT_BASE_URL}"
log "working dir     : ${WEB_DIR}"

# 1. Seed
if [[ "${QA_SKIP_SEED:-0}" != "1" ]]; then
  log "1/3 seeding QA test users"
  if node scripts/seed-test-users.mjs; then
    SEED_STATUS="pass"; step_ok "seed"
  else
    SEED_STATUS="fail"; step_fail "seed"
  fi
else
  log "1/3 seed skipped (QA_SKIP_SEED=1)"
fi

# 2. Journeys
if [[ "${QA_ONLY:-}" != "regression" ]]; then
  log "2/3 running Playwright journeys"
  if npx playwright test tests/e2e/journeys/ --reporter=line; then
    JOURNEYS_STATUS="pass"; step_ok "journeys"
  else
    JOURNEYS_STATUS="fail"; step_fail "journeys"
  fi
fi

# 3. Regression
if [[ "${QA_ONLY:-}" != "journeys" ]]; then
  log "3/3 running Playwright regression"
  if npx playwright test tests/e2e/regression/ --reporter=line; then
    REGRESSION_STATUS="pass"; step_ok "regression"
  else
    REGRESSION_STATUS="fail"; step_fail "regression"
  fi
fi

echo
log "release-gate summary"
printf '  seed        : %s\n' "${SEED_STATUS}"
printf '  journeys    : %s\n' "${JOURNEYS_STATUS}"
printf '  regression  : %s\n' "${REGRESSION_STATUS}"

if [[ ${FAIL} -eq 0 ]]; then
  log "GATE OPEN — deploy may proceed"
  exit 0
fi
log "GATE CLOSED — fix failures before deploying"
exit 1
