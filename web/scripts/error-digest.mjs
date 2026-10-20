#!/usr/bin/env node
// G15-R2 — error digest for the production log. Plain node, no deps.
//
//   node scripts/error-digest.mjs             # cron: every 10 min
//   node scripts/error-digest.mjs --dry-run   # parse + print, write nothing, no Telegram
//   node scripts/error-digest.mjs --log /path/to/file --window 10 --json
//
// What it does each run:
//   1. L1-2 (2026-10-20): resolves WHICH logs to read from the G30 serving state
//      (content/reports/g30-serving-state.json). Since 22/09 the live server is a
//      systemd origin unit whose stdout/stderr go to
//      ~/.local/state/blockid-runtime/g30-origin-<port>-<sha256(release)[:10]>-<tag>.service.log
//      (scripts/g30-supervised-launch.py) — the legacy /data/logs/blockid-production.log
//      is no longer written, so reading it made errors_1h a fake 0. The digest
//      now reads the ACTIVE origin's log plus the PREVIOUS origin's log (the
//      switch window; in-flight work may still log there) and fast-forwards the
//      offsets of the other retained origins so a rollback never re-reads their
//      history. Origin logs have no timestamps, so the "window" is a per-log
//      byte offset kept in /data/logs/.error-digest.offsets.json (each run reads
//      only the bytes appended since the previous run; offset > size ⇒ the file
//      was truncated ⇒ restart at 0; a partial trailing line waits for the next
//      run; first ever run seeds every log at its current size). The legacy
//      single-file path (+ /data/logs/.error-digest.offset) is used only when no
//      serving state exists, or when --log is passed explicitly. A run that can
//      read none of the resolved origin logs appends NO row (blind ≠ zero
//      errors), so /api/status.errors_1h shows windows=0 instead of total=0.
//   2. Groups error lines by [tag] + normalised message (lib/error-digest-core.mjs).
//      L1-13: stale Server Action noise (old tab / bot) is a counted WARNING
//      (`warnings.stale_server_action` in the row), not an error class.
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
//   7. G29-A: from the same /api/status read, raises ONE line when
//      `ai.healthy_providers` has been < 2 for > 1 h (then once a day while
//      it holds) and clears the episode at ≥ 2 — the dead-rung / unfunded
//      signal (docs/ops/ai-providers.md § 12).
//
// Lock: /tmp/blockid-error-digest.lock (pid file, stale-safe). Exit 0 always
// except a genuine crash (exit 1) so cron-health stays readable.

