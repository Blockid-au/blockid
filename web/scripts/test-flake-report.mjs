#!/usr/bin/env node
/**
 * test-flake-report.mjs — slow / flaky unit-test ledger (G15-R1, evidence E6).
 *
 * Reads a vitest JSON reporter file (gate 6 of deploy-live.sh writes it with
 * `--reporter=default --reporter=json --outputFile=/tmp/blockid-deploy-vitest.json`),
 * prints the top-10 slowest tests, and appends every test slower than the
 * threshold (default 5 s = vitest's default `testTimeout`) — plus every
 * failed / timed-out test — to content/reports/test-flakes.jsonl as
 *   { ts, file, name, duration_ms, status }
 * so a test that keeps flirting with the timeout is visible BEFORE it
 * starts failing the deploy. Gate 6 keeps `--retry 0`: a retry would hide
 * exactly the tests this ledger exists to surface.
 *
 *   node scripts/test-flake-report.mjs /tmp/blockid-deploy-vitest.json
 *   node scripts/test-flake-report.mjs report.json --threshold-ms 3000 --top 20 --out /tmp/x.jsonl
 *   node scripts/test-flake-report.mjs report.json --dry-run       # print only, append nothing
 *
 * Exit 0 always when the report parses (informative, never a gate verdict);
 * exit 2 on a missing / unparseable report so the caller can tell "no data"
 * from "no slow tests".
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_THRESHOLD_MS = 5_000;
export const DEFAULT_TOP = 10;
export const DEFAULT_LEDGER = path.join(__dirname, "..", "content", "reports", "test-flakes.jsonl");

/** @typedef {{ ts: string, file: string, name: string, duration_ms: number, status: string }} FlakeRow */

/**
 * Flatten a vitest JSON report into one row per test. `file` is made relative
 * to `cwd` so the ledger reads the same from the deploy host and a worktree.
 * Tests with no duration (skipped / todo) are dropped — they cannot be slow.
 * @param {unknown} report
 * @param {{ cwd?: string, now?: () => string }} [opts]
 * @returns {FlakeRow[]}
 */
export function flattenReport(report, opts = {}) {
  const cwd = (opts.cwd ?? process.cwd()).replace(/\/+$/, "");
  const ts = (opts.now ?? (() => new Date().toISOString()))();
  const rows = [];
  const results = report && typeof report === "object" ? report.testResults : null;
  if (!Array.isArray(results)) return rows;
  for (const suite of results) {
    if (!suite || typeof suite !== "object") continue;
    const rawFile = typeof suite.name === "string" ? suite.name : "";
    const file = rawFile.startsWith(cwd + "/") ? rawFile.slice(cwd.length + 1) : rawFile;
    const asserts = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
    for (const a of asserts) {
      if (!a || typeof a !== "object") continue;
      const duration = typeof a.duration === "number" && Number.isFinite(a.duration) ? a.duration : null;
      if (duration === null) continue;
      const status = typeof a.status === "string" ? a.status : "unknown";
      const name = typeof a.fullName === "string" && a.fullName ? a.fullName : String(a.title ?? "");
      rows.push({ ts, file, name, duration_ms: Math.round(duration), status });
    }
  }
  return rows;
}

/**
 * Rows worth recording: slower than the threshold, or not passed (failed /
 * timed out). Order: slowest first, ties by file+name for a stable ledger.
 * @param {FlakeRow[]} rows
 * @param {number} thresholdMs
 */
export function selectFlakes(rows, thresholdMs = DEFAULT_THRESHOLD_MS) {
  return rows
    .filter((r) => r.duration_ms > thresholdMs || (r.status !== "passed" && r.status !== "pending" && r.status !== "skipped" && r.status !== "todo"))
    .sort(byDurationDesc);
}

/** @param {FlakeRow[]} rows @param {number} n */
export function topSlowest(rows, n = DEFAULT_TOP) {
  return [...rows].sort(byDurationDesc).slice(0, Math.max(0, n));
}

function byDurationDesc(a, b) {
  return b.duration_ms - a.duration_ms || a.file.localeCompare(b.file) || a.name.localeCompare(b.name);
}

/**
 * Human summary for the deploy log. Pure — the caller prints it.
 * @param {FlakeRow[]} all @param {FlakeRow[]} flakes @param {number} thresholdMs @param {number} top
 */
export function formatSummary(all, flakes, thresholdMs, top = DEFAULT_TOP) {
  const lines = [];
  const slowest = topSlowest(all, top);
  lines.push(`test-flake-report: ${all.length} timed tests · ${flakes.length} over ${thresholdMs} ms or not passed · top ${slowest.length} slowest:`);
  for (const r of slowest) {
    const flag = r.duration_ms > thresholdMs ? " ⚠" : "";
    lines.push(`  ${String(r.duration_ms).padStart(6)} ms  ${r.status.padEnd(7)} ${r.file} › ${truncate(r.name, 90)}${flag}`);
  }
  if (all.length === 0) lines.push("  (no timed tests in the report)");
  return lines.join("\n");
}

function truncate(s, n) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/**
 * Append rows to the JSONL ledger (creates the directory). Returns the count.
 * @param {FlakeRow[]} rows @param {string} ledgerPath
 */
export function appendLedger(rows, ledgerPath = DEFAULT_LEDGER) {
  if (rows.length === 0) return 0;
  mkdirSync(path.dirname(ledgerPath), { recursive: true });
  appendFileSync(ledgerPath, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return rows.length;
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const out = { report: "", thresholdMs: DEFAULT_THRESHOLD_MS, top: DEFAULT_TOP, ledger: DEFAULT_LEDGER, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--threshold-ms") out.thresholdMs = Number(argv[++i]);
    else if (a === "--top") out.top = Number(argv[++i]);
    else if (a === "--out") out.ledger = String(argv[++i] ?? out.ledger);
    else if (a === "--dry-run") out.dryRun = true;
    else if (!out.report) out.report = a;
  }
  if (!Number.isFinite(out.thresholdMs) || out.thresholdMs < 0) out.thresholdMs = DEFAULT_THRESHOLD_MS;
  if (!Number.isFinite(out.top) || out.top < 0) out.top = DEFAULT_TOP;
  return out;
}

/**
 * CLI body. Returns the exit code; prints via `log`.
 * @param {string[]} argv @param {{ log?: (s: string) => void, cwd?: string }} [io]
 */
export function main(argv, io = {}) {
  const log = io.log ?? console.log;
  const args = parseArgs(argv);
  if (!args.report) {
    log("usage: node scripts/test-flake-report.mjs <vitest-json-report> [--threshold-ms 5000] [--top 10] [--out content/reports/test-flakes.jsonl] [--dry-run]");
    return 2;
  }
  let report;
  try {
    report = JSON.parse(readFileSync(args.report, "utf8"));
  } catch (e) {
    log(`test-flake-report: cannot read ${args.report}: ${e instanceof Error ? e.message : String(e)}`);
    return 2;
  }
  const all = flattenReport(report, { cwd: io.cwd });
  const flakes = selectFlakes(all, args.thresholdMs);
  log(formatSummary(all, flakes, args.thresholdMs, args.top));
  if (args.dryRun) {
    log(`  (dry run — ${flakes.length} row(s) NOT appended to ${args.ledger})`);
    return 0;
  }
  const n = appendLedger(flakes, args.ledger);
  log(n > 0 ? `  → ${n} row(s) appended to ${args.ledger}` : `  → nothing over ${args.thresholdMs} ms; ledger untouched`);
  return 0;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  process.exitCode = main(process.argv.slice(2));
}
