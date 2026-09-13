#!/usr/bin/env bash
# scripts/qa-live.sh — run the live-QA Playwright suite against production
# (S30-A) and write content/reports/live-qa-latest.json.
#
#   bash scripts/qa-live.sh                     # Free-plan coverage only
#   LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 bash scripts/qa-live.sh   # full (Growth) coverage
#   bash scripts/qa-live.sh -- tests/live-qa/07-investor-crm.spec.ts   # one spec (setup + teardown still run)
#
# Env (all optional): LIVE_QA_BASE_URL (default https://blockid.au),
# LIVE_QA_ALLOW_DB, LIVE_QA_ELEVATE, LIVE_QA_SPEND_OK, LIVE_QA_KEEP_ACCOUNT.
# Loads .env.runtime (set -a) so the erase script and any helper see the same
# runtime configuration the server uses; nothing from it is printed.
#
# Exit: 0 all passed · 1 any test failed OR the account erasure failed (the
# teardown throws — never leave a qa-live-* account behind) · 2 preflight.
#
# Proposed crontab line (NOT installed by this script — add to
# scripts/crontab.production and `crontab` it when the founder approves):
#   # Weekly Sunday 07:00 UTC — live QA of the S25–S29 founder journeys against prod
#   # (after the 03:00–05:00 UTC Sunday jobs and the money-radar sweep).
#   0 7 * * 0 cd /home/dovanlong/blockid.au/web && LIVE_QA_ALLOW_DB=1 LIVE_QA_ELEVATE=1 bash scripts/qa-live.sh >> /tmp/blockid-live-qa.log 2>&1
set -uo pipefail

WEB_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$WEB_DIR"

OUT_DIR="$WEB_DIR/test-results/live-qa"
RESULTS="$OUT_DIR/results.json"
RUN_STATE="$OUT_DIR/run-state.json"
REPORT="$WEB_DIR/content/reports/live-qa-latest.json"
HISTORY="$WEB_DIR/content/reports/live-qa-history.jsonl"

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

mkdir -p "$OUT_DIR" "$(dirname "$REPORT")"
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
# report the ops dashboard reads. Node keeps this dependency-free.
node - "$RESULTS" "$RUN_STATE" "$REPORT" "$HISTORY" "$START_TS" "$PW_EXIT" <<'NODE'
const fs = require("node:fs");
const [results, runState, report, history, startTs, pwExit] = process.argv.slice(2);
const summary = { ts: new Date().toISOString(), startedAt: startTs, baseURL: process.env.LIVE_QA_BASE_URL, exitCode: Number(pwExit), passed: 0, failed: 0, skipped: 0, flaky: 0, expectedFailures: 0, durationMs: null, account: null, erasure: null, findings: [] };
try {
  const rs = JSON.parse(fs.readFileSync(runState, "utf8"));
  summary.account = { email: rs.email, userId: rs.userId, projectId: rs.projectId, plan: rs.plan, elevated: rs.elevated };
  summary.erasure = rs.erasure ?? { ok: false, detail: "teardown did not record an outcome" };
} catch {
  summary.erasure = { ok: false, detail: "run-state.json missing — setup never provisioned an account (nothing to erase) or the run aborted before it" };
}
try {
  const r = JSON.parse(fs.readFileSync(results, "utf8"));
  summary.durationMs = r.stats?.duration ?? null;
  const walk = (suite, file) => {
    for (const s of suite.suites ?? []) walk(s, suite.file ?? file);
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const last = t.results?.[t.results.length - 1];
        const status = t.status; // expected | unexpected | skipped | flaky
        if (status === "expected") { if (t.expectedStatus === "failed") summary.expectedFailures += 1; else summary.passed += 1; }
        else if (status === "skipped") summary.skipped += 1;
        else if (status === "flaky") summary.flaky += 1;
        else {
          summary.failed += 1;
          const err = last?.error?.message ?? last?.errors?.[0]?.message ?? "(no error message)";
          summary.findings.push({ spec: (spec.file ?? suite.file ?? file ?? "").replace(/^.*tests\/live-qa\//, ""), project: t.projectName, title: spec.title, error: String(err).replace(/\[[0-9;]*m/g, "").slice(0, 600) });
        }
      }
    }
  };
  for (const s of r.suites ?? []) walk(s, s.file);
  if (r.errors?.length) for (const e of r.errors) summary.findings.push({ spec: "(global)", title: "global setup/teardown", error: String(e.message ?? e).replace(/\[[0-9;]*m/g, "").slice(0, 600) });
} catch (e) {
  summary.findings.push({ spec: "(runner)", title: "results.json unreadable", error: String(e.message ?? e) });
}
if (summary.erasure && summary.erasure.ok === false && summary.account) {
  summary.findings.push({ spec: "(teardown)", title: "QA account erasure", error: `ERASURE NOT CONFIRMED for ${summary.account.email}: ${summary.erasure.detail}` });
}
fs.writeFileSync(report, JSON.stringify(summary, null, 2) + "\n");
fs.appendFileSync(history, JSON.stringify({ ts: summary.ts, passed: summary.passed, failed: summary.failed, skipped: summary.skipped, expectedFailures: summary.expectedFailures, exitCode: summary.exitCode, erasureOk: summary.erasure?.ok ?? null, elevated: summary.account?.elevated ?? null }) + "\n");
console.log(`qa-live: passed ${summary.passed} · failed ${summary.failed} · skipped ${summary.skipped} · expected-failures ${summary.expectedFailures} · erasure ${summary.erasure?.ok ? "ok" : "NOT OK"} → ${report}`);
for (const f of summary.findings) console.log(`  ✗ [${f.spec}] ${f.title}: ${f.error.split("\n")[0]}`);
NODE

echo "qa-live: HTML report → $WEB_DIR/playwright-report-live-qa/index.html (npx playwright show-report playwright-report-live-qa)"
exit "$PW_EXIT"
