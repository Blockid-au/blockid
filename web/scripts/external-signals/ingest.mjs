#!/usr/bin/env node
// scripts/external-signals/ingest.mjs — open Australian external signals
// ingest (G14-S40). Reuses the S-R5 comparables-ingest shape (allow-list +
// dedupe + summary) for three OPEN registers:
//
//   abr-bulk             ABN Bulk Extract XML (stream-parsed; only ABNs in the
//                        allow-set are kept)                     CC BY 3.0 AU
//   business-gov-grants  GrantConnect grant-award CSV export       CC BY 3.0 AU
//   rdti-transparency    ATO R&DTI transparency report (xlsx→csv)  CC BY 2.5 AU
//   funding-announcements BlockID-curated CSV of PUBLIC funding
//                        announcements (press releases / media, each row
//                        links its source) → `funding_round` signals that
//                        feed the funding_raised outcome proposals (G24-B)
//                                                                 CC BY 4.0
//
//   node scripts/external-signals/ingest.mjs --dry --source business-gov-grants --file scripts/external-signals/fixtures/grants-sample.csv --limit 5
//   node scripts/external-signals/ingest.mjs --source rdti-transparency --fetch
//   node scripts/external-signals/ingest.mjs --source abr-bulk --fetch --abn-file ~/abns.txt   # ~2 GB, off-peak
//   node scripts/external-signals/ingest.mjs                       # every source, newest file in the data dir
//
// Licence gate: the source's `external_sources` row (migration 0410) must
// exist, be `active` and carry a licence; `cite_only` (Cut Through Venture,
// Startup Muster, ACS) and unknown ids are refused before a byte is parsed.
// With no DB (dry run) the seed catalogue below stands in — it is pinned to
// src/lib/signals/external-sources.ts by ingest.test.mjs.
//
// Allow-set for abr-bulk = projects.abn ∪ project_grant_profiles.abn ∪ ABNs
// already on external_signals (grants / R&DTI recipients) ∪ --abn-file.
// Dedupe = content_hash (sha256 of source|abn|type|as_of|value), in memory
// + the table's unique index (upsert … ignoreDuplicates). Nothing is ever
// invented: a row is the register's own fields or it is not written.
//
// Writes content/reports/external-signals-latest.json (+ appends
// external-signals-history.jsonl) after a WRITE run; dry runs only print.
// Exit codes: 0 ok · 1 error · 2 usage · 3 every requested source refused.

