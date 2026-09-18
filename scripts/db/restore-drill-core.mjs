#!/usr/bin/env node
// BlockID.au — restore-drill parity logic (G15-R3).
//
// The pure half of scripts/db/restore-drill.sh: the shell script does the
// docker / pg_restore plumbing and hands the numbers to this module, which
// decides PASS / FAIL and shapes the backup-health.jsonl row. Keeping the
// verdict here means it is unit-tested (restore-drill-core.test.mjs) without
// a Supabase container.
//
// CLI (used by restore-drill.sh):
//   node restore-drill-core.mjs --evaluate [--min-pct 95] < input.json → prints the health
//     row as one JSON line on stdout; exit 0 on "ok", 1 on "fail".
//
// Input JSON shape:
//   { dump, dump_age_h, duration_ms, pg_restore_exit, pg_restore_error_lines: [],
//     live: {table: n|null}, drill: {table: n|null},
//     audit: { rows: n|null, prev_hash_present: bool|null, curr_hash_present: bool|null } }

import { readFileSync } from "node:fs";

/** The 12 tables the drill counts in both databases (spec § 3 R3.1). */
export const DRILL_TABLES = Object.freeze([
  "app_users",
  "projects",
  "svi_snapshots",
  "evaluations",
  "funding_reports",
  "audit_events",
  "credit_transactions",
  "report_orders",
  "webhook_endpoints",
  "intake_submissions",
  "external_signals",
  "schema_migrations",
]);

/** Drill row count must be ≥ this share of the live count (dump is ≤ 24 h old). */
export const MIN_PCT = 95;
/** A dump older than this is a backup-pipeline problem, not a restore proof. */
export const MAX_DUMP_AGE_H = 36;

/**
 * pg_restore of a Supabase dump into the same cluster always reports a few
 * errors that are expected and harmless: pre-existing `public` / `extensions`
 * schemas, event triggers owned by supabase_admin, vault / pg_net objects,
 * CREATE EXTENSION on extensions already installed, missing roles referenced
 * by grants (we restore with --no-privileges but ALTER DEFAULT PRIVILEGES can
 * still name them). Anything else is fatal.
 */
export const BENIGN_RESTORE_ERROR_PATTERNS = Object.freeze([
  /already exists/i,
  /must be owner of/i,
  /permission denied for (schema|table|extension|function|sequence)/i,
  /permission denied to set parameter/i,
  /event trigger/i,
  /supabase_vault/i,
  /pg_net/i,
  /pg_graphql/i,
  /does not exist/i,
  /role ".*" (does not exist|cannot be)/i,
  /extension ".*" is not available/i,
  /unrecognized configuration parameter/i,
]);

/** Split pg_restore stderr into `error:` lines and classify each one. */
export function classifyRestoreErrors(stderrLines) {
  const errors = (stderrLines ?? [])
    .map((l) => String(l ?? "").trim())
    .filter((l) => /^pg_restore: error:/.test(l));
  const benign = [];
  const fatal = [];
  for (const line of errors) {
    (BENIGN_RESTORE_ERROR_PATTERNS.some((re) => re.test(line)) ? benign : fatal).push(line);
  }
  return { total: errors.length, benign, fatal };
}

