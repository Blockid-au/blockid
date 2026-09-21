#!/usr/bin/env node
// G15-R2 — error digest for the production log. Plain node, no deps.
//
//   node scripts/error-digest.mjs             # cron: every 10 min
//   node scripts/error-digest.mjs --dry-run   # parse + print, write nothing, no Telegram
//   node scripts/error-digest.mjs --log /path/to/file --window 10 --json
//
// What it does each run:
//   1. Reads the log from the byte offset stored in /data/logs/.error-digest.offset
//      (offset > size ⇒ the file was rotated / truncated ⇒ restart at 0), so no
//      line is counted twice and a partial trailing line waits for the next run.
//   2. Groups error lines by [tag] + normalised message (lib/error-digest-core.mjs).
//   3. Appends {ts, window_min, total, classes} to content/reports/error-digest.jsonl.
//   4. Keeps a 7-day class memory in content/reports/error-digest-state.json.
//   5. Telegram (same bot/chat as cron-runner.sh, 30-min debounce per class) on:
//      (a) a class not seen in 7 days, (b) ≥ 5× its 24 h hourly median and ≥ 10
//      lines, (c) any line with fully_degraded / AIBudgetExhaustedError /
//      permission denied.
//   6. G24-B: reads /api/status (local, STATUS_BASE_URL or 127.0.0.1:4001) and
//      raises ONE line when `tbr_quality.status` has been ≠ ok for > 24 h
//      (then once a day while it holds) — same send path, so the e-mail
//      fallback carries it when the Telegram token is dead. App down → no-op.
//
// Lock: /tmp/blockid-error-digest.lock (pid file, stale-safe). Exit 0 always
// except a genuine crash (exit 1) so cron-health stays readable.

