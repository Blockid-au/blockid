// G15-R1 — scripts/test-flake-report.mjs: flattens a vitest JSON reporter
// file, prints the top-10 slowest tests and appends every test slower than
// 5 s (or not passed) to content/reports/test-flakes.jsonl as
// { ts, file, name, duration_ms, status }. Gate 6 of deploy-live.sh feeds it
// /tmp/blockid-deploy-vitest.json; it never changes the gate verdict.

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLD_MS,
  appendLedger,
  flattenReport,
  formatSummary,
  main,
  parseArgs,
  selectFlakes,
  topSlowest,
} from "./test-flake-report.mjs";

const CWD = "/srv/blockid/web";
const NOW = () => "2026-09-18T05:00:00.000Z";

/** A vitest 4 JSON reporter fixture: 3 files, 6 timed tests, 1 skipped. */
function fixture() {
  return {
    numTotalTests: 7,
    numPassedTests: 5,
    numFailedTests: 1,
    numPendingTests: 1,
    success: false,
    startTime: 1_000,
    testResults: [
      {
        name: `${CWD}/src/lib/pdf/tbr-pdf.test.tsx`,
        status: "passed",
        startTime: 1_000,
        endTime: 9_000,
        assertionResults: [
          { ancestorTitles: ["tbr pdf"], fullName: "tbr pdf renders 3 pages", title: "renders 3 pages", status: "passed", duration: 7_412.6, failureMessages: [] },
          { ancestorTitles: ["tbr pdf"], fullName: "tbr pdf footer", title: "footer", status: "passed", duration: 1_200, failureMessages: [] },
        ],
      },
      {
        name: `${CWD}/src/lib/svi/score.test.ts`,
        status: "failed",
        startTime: 1_000,
        endTime: 2_000,
        assertionResults: [
          { ancestorTitles: [], fullName: "score is monotonic", title: "score is monotonic", status: "passed", duration: 12, failureMessages: [] },
          { ancestorTitles: [], fullName: "score timeout", title: "score timeout", status: "failed", duration: 5_001, failureMessages: ["Error: Test timed out in 5000ms."] },
          { ancestorTitles: [], fullName: "score todo", title: "score todo", status: "pending", duration: null, failureMessages: [] },
        ],
      },
      {
        name: "/elsewhere/scripts/cron/guard.test.mjs",
        status: "passed",
        startTime: 1_000,
        endTime: 1_500,
        assertionResults: [
          { ancestorTitles: [], fullName: "guard a", title: "guard a", status: "passed", duration: 5_000, failureMessages: [] },
          { ancestorTitles: [], fullName: "guard b", title: "guard b", status: "passed", duration: 300, failureMessages: [] },
        ],
      },
    ],
  };
}

describe("flattenReport", () => {
  it("emits one row per timed test, file relative to cwd, duration rounded", () => {
    const rows = flattenReport(fixture(), { cwd: CWD, now: NOW });
    expect(rows).toHaveLength(6); // the `pending` test with duration null is dropped
    expect(rows[0]).toEqual({ ts: "2026-09-18T05:00:00.000Z", file: "src/lib/pdf/tbr-pdf.test.tsx", name: "tbr pdf renders 3 pages", duration_ms: 7413, status: "passed" });
    // a file outside cwd keeps its absolute path (the ../scripts/** guard tests)
    expect(rows.find((r) => r.name === "guard a")?.file).toBe("/elsewhere/scripts/cron/guard.test.mjs");
  });

  it("tolerates a malformed report (no testResults / junk entries) without throwing", () => {
    expect(flattenReport(null)).toEqual([]);
    expect(flattenReport({ testResults: "nope" })).toEqual([]);
    expect(flattenReport({ testResults: [null, { assertionResults: [null, { duration: "x" }] }] })).toEqual([]);
  });
});

describe("selectFlakes", () => {
  it("keeps tests strictly over the threshold OR not passed, slowest first", () => {
    const rows = flattenReport(fixture(), { cwd: CWD, now: NOW });
    const flakes = selectFlakes(rows, DEFAULT_THRESHOLD_MS);
    expect(flakes.map((r) => [r.name, r.status])).toEqual([
      ["tbr pdf renders 3 pages", "passed"], // 7413 ms > 5000
      ["score timeout", "failed"], // 5001 ms AND failed
    ]);
    // exactly 5000 ms and passed is NOT a flake (strictly greater-than)
    expect(flakes.find((r) => r.name === "guard a")).toBeUndefined();
  });

  it("a failed test is recorded even when it was fast", () => {
    const rows = [{ ts: "t", file: "f", name: "fast fail", duration_ms: 3, status: "failed" }];
    expect(selectFlakes(rows, 5_000)).toHaveLength(1);
  });

  it("honours a custom threshold", () => {
    const rows = flattenReport(fixture(), { cwd: CWD, now: NOW });
    expect(selectFlakes(rows, 1_000).map((r) => r.name)).toEqual(["tbr pdf renders 3 pages", "score timeout", "guard a", "tbr pdf footer"]);
  });
});

