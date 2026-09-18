#!/usr/bin/env node
// G15-R2 — per-route-class latency + 5xx sampler over the nginx access log.
//
//   node scripts/latency-sample.mjs             # cron: every 10 min
//   node scripts/latency-sample.mjs --dry-run   # parse + print, write nothing, no Telegram
//   node scripts/latency-sample.mjs --log /var/log/nginx/access.log --window 10 --json
//
// Reads the tail of /var/log/nginx/access.log (www-data:adm 0640 — the app
// user must be in `adm`; if it is not, exits 0 with {skipped:"no_access"} and
// docs/ops/slo.md has the one-line usermod), keeps the last 10 minutes, groups
// by route class (marketing / api_ai / api_other / tbr / workspace), computes
// n, p50, p95, 5xx rate → content/reports/latency.jsonl. p50/p95 need the
// `blockid_timing` log_format ($request_time appended) — until nginx is
// switched they are null and only the error rate is tracked.
//
// Alert: Telegram after 3 consecutive windows over target (SLO in
// lib/latency-core.mjs, mirrored in docs/ops/slo.md), state in
// content/reports/latency-state.json. Lock: /tmp/blockid-latency-sample.lock.

import { closeSync, existsSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, appendJsonl, readJson, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import { emptyState, evaluate, formatAlert, sampleWindow, toReportRow, WINDOW_MIN } from "./lib/latency-core.mjs";

const DEFAULT_LOG = "/var/log/nginx/access.log";
const REPORT = path.join(WEB_DIR, "content", "reports", "latency.jsonl");
const STATE = path.join(WEB_DIR, "content", "reports", "latency-state.json");
const LOCK = "/tmp/blockid-latency-sample.lock";
const TAIL_BYTES = 12 * 1024 * 1024; // ~40k lines — comfortably > 10 min at current traffic

export function parseArgs(argv) {
  const out = { dryRun: false, json: false, log: DEFAULT_LOG, windowMin: WINDOW_MIN };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--log") out.log = argv[++i];
    else if (a === "--window") out.windowMin = Number(argv[++i]) || WINDOW_MIN;
  }
  return out;
}

/** Last `maxBytes` of a file as whole lines; {lines:null, reason} when unreadable. */
export function readTail(file, maxBytes = TAIL_BYTES) {
  let size;
  try {
    size = statSync(file).size;
  } catch (err) {
    return { lines: null, reason: err?.code === "ENOENT" ? "missing" : "no_access" };
  }
  const start = Math.max(0, size - maxBytes);
  const len = size - start;
  if (len <= 0) return { lines: [], reason: null };
  let fd;
  try {
    fd = openSync(file, "r");
  } catch (err) {
    return { lines: null, reason: err?.code === "EACCES" ? "no_access" : "no_access" };
  }
  const buf = Buffer.alloc(len);
  try {
    readSync(fd, buf, 0, len, start);
  } finally {
    closeSync(fd);
  }
  const text = buf.toString("utf8");
  const lines = text.split("\n");
  if (start > 0) lines.shift(); // first line is a fragment
  return { lines: lines.filter(Boolean), reason: null };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const log = deps.log ?? ((m) => process.stdout.write(`${m}\n`));

  const release = args.dryRun ? () => {} : acquireLock(LOCK);
  if (!release) {
    log(`[latency-sample] ${nowIso} skip: previous run still holds ${LOCK}`);
    return { skipped: "locked" };
  }
  try {
    const tail = readTail(args.log);
    if (tail.lines === null) {
      const out = { ts: nowIso, skipped: tail.reason };
      log(args.json ? JSON.stringify(out) : `[latency-sample] ${nowIso} skipped: ${tail.reason} (${args.log}) — see docs/ops/slo.md`);
      return out;
    }
    // Daily logrotate at ~00:50 UTC: the current file may be younger than the
    // window, so also fold in the previous file's tail.
    let lines = tail.lines;
    const rotated = `${args.log}.1`;
    if (lines.length < 2000 && existsSync(rotated)) {
      const prev = readTail(rotated, 4 * 1024 * 1024);
      if (prev.lines) lines = [...prev.lines, ...lines];
    }
    const sample = sampleWindow(lines, now, args.windowMin);
    const prevState = readJson(STATE, emptyState());
    const { state, alerts } = evaluate(prevState, sample);
    const summary = { ...toReportRow(sample), dry_run: args.dryRun, requests: sample.requests, alerts, telegram: null };

    if (!args.dryRun) {
      appendJsonl(REPORT, toReportRow(sample));
      writeJsonAtomic(STATE, state);
    }
    if (alerts.length > 0) summary.telegram = await (deps.sendTelegram ?? sendTelegram)(formatAlert(alerts, sample), { dryRun: args.dryRun });

    if (args.json) log(JSON.stringify(summary));
    else {
      log(`[latency-sample] ${nowIso}${args.dryRun ? " (dry-run)" : ""} ${sample.requests} requests in ${args.windowMin} min${sample.timing ? "" : " (combined format — no p50/p95 until blockid_timing log_format is live)"}`);
      for (const [name, c] of Object.entries(sample.classes)) {
        log(`  ${name.padEnd(10)} n=${String(c.n).padStart(5)}  p50=${c.p50_ms ?? "—"}  p95=${c.p95_ms ?? "—"}  5xx=${c.err_rate_5xx === null ? "—" : `${(c.err_rate_5xx * 100).toFixed(2)}%`}`);
      }
      for (const a of alerts) log(`  ALERT ${a.kind} ${a.key}${a.windows ? ` (${a.windows} windows)` : ""}`);
      if (summary.telegram) log(`  telegram: ${summary.telegram.sent ? "sent" : `not sent (${summary.telegram.reason})`}`);
    }
    return summary;
  } finally {
    release();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    () => process.exit(0),
    (err) => {
      process.stderr.write(`[latency-sample] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