import { closeSync, existsSync, openSync, readSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { acquireLock, appendJsonl, readJson, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import { computeReadStart, digestLines, emptyState, emptyTbrQualityState, evaluate, evaluateTbrQuality, formatAlert, pickTbrQuality, splitComplete, toReportRow, WINDOW_MIN } from "./lib/error-digest-core.mjs";

const DEFAULT_LOG = existsSync("/data/logs/blockid-production.log") ? "/data/logs/blockid-production.log" : "/tmp/blockid-production.log";
const DEFAULT_OFFSET = "/data/logs/.error-digest.offset";
const REPORT = path.join(WEB_DIR, "content", "reports", "error-digest.jsonl");
const STATE = path.join(WEB_DIR, "content", "reports", "error-digest-state.json");
const LOCK = "/tmp/blockid-error-digest.lock";
const MAX_READ_BYTES = 32 * 1024 * 1024; // never slurp more than 32 MB per run
const STATUS_TIMEOUT_MS = 5_000;

/** G24-B: /api/status.tbr_quality from the local app, or null when unreachable / not a status body. */
export async function readTbrQuality({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = STATUS_TIMEOUT_MS } = {}) {
  const base = (env.STATUS_BASE_URL || "http://127.0.0.1:4001").replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/status`, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return pickTbrQuality(await res.json());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function parseArgs(argv) {
  const out = { dryRun: false, json: false, log: DEFAULT_LOG, offsetFile: DEFAULT_OFFSET, windowMin: WINDOW_MIN };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--log") out.log = argv[++i];
    else if (a === "--offset-file") out.offsetFile = argv[++i];
    else if (a === "--window") out.windowMin = Number(argv[++i]) || WINDOW_MIN;
  }
  return out;
}

function readOffset(file) {
  try {
    const n = Number(readFileSync(file, "utf8").trim());
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

/** Read the unconsumed tail as complete lines. Exported for the test. */
export function readWindow(logFile, offset) {
  let size = 0;
  try {
    size = statSync(logFile).size;
  } catch {
    return { lines: [], nextOffset: 0, start: 0, size: 0, missing: true };
  }
  let start = computeReadStart(offset, size);
  if (size - start > MAX_READ_BYTES) start = size - MAX_READ_BYTES; // backlog too big — skip ahead
  const len = size - start;
  if (len <= 0) return { lines: [], nextOffset: start, start, size };
  const buf = Buffer.alloc(len);
  const fd = openSync(logFile, "r");
  try {
    readSync(fd, buf, 0, len, start);
  } finally {
    closeSync(fd);
  }
  const { lines, nextOffset } = splitComplete(buf, start);
  return { lines, nextOffset, start, size };
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseArgs(argv);
  const now = deps.now ?? Date.now();
  const nowIso = new Date(now).toISOString();
  const log = deps.log ?? ((m) => process.stdout.write(`${m}\n`));

  const release = args.dryRun ? () => {} : acquireLock(deps.lockFile ?? LOCK);
  if (!release) {
    log(`[error-digest] ${nowIso} skip: previous run still holds ${deps.lockFile ?? LOCK}`);
    return { skipped: "locked" };
  }
  try {
    const stateFile = deps.stateFile ?? STATE;
    const offset = readOffset(args.offsetFile);
    const win = readWindow(args.log, offset);
    const digest = digestLines(win.lines, nowIso);
    const seeding = !existsSync(stateFile); // first run: remember classes, do not alert "new" on all of them
    const prevState = readJson(stateFile, emptyState());
    const { state, alerts } = evaluate(prevState, digest, now, { suppressNew: seeding });
    // G24-B: report-quality watch — evaluate() rebuilds the state object, so the
    // tbr_quality slot is carried over here explicitly.
    const tbrVerdict = await (deps.readTbrQuality ?? readTbrQuality)();
    const tbr = evaluateTbrQuality(prevState.tbr_quality ?? emptyTbrQualityState(), tbrVerdict, now);
    state.tbr_quality = tbr.next;
    const row = toReportRow(digest, nowIso, args.windowMin);
    const summary = {
      ts: nowIso,
      dry_run: args.dryRun,
      log: args.log,
      read_from: win.start,
      read_to: win.nextOffset,
      rotated: offset > win.size,
      seeding,
      lines: win.lines.length,
      total: digest.total,
      classes: digest.classes.length,
      alerts: alerts.map((a) => ({ rule: a.rules.join("+"), tag: a.tag, count: a.count, msg: a.msg })),
      telegram: null,
      tbr_quality: {
        status: tbrVerdict?.status ?? null,
        not_ok_since: tbr.next.not_ok_since,
        alert: tbr.alert,
        telegram: null,
      },
    };

    if (!args.dryRun) {
      appendJsonl(deps.reportFile ?? REPORT, row);
      writeJsonAtomic(stateFile, state);
      try {
        writeFileSync(args.offsetFile, String(win.nextOffset));
      } catch (err) {
        log(`[error-digest] offset file not writable (${err.code ?? err.message}) — next run re-reads the window`);
      }
    }
    if (alerts.length > 0) {
      summary.telegram = await (deps.sendTelegram ?? sendTelegram)(formatAlert(alerts, digest, args.windowMin), { dryRun: args.dryRun });
    }
    if (tbr.alert) {
      summary.tbr_quality.telegram = await (deps.sendTelegram ?? sendTelegram)(`BlockID report quality\n${tbr.alert}`, { dryRun: args.dryRun });
    }
    if (args.json) log(JSON.stringify(summary));
    else {
      log(`[error-digest] ${nowIso}${args.dryRun ? " (dry-run)" : ""} ${win.lines.length} lines → ${digest.total} error lines in ${digest.classes.length} classes; alerts=${alerts.length}${win.missing ? " (log missing)" : ""}${summary.rotated ? " (rotation detected)" : ""}`);
      for (const c of digest.classes.slice(0, 10)) log(`  ×${c.count} [${c.tag}] ${c.msg}`);
      for (const a of alerts) log(`  ALERT ${a.rules.join("+")} [${a.tag}] ×${a.count}`);
      if (summary.telegram) log(`  telegram: ${summary.telegram.sent ? "sent" : `not sent (${summary.telegram.reason})`}`);
      if (tbr.alert) log(`  ALERT ${tbr.alert}${summary.tbr_quality.telegram ? ` — ${summary.tbr_quality.telegram.sent ? "sent" : `not sent (${summary.tbr_quality.telegram.reason})`}` : ""}`);
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
      process.stderr.write(`[error-digest] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