import { spawnSync } from "node:child_process";
import { appendFileSync, createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as abrBulk from "./adapters/abr-bulk.mjs";
import * as grants from "./adapters/business-gov-grants.mjs";
import * as rdti from "./adapters/rdti-transparency.mjs";
import * as funding from "./adapters/funding-announcements.mjs";
import {
  EXIT_ERROR,
  EXIT_OK,
  EXIT_REFUSED,
  EXIT_USAGE,
  SOURCE_IDS,
  USAGE,
  dedupeRows,
  filterByAllowSet,
  formatSummary,
  licenceGate,
  loadEnv,
  normalizeAbn,
  parseAbnFile,
  parseArgs,
  resolveDataDir,
  validateAbnChecksum,
} from "./lib.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = resolve(__dirname, "..", "..");
export const SUMMARY_FILE = "content/reports/external-signals-latest.json";
export const HISTORY_FILE = "content/reports/external-signals-history.jsonl";

export const ADAPTERS = { [abrBulk.sourceId]: abrBulk, [grants.sourceId]: grants, [rdti.sourceId]: rdti, [funding.sourceId]: funding };

/**
 * Seed catalogue — the six rows migration 0410 inserts plus the
 * funding-announcements row from 0435 (ingest.test.mjs pins them against
 * src/lib/signals/external-sources.ts). Used ONLY when there is no DB
 * (fixture dry runs); a live run reads external_sources.
 */
export const SEED_SOURCES = [
  { id: "abr-bulk", licence: "CC BY 3.0 AU", status: "active" },
  { id: "business-gov-grants", licence: "CC BY 3.0 AU", status: "active" },
  { id: "rdti-transparency", licence: "CC BY 2.5 AU", status: "active" },
  { id: "funding-announcements", licence: "CC BY 4.0", status: "active" },
  { id: "cut-through-venture", licence: "All rights reserved (cite only)", status: "cite_only" },
  { id: "startup-muster", licence: "All rights reserved (cite only)", status: "cite_only" },
  { id: "acs-digital-pulse", licence: "All rights reserved (cite only)", status: "cite_only" },
];

const DB_MISSING = new Set(["42P01", "PGRST205", "PGRST204", "PGRST202"]);

/** Service-role Supabase client from web/node_modules, or null when the env is incomplete. */
export function makeDb(env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  const require = createRequire(resolve(WEB_DIR, "package.json"));
  const { createClient } = require("@supabase/supabase-js");
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
}

/** external_sources rows keyed by id. No db → the seed catalogue. Missing table → throws (0410 pending). */
export async function loadSourceRows(db) {
  if (!db) return { rows: new Map(SEED_SOURCES.map((s) => [s.id, s])), fromDb: false };
  const { data, error } = await db.from("external_sources").select("id,name,licence,status,url");
  if (error) throw new Error(DB_MISSING.has(String(error.code)) ? "external_sources missing — apply web/supabase/migrations/0410_external_signals.sql" : `external_sources read failed: ${error.message}`);
  return { rows: new Map((data ?? []).map((s) => [s.id, s])), fromDb: true };
}

async function pageAll(query, pageSize = 1000, max = 500_000) {
  const out = [];
  for (let from = 0; from < max; from += pageSize) {
    const { data, error } = await query().range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return out;
}

/** projects.abn ∪ project_grant_profiles.abn ∪ external_signals ABNs (each 42P01-tolerant) ∪ --abn-file. */
export async function buildAllowSet(db, { abnFileText = null, log = () => {} } = {}) {
  const allow = new Set();
  const add = (v) => {
    const abn = normalizeAbn(v);
    if (abn && validateAbnChecksum(abn)) allow.add(abn);
  };
  const provenance = { projects: 0, grant_profiles: 0, register: 0, abn_file: 0, invalid_in_file: 0 };
  if (db) {
    const tryRows = async (label, fn) => {
      try {
        const rows = await fn();
        let n = 0;
        for (const r of rows) {
          const before = allow.size;
          add(r.abn ?? r.entity_abn);
          if (allow.size > before) n += 1;
        }
        provenance[label] = n;
      } catch (e) {
        log(`allow-set: ${label} unavailable (${e instanceof Error ? e.message : String(e)})`);
      }
    };
    await tryRows("projects", () => pageAll(() => db.from("projects").select("abn").not("abn", "is", null)));
    await tryRows("grant_profiles", () => pageAll(() => db.from("project_grant_profiles").select("abn").not("abn", "is", null)));
    await tryRows("register", () => pageAll(() => db.from("external_signals").select("entity_abn").not("entity_abn", "is", null)));
  }
  if (abnFileText != null) {
    const { abns, invalid } = parseAbnFile(abnFileText);
    for (const a of abns) allow.add(a);
    provenance.abn_file = abns.size;
    provenance.invalid_in_file = invalid.length;
  }
  return { allow, provenance };
}

/** content_hash values already stored for a source (so a re-run never re-inserts). */
export async function loadKnownHashes(db, sourceId) {
  if (!db) return new Set();
  const rows = await pageAll(() => db.from("external_signals").select("content_hash").eq("source_id", sourceId));
  return new Set(rows.map((r) => r.content_hash));
}

/** G25-B: curated inputs committed IN THE REPO — `web/content/external-signals/<sourceId>-*.csv`
 *  (e.g. `funding-announcements-2026-09.csv`). Read FIRST, before the home
 *  data dir, so a curated sheet ships with the code and needs no founder step.
 *  Sorted by name (the YYYY-MM suffix) so the summary lists them in order. */
export const REPO_CONTENT_DIR = resolve(WEB_DIR, "content", "external-signals");
export function repoInputFiles(sourceId, format, contentDir = REPO_CONTENT_DIR) {
  if (!existsSync(contentDir)) return [];
  const wanted = format === "xml" ? ".xml" : ".csv";
  return readdirSync(contentDir)
    .filter((f) => f.startsWith(`${sourceId}-`) && extname(f).toLowerCase() === wanted)
    .sort()
    .map((f) => join(contentDir, f));
}

/** Newest input file for a source under <dataDir>/<sourceId>/ (matching the adapter's format), or null. */
export function newestInputFile(dataDir, sourceId, format) {
  const dir = join(dataDir, sourceId);
  if (!existsSync(dir)) return null;
  const wanted = format === "xml" ? [".xml"] : [".csv"];
  const files = readdirSync(dir)
    .filter((f) => wanted.includes(extname(f).toLowerCase()))
    .map((f) => join(dir, f))
    .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
  return files[0] ?? null;
}

/** All XML files for the ABR extract (a directory or a single file). */
export function abrInputFiles(input) {
  if (statSync(input).isDirectory()) {
    return readdirSync(input)
      .filter((f) => extname(f).toLowerCase() === ".xml")
      .sort()
      .map((f) => join(input, f));
  }
  return [input];
}

function sh(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...opts });
  if (r.status !== 0) throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} failed: ${(r.stderr || r.stdout || "").trim().slice(0, 300)}`);
  return r.stdout;
}

const UA = "BlockID-external-signals/1.0 (+https://blockid.au/methodology)";

/** data.gov.au CKAN package_show → resources. */
export function ckanResources(packageId, fetchText = (url) => sh("curl", ["-sfL", "--max-time", "60", "-A", UA, url])) {
  const body = fetchText(`https://data.gov.au/data/api/3/action/package_show?id=${encodeURIComponent(packageId)}`);
  const json = JSON.parse(body);
  if (!json.success) throw new Error(`CKAN package_show failed for ${packageId}`);
  return { licence: json.result.license_title ?? null, resources: (json.result.resources ?? []).map((r) => ({ name: r.name, format: String(r.format ?? "").toLowerCase(), url: r.url, size: r.size ?? null, lastModified: r.last_modified ?? null })) };
}