import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readdirSync, readSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { acquireLock, appendJsonl, readJson, sendTelegram, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import { computeReadStart, digestLines, emptyAiCapacityState, emptyState, emptyTbrQualityState, evaluate, evaluateAiCapacity, evaluateTbrQuality, formatAlert, pickAiCapacity, pickTbrQuality, splitComplete, toReportRow, WINDOW_MIN } from "./lib/error-digest-core.mjs";

const DEFAULT_LOG = existsSync("/data/logs/blockid-production.log") ? "/data/logs/blockid-production.log" : "/tmp/blockid-production.log";
const DEFAULT_OFFSET = "/data/logs/.error-digest.offset";
const DEFAULT_OFFSETS = "/data/logs/.error-digest.offsets.json";
const SERVING_STATE = path.join(WEB_DIR, "content", "reports", "g30-serving-state.json");
const RUNTIME_DIR = process.env.BLOCKID_RUNTIME_DIR || path.join(os.userInfo().homedir, ".local", "state", "blockid-runtime");
const REPORT = path.join(WEB_DIR, "content", "reports", "error-digest.jsonl");
const STATE = path.join(WEB_DIR, "content", "reports", "error-digest-state.json");
const LOCK = "/tmp/blockid-error-digest.lock";
const MAX_READ_BYTES = 32 * 1024 * 1024; // never slurp more than 32 MB per run
const STATUS_TIMEOUT_MS = 5_000;

/** The local /api/status body, or null when unreachable / non-200 (never throws). */
export function servingStatusBase({ env = process.env, execImpl = execFileSync } = {}) {
  if (env.STATUS_BASE_URL) return env.STATUS_BASE_URL.replace(/\/+$/, "");
  try {
    const port = String(execImpl("python3", [path.join(WEB_DIR, "scripts", "g30-serving-state.py"), "--web", WEB_DIR, "--port"],
      { encoding: "utf8", timeout: STATUS_TIMEOUT_MS, stdio: ["ignore", "pipe", "pipe"] })).trim();
    if (!/^(4001|41[0-9]{2})$/.test(port)) return null;
    return `http://127.0.0.1:${port}`;
  } catch {
    return null; // invalid/switching state must never silently probe legacy4001
  }
}

export async function readStatusBody({ env = process.env, fetchImpl = globalThis.fetch, timeoutMs = STATUS_TIMEOUT_MS, execImpl = execFileSync } = {}) {
  const base = servingStatusBase({ env, execImpl });
  if (!base) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${base}/api/status`, { headers: { accept: "application/json" }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** G24-B: /api/status.tbr_quality from the local app, or null when unreachable / not a status body. */
export async function readTbrQuality(opts = {}) {
  return pickTbrQuality(await readStatusBody(opts));
}

/** G29-A: /api/status.ai → { healthy, unfunded }, or null when unreachable / no ai block. */
export async function readAiCapacity(opts = {}) {
  return pickAiCapacity(await readStatusBody(opts));
}

export function parseArgs(argv) {
  const out = {
    dryRun: false,
    json: false,
    log: DEFAULT_LOG,
    explicitLog: false,
    offsetFile: DEFAULT_OFFSET,
    offsetsFile: DEFAULT_OFFSETS,
    servingState: SERVING_STATE,
    runtimeDir: RUNTIME_DIR,
    windowMin: WINDOW_MIN,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") out.dryRun = true;
    else if (a === "--json") out.json = true;
    else if (a === "--log") {
      out.log = argv[++i];
      out.explicitLog = true;
    } else if (a === "--offset-file") out.offsetFile = argv[++i];
    else if (a === "--offsets-file") out.offsetsFile = argv[++i];
    else if (a === "--serving-state") out.servingState = argv[++i];
    else if (a === "--runtime-dir") out.runtimeDir = argv[++i];
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

/**
 * L1-2: the service log of one G30 serving-state entry. The unit name (and so
 * the log name) is `g30-origin-<port>-<sha256(releasePath)[:10]>-<tag>` —
 * scripts/g30-supervised-launch.py — so the log is found from the state alone,
 * without sudo/systemctl. A relaunch of the same release on the same port gets
 * a new tag; the most recently written log wins. null when none exists (e.g.
 * the 4001 bootstrap origin, which predates supervised units).
 */
export function originLogFor(entry, runtimeDir, { readdirImpl = readdirSync, statImpl = statSync } = {}) {
  if (!entry || typeof entry !== "object" || !Number.isInteger(entry.port) || typeof entry.releasePath !== "string") return null;
  const hash = createHash("sha256").update(entry.releasePath).digest("hex").slice(0, 10);
  const prefix = `g30-origin-${entry.port}-${hash}-`;
  let names;
  try {
    names = readdirImpl(runtimeDir);
  } catch {
    return null;
  }
  let best = null;
  for (const name of names) {
    if (typeof name !== "string" || !name.startsWith(prefix) || !name.endsWith(".service.log")) continue;
    const file = path.join(runtimeDir, name);
    let mtime = 0;
    try {
      mtime = statImpl(file).mtimeMs;
    } catch {
      continue;
    }
    if (!best || mtime > best.mtime) best = { file, mtime };
  }
  return best ? best.file : null;
}

/**
 * L1-2: which logs this run reads. Returns
 *   { mode: "origin", read: [{ role, port, log }], track: [log...] }  — serving state present
 *   { mode: "legacy", log, reason }                                    — no / unreadable state
 * `read` = active (+ previous when distinct); `track` = the other retained
 * origins' logs, whose offsets are fast-forwarded without counting so a later
 * rollback to one of them starts at "now", not at its whole history.
 * A present-but-malformed state falls back to legacy with
 * reason=state_unreadable so the summary says why.
 */
export function resolveLogSources({ servingState = SERVING_STATE, runtimeDir = RUNTIME_DIR, legacyLog = DEFAULT_LOG, readFileImpl = readFileSync, readdirImpl, statImpl } = {}) {
  let raw;
  try {
    raw = readFileImpl(servingState, "utf8");
  } catch {
    return { mode: "legacy", log: legacyLog, reason: "no_serving_state" };
  }
  let state;
  try {
    state = JSON.parse(raw);
  } catch {
    return { mode: "legacy", log: legacyLog, reason: "state_unreadable" };
  }
  if (!state || typeof state !== "object" || !state.active || typeof state.active !== "object") {
    return { mode: "legacy", log: legacyLog, reason: "state_unreadable" };
  }
  const fsOpts = {};
  if (readdirImpl) fsOpts.readdirImpl = readdirImpl;
  if (statImpl) fsOpts.statImpl = statImpl;
  const read = [];
  const seen = new Set();
  for (const role of ["active", "previous"]) {
    const entry = state[role];
    if (!entry || typeof entry !== "object") continue;
    const log = originLogFor(entry, runtimeDir, fsOpts);
    if (log && seen.has(log)) continue;
    if (log) seen.add(log);
    read.push({ role, port: entry.port ?? null, log });
  }
  const track = [];
  for (const entry of Array.isArray(state.retained) ? state.retained : []) {
    const log = originLogFor(entry, runtimeDir, fsOpts);
    if (log && !seen.has(log)) {
      seen.add(log);
      track.push(log);
    }
  }
  return { mode: "origin", read, track, phase: typeof state.phase === "string" ? state.phase : null };
}

/** { version: 1, logs: { "<abs path>": byteOffset } } or null when absent / unreadable. */
export function readOffsets(file) {
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    if (!data || typeof data !== "object" || !data.logs || typeof data.logs !== "object") return null;
    const logs = {};
    for (const [k, v] of Object.entries(data.logs)) if (Number.isFinite(v) && v >= 0) logs[k] = Math.floor(v);
    return { version: 1, logs };
  } catch {
    return null;
  }
}

function fileSize(file) {
  try {
    return statSync(file).size;
  } catch {
    return null;
  }
}

/**
 * L1-2: read the unconsumed tail of every `read` log and fast-forward every
 * `track` log. Offset policy for a log with no stored offset:
 *   - offsets file absent (first run on origin logs) → seed at current size,
 *     count nothing (no backlog of weeks-old lines on cut-over);
 *   - offsets file present → the log belongs to an origin launched since the
 *     last run → read from 0 (bounded by MAX_READ_BYTES in readWindow).
 * Logs no longer resolved are dropped from the offsets file (it stays small).
 * Returns { lines, sources, nextOffsets, blind } — blind when there was at
 * least one origin to read and none of their logs exists.
 */
export function readOriginWindows(resolved, prevOffsets) {
  const seeding = prevOffsets === null;
  const prev = prevOffsets?.logs ?? {};
  const nextOffsets = { version: 1, logs: {} };
  const lines = [];
  const sources = [];
  for (const src of resolved.read) {
    const size = src.log ? fileSize(src.log) : null;
    if (size === null) {
      sources.push({ role: src.role, port: src.port, log: src.log, missing: true, lines: 0 });
      continue;
    }
    const known = Object.prototype.hasOwnProperty.call(prev, src.log);
    const offset = known ? prev[src.log] : seeding ? size : 0;
    const win = readWindow(src.log, offset);
    lines.push(...win.lines);
    nextOffsets.logs[src.log] = win.nextOffset;
    sources.push({
      role: src.role,
      port: src.port,
      log: src.log,
      read_from: win.start,
      read_to: win.nextOffset,
      truncated: known && offset > win.size,
      seeded: !known && seeding,
      lines: win.lines.length,
    });
  }
  for (const log of resolved.track) {
    const size = fileSize(log);
    if (size !== null) nextOffsets.logs[log] = size;
  }
  const blind = resolved.read.length === 0 || sources.every((x) => x.missing);
  return { lines, sources, nextOffsets, blind };
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
    // L1-2: origin logs from the serving state; the legacy single file only
    // when --log is explicit or no serving state exists.
    const resolved = args.explicitLog
      ? { mode: "legacy", log: args.log, reason: "explicit_log" }
      : resolveLogSources({ servingState: args.servingState, runtimeDir: args.runtimeDir, legacyLog: args.log });
    let win;
    let originRead = null;
    let rotated = false;
    if (resolved.mode === "origin") {
      originRead = readOriginWindows(resolved, readOffsets(args.offsetsFile));
      const active = originRead.sources.find((x) => x.role === "active") ?? {};
      win = { lines: originRead.lines, start: active.read_from ?? 0, nextOffset: active.read_to ?? 0, missing: originRead.blind };
      rotated = originRead.sources.some((x) => x.truncated);
    } else {
      const offset = readOffset(args.offsetFile);
      win = readWindow(resolved.log, offset);
      rotated = offset > win.size;
    }
    const digest = digestLines(win.lines, nowIso);
    const seeding = !existsSync(stateFile); // first run: remember classes, do not alert "new" on all of them
    const prevState = readJson(stateFile, emptyState());
    const { state, alerts } = evaluate(prevState, digest, now, { suppressNew: seeding });
    // G24-B: report-quality watch — evaluate() rebuilds the state object, so the
    // tbr_quality slot is carried over here explicitly.
    // One /api/status read serves both watches; an injected reader (tests)
    // replaces the fetch for its own watch and leaves the other with null.
    const injected = Boolean(deps.readTbrQuality || deps.readAiCapacity);
    const statusBody = injected ? null : await (deps.readStatusBody ?? readStatusBody)();
    const tbrVerdict = deps.readTbrQuality ? await deps.readTbrQuality() : pickTbrQuality(statusBody);
    const tbr = evaluateTbrQuality(prevState.tbr_quality ?? emptyTbrQualityState(), tbrVerdict, now);
    state.tbr_quality = tbr.next;
    // G29-A: < 2 healthy AI providers for > 1 h → one line; clears at ≥ 2.
    const aiVerdict = deps.readAiCapacity ? await deps.readAiCapacity() : pickAiCapacity(statusBody);
    const aiCap = evaluateAiCapacity(prevState.ai_capacity ?? emptyAiCapacityState(), aiVerdict, now);
    state.ai_capacity = aiCap.next;
    const row = toReportRow(digest, nowIso, args.windowMin);
    const summary = {
      ts: nowIso,
      dry_run: args.dryRun,
      source: resolved.mode,
      source_reason: resolved.reason ?? null,
      log: originRead ? (originRead.sources.find((x) => x.role === "active")?.log ?? null) : resolved.log,
      sources: originRead ? originRead.sources : null,
      blind: originRead ? originRead.blind : false,
      read_from: win.start,
      read_to: win.nextOffset,
      rotated,
      seeding,
      lines: win.lines.length,
      total: digest.total,
      warnings: digest.warnings ?? {},
      classes: digest.classes.length,
      alerts: alerts.map((a) => ({ rule: a.rules.join("+"), tag: a.tag, count: a.count, msg: a.msg })),
      telegram: null,
      tbr_quality: {
        status: tbrVerdict?.status ?? null,
        not_ok_since: tbr.next.not_ok_since,
        alert: tbr.alert,
        telegram: null,
      },
      ai_capacity: {
        healthy: aiVerdict?.healthy ?? null,
        unfunded: aiVerdict?.unfunded ?? [],
        low_since: aiCap.next.low_since,
        alert: aiCap.alert,
        telegram: null,
      },
    };

    if (!args.dryRun) {
      // Blind (no origin log readable) ⇒ no row: /api/status.errors_1h must
      // show windows=0, never a fake total=0. The state file still carries
      // the tbr/ai watches.
      if (!summary.blind) appendJsonl(deps.reportFile ?? REPORT, row);
      writeJsonAtomic(stateFile, state);
      try {
        if (originRead) writeJsonAtomic(args.offsetsFile, originRead.nextOffsets);
        else writeFileSync(args.offsetFile, String(win.nextOffset));
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
    if (aiCap.alert) {
      summary.ai_capacity.telegram = await (deps.sendTelegram ?? sendTelegram)(`BlockID AI capacity\n${aiCap.alert}`, { dryRun: args.dryRun });
    }
    if (args.json) log(JSON.stringify(summary));
    else {
      log(`[error-digest] ${nowIso}${args.dryRun ? " (dry-run)" : ""} ${win.lines.length} lines → ${digest.total} error lines in ${digest.classes.length} classes; alerts=${alerts.length}${win.missing ? (summary.blind ? " (BLIND: no origin log readable — no row written)" : " (log missing)") : ""}${summary.rotated ? " (rotation detected)" : ""}`);
      if (originRead) {
        for (const x of originRead.sources) {
          log(`  source ${x.role}:${x.port ?? "?"} ${x.log ?? "(no log found)"}${x.missing ? " MISSING" : ` bytes ${x.read_from}→${x.read_to} (${x.lines} lines)${x.seeded ? " seeded" : ""}${x.truncated ? " truncated" : ""}`}`);
        }
      } else log(`  source legacy ${resolved.log} (${resolved.reason})`);
      for (const c of digest.classes.slice(0, 10)) log(`  ×${c.count} [${c.tag}] ${c.msg}`);
      for (const [k, n] of Object.entries(digest.warnings ?? {})) log(`  warning ×${n} ${k} (counted, not an error)`);
      for (const a of alerts) log(`  ALERT ${a.rules.join("+")} [${a.tag}] ×${a.count}`);
      if (summary.telegram) log(`  telegram: ${summary.telegram.sent ? "sent" : `not sent (${summary.telegram.reason})`}`);
      if (tbr.alert) log(`  ALERT ${tbr.alert}${summary.tbr_quality.telegram ? ` — ${summary.tbr_quality.telegram.sent ? "sent" : `not sent (${summary.tbr_quality.telegram.reason})`}` : ""}`);
      if (aiCap.alert) log(`  ALERT ${aiCap.alert}${summary.ai_capacity.telegram ? ` — ${summary.ai_capacity.telegram.sent ? "sent" : `not sent (${summary.ai_capacity.telegram.reason})`}` : ""}`);
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
