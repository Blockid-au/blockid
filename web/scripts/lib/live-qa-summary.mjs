// G23-C — the live-QA summary step of scripts/qa-live.sh, factored out of the
// heredoc so the partial-run contract is unit-testable (scripts/live-qa-summary.test.mjs).
//
// Contract (docs/ops/live-qa.md, "Reading the report"):
//   full run  (no spec args)     -> content/reports/live-qa-latest.json
//                                   + one history row { ..., partial: false }
//   partial   (spec args given)  -> content/reports/live-qa-latest-partial.json
//                                   + one history row { ..., partial: true, specs: [...] }
//
// `live-qa-latest.json` is written ONLY by a full run, so its readers
// (scripts/investor-update.mjs; nothing under lib/status reads it today) never
// see a one-spec canary (G22-D lane 41) as "the suite". History readers that
// want the trend of full runs filter `partial !== true`.
//
// Dependency-free node (fs only); the CLI shape is
//   node scripts/lib/live-qa-summary.mjs RESULTS RUN_STATE REPORTS_DIR START_TS PW_EXIT [spec...]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const LIVE_QA_LATEST = "live-qa-latest.json";
export const LIVE_QA_LATEST_PARTIAL = "live-qa-latest-partial.json";
export const LIVE_QA_HISTORY = "live-qa-history.jsonl";

