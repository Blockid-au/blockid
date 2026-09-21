// G23-C — the live-QA summary step (scripts/lib/live-qa-summary.mjs) pinned:
// a full run writes live-qa-latest.json and a { partial: false } history row;
// a `-- SPEC` run writes live-qa-latest-partial.json + { partial: true,
// specs: [...] } and never touches live-qa-latest.json; the Playwright
// results reducer keeps the S30-A counting rules (expected-failure pins,
// flaky, erasure finding).

import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LIVE_QA_HISTORY, LIVE_QA_LATEST, LIVE_QA_LATEST_PARTIAL, formatSummaryLine, historyRow, normaliseSpecs, summariseRun, summaryPaths, writeSummary } from "./lib/live-qa-summary.mjs";

const NOW = new Date("2026-09-21T07:30:00.000Z");

const RESULTS = {
  stats: { duration: 12345 },
  suites: [
    {
      file: "tests/live-qa/41-g21-regression.spec.ts",
      specs: [
        { title: "hero", tests: [{ status: "expected", expectedStatus: "passed", projectName: "chromium", results: [] }] },
        { title: "pinned product bug", tests: [{ status: "expected", expectedStatus: "failed", projectName: "chromium", results: [] }] },
        { title: "skipped one", tests: [{ status: "skipped", expectedStatus: "passed", projectName: "chromium", results: [] }] },
        { title: "flaky one", tests: [{ status: "flaky", expectedStatus: "passed", projectName: "chromium", results: [] }] },
      ],
      suites: [
        {
          specs: [
            { title: "trust band", tests: [{ status: "unexpected", expectedStatus: "passed", projectName: "chromium", results: [{ error: { message: "\u001b[31mexpected 200\u001b[0m got 500\nstack" } }] }] },
          ],
        },
      ],
    },
  ],
  errors: [],
};
const RUN_STATE = { email: "qa-live-x@blockid.au", userId: "u", projectId: "p", plan: "growth", elevated: true, erasure: { ok: true, detail: "erased" } };

describe("summaryPaths / normaliseSpecs", () => {
  it("no specs = full run = live-qa-latest.json; specs = partial file; history is shared", () => {
    expect(summaryPaths("/r")).toEqual({ partial: false, report: join("/r", LIVE_QA_LATEST), history: join("/r", LIVE_QA_HISTORY) });
    expect(summaryPaths("/r", ["tests/live-qa/41-g21-regression.spec.ts"])).toEqual({ partial: true, report: join("/r", LIVE_QA_LATEST_PARTIAL), history: join("/r", LIVE_QA_HISTORY) });
    expect(LIVE_QA_LATEST_PARTIAL).toBe("live-qa-latest-partial.json");
  });

  it("specs are repo-relative, de-duplicated and sorted", () => {
    expect(normaliseSpecs(["/home/x/web/tests/live-qa/41-g21-regression.spec.ts", "tests/live-qa/07-investor-crm.spec.ts", " tests/live-qa/07-investor-crm.spec.ts ", "", 3])).toEqual([
      "tests/live-qa/07-investor-crm.spec.ts",
      "tests/live-qa/41-g21-regression.spec.ts",
    ]);
  });
});