function asCount(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(String(v).trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

/**
 * Per-table parity. `pct` = drill / live × 100 (one decimal); 100 when both
 * are 0 or live is 0 (rows deleted since the dump are not a restore fault).
 * A table that could not be counted on either side fails.
 */
export function compareCounts(live, drill, { minPct = MIN_PCT, tables = DRILL_TABLES } = {}) {
  const out = {};
  const failures = [];
  for (const t of tables) {
    const l = asCount(live?.[t]);
    const d = asCount(drill?.[t]);
    let pct = null;
    if (l !== null && d !== null) {
      pct = l === 0 ? 100 : Math.round((d / l) * 1000) / 10;
    }
    out[t] = { live: l, drill: d, pct };
    if (l === null) failures.push(`${t}: live count unreadable`);
    else if (d === null) failures.push(`${t}: drill count unreadable (table missing after restore?)`);
    else if (pct < minPct) failures.push(`${t}: drill=${d} live=${l} (${pct}% < ${minPct}%)`);
  }
  return { ok: failures.length === 0, tables: out, failures };
}

/** The drill DB's newest audit_events row must carry a linked hash chain. */
export function checkAuditHead(audit) {
  const rows = asCount(audit?.rows);
  if (rows === null) return { ok: false, reason: "audit_events unreadable in drill DB" };
  if (rows === 0) return { ok: true, reason: null };
  if (audit?.prev_hash_present !== true) return { ok: false, reason: "audit chain head has null prev_hash" };
  if (audit?.curr_hash_present !== true) return { ok: false, reason: "audit chain head has null curr_hash" };
  return { ok: true, reason: null };
}

/**
 * Full verdict + backup-health.jsonl row. Row shape stays compatible with the
 * existing db-backup / offsite / restore_test rows (ts, job, status, file,
 * duration_ms, error) and adds dump, dump_age_h, tables{name:{live,drill,pct}}.
 */
export function evaluateDrill(input, { now = new Date(), minPct = MIN_PCT, maxDumpAgeH = MAX_DUMP_AGE_H } = {}) {
  const failures = [];
  const dumpAgeH = Number(input?.dump_age_h);
  const dump = String(input?.dump ?? "");
  if (!dump) failures.push("no dump file");
  if (!Number.isFinite(dumpAgeH)) failures.push("dump age unknown");
  else if (dumpAgeH > maxDumpAgeH) failures.push(`dump is ${dumpAgeH.toFixed(1)} h old (> ${maxDumpAgeH} h) — check db-backup`);

  const errs = classifyRestoreErrors(input?.pg_restore_error_lines);
  if (errs.fatal.length > 0) failures.push(`pg_restore non-benign errors: ${errs.fatal.slice(0, 3).join(" | ")}`);
  const restoreExit = asCount(input?.pg_restore_exit);
  if (restoreExit !== null && restoreExit !== 0 && errs.total === 0) failures.push(`pg_restore exit ${restoreExit} with no error lines`);

  const parity = compareCounts(input?.live, input?.drill, { minPct });
  failures.push(...parity.failures);

  const audit = checkAuditHead(input?.audit);
  if (!audit.ok) failures.push(audit.reason);

  const status = failures.length === 0 ? "ok" : "fail";
  const row = {
    ts: now.toISOString().replace(/\.\d{3}Z$/, "Z"),
    job: "restore-drill",
    status,
    dump,
    file: dump,
    dump_age_h: Number.isFinite(dumpAgeH) ? Math.round(dumpAgeH * 10) / 10 : null,
    scratch_db: String(input?.scratch_db ?? "blockid_restore_drill"),
    tables: parity.tables,
    audit_chain_head: audit.ok ? "ok" : "fail",
    pg_restore_exit: restoreExit,
    pg_restore_errors: errs.total,
    pg_restore_benign: errs.benign.length,
    duration_ms: asCount(input?.duration_ms) ?? 0,
  };
  if (status === "fail") row.error = failures.join("; ").slice(0, 600);
  return { status, row, failures };
}

// ── CLI ───────────────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  if (!args.includes("--evaluate")) {
    console.error("usage: node restore-drill-core.mjs --evaluate < input.json");
    process.exit(2);
  }
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch (err) {
    console.error(`[restore-drill-core] invalid JSON on stdin: ${err?.message ?? err}`);
    process.exit(2);
  }
  const i = args.indexOf("--min-pct");
  const minPct = i >= 0 ? Number(args[i + 1]) : MIN_PCT;
  const { status, row } = evaluateDrill(input, { minPct: Number.isFinite(minPct) && minPct > 0 ? minPct : MIN_PCT });
  process.stdout.write(JSON.stringify(row) + "\n");
  process.exit(status === "ok" ? 0 : 1);
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();