const stripAnsi = (s) => String(s).replace(/\u001b\[[0-9;]*m/g, "").replace(/\[[0-9;]*m/g, "");

/** Pure: which files a run writes. `specs` = the spec args after `--` (empty = full run). */
export function summaryPaths(reportsDir, specs = []) {
  const partial = Array.isArray(specs) && specs.length > 0;
  return {
    partial,
    report: path.join(reportsDir, partial ? LIVE_QA_LATEST_PARTIAL : LIVE_QA_LATEST),
    history: path.join(reportsDir, LIVE_QA_HISTORY),
  };
}

/** Specs as they appear in the history row: repo-relative, de-duplicated, sorted. */
export function normaliseSpecs(specs = []) {
  const out = new Set();
  for (const s of specs) {
    if (typeof s !== "string" || !s.trim()) continue;
    out.add(s.trim().replace(/^.*?tests\/live-qa\//, "tests/live-qa/"));
  }
  return [...out].sort();
}

/** Pure: reduce Playwright's results.json + run-state.json into the summary object. */
export function summariseRun({ results, runState, startTs, pwExit, baseURL, specs = [], now = new Date() }) {
  const partial = Array.isArray(specs) && specs.length > 0;
  const summary = {
    ts: now.toISOString(),
    startedAt: startTs,
    baseURL,
    partial,
    ...(partial ? { specs: normaliseSpecs(specs) } : {}),
    exitCode: Number(pwExit),
    passed: 0,
    failed: 0,
    skipped: 0,
    flaky: 0,
    expectedFailures: 0,
    durationMs: null,
    account: null,
    erasure: null,
    findings: [],
  };
  if (runState && typeof runState === "object") {
    summary.account = { email: runState.email, userId: runState.userId, projectId: runState.projectId, plan: runState.plan, elevated: runState.elevated };
    summary.erasure = runState.erasure ?? { ok: false, detail: "teardown did not record an outcome" };
  } else {
    summary.erasure = { ok: false, detail: "run-state.json missing — setup never provisioned an account (nothing to erase) or the run aborted before it" };
  }
  if (results && typeof results === "object" && !(results instanceof Error)) {
    summary.durationMs = results.stats?.duration ?? null;
    const walk = (suite, file) => {
      for (const s of suite.suites ?? []) walk(s, suite.file ?? file);
      for (const spec of suite.specs ?? []) {
        for (const t of spec.tests ?? []) {
          const last = t.results?.[t.results.length - 1];
          const status = t.status; // expected | unexpected | skipped | flaky
          if (status === "expected") {
            if (t.expectedStatus === "failed") summary.expectedFailures += 1;
            else summary.passed += 1;
          } else if (status === "skipped") summary.skipped += 1;
          else if (status === "flaky") summary.flaky += 1;
          else {
            summary.failed += 1;
            const err = last?.error?.message ?? last?.errors?.[0]?.message ?? "(no error message)";
            summary.findings.push({ spec: (spec.file ?? suite.file ?? file ?? "").replace(/^.*tests\/live-qa\//, ""), project: t.projectName, title: spec.title, error: stripAnsi(err).slice(0, 600) });
          }
        }
      }
    };
    for (const s of results.suites ?? []) walk(s, s.file);
    if (results.errors?.length) for (const e of results.errors) summary.findings.push({ spec: "(global)", title: "global setup/teardown", error: stripAnsi(e.message ?? e).slice(0, 600) });
  } else {
    summary.findings.push({ spec: "(runner)", title: "results.json unreadable", error: String(results instanceof Error ? results.message : "results.json missing") });
  }
  if (summary.erasure && summary.erasure.ok === false && summary.account) {
    summary.findings.push({ spec: "(teardown)", title: "QA account erasure", error: `ERASURE NOT CONFIRMED for ${summary.account.email}: ${summary.erasure.detail}` });
  }
  return summary;
}

/** Pure: the one-line history row for a summary. */
export function historyRow(summary) {
  return {
    ts: summary.ts,
    passed: summary.passed,
    failed: summary.failed,
    skipped: summary.skipped,
    expectedFailures: summary.expectedFailures,
    exitCode: summary.exitCode,
    erasureOk: summary.erasure?.ok ?? null,
    elevated: summary.account?.elevated ?? null,
    partial: summary.partial === true,
    ...(summary.partial === true ? { specs: summary.specs ?? [] } : {}),
  };
}

/** One-line console summary (the cron log). */
export function formatSummaryLine(summary, reportPath) {
  const n = (summary.specs ?? []).length;
  const scope = summary.partial ? ` · PARTIAL (${n} spec${n === 1 ? "" : "s"})` : "";
  return `qa-live: passed ${summary.passed} · failed ${summary.failed} · skipped ${summary.skipped} · expected-failures ${summary.expectedFailures} · erasure ${summary.erasure?.ok ? "ok" : "NOT OK"}${scope} → ${reportPath}`;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return e instanceof Error ? e : new Error(String(e));
  }
}

/** Read the run files, write the report + history row, return { summary, paths }. */
export function writeSummary({ resultsFile, runStateFile, reportsDir, startTs, pwExit, baseURL, specs = [], now = new Date() }) {
  const results = readJson(resultsFile);
  const rs = readJson(runStateFile);
  const summary = summariseRun({ results, runState: rs instanceof Error ? null : rs, startTs, pwExit, baseURL, specs, now });
  const paths = summaryPaths(reportsDir, specs);
  fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(paths.report, JSON.stringify(summary, null, 2) + "\n");
  fs.appendFileSync(paths.history, JSON.stringify(historyRow(summary)) + "\n");
  return { summary, paths };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const [resultsFile, runStateFile, reportsDir, startTs, pwExit, ...specs] = process.argv.slice(2);
  if (!resultsFile || !runStateFile || !reportsDir) {
    console.error("usage: node scripts/lib/live-qa-summary.mjs RESULTS RUN_STATE REPORTS_DIR START_TS PW_EXIT [spec...]");
    process.exit(2);
  }
  const { summary, paths } = writeSummary({ resultsFile, runStateFile, reportsDir, startTs, pwExit, baseURL: process.env.LIVE_QA_BASE_URL, specs });
  console.log(formatSummaryLine(summary, paths.report));
  for (const f of summary.findings) console.log(`  ✗ [${f.spec}] ${f.title}: ${f.error.split("\n")[0]}`);
}