describe("summariseRun", () => {
  it("counts expected / expected-failure / skipped / flaky / failed and strips ANSI from findings", () => {
    const s = summariseRun({ results: RESULTS, runState: RUN_STATE, startTs: "2026-09-21T07:00:00Z", pwExit: "1", baseURL: "https://blockid.au", now: NOW });
    expect(s).toMatchObject({ ts: NOW.toISOString(), partial: false, exitCode: 1, passed: 1, failed: 1, skipped: 1, flaky: 1, expectedFailures: 1, durationMs: 12345 });
    expect(s.specs).toBeUndefined();
    expect(s.account).toEqual({ email: RUN_STATE.email, userId: "u", projectId: "p", plan: "growth", elevated: true });
    expect(s.findings).toEqual([{ spec: "41-g21-regression.spec.ts", project: "chromium", title: "trust band", error: "expected 200 got 500\nstack" }]);
  });

  it("a partial run carries partial: true + the normalised specs; the history row mirrors both", () => {
    const s = summariseRun({ results: RESULTS, runState: RUN_STATE, startTs: "t", pwExit: 0, baseURL: "b", specs: ["/abs/tests/live-qa/41-g21-regression.spec.ts"], now: NOW });
    expect(s.partial).toBe(true);
    expect(s.specs).toEqual(["tests/live-qa/41-g21-regression.spec.ts"]);
    expect(historyRow(s)).toEqual({ ts: NOW.toISOString(), passed: 1, failed: 1, skipped: 1, expectedFailures: 1, exitCode: 0, erasureOk: true, elevated: true, partial: true, specs: ["tests/live-qa/41-g21-regression.spec.ts"] });
    expect(formatSummaryLine(s, "/r/x.json")).toContain("PARTIAL (1 spec)");
    const full = historyRow(summariseRun({ results: RESULTS, runState: RUN_STATE, startTs: "t", pwExit: 0, now: NOW }));
    expect(full.partial).toBe(false);
    expect(full).not.toHaveProperty("specs");
  });

  it("missing run-state = erasure not ok with no account finding; unreadable results = a (runner) finding; unconfirmed erasure = a (teardown) finding", () => {
    const noState = summariseRun({ results: RESULTS, runState: null, startTs: "t", pwExit: 1, now: NOW });
    expect(noState.account).toBeNull();
    expect(noState.erasure.ok).toBe(false);
    expect(noState.findings.map((f) => f.spec)).toEqual(["41-g21-regression.spec.ts"]);
    const broken = summariseRun({ results: new Error("ENOENT"), runState: { ...RUN_STATE, erasure: { ok: false, detail: "delete failed" } }, startTs: "t", pwExit: 1, now: NOW });
    expect(broken.findings.map((f) => f.spec)).toEqual(["(runner)", "(teardown)"]);
    expect(broken.findings[1].error).toContain("ERASURE NOT CONFIRMED for qa-live-x@blockid.au");
  });
});

describe("writeSummary (temp root)", () => {
  let root;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "live-qa-summary-"));
    writeFileSync(join(root, "results.json"), JSON.stringify(RESULTS));
    writeFileSync(join(root, "run-state.json"), JSON.stringify(RUN_STATE));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("a partial run writes ONLY live-qa-latest-partial.json + a partial history row; a full run then writes live-qa-latest.json", () => {
    const reports = join(root, "content", "reports");
    const partial = writeSummary({ resultsFile: join(root, "results.json"), runStateFile: join(root, "run-state.json"), reportsDir: reports, startTs: "t", pwExit: "0", baseURL: "b", specs: ["tests/live-qa/41-g21-regression.spec.ts"], now: NOW });
    expect(partial.paths.report).toBe(join(reports, LIVE_QA_LATEST_PARTIAL));
    expect(existsSync(join(reports, LIVE_QA_LATEST_PARTIAL))).toBe(true);
    expect(existsSync(join(reports, LIVE_QA_LATEST))).toBe(false);
    const written = JSON.parse(readFileSync(join(reports, LIVE_QA_LATEST_PARTIAL), "utf8"));
    expect(written).toMatchObject({ partial: true, specs: ["tests/live-qa/41-g21-regression.spec.ts"], passed: 1 });

    const full = writeSummary({ resultsFile: join(root, "results.json"), runStateFile: join(root, "run-state.json"), reportsDir: reports, startTs: "t", pwExit: "1", baseURL: "b", now: NOW });
    expect(full.paths.report).toBe(join(reports, LIVE_QA_LATEST));
    expect(JSON.parse(readFileSync(join(reports, LIVE_QA_LATEST), "utf8"))).toMatchObject({ partial: false, exitCode: 1 });

    const rows = readFileSync(join(reports, LIVE_QA_HISTORY), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(rows.map((r) => r.partial)).toEqual([true, false]);
    expect(rows[0].specs).toEqual(["tests/live-qa/41-g21-regression.spec.ts"]);
    expect(rows[1]).not.toHaveProperty("specs");
  });

  it("a missing results.json still writes the report with a (runner) finding", () => {
    const reports = join(root, "r");
    const out = writeSummary({ resultsFile: join(root, "nope.json"), runStateFile: join(root, "run-state.json"), reportsDir: reports, startTs: "t", pwExit: "1", now: NOW });
    expect(out.summary.findings[0].spec).toBe("(runner)");
    expect(existsSync(join(reports, LIVE_QA_LATEST))).toBe(true);
  });
});
