#!/usr/bin/env node
/**
 * G13-W1-T1 — backfill `public.startup_taxonomy` for every existing project
 * (spec docs/plans/investor-clarity-2026-09-15/10-ba-investor-dossier-taxonomy.md §B.5).
 *
 * For each `projects` row the classifier (`src/lib/taxonomy/suggest.ts`, the
 * same deterministic code the pipeline runs — loaded through tsx, no
 * duplicated logic) sees:
 *   • projects.name / description / industry / stage
 *   • the latest svi_analyses row for the project: analysis_json.sector
 *     (detectSector slug), analysis_json.stage, raw_input
 *   • hq_state from evaluations.state, else project_grant_profiles.state
 * and produces industry / sub_industry / business_model / customer_types /
 * stage_key / hq_state / geo_scope / tags with per-field confidence (DQ-1:
 * < 0.5 stays `unclassified`), sources = 'auto', confirmed_at = null.
 *
 * Idempotent and lock-aware (DQ-5): a row with `confirmed_at` set is left
 * untouched (only `suggested` is refreshed); on an unconfirmed row every
 * field whose `sources.<field>` is founder|evaluator is kept. Protected tags
 * (female_founded / first_nations) are never written or removed.
 *
 * Dry-run by default — prints the report (total / classified / % unclassified
 * per axis) and writes nothing. `--write` persists.
 *
 * Usage (from web/, reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env):
 *   node scripts/db/backfill-startup-taxonomy.mjs                 # dry-run report
 *   node scripts/db/backfill-startup-taxonomy.mjs --write         # persist
 *   node scripts/db/backfill-startup-taxonomy.mjs --json          # machine-readable report on stdout
 *   node scripts/db/backfill-startup-taxonomy.mjs --report=path   # also save the report JSON to a file
 *   node scripts/db/backfill-startup-taxonomy.mjs --include-archived
 *   node scripts/db/backfill-startup-taxonomy.mjs --limit=50
 *
 * Requires migration 0394 to be applied first (scripts/db/apply-migration.sh).
 * Exit codes: 0 ok · 2 config/usage · 3 table missing (apply 0394).
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { register as registerCjs } from "tsx/cjs/api";
import { register as registerEsm } from "tsx/esm/api";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..", "..");

// ─── args ────────────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n) => {
  const hit = argv.find((a) => a.startsWith(`${n}=`));
  return hit ? hit.slice(n.length + 1) : null;
};
const WRITE = flag("--write");
const JSON_OUT = flag("--json");
const INCLUDE_ARCHIVED = flag("--include-archived");
const LIMIT = opt("--limit") ? Number(opt("--limit")) : null;
const REPORT_PATH = opt("--report");
if (flag("--help") || flag("-h")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
  process.exit(0);
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
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// ─── classifier (the real TS module, via tsx) ────────────────────────────────

// web/package.json has no "type": "module", so tsx compiles src/**/*.ts as
// CJS — both hooks are needed (ESM for this .mjs entry, CJS for the graph
// underneath, which has a journey-map ↔ showcase/gallery cycle that only
// CJS tolerates). The `@/` alias comes from tsconfig paths.
const tsconfig = resolve(WEB_DIR, "tsconfig.json");
const unregisterCjs = registerCjs({ tsconfig });
const unregisterEsm = registerEsm({ tsconfig });
const cjsNs = (m) => (m && m.default && typeof m.default === "object" && !("suggestTaxonomy" in m) && !("INDUSTRIES" in m) ? m.default : m);
const suggestMod = cjsNs(await import(pathToFileURL(resolve(WEB_DIR, "src/lib/taxonomy/suggest.ts")).href));
const taxonomy = cjsNs(await import(pathToFileURL(resolve(WEB_DIR, "src/lib/taxonomy/startup-taxonomy.ts")).href));
await unregisterEsm();
unregisterCjs();
const { suggestTaxonomy } = suggestMod;
const { INDUSTRY_ANZSIC, PROTECTED_TAGS, TAXONOMY_VERSION } = taxonomy;
if (typeof suggestTaxonomy !== "function" || !Array.isArray(PROTECTED_TAGS)) {
  console.error("Could not load the taxonomy classifier via tsx — run from web/ with node_modules installed.");
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

/** true when the table exists. Missing table: dry-run continues (report only), --write exits 3. */
async function probeTable() {
  const { error } = await supabase.from("startup_taxonomy").select("project_id").limit(1);
  if (!error) return true;
  if (/startup_taxonomy/.test(error.message) && /does not exist|schema cache/.test(error.message)) {
    if (WRITE) {
      console.error("public.startup_taxonomy is missing — apply web/supabase/migrations/0394_startup_taxonomy.sql first (scripts/db/apply-migration.sh).");
      process.exit(3);
    }
    console.warn("note: public.startup_taxonomy does not exist yet (apply 0394) — dry-run classifies as if every row were new.");
    return false;
  }
  throw new Error(`startup_taxonomy probe: ${error.message}`);
}

async function loadInputs(tableExists) {
  let projects = await fetchAll("projects", "id, name, description, industry, stage, archived_at, created_at", (q) => q.order("created_at", { ascending: true }));
  if (!INCLUDE_ARCHIVED) projects = projects.filter((p) => !p.archived_at);
  if (LIMIT && Number.isFinite(LIMIT)) projects = projects.slice(0, LIMIT);
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) return { projects, analyses: new Map(), states: new Map(), existing: new Map() };

  // Latest analysis per project (ordered desc; first hit wins). JSON path
  // selection keeps the payload small — analysis_json can be hundreds of KB.
  const analyses = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await fetchAll(
      "svi_analyses",
      "project_id, created_at, raw_input, sector:analysis_json->>sector, stage:analysis_json->>stage",
      (q) => q.in("project_id", chunk).order("created_at", { ascending: false }),
    );
    for (const r of rows) if (!analyses.has(r.project_id)) analyses.set(r.project_id, r);
  }

  const states = new Map();
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const evals = await fetchAll("evaluations", "project_id, state, created_at", (q) => q.in("project_id", chunk).order("created_at", { ascending: true }));
    for (const e of evals) if (e.state && !states.has(e.project_id)) states.set(e.project_id, e.state);
    const profiles = await fetchAll("project_grant_profiles", "project_id, state", (q) => q.in("project_id", chunk));
    for (const p of profiles) if (p.state && !states.has(p.project_id)) states.set(p.project_id, p.state);
  }

  const existing = new Map();
  for (let i = 0; tableExists && i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200);
    const rows = await fetchAll("startup_taxonomy", "*", (q) => q.in("project_id", chunk));
    for (const r of rows) existing.set(r.project_id, r);
  }
  return { projects, analyses, states, existing };
}