describe("topSlowest + formatSummary", () => {
  it("top-N is sorted by duration desc and capped", () => {
    const rows = flattenReport(fixture(), { cwd: CWD, now: NOW });
    expect(topSlowest(rows, 3).map((r) => r.duration_ms)).toEqual([7413, 5001, 5000]);
    expect(topSlowest(rows, 0)).toEqual([]);
  });

  it("summary names the counts, lists the slowest with ms + status, flags over-threshold rows", () => {
    const rows = flattenReport(fixture(), { cwd: CWD, now: NOW });
    const text = formatSummary(rows, selectFlakes(rows), DEFAULT_THRESHOLD_MS, 10);
    expect(text).toContain("6 timed tests · 2 over 5000 ms or not passed · top 6 slowest");
    expect(text).toContain("7413 ms  passed  src/lib/pdf/tbr-pdf.test.tsx › tbr pdf renders 3 pages ⚠");
    expect(text).toContain("5001 ms  failed  src/lib/svi/score.test.ts › score timeout ⚠");
    expect(text).toMatch(/5000 ms {2}passed {2}\/elsewhere\/scripts\/cron\/guard\.test\.mjs › guard a\n/); // not flagged
  });

  it("summary for an empty report says so instead of printing nothing", () => {
    expect(formatSummary([], [], 5_000)).toContain("(no timed tests in the report)");
  });
});

describe("appendLedger", () => {
  it("creates the directory, appends JSONL rows, and leaves the file alone when there is nothing to add", () => {
    const dir = mkdtempSync(join(tmpdir(), "flake-ledger-"));
    const ledger = join(dir, "nested", "test-flakes.jsonl");
    expect(appendLedger([], ledger)).toBe(0);
    expect(existsSync(ledger)).toBe(false);
    const rows = selectFlakes(flattenReport(fixture(), { cwd: CWD, now: NOW }));
    expect(appendLedger(rows, ledger)).toBe(2);
    expect(appendLedger(rows.slice(0, 1), ledger)).toBe(1);
    const lines = readFileSync(ledger, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(3);
    expect(lines[0]).toEqual({ ts: "2026-09-18T05:00:00.000Z", file: "src/lib/pdf/tbr-pdf.test.tsx", name: "tbr pdf renders 3 pages", duration_ms: 7413, status: "passed" });
    expect(Object.keys(lines[1])).toEqual(["ts", "file", "name", "duration_ms", "status"]);
  });
});

describe("parseArgs + main (CLI)", () => {
  it("parses report path, --threshold-ms, --top, --out, --dry-run; bad numbers fall back to defaults", () => {
    const a = parseArgs(["r.json", "--threshold-ms", "3000", "--top", "20", "--out", "/tmp/x.jsonl", "--dry-run"]);
    expect(a).toMatchObject({ report: "r.json", thresholdMs: 3000, top: 20, ledger: "/tmp/x.jsonl", dryRun: true });
    expect(parseArgs(["r.json", "--threshold-ms", "abc", "--top", "-1"])).toMatchObject({ thresholdMs: 5000, top: 10, dryRun: false });
  });

  it("exit 2 with usage when no report is given, exit 2 when the report is missing or not JSON", () => {
    const out = [];
    expect(main([], { log: (s) => out.push(s) })).toBe(2);
    expect(out[0]).toContain("usage:");
    expect(main(["/nonexistent/report.json"], { log: (s) => out.push(s) })).toBe(2);
    const dir = mkdtempSync(join(tmpdir(), "flake-cli-"));
    const bad = join(dir, "bad.json");
    writeFileSync(bad, "{not json");
    expect(main([bad], { log: (s) => out.push(s) })).toBe(2);
    expect(out.at(-1)).toContain("cannot read");
  });

  it("end to end: prints the top-10, appends the flakes, exit 0; --dry-run appends nothing", () => {
    const dir = mkdtempSync(join(tmpdir(), "flake-cli-"));
    const report = join(dir, "vitest.json");
    const ledger = join(dir, "test-flakes.jsonl");
    writeFileSync(report, JSON.stringify(fixture()));
    const out = [];
    expect(main([report, "--out", ledger, "--dry-run"], { log: (s) => out.push(s), cwd: CWD })).toBe(0);
    expect(existsSync(ledger)).toBe(false);
    expect(out.join("\n")).toContain("dry run — 2 row(s) NOT appended");
    expect(main([report, "--out", ledger], { log: (s) => out.push(s), cwd: CWD })).toBe(0);
    expect(out.at(-1)).toBe(`  → 2 row(s) appended to ${ledger}`);
    expect(readFileSync(ledger, "utf8").trim().split("\n")).toHaveLength(2);
    // a clean run leaves the ledger untouched
    const clean = { testResults: [{ name: `${CWD}/a.test.ts`, assertionResults: [{ fullName: "a", status: "passed", duration: 10 }] }] };
    writeFileSync(report, JSON.stringify(clean));
    expect(main([report, "--out", ledger], { log: (s) => out.push(s), cwd: CWD })).toBe(0);
    expect(out.at(-1)).toContain("ledger untouched");
    expect(readFileSync(ledger, "utf8").trim().split("\n")).toHaveLength(2);
  });
});
