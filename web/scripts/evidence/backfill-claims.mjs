#!/usr/bin/env node
/**
 * G21 P1-A — backfill `public.claims` / `public.evidence_records` (migration
 * 0417) for existing projects from their latest analysis + Evidence Hub rows.
 *
 * Runs the SAME code the analysis writers run on completion
 * (src/lib/evidence/claims.ts syncClaimsForProject, tsx-loaded — no
 * duplicated logic): idempotent upsert on (project_id, claim_key), never
 * deletes, a proof already recorded (same hash) is skipped, older same-source
 * proof is superseded, every status change and every new record is audited
 * (`claim.status_changed` / `evidence.recorded`, actor `system`).
 *
 * Dry-run by default — derives against an in-memory copy of the live rows
 * and prints the counts; nothing is written. `--write` persists.
 *
 * Usage (from web/, reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env):
 *   node scripts/evidence/backfill-claims.mjs --all                    # dry-run, every project with an analysis
 *   node scripts/evidence/backfill-claims.mjs --project <uuid>         # dry-run, one project
 *   node scripts/evidence/backfill-claims.mjs --all --write            # persist
 *   node scripts/evidence/backfill-claims.mjs --all --write --report   # + content/reports/claims-backfill.json
 *   node scripts/evidence/backfill-claims.mjs --all --limit=50 --json
 *
 * Requires migration 0417 to be applied for --write (dry-run works without).
 * Exit codes: 0 ok · 1 some projects failed · 2 config/usage · 3 table missing (apply 0417).
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..", "..");

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const i = argv.findIndex((a) => a === n || a.startsWith(`${n}=`));
  if (i < 0) return null;
  if (argv[i].includes("=")) return argv[i].slice(n.length + 1);
  return argv[i + 1] ?? null;
};
const WRITE = flag("--write");
const DRY = !WRITE;
const ALL = flag("--all");
const PROJECT = opt("--project");
const JSON_OUT = flag("--json");
const REPORT = flag("--report");
const LIMIT = opt("--limit") ? Number(opt("--limit")) : null;
if (flag("--help") || flag("-h") || (!ALL && !PROJECT)) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(ALL || PROJECT ? 0 : 2);
}
if (flag("--dry-run") && WRITE) {
  console.error("--dry-run and --write are mutually exclusive");
  process.exit(2);
}

// ─── env ─────────────────────────────────────────────────────────────────────

function loadEnv() {
  const file = resolve(WEB_DIR, ".env");
  const out = { ...process.env };
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}
const env = loadEnv();
const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace("supabase-kong", "localhost");
const key = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (web/.env)");
  process.exit(2);
}
if (env.AUDIT_HMAC_SECRET) process.env.AUDIT_HMAC_SECRET = env.AUDIT_HMAC_SECRET;
process.env.SUPABASE_URL = url;
process.env.SUPABASE_SERVICE_ROLE_KEY = key;
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ─── the real TS modules, via tsx ────────────────────────────────────────────
// Same loader as scripts/run-self-analysis.mjs: the lib graph goes through
// tsx's CommonJS hook (require tolerates its import cycles) and
// scripts/lib/server-only-hook.mjs maps `server-only` to an empty module and
// `@/lib/x` dynamic imports (lib/audit for the audit rows) to the .ts files.

const nodeModule = await import("node:module");
const { hooks } = await import("../lib/server-only-hook.mjs");
nodeModule.registerHooks(hooks);
const { register: registerTsxCjs } = await import("tsx/cjs/api");
process.env.TSX_TSCONFIG_PATH ??= resolve(WEB_DIR, "tsconfig.json");
registerTsxCjs();
const require = nodeModule.createRequire(import.meta.url);
const claimsMod = require("../../src/lib/evidence/claims.ts");
const dbMod = require("../../src/lib/evidence/claims-db.ts");
const { syncClaimsForProject } = claimsMod;
const { supabaseClaimsDb, memoryClaimsDb, isMissingTableError } = dbMod;
if (typeof syncClaimsForProject !== "function" || typeof supabaseClaimsDb !== "function") {
  console.error("Could not load lib/evidence/claims via tsx — run from web/ with node_modules installed.");
  process.exit(2);
}

// ─── data ────────────────────────────────────────────────────────────────────

const BATCH = 500;

async function fetchAll(table, select, build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += BATCH) {
    const { data, error } = await build(supabase.from(table).select(select)).range(from, from + BATCH - 1);
    if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { code: error.code, table });
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < BATCH) break;
  }
  return rows;
}

async function probeClaimsTable() {
  const { error } = await supabase.from("claims").select("id").limit(1);
  if (!error) return true;
  if (isMissingTableError(error)) {
    if (WRITE) {
      console.error("public.claims is missing — apply web/supabase/migrations/0417_claims_evidence_records.sql first (scripts/db/apply-migration.sh).");
      process.exit(3);
    }
    console.error("note: public.claims is missing — dry-run derives against an empty in-memory copy; apply 0417 before --write.");
    return false;
  }
  throw new Error(`claims probe: ${error.message}`);
}

/** Latest svi_analyses row per project (analysis_json + raw_input). */
async function latestAnalyses(projectIds) {
  const out = new Map();
  const ids = projectIds ? [...projectIds] : null;
  const rows = await fetchAll("svi_analyses", "id, project_id, raw_input, analysis_json, created_at", (q) => {
    let qq = q.not("project_id", "is", null).order("created_at", { ascending: false });
    if (ids) qq = qq.in("project_id", ids);
    return qq;
  });
  for (const r of rows) {
    if (!r.project_id || out.has(r.project_id)) continue;
    if (!r.analysis_json || typeof r.analysis_json !== "object" || !r.analysis_json.signals) continue;
    out.set(r.project_id, r);
  }
  return out;
}

