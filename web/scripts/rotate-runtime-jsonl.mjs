#!/usr/bin/env node
// O1 / L1-10 (2026-10-20) — rotate the high-volume runtime JSONL logs.
//
//   node scripts/rotate-runtime-jsonl.mjs            # rotate (crontab: daily 04:25 UTC)
//   node scripts/rotate-runtime-jsonl.mjs --dry-run  # report only, change nothing
//   node scripts/rotate-runtime-jsonl.mjs --json
//
// Policy per file in TARGETS (an explicit allowlist — history/ledger files such
// as erasure-history, svi-backtest-history, traction-history, grants-review-queue,
// migration-audit are evidence or queues and are NEVER rotated here):
//   keep  rows whose timestamp is within KEEP_DAYS (30) — and of those at most
//         the newest MAX_BYTES (5 MB);
//   move  everything else, gzipped, to ARCHIVE_DIR (/data/logs/archive)
//         as <name>.<YYYYMMDDTHHMMZ>.jsonl.gz (one archive per run per file);
//   rows without a parseable timestamp (ts | timestamp | checked_at | at |
//   time | started_at) are treated as "keep" unless the 5 MB cap pushes them out.
// A file is only touched when it is over MAX_BYTES or its oldest row is older
// than KEEP_DAYS. The rewrite is append-safe: lines appended by a cron while
// we work are carried over before the atomic rename (temp file + rename,
// same mode). Nothing is deleted: archived rows live on under ARCHIVE_DIR.
//
// Lock: /tmp/blockid-rotate-jsonl.lock (ops-env acquireLock). Exit 0 unless it crashes.

import { closeSync, existsSync, mkdirSync, openSync, readSync, renameSync, statSync, chmodSync, writeFileSync, appendFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { fileURLToPath } from "node:url";
import { acquireLock, WEB_DIR } from "./lib/ops-env.mjs";

export const KEEP_DAYS = 30;
export const MAX_BYTES = 5 * 1024 * 1024;
export const ARCHIVE_DIR = process.env.BLOCKID_LOG_ARCHIVE_DIR || "/data/logs/archive";
const LOCK = "/tmp/blockid-rotate-jsonl.lock";

/** Paths relative to web/. High-volume operational logs only. */
export const TARGETS = [
  "content/ai-model-health.jsonl",
  "content/reports/cron-health.jsonl",
  "content/reports/uptime-guardian.jsonl",
  "content/reports/latency.jsonl",
  "content/reports/deploy-log.jsonl",
  "content/reports/error-digest.jsonl",
  "content/reports/test-flakes.jsonl",
  "content/reports/guardian-history.jsonl",
  "content/reports/link-check.jsonl",
  "content/reports/reseller-monitor.jsonl",
  "content/reports/orchestrator-history.jsonl",
  "content/reports/routine-heartbeat.jsonl",
  "content/reports/security-posture-history.jsonl",
  "content/reports/ai-free-models-verify-history.jsonl",
  "content/reports/disk-cleanup-history.jsonl",
  "content/reports/page-sweep.jsonl",
  "content/reports/tbr-quality.jsonl",
  "content/reports/tbr-stage-timings.jsonl",
];

const TS_KEYS = ["ts", "timestamp", "checked_at", "at", "time", "started_at"];

/** Row timestamp in ms, or null. */
export function rowTime(line) {
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== "object") return null;
  for (const k of TS_KEYS) {
    const v = obj[k];
    if (typeof v === "string" || typeof v === "number") {
      const t = typeof v === "number" ? (v < 1e12 ? v * 1000 : v) : Date.parse(v);
      if (Number.isFinite(t)) return t;
    }
  }
  return null;
}

/**
 * Split complete lines into { keep, archive } (order preserved).
 * keep = rows newer than now - keepDays (unknown time ⇒ keep), then capped to
 * the newest maxBytes; everything else is archived.
 */
export function partition(lines, nowMs = Date.now(), { keepDays = KEEP_DAYS, maxBytes = MAX_BYTES } = {}) {
  const cutoff = nowMs - keepDays * 86_400_000;
  const flags = lines.map((l) => {
    if (!l.trim()) return false; // blank lines are dropped (neither kept nor archived)
    const t = rowTime(l);
    return t === null || t >= cutoff;
  });
  // Cap: walk from the newest kept row backwards.
  let bytes = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (!flags[i]) continue;
    const b = Buffer.byteLength(lines[i], "utf8") + 1;
    if (bytes + b > maxBytes) flags[i] = false;
    else bytes += b;
  }
  const keep = [];
  const archive = [];
  lines.forEach((l, i) => {
    if (!l.trim()) return;
    (flags[i] ? keep : archive).push(l);
  });
  return { keep, archive };
}

/** Does this file need a rotation pass? (cheap: size + first line only) */
export function needsRotation(file, nowMs = Date.now(), { keepDays = KEEP_DAYS, maxBytes = MAX_BYTES } = {}) {
  let st;
  try {
    st = statSync(file);
  } catch {
    return { needed: false, reason: "missing" };
  }
  if (st.size > maxBytes) return { needed: true, reason: "size", size: st.size };
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(Math.min(st.size, 64 * 1024));
    readSync(fd, buf, 0, buf.length, 0);
    for (const line of buf.toString("utf8").split("\n")) {
      if (!line.trim()) continue;
      const t = rowTime(line);
      if (t === null) continue;
      return t < nowMs - keepDays * 86_400_000 ? { needed: true, reason: "age", size: st.size } : { needed: false, reason: "fresh", size: st.size };
    }
  } finally {
    closeSync(fd);
  }
  return { needed: false, reason: "no_timestamps", size: st.size };
}