/**
 * `--fetch` — download a source into <dataDir>/<sourceId>/ and return the
 * input path. Explicit only (never implied by a cron run):
 *   rdti-transparency  newest xlsx via CKAN → curl → xlsx-to-csv.py (openpyxl) → .csv
 *   abr-bulk           every zip via CKAN → curl → unzip → the directory of .xml files (~2 GB)
 *   business-gov-grants no automated download (GrantConnect serves bots a 403) → throws with instructions
 */
export function fetchSource(sourceId, dataDir, log = () => {}) {
  const dir = join(dataDir, sourceId);
  mkdirSync(dir, { recursive: true });
  if (sourceId === "rdti-transparency") {
    const { resources } = ckanResources(rdti.ckanPackage);
    const xlsx = resources.filter((r) => r.format.includes("xls")).sort((a, b) => String(b.name).localeCompare(String(a.name)))[0];
    if (!xlsx) throw new Error("no xlsx resource on the R&DTI dataset");
    const target = join(dir, `rdti-${(xlsx.name.match(/\d{4}-\d{2}/) || ["latest"])[0]}.xlsx`);
    log(`fetch ${xlsx.url} → ${target}`);
    sh("curl", ["-sfL", "--max-time", "300", "-A", UA, "-o", target, xlsx.url]);
    const csv = target.replace(/\.xlsx$/, ".csv");
    sh("python3", [join(__dirname, "xlsx-to-csv.py"), target, csv]);
    return csv;
  }
  if (sourceId === "abr-bulk") {
    const { resources } = ckanResources(abrBulk.ckanPackage);
    const zips = resources.filter((r) => r.format === "zip" || /\.zip$/i.test(r.url));
    if (!zips.length) throw new Error("no zip resources on the ABN bulk extract dataset");
    for (const z of zips) {
      const target = join(dir, basename(new URL(z.url).pathname));
      log(`fetch ${z.url} → ${target} (${z.size ?? "?"} bytes)`);
      sh("curl", ["-sfL", "--max-time", "3600", "-A", UA, "-o", target, z.url]);
      sh("unzip", ["-o", "-q", target, "-d", dir]);
    }
    return dir;
  }
  throw new Error(`${sourceId} has no automated download — export the Grant Award CSV from https://www.grants.gov.au/Ga/List (GrantConnect blocks non-browser clients) and pass --file <export.csv>`);
}

/** Insert rows in batches; the unique index on content_hash makes a re-run idempotent. */
export async function insertRows(db, rows, batchSize = 500) {
  let inserted = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error, data } = await db.from("external_signals").upsert(batch, { onConflict: "content_hash", ignoreDuplicates: true }).select("id");
    if (error) throw new Error(`insert failed: ${error.message}`);
    inserted += data ? data.length : batch.length;
  }
  return inserted;
}