// ─── run ─────────────────────────────────────────────────────────────────────

const startedAt = new Date().toISOString();
const tableExists = await probeClaimsTable();

const analyses = await latestAnalyses(PROJECT ? [PROJECT] : null);
let projectIds = [...analyses.keys()];
if (PROJECT && projectIds.length === 0) {
  console.error(`project ${PROJECT}: no svi_analyses row with analysis_json.signals — nothing to derive`);
  process.exit(2);
}
if (LIMIT && Number.isFinite(LIMIT)) projectIds = projectIds.slice(0, LIMIT);

const liveDb = supabaseClaimsDb(supabase);

/** Dry-run: a memory db seeded with the project's live rows so the counts are what --write would do. */
async function dbFor(projectId) {
  if (WRITE) return liveDb;
  const seed = { claims: [], records: [], hubRows: {} };
  if (tableExists) {
    seed.claims = await liveDb.listClaims(projectId);
    seed.records = await liveDb.listRecords(projectId);
  }
  seed.hubRows[projectId] = await liveDb.loadHubRows(projectId);
  return memoryClaimsDb(seed);
}

const totals = { projects: 0, ok: 0, failed: 0, claims_created: 0, claims_updated: 0, records_created: 0, records_superseded: 0, records_skipped: 0, status_changes: 0, conflicting: 0, claims_total: 0 };
const perProject = [];
const failures = [];

for (const projectId of projectIds) {
  const row = analyses.get(projectId);
  totals.projects += 1;
  try {
    const db = await dbFor(projectId);
    const summary = await syncClaimsForProject(projectId, row.analysis_json, {
      db,
      audit: WRITE ? undefined : null,
      rawText: row.raw_input ?? null,
      sourceReportId: row.id,
    });
    totals.ok += 1;
    for (const k of ["claims_created", "claims_updated", "records_created", "records_superseded", "records_skipped", "status_changes", "conflicting", "claims_total"]) totals[k] += summary[k] ?? 0;
    perProject.push({ project_id: projectId, analysis_id: row.id, ...summary });
    if (!JSON_OUT) console.log(`${DRY ? "[dry] " : ""}${projectId}  claims +${summary.claims_created} ~${summary.claims_updated} (${summary.claims_total})  records +${summary.records_created} sup ${summary.records_superseded} skip ${summary.records_skipped}  status Δ${summary.status_changes}  conflicting ${summary.conflicting}`);
  } catch (err) {
    totals.failed += 1;
    const message = err instanceof Error ? err.message : String(err);
    failures.push({ project_id: projectId, error: message });
    if (!JSON_OUT) console.error(`${projectId}: FAILED — ${message}`);
    if (isMissingTableError(err) && WRITE) process.exit(3);
  }
}

const report = {
  generated_at: new Date().toISOString(),
  started_at: startedAt,
  mode: DRY ? "dry-run" : "write",
  scope: PROJECT ? { project: PROJECT } : { all: true, limit: LIMIT },
  table_present: tableExists,
  totals,
  failures,
  projects: perProject,
};

if (JSON_OUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log("");
  console.log(`${DRY ? "DRY-RUN — nothing written. " : ""}projects ${totals.ok}/${totals.projects} ok (${totals.failed} failed) · claims +${totals.claims_created} ~${totals.claims_updated} (total ${totals.claims_total}) · records +${totals.records_created} superseded ${totals.records_superseded} skipped ${totals.records_skipped} · status changes ${totals.status_changes} · conflicting ${totals.conflicting}`);
}

if (REPORT) {
  const out = resolve(WEB_DIR, "content", "reports", "claims-backfill.json");
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify({ ...report, projects: perProject.slice(0, 500) }, null, 2) + "\n");
  if (!JSON_OUT) console.log(`report → ${out}`);
}

process.exit(totals.failed > 0 ? 1 : 0);
