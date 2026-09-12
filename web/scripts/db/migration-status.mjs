#!/usr/bin/env node
// scripts/db/migration-status.mjs — which migration files are NOT in the
// public.schema_migrations ledger (0345)?
//
//   node scripts/db/migration-status.mjs            # human list
//   node scripts/db/migration-status.mjs --json
//   node scripts/db/migration-status.mjs --write    # also refresh content/reports/schema-migrations.json
//   node scripts/db/migration-status.mjs --strict   # exit 1 when anything is pending
//
// Output buckets:
//   pending   file exists, no ledger row            → apply with scripts/db/apply-migration.sh
//   deferred  file exists, intentionally unapplied  → scripts/db/parity-exceptions.json `deferred: true`
//   drift     ledger checksum != file sha256        → file edited after apply; review, then re-apply or --record-only
//   orphan    ledger row with no file               → file renamed/deleted after apply
//
// The --write manifest is what /api/status reads at runtime (the release
// bundle carries content/ but not supabase/migrations/): it lists every
// migration filename plus the deferred set, and the route diffs that against
// the live ledger to produce `schema_migrations: ok | pending:<n>`.
// scripts/db/apply-migration.sh runs --write after every apply.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { listMigrationFiles, loadExceptions, runPsql } from "./migration-parity.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const WEB_DIR = path.resolve(__dirname, "..", "..");
const MIG_DIR = path.join(WEB_DIR, "supabase", "migrations");
export const MANIFEST_FILE = path.join(WEB_DIR, "content", "reports", "schema-migrations.json");

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);

export function readLedger() {
  const exists = runPsql("select to_regclass('public.schema_migrations') is not null").trim() === "t";
  if (!exists) return null;
  const raw = runPsql(
    "select coalesce(json_agg(json_build_object('filename', filename, 'checksum', checksum, 'applied_at', applied_at, 'applied_by', applied_by)), '[]'::json)::text from public.schema_migrations",
  ).trim();
  return new Map(JSON.parse(raw).map((r) => [r.filename, r]));
}

export function computeStatus({ files, ledger, exceptions }) {
  const deferredSet = new Set([...exceptions.entries()].filter(([, v]) => v.deferred).map(([f]) => f));
  const pending = [];
  const deferred = [];
  const drift = [];
  const applied = [];
  for (const f of files) {
    const row = ledger?.get(f);
    if (!row) {
      if (deferredSet.has(f)) deferred.push(f);
      else pending.push(f);
      continue;
    }
    const sum = createHash("sha256").update(readFileSync(path.join(MIG_DIR, f))).digest("hex");
    if (row.checksum && row.checksum !== sum) drift.push(f);
    applied.push(f);
  }
  const orphan = ledger ? [...ledger.keys()].filter((f) => !files.includes(f)).sort() : [];
  return { pending, deferred, drift, orphan, applied };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const files = listMigrationFiles(MIG_DIR);
  const exceptions = loadExceptions();
  let ledger = null;
  let ledgerError = "";
  try {
    ledger = readLedger();
  } catch (e) {
    ledgerError = e.message;
  }
  const st = computeStatus({ files, ledger, exceptions });
  const manifest = {
    generated_at: new Date().toISOString(),
    ledger_present: ledger !== null,
    total_files: files.length,
    files,
    deferred: st.deferred,
    // Snapshot of the DB view at generation time (informational — /api/status
    // re-derives pending from the live ledger).
    pending_at_generation: st.pending,
    drift_at_generation: st.drift,
  };
  if (flag("--write")) {
    mkdirSync(path.dirname(MANIFEST_FILE), { recursive: true });
    writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2) + "\n");
  }
  if (flag("--json")) {
    console.log(JSON.stringify({ ...manifest, applied: st.applied.length, orphan: st.orphan, ledger_error: ledgerError || undefined }, null, 2));
  } else if (!flag("--quiet")) {
    if (ledger === null) {
      console.log(`schema_migrations ledger NOT present${ledgerError ? ` (${ledgerError.split("\n")[0]})` : ""} — apply supabase/migrations/0345_schema_migrations_ledger.sql first.`);
    }
    console.log(`Migration files: ${files.length}  applied: ${st.applied.length}  pending: ${st.pending.length}  deferred: ${st.deferred.length}  drift: ${st.drift.length}  orphan: ${st.orphan.length}`);
    const section = (title, list, hint) => {
      if (!list.length) return;
      console.log(`\n${title}${hint ? `  (${hint})` : ""}`);
      for (const f of list) console.log("  " + f);
    };
    section("PENDING", st.pending, "apply: scripts/db/apply-migration.sh supabase/migrations/<file>");
    section("DEFERRED", st.deferred, "intentionally unapplied — scripts/db/parity-exceptions.json");
    section("DRIFT", st.drift, "file edited after apply — review; re-apply or --record-only");
    section("ORPHAN", st.orphan, "ledger row without a file");
    if (flag("--write")) console.log(`\nmanifest written → ${path.relative(WEB_DIR, MANIFEST_FILE)}`);
  }
  if (flag("--strict") && (st.pending.length > 0 || ledger === null)) process.exit(1);
}