/** external_sources.last_fetched_at + row_count after a write. */
export async function touchSource(db, sourceId, ranAt) {
  const { count, error } = await db.from("external_signals").select("id", { count: "exact", head: true }).eq("source_id", sourceId);
  if (error) throw new Error(error.message);
  const { error: upErr } = await db.from("external_sources").update({ last_fetched_at: ranAt, row_count: count ?? 0 }).eq("id", sourceId);
  if (upErr) throw new Error(upErr.message);
  return count ?? 0;
}

/**
 * Run one source end to end. Pure apart from `deps` (db / fetch / clock).
 * Never throws — every failure becomes { status: "error", error } so the
 * other sources still run and the summary is complete.
 */
export async function runSource(sourceId, ctx) {
  const { db, dry, limit, allow, sourceRows, dataDir, explicitFile, fetch, log, now } = ctx;
  const out = { id: sourceId, status: "ok", licence: null, file: null, parsed: 0, kept: 0, filtered_out: 0, duplicates: 0, inserted: 0, row_count: null, skipped: {}, sample: [], error: null };
  const adapter = ADAPTERS[sourceId];
  const row = sourceRows.get(sourceId) ?? null;
  out.licence = row?.licence ?? null;

  // 1. Licence gate — before any byte is read.
  const gate = licenceGate(row);
  if (!gate.ok) return { ...out, status: "refused", error: gate.reason };
  if (!adapter) return { ...out, status: "refused", error: `no adapter for ${sourceId}` };
  if (adapter.licence !== row.licence) return { ...out, status: "refused", error: `licence mismatch: adapter says "${adapter.licence}", external_sources says "${row.licence}" — fix the row before ingesting` };
  if (adapter.requiresAllowSet && allow.size === 0) return { ...out, status: "refused", error: "abr-bulk needs a non-empty allow-set (verified project ABNs, register ABNs or --abn-file)" };

  try {
    // 2. Input.
    let input = explicitFile ?? null;
    if (!input && fetch) input = await (ctx.fetchSource ?? fetchSource)(sourceId, dataDir, log);
    // abr-bulk is a 20-file extract: default to the whole directory so every
    // split file streams (newestInputFile would pick one split only).
    if (!input && sourceId === "abr-bulk" && existsSync(join(dataDir, sourceId))) input = join(dataDir, sourceId);
    // G25-B: no explicit / fetched file → every curated sheet in the repo
    // (web/content/external-signals/<sourceId>-*.csv) FIRST, then the newest
    // file in the home data dir. All of them are parsed (content_hash keeps
    // re-runs idempotent), so a founder never has to copy anything under ~.
    let inputs = input ? [input] : [];
    if (!input) {
      inputs = repoInputFiles(sourceId, adapter.format, ctx.contentDir);
      const home = newestInputFile(dataDir, sourceId, adapter.format);
      if (home) inputs.push(home);
      if (inputs.length === 0) return { ...out, status: "skipped", error: `no input file — commit one as ${join(ctx.contentDir ?? REPO_CONTENT_DIR, `${sourceId}-YYYY-MM.csv`)}, put one under ${join(dataDir, sourceId)}/ or pass --file / --fetch` };
      input = inputs[0];
    }
    out.file = inputs.join(",");

    // 3. Parse (abr-bulk streams every xml file in the directory, allow-set applied inside).
    let rows = [];
    if (sourceId === "abr-bulk") {
      let remaining = limit;
      for (const f of abrInputFiles(input)) {
        const res = await adapter.parse(createReadStream(f, { highWaterMark: 1 << 20 }), { keep: allow, limit: remaining });
        out.parsed += res.parsed;
        rows.push(...res.rows);
        if (limit) {
          remaining = limit - out.parsed;
          if (remaining <= 0) break;
        }
      }
      out.filtered_out = out.parsed - rows.length;
    } else {
      let remaining = limit;
      for (const f of inputs) {
        const res = await adapter.parse(createReadStream(f), { limit: remaining });
        out.parsed += res.parsed;
        for (const [k, v] of Object.entries(res.skipped ?? {})) out.skipped[k] = (out.skipped[k] ?? 0) + v;
        rows.push(...res.rows);
        if (limit) {
          remaining = limit - out.parsed;
          if (remaining <= 0) break;
        }
      }
      out.filtered_out = Object.values(out.skipped).reduce((a, b) => a + b, 0);
    }
    // Belt and braces: every stored row must carry a checksum-valid ABN or an ACN.
    const valid = filterByAllowSet(rows, new Set(rows.map((r) => r.entity_abn).filter((a) => a && validateAbnChecksum(a))));
    const withAcn = rows.filter((r) => !r.entity_abn && r.entity_acn);
    rows = [...valid.kept, ...withAcn];
    out.kept = rows.length;

    // 4. Dedupe — in memory + against what the table already holds.
    const known = await loadKnownHashes(db, sourceId);
    const { fresh, duplicates } = dedupeRows(rows, known);
    out.duplicates = duplicates;
    out.sample = fresh.slice(0, 3).map((r) => ({ as_of: r.as_of, signal_type: r.signal_type, entity_abn: r.entity_abn, entity_acn: r.entity_acn, entity_name: r.entity_name }));

    // 5. Write.
    if (dry) {
      out.inserted = fresh.length;
      return out;
    }
    out.inserted = await insertRows(db, fresh);
    out.row_count = await touchSource(db, sourceId, now());
    return out;
  } catch (e) {
    return { ...out, status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/** CLI entry. `deps` (db / env / fetchSource / stdout / now / root) are injectable so the test never touches the network. */
export async function main(argv = process.argv.slice(2), deps = {}) {
  const stdout = deps.stdout ?? ((s) => process.stdout.write(`${s}\n`));
  const stderr = deps.stderr ?? ((s) => process.stderr.write(`${s}\n`));
  const now = deps.now ?? (() => new Date().toISOString());
  const root = deps.root ?? WEB_DIR;
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    stderr(`${err.message}\n${USAGE}`);
    return EXIT_USAGE;
  }
  if (args.help) {
    stdout(USAGE);
    return EXIT_OK;
  }
  const env = deps.env ?? loadEnv(args.envFile ? resolve(args.envFile) : resolve(root, ".env"));
  const db = deps.db !== undefined ? deps.db : makeDb(env);
  const dry = args.dry || !db;
  if (!args.dry && !db) stderr("no SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY — running as --dry");
  const dataDir = resolveDataDir(args.dataDir, env);
  const sources = args.sources.length ? args.sources : [...SOURCE_IDS];
  const log = (s) => stderr(`[external-signals] ${s}`);

  let sourceRows;
  try {
    sourceRows = (await (deps.loadSourceRows ?? loadSourceRows)(db)).rows;
  } catch (err) {
    stderr(err instanceof Error ? err.message : String(err));
    return EXIT_ERROR;
  }

  const abnFileText = args.abnFile ? readFileSync(resolve(args.abnFile), "utf8") : null;
  const { allow, provenance } = await (deps.buildAllowSet ?? buildAllowSet)(db, { abnFileText, log });

  const summary = { ok: true, dry, ran_at: now(), db: Boolean(db), data_dir: dataDir, allow_set_size: allow.size, allow_set: provenance, limit: args.limit, sources: [], totals: { parsed: 0, kept: 0, inserted: 0, duplicates: 0, refused: 0, errors: 0 }, error: null };
  for (const id of sources) {
    const res = await runSource(id, { db, dry, limit: args.limit, allow, sourceRows, dataDir, explicitFile: args.files[0] ? resolve(args.files[0]) : null, contentDir: deps.contentDir, fetch: args.fetch, fetchSource: deps.fetchSource, log, now });
    summary.sources.push(res);
    summary.totals.parsed += res.parsed;
    summary.totals.kept += res.kept;
    summary.totals.inserted += res.inserted;
    summary.totals.duplicates += res.duplicates;
    if (res.status === "refused") summary.totals.refused += 1;
    if (res.status === "error") summary.totals.errors += 1;
  }
  summary.ok = summary.totals.errors === 0;

  if (!dry && !deps.skipWrite) {
    const latest = resolve(root, SUMMARY_FILE);
    mkdirSync(dirname(latest), { recursive: true });
    writeFileSync(latest, `${JSON.stringify(summary, null, 2)}\n`);
    appendFileSync(resolve(root, HISTORY_FILE), `${JSON.stringify({ ran_at: summary.ran_at, totals: summary.totals, sources: summary.sources.map((s) => ({ id: s.id, status: s.status, parsed: s.parsed, inserted: s.inserted, row_count: s.row_count })) })}\n`);
  }

  stdout(args.json ? JSON.stringify(summary, null, 2) : formatSummary(summary));
  if (!summary.ok) return EXIT_ERROR;
  if (summary.totals.refused === sources.length) return EXIT_REFUSED;
  return EXIT_OK;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
      process.exit(EXIT_ERROR);
    },
  );
}