// ─── lock rules (mirror src/lib/taxonomy/store.ts — kept tiny on purpose) ────

const HUMAN = new Set(["founder", "evaluator"]);
const FIELDS = ["industry", "sub_industry", "industry_secondary", "business_model", "customer_types", "stage_key", "hq_state", "geo_scope"];

function fieldLocked(row, field) {
  const src = row.sources?.[field];
  if (src && HUMAN.has(src)) return true;
  if (row.confirmed_at && src !== "auto") return true;
  return false;
}
function tagLocked(row, tag) {
  if (PROTECTED_TAGS.includes(tag)) return true;
  const src = row.sources?.tags?.[tag];
  if (src && HUMAN.has(src)) return true;
  if (row.confirmed_at && src !== "auto") return true;
  return false;
}
function same(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => v === b[i]);
  return (a ?? null) === (b ?? null);
}

function planWrite(projectId, suggestion, existing) {
  if (!existing) {
    const sources = {};
    for (const f of FIELDS) if (suggestion.sources[f] === "auto") sources[f] = "auto";
    const autoTags = suggestion.tags.filter((t) => !PROTECTED_TAGS.includes(t));
    if (autoTags.length) sources.tags = Object.fromEntries(autoTags.map((t) => [t, "auto"]));
    const row = {
      project_id: projectId,
      taxonomy_version: TAXONOMY_VERSION,
      hq_country: "AU",
      suggested: suggestion,
      confidence: suggestion.confidence,
      sources,
      tags: autoTags,
      anzsic_division: INDUSTRY_ANZSIC[suggestion.industry]?.division ?? null,
    };
    for (const f of FIELDS) row[f] = suggestion[f];
    return { op: "insert", row };
  }
  // Mirrors lib/taxonomy/store.ts: merge only confidences with evidence, and
  // never let a source-less suggestion ("no opinion") erase a stored value.
  const positiveConfidence = Object.fromEntries(Object.entries(suggestion.confidence ?? {}).filter(([, v]) => typeof v === "number" && v > 0));
  const patch = { suggested: suggestion, confidence: { ...(existing.confidence ?? {}), ...positiveConfidence } };
  const sources = { ...(existing.sources ?? {}), tags: { ...(existing.sources?.tags ?? {}) } };
  let changed = false;
  for (const f of FIELDS) {
    if (fieldLocked(existing, f)) continue;
    if (same(existing[f], suggestion[f])) continue;
    if (suggestion.sources[f] !== "auto") continue;
    patch[f] = suggestion[f];
    sources[f] = "auto";
    changed = true;
  }
  const curTags = Array.isArray(existing.tags) ? existing.tags : [];
  const locked = curTags.filter((t) => tagLocked(existing, t));
  const next = [...locked];
  const tagSources = {};
  for (const t of locked) {
    // A locked tag without a recorded source is founder-declared by definition
    // (protected tags are never auto) — never label it "auto".
    const recorded = existing.sources?.tags?.[t];
    if (recorded) tagSources[t] = recorded;
    else if (PROTECTED_TAGS.includes(t) || existing.confirmed_at) tagSources[t] = "founder";
  }
  for (const t of suggestion.tags) {
    if (PROTECTED_TAGS.includes(t) || next.includes(t) || tagLocked(existing, t)) continue;
    next.push(t);
    tagSources[t] = "auto";
  }
  if (!same([...curTags].sort(), [...next].sort())) {
    patch.tags = next;
    changed = true;
  }
  if (Object.keys(tagSources).length) sources.tags = tagSources;
  else delete sources.tags;
  if (changed) {
    patch.sources = sources;
    if (patch.industry !== undefined) patch.anzsic_division = INDUSTRY_ANZSIC[suggestion.industry]?.division ?? null;
  }
  // Confirmed rows: locked fields already skipped above; unlocked auto fields
  // still refresh (same as store.ts). Report "suggested_only" only when the
  // patch really carries nothing but the refreshed suggestion.
  return { op: changed ? "update" : existing.confirmed_at ? "suggested_only" : "unchanged", patch };
}

