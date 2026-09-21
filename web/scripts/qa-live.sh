#!/usr/bin/env bash
# scripts/qa-live.sh — run the live-QA Playwright suite against production
# (S30-A) and write content/reports/live-qa-latest.json (full run) or
# content/reports/live-qa-latest-partial.json (G23-C: a `-- SPEC...` subset).
#
#   bash scripts/qa-live.sh                     # Free-plan coverage only
#   LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 bash scripts/qa-live.sh   # full (Growth) coverage
#   bash scripts/qa-live.sh -- tests/live-qa/07-investor-crm.spec.ts   # one spec (setup + teardown still run)
#   bash scripts/qa-live.sh --wait               # queue behind a running suite instead of aborting (exit 2)
#
# Env (all optional): LIVE_QA_BASE_URL (default https://blockid.au),
# LIVE_QA_ALLOW_DB, LIVE_QA_ELEVATE, LIVE_QA_SPEND_OK, LIVE_QA_KEEP_ACCOUNT.
# Loads .env.runtime (set -a) so the erase script and any helper see the same
# runtime configuration the server uses; nothing from it is printed.
#
# Exit: 0 all passed · 1 any test failed OR the account erasure failed (the
# teardown throws — never leave a qa-live-* account behind) · 2 preflight.
#
# Outputs (scripts/lib/live-qa-summary.mjs):
#   full run      content/reports/live-qa-latest.json + live-qa-history.jsonl row { partial: false }
#   `-- SPEC...`  content/reports/live-qa-latest-partial.json + history row { partial: true, specs: [...] }
#   live-qa-latest.json is never touched by a partial run (its readers —
#   scripts/investor-update.mjs — see only full suites).
#
# Crontab rows live in scripts/crontab.production (Sun 07:00 UTC full suite,
# Sun 05:10 UTC lane-41 canary); logs go to content/reports/logs/ (G23-C,
# gitignored, 8-week prune). This script installs nothing.
set -uo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"

# ── Run lock (G15-R1) ───────────────────────────────────────────────────
# Two concurrent runs shared test-results/live-qa/run-state.json (one setup
# overwrote the other's account) and produced false failures. Same etiquette
# as deploy-live.sh: abort by default with the holder's pid / start time /
# run state; `--wait` queues behind the running suite (30-min ceiling).
#   bash scripts/qa-live.sh --wait -- tests/live-qa/29-intake.spec.ts
QA_LOCK="/tmp/blockid-live-qa.lock"
QA_PID_FILE="/tmp/blockid-live-qa.pid"
QA_WAIT=0
_ARGS=()
for _a in "$@"; do
  case "$_a" in
    --wait) QA_WAIT=1 ;;
    *) _ARGS+=("$_a") ;;
  esac
done
set -- "${_ARGS[@]+"${_ARGS[@]}"}"
unset _a _ARGS

describe_qa_holder() {
  local holder started last
  holder=$(cat "$QA_PID_FILE" 2>/dev/null || echo "unknown")
  echo "   holder pid: $holder" >&2
  if [ "$holder" != "unknown" ] && kill -0 "$holder" 2>/dev/null; then
    started=$(ps -o lstart= -p "$holder" 2>/dev/null | sed 's/^ *//')
    echo "   started:    ${started:-unknown}" >&2
  else
    echo "   started:    (pid $holder is not alive — see 'fuser $QA_LOCK')" >&2
  fi
  if [ -f "$WEB_DIR/test-results/live-qa/run-state.json" ]; then
    last=$(node -e "try{const s=require('$WEB_DIR/test-results/live-qa/run-state.json');process.stdout.write((s.email||'?')+' since '+(s.startedAt||'?')+' pid '+(s.pid||'?'))}catch(e){process.stdout.write('unreadable')}" 2>/dev/null)
    echo "   run state:  ${last:-unknown}" >&2
  fi
}

exec 201>"$QA_LOCK"
if [ "$QA_WAIT" = "1" ]; then
  if ! flock -x -n 201; then
    echo "qa-live: another live-QA run holds $QA_LOCK — --wait: blocking (ceiling 1800 s)" >&2
    describe_qa_holder
    if ! flock -x -w 1800 201; then
      echo "qa-live: waited 1800 s and the lock is still held — giving up" >&2
      describe_qa_holder
      exit 2
    fi
    echo "qa-live: lock acquired after wait — $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  fi
elif ! flock -x -n 201; then
  echo "qa-live: another live-QA run is in progress — aborting (two runs share run-state.json). Re-run with --wait to queue." >&2
  describe_qa_holder
  exit 2
fi
echo $$ > "$QA_PID_FILE"
trap 'rm -f "$QA_PID_FILE"' EXIT

OUT_DIR="$WEB_DIR/test-results/live-qa"
RESULTS="$OUT_DIR/results.json"
RUN_STATE="$OUT_DIR/run-state.json"
REPORTS_DIR="$WEB_DIR/content/reports"

if [ -f .env.runtime ]; then
  set -a
  # shellcheck disable=SC1091
  . ./.env.runtime
  set +a
fi
export LIVE_QA_BASE_URL="${LIVE_QA_BASE_URL:-https://blockid.au}"

if ! npx --no-install playwright --version >/dev/null 2>&1; then
  echo "qa-live: Playwright is not installed in $WEB_DIR/node_modules — npm install first" >&2
  exit 2
fi
if [ "${LIVE_QA_ELEVATE:-0}" = "1" ] && [ "${LIVE_QA_ALLOW_DB:-0}" != "1" ]; then
  echo "qa-live: LIVE_QA_ELEVATE=1 needs LIVE_QA_ALLOW_DB=1 (the elevation is a local psql step)" >&2
  exit 2
fi

mkdir -p "$OUT_DIR" "$REPORTS_DIR"
rm -f "$RESULTS"

EXTRA=()
if [ "${1:-}" = "--" ]; then shift; EXTRA=("$@"); fi

START_TS="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "qa-live: $START_TS · base $LIVE_QA_BASE_URL · elevate=${LIVE_QA_ELEVATE:-0} allowDb=${LIVE_QA_ALLOW_DB:-0} spendOk=${LIVE_QA_SPEND_OK:-0}"

set +e
npx --no-install playwright test --config playwright.live-qa.config.ts "${EXTRA[@]}"
PW_EXIT=$?
set -e

# Summarise results.json (+ the erasure outcome from run-state.json) into the
# report the ops dashboard reads (scripts/lib/live-qa-summary.mjs, unit-tested
# in scripts/live-qa-summary.test.mjs; dependency-free node).
#
# G23-C partial-run contract: with `-- SPEC...` the summary goes to
# live-qa-latest-partial.json and the history row carries
# `partial: true, specs: [...]`; live-qa-latest.json is written ONLY by a
# full run, so its readers never mistake a one-spec canary for the suite.
node scripts/lib/live-qa-summary.mjs "$RESULTS" "$RUN_STATE" "$REPORTS_DIR" "$START_TS" "$PW_EXIT" "${EXTRA[@]+"${EXTRA[@]}"}"


echo "qa-live: HTML report → $WEB_DIR/playwright-report-live-qa/index.html (npx playwright show-report playwright-report-live-qa)"
exit "$PW_EXIT"