function readRange(file, start, end) {
  const len = Math.max(0, end - start);
  if (len === 0) return Buffer.alloc(0);
  const fd = openSync(file, "r");
  try {
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, start);
    return buf;
  } finally {
    closeSync(fd);
  }
}

const stamp = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 13) + "Z";

/** Rotate one file. → summary row. */
export function rotateFile(file, { nowMs = Date.now(), dryRun = false, archiveDir = ARCHIVE_DIR, keepDays = KEEP_DAYS, maxBytes = MAX_BYTES } = {}) {
  const check = needsRotation(file, nowMs, { keepDays, maxBytes });
  if (!check.needed) return { file, rotated: false, reason: check.reason, size: check.size ?? 0 };
  const st = statSync(file);
  const size0 = st.size;
  const text = readRange(file, 0, size0).toString("utf8");
  const lastNl = text.lastIndexOf("\n");
  const complete = lastNl >= 0 ? text.slice(0, lastNl) : "";
  const consumed = lastNl >= 0 ? Buffer.byteLength(complete, "utf8") + 1 : 0;
  const { keep, archive } = partition(complete ? complete.split("\n") : [], nowMs, { keepDays, maxBytes });
  const summary = { file, rotated: false, reason: check.reason, size_before: size0, kept_rows: keep.length, archived_rows: archive.length, archive: null };
  if (archive.length === 0) return { ...summary, reason: `${check.reason}:nothing_to_archive` };
  const archiveFile = path.join(archiveDir, `${path.basename(file, ".jsonl")}.${stamp(nowMs)}.jsonl.gz`);
  summary.archive = archiveFile;
  if (dryRun) return { ...summary, dry_run: true };

  // 1. archive first (nothing is lost if we die after this point: the rows
  //    are in both places until the rename).
  mkdirSync(archiveDir, { recursive: true });
  const gz = gzipSync(Buffer.from(`${archive.join("\n")}\n`, "utf8"));
  if (existsSync(archiveFile)) appendFileSync(archiveFile, gz); // concatenated gzip members are valid gzip
  else writeFileSync(archiveFile, gz, { mode: 0o640 });

  // 2. temp file with the kept rows + whatever was appended meanwhile.
  const tmp = `${file}.rotate-${process.pid}.tmp`;
  writeFileSync(tmp, keep.length ? `${keep.join("\n")}\n` : "", { mode: st.mode & 0o777 });
  let carried = consumed;
  for (let i = 0; i < 5; i++) {
    const now = statSync(file).size;
    if (now <= carried) break;
    appendFileSync(tmp, readRange(file, carried, now));
    carried = now;
  }
  try { chmodSync(tmp, st.mode & 0o777); } catch { /* same owner — best effort */ }
  renameSync(tmp, file);
  return { ...summary, rotated: true, size_after: statSync(file).size };
}

export function parseArgs(argv) {
  return { dryRun: argv.includes("--dry-run"), json: argv.includes("--json") };
}

export function main(argv = process.argv.slice(2), { webDir = WEB_DIR, nowMs = Date.now(), log = (m) => process.stdout.write(`${m}\n`), targets = TARGETS, archiveDir = ARCHIVE_DIR, lockFile = LOCK } = {}) {
  const args = parseArgs(argv);
  const release = args.dryRun ? () => {} : acquireLock(lockFile);
  if (!release) {
    log("[rotate-jsonl] skip: previous run still holds the lock");
    return { skipped: "locked" };
  }
  try {
    const rows = targets.map((rel) => {
      try {
        return rotateFile(path.join(webDir, rel), { nowMs, dryRun: args.dryRun, archiveDir });
      } catch (err) {
        return { file: path.join(webDir, rel), rotated: false, error: err instanceof Error ? err.message : String(err) };
      }
    });
    const out = { ts: new Date(nowMs).toISOString(), dry_run: args.dryRun, rows };
    if (args.json) log(JSON.stringify(out));
    else {
      for (const r of rows) {
        if (r.error) log(`[rotate-jsonl] ERROR ${r.file}: ${r.error}`);
        else if (r.archived_rows) log(`[rotate-jsonl] ${r.dry_run ? "would rotate" : "rotated"} ${path.relative(webDir, r.file)} (${r.reason}): ${r.size_before} B → keep ${r.kept_rows} rows${r.size_after !== undefined ? ` / ${r.size_after} B` : ""}, archive ${r.archived_rows} rows → ${r.archive}`);
      }
      log(`[rotate-jsonl] ${out.ts}${args.dryRun ? " (dry-run)" : ""}: ${rows.filter((r) => r.rotated || r.dry_run).length}/${rows.length} files rotated`);
    }
    return out;
  } finally {
    release();
  }
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    main();
    process.exit(0);
  } catch (err) {
    process.stderr.write(`[rotate-jsonl] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    process.exit(1);
  }
}