// ─── report ──────────────────────────────────────────────────────────────────

const AXES = ["industry", "business_model", "stage_key", "customer_types", "hq_state", "geo_scope"];

function isUnclassified(axis, value) {
  if (axis === "customer_types") return !Array.isArray(value) || value.length === 0 || value.every((v) => v === "unclassified");
  if (axis === "stage_key") return value == null; // stage always has a value; count "unrecognised" via confidence below
  return value == null || value === "unclassified";
}

function pct(n, d) {
  return d === 0 ? 0 : Math.round((n / d) * 1000) / 10;
}

function buildReport({ total, results }) {
  const axes = {};
  for (const axis of AXES) {
    const counts = {};
    let unclassified = 0;
    for (const r of results) {
      const v = r.final[axis];
      const key = Array.isArray(v) ? (v[0] ?? "unclassified") : v ?? "unclassified";
      counts[key] = (counts[key] ?? 0) + 1;
      const un = axis === "stage_key" ? (r.final.confidence?.stage_key ?? 0) < 0.5 : isUnclassified(axis, v);
      if (un) unclassified += 1;
    }
    axes[axis] = { classified: total - unclassified, unclassified, pct_unclassified: pct(unclassified, total), counts };
  }
  const tagCounts = {};
  for (const r of results) for (const t of r.final.tags ?? []) tagCounts[t] = (tagCounts[t] ?? 0) + 1;
  const ops = {};
  for (const r of results) ops[r.op] = (ops[r.op] ?? 0) + 1;
  return {
    generated_at: new Date().toISOString(),
    mode: WRITE ? "write" : "dry-run",
    taxonomy_version: TAXONOMY_VERSION,
    total,
    ops,
    axes,
    tags: tagCounts,
    unclassified_industry_examples: results
      .filter((r) => r.final.industry === "unclassified")
      .slice(0, 15)
      .map((r) => ({ project_id: r.projectId, name: r.name, best_guess: r.suggestion.evidence?.[0] ?? null })),
  };
}

function printHuman(report) {
  const lines = [];
  lines.push(`startup_taxonomy backfill — ${report.mode} · ${report.total} project(s) · taxonomy ${report.taxonomy_version}`);
  lines.push(`ops: ${Object.entries(report.ops).map(([k, v]) => `${k}=${v}`).join("  ") || "none"}`);
  lines.push("");
  lines.push("axis              classified  unclassified  % unclassified");
  for (const [axis, a] of Object.entries(report.axes)) {
    lines.push(`${axis.padEnd(18)}${String(a.classified).padStart(10)}  ${String(a.unclassified).padStart(12)}  ${String(a.pct_unclassified).padStart(13)}%`);
  }
  lines.push("");
  const ind = report.axes.industry.counts;
  lines.push(`industry breakdown: ${Object.entries(ind).sort((x, y) => y[1] - x[1]).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}`);
  lines.push(`tags: ${Object.entries(report.tags).map(([k, v]) => `${k}=${v}`).join(", ") || "—"}`);
  if (report.unclassified_industry_examples.length) {
    lines.push("");
    lines.push("unclassified industry (first 15):");
    for (const e of report.unclassified_industry_examples) lines.push(`  ${e.project_id}  ${e.name ?? ""}  ${e.best_guess ?? ""}`);
  }
  if (!WRITE) lines.push("\n(dry-run — nothing written; re-run with --write)");
  console.log(lines.join("\n"));
}

// ─── main ────────────────────────────────────────────────────────────────────

const tableExists = await probeTable();
const { projects, analyses, states, existing } = await loadInputs(tableExists);
const results = [];
let written = 0;
for (const p of projects) {
  const a = analyses.get(p.id);
  const stageFromAnalysis = a?.stage != null && a.stage !== "" ? Number(a.stage) : null;
  const suggestion = suggestTaxonomy({
    name: p.name,
    description: p.description,
    industry: p.industry,
    rawText: a?.raw_input ?? null,
    sector: a?.sector ?? null,
    stage: Number.isFinite(stageFromAnalysis) ? stageFromAnalysis : typeof p.stage === "number" ? p.stage : null,
    state: states.get(p.id) ?? null,
  });
  const ex = existing.get(p.id) ?? null;
  const plan = planWrite(p.id, suggestion, ex);
  // What the row will look like after this run (for the report).
  const final = plan.op === "insert" ? plan.row : { ...ex, ...(plan.op === "update" ? plan.patch : {}) };
  final.confidence = plan.op === "insert" ? suggestion.confidence : { ...(ex?.confidence ?? {}), ...suggestion.confidence };
  results.push({ projectId: p.id, name: p.name, op: plan.op, suggestion, final });

  if (!WRITE) continue;
  if (plan.op === "insert") {
    const { error } = await supabase.from("startup_taxonomy").insert(plan.row);
    if (error) throw new Error(`insert ${p.id}: ${error.message}`);
    written += 1;
  } else {
    const { error } = await supabase.from("startup_taxonomy").update(plan.patch).eq("project_id", p.id);
    if (error) throw new Error(`update ${p.id}: ${error.message}`);
    written += 1;
  }
}

const report = buildReport({ total: projects.length, results });
report.written = written;
if (JSON_OUT) console.log(JSON.stringify(report, null, 2));
else printHuman(report);
if (REPORT_PATH) {
  const out = resolve(process.cwd(), REPORT_PATH);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(report, null, 2));
  if (!JSON_OUT) console.log(`report saved → ${out}`);
}
