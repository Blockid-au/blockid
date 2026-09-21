#!/usr/bin/env node
/**
 * G22-B — backfill `evaluation_batches.org_id` / `program_intakes.org_id`
 * (migration 0433) for rows created before the column was stamped.
 *
 * For every batch / intake WITHOUT an org_id, the creator's ACTING org is
 * resolved the way `resolveActingOrg` (src/lib/investor/organisations.ts)
 * does — from their `investor_organisation_members` rows:
 *   1. an org the creator OWNS that is not their personal one (a firm they run)
 *   2. else the first org they were invited into (owner ≠ creator), oldest seat first
 *   3. else their personal org (owner = creator, is_personal) — read only,
 *      never created here (a creator with no org at all is skipped and counted)
 * Rows that already carry an org_id are never touched.
 *
 * Dry-run by default — prints the counts and (with --verbose) each row →
 * org; nothing is written. `--write` stamps the rows in pages of 200 via
 * `UPDATE … WHERE id = ? AND org_id IS NULL` (a row stamped meanwhile by the
 * app is left alone).
 *
 * Usage (from web/, reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from web/.env):
 *   node scripts/org/backfill-org-ids.mjs              # dry-run, counts only
 *   node scripts/org/backfill-org-ids.mjs --verbose    # + one line per row
 *   node scripts/org/backfill-org-ids.mjs --write      # persist
 *   node scripts/org/backfill-org-ids.mjs --json       # machine-readable summary
 *
 * Requires migration 0433 (evaluation_batches.org_id) for both modes: a
 * 42703 on the column exits 3 with the apply hint.
 * Exit codes: 0 ok · 1 some updates failed · 2 config/usage · 3 column missing (apply 0433).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const WEB_DIR = resolve(__dirname, "..", "..");

export const EXIT_OK = 0;
export const EXIT_FAILED = 1;
export const EXIT_USAGE = 2;
export const EXIT_MISSING = 3;

export const PAGE = 500;
export const WRITE_PAGE = 200;

// ─── args ────────────────────────────────────────────────────────────────────

export function parseArgs(argv) {
  const flag = (n) => argv.includes(n);
  if (flag("--help") || flag("-h")) return { help: true };
  const unknown = argv.filter((a) => !["--write", "--dry-run", "--json", "--verbose"].includes(a));
  if (unknown.length) throw new Error(`unknown argument: ${unknown.join(" ")}`);
  if (flag("--dry-run") && flag("--write")) throw new Error("--dry-run and --write are mutually exclusive");
  return { help: false, write: flag("--write"), json: flag("--json"), verbose: flag("--verbose") };
}

// ─── env ─────────────────────────────────────────────────────────────────────

export function loadEnv(webDir = WEB_DIR) {
  const file = resolve(webDir, ".env");
  const out = { ...process.env };
  if (existsSync(file)) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (m && out[m[1]] === undefined) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return out;
}

export async function makeClient(env) {
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace("supabase-kong", "localhost");
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw Object.assign(new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (web/.env)"), { exit: EXIT_USAGE });
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

// ─── pure: the acting-org rule ───────────────────────────────────────────────

/**
 * Mirror of resolveActingOrg's preference order over the creator's seats
 * (oldest first) — own non-personal org → first invited org → personal org.
 * `memberships` = [{ org_id, created_at }], `orgs` = Map<id, { owner_user_id, is_personal }>.
 * Returns the org id or null (no org at all → the row is skipped).
 */
export function pickActingOrg(userId, memberships, orgs) {
  const seats = [...memberships].sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  let invited = null;
  let personal = null;
  for (const m of seats) {
    const org = orgs.get(String(m.org_id));
    if (!org) continue;
    const owns = String(org.owner_user_id ?? "") === userId;
    if (owns && !org.is_personal) return String(m.org_id);
    if (!owns && !invited) invited = String(m.org_id);
    if (owns && org.is_personal && !personal) personal = String(m.org_id);
  }
  if (invited) return invited;
  if (personal) return personal;
  // A personal org created before the seat row was written (0393 → S-T2) has no membership; fall back to ownership.
  for (const [id, org] of orgs) if (String(org.owner_user_id ?? "") === userId && org.is_personal) return id;
  return null;
}

/** Pure: plan the updates. `rows` = [{ id, creator, org_id }]; returns { updates: [{ id, org_id }], skipped: [{ id, creator }] }. */
export function planUpdates(rows, resolveOrg) {
  const updates = [];
  const skipped = [];
  for (const r of rows) {
    if (r.org_id) continue; // never touch a stamped row
    const org = resolveOrg(String(r.creator));
    if (org) updates.push({ id: String(r.id), org_id: org });
    else skipped.push({ id: String(r.id), creator: String(r.creator) });
  }
  return { updates, skipped };
}

// ─── data ────────────────────────────────────────────────────────────────────

function isMissingColumn(error) {
  return error?.code === "42703";
}

async function fetchAll(db, table, select, build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(db.from(table).select(select)).range(from, from + PAGE - 1);
    if (error) throw Object.assign(new Error(`${table}: ${error.message}`), { code: error.code, table, exit: isMissingColumn(error) ? EXIT_MISSING : EXIT_FAILED });
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

/** The unstamped rows of both tables, normalised to { id, creator, org_id }. */
export async function loadUnstamped(db) {
  let batches;
  try {
    batches = await fetchAll(db, "evaluation_batches", "id, user_id, org_id", (q) => q.is("org_id", null));
  } catch (err) {
    if (err.exit === EXIT_MISSING) throw Object.assign(new Error("evaluation_batches.org_id is missing — apply web/supabase/migrations/0433_org_id_on_batches_intakes.sql first (scripts/db/apply-migration.sh)."), { exit: EXIT_MISSING });
    throw err;
  }
  const intakes = await fetchAll(db, "program_intakes", "id, owner_user_id, org_id", (q) => q.is("org_id", null));
  return {
    batches: batches.map((r) => ({ id: r.id, creator: r.user_id, org_id: r.org_id ?? null })),
    intakes: intakes.map((r) => ({ id: r.id, creator: r.owner_user_id, org_id: r.org_id ?? null })),
  };
}

/** Memberships + orgs for the creators in question → a resolver. */
export async function buildResolver(db, creatorIds) {
  const ids = [...new Set(creatorIds.map(String).filter(Boolean))];
  if (ids.length === 0) return () => null;
  const memberships = new Map();
  const orgs = new Map();
  for (let i = 0; i < ids.length; i += PAGE) {
    const slice = ids.slice(i, i + PAGE);
    const seats = await fetchAll(db, "investor_organisation_members", "org_id, user_id, created_at", (q) => q.in("user_id", slice));
    for (const s of seats) {
      const list = memberships.get(String(s.user_id)) ?? [];
      list.push({ org_id: s.org_id, created_at: s.created_at });
      memberships.set(String(s.user_id), list);
    }
    // Personal orgs may predate their seat row — read by ownership too.
    const owned = await fetchAll(db, "investor_organisations", "id, owner_user_id, is_personal", (q) => q.in("owner_user_id", slice));
    for (const o of owned) orgs.set(String(o.id), { owner_user_id: o.owner_user_id, is_personal: o.is_personal === true });
  }
  const orgIds = [...new Set([...memberships.values()].flat().map((m) => String(m.org_id)))].filter((id) => !orgs.has(id));
  for (let i = 0; i < orgIds.length; i += PAGE) {
    const slice = orgIds.slice(i, i + PAGE);
    const rows = await fetchAll(db, "investor_organisations", "id, owner_user_id, is_personal", (q) => q.in("id", slice));
    for (const o of rows) orgs.set(String(o.id), { owner_user_id: o.owner_user_id, is_personal: o.is_personal === true });
  }
  const cache = new Map();
  return (userId) => {
    if (!cache.has(userId)) cache.set(userId, pickActingOrg(userId, memberships.get(userId) ?? [], orgs));
    return cache.get(userId);
  };
}

/** Stamp the planned updates, one row at a time inside pages; a row stamped meanwhile (org_id no longer null) is skipped, not overwritten. */
export async function applyUpdates(db, table, updates) {
  let written = 0;
  let failed = 0;
  for (let i = 0; i < updates.length; i += WRITE_PAGE) {
    const page = updates.slice(i, i + WRITE_PAGE);
    for (const u of page) {
      const { data, error } = await db.from(table).update({ org_id: u.org_id }).eq("id", u.id).is("org_id", null).select("id");
      if (error) {
        failed += 1;
        console.error(`[backfill-org-ids] ${table} ${u.id}: ${error.message}`);
        continue;
      }
      written += (data ?? []).length;
    }
  }
  return { written, failed };
}

// ─── main ────────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2), deps = {}) {
  const log = deps.log ?? ((s) => console.log(s));
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(err.message);
    return EXIT_USAGE;
  }
  if (args.help) {
    log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    return EXIT_OK;
  }
  let db;
  try {
    db = deps.db ?? (await makeClient(deps.env ?? loadEnv()));
  } catch (err) {
    console.error(err.message);
    return err.exit ?? EXIT_USAGE;
  }

  const summary = { dry_run: !args.write, started_at: new Date().toISOString(), batches: { unstamped: 0, planned: 0, skipped: 0, written: 0, failed: 0 }, intakes: { unstamped: 0, planned: 0, skipped: 0, written: 0, failed: 0 }, creators_without_org: [] };
  let unstamped;
  try {
    unstamped = await loadUnstamped(db);
  } catch (err) {
    console.error(err.message);
    return err.exit ?? EXIT_FAILED;
  }
  const resolveOrg = await buildResolver(db, [...unstamped.batches, ...unstamped.intakes].map((r) => r.creator));

  const plans = { batches: planUpdates(unstamped.batches, resolveOrg), intakes: planUpdates(unstamped.intakes, resolveOrg) };
  for (const key of ["batches", "intakes"]) {
    summary[key].unstamped = unstamped[key].length;
    summary[key].planned = plans[key].updates.length;
    summary[key].skipped = plans[key].skipped.length;
    for (const s of plans[key].skipped) if (!summary.creators_without_org.includes(s.creator)) summary.creators_without_org.push(s.creator);
    if (args.verbose) for (const u of plans[key].updates) log(`${args.write ? "" : "[dry] "}${key} ${u.id} → org ${u.org_id}`);
  }

  if (args.write) {
    const b = await applyUpdates(db, "evaluation_batches", plans.batches.updates);
    const i = await applyUpdates(db, "program_intakes", plans.intakes.updates);
    Object.assign(summary.batches, { written: b.written, failed: b.failed });
    Object.assign(summary.intakes, { written: i.written, failed: i.failed });
  }
  summary.finished_at = new Date().toISOString();

  if (args.json) log(JSON.stringify(summary, null, 2));
  else {
    const mode = args.write ? "WROTE" : "DRY-RUN (nothing written; add --write)";
    log(`backfill-org-ids — ${mode}`);
    log(`evaluation_batches: ${summary.batches.unstamped} without org_id → ${summary.batches.planned} resolvable, ${summary.batches.skipped} skipped (creator has no org)${args.write ? `, ${summary.batches.written} written, ${summary.batches.failed} failed` : ""}`);
    log(`program_intakes:    ${summary.intakes.unstamped} without org_id → ${summary.intakes.planned} resolvable, ${summary.intakes.skipped} skipped (creator has no org)${args.write ? `, ${summary.intakes.written} written, ${summary.intakes.failed} failed` : ""}`);
    if (summary.creators_without_org.length) log(`creators without any organisation (rows left null, retention/export fall back to owner-owned rows): ${summary.creators_without_org.length}`);
  }
  return summary.batches.failed + summary.intakes.failed > 0 ? EXIT_FAILED : EXIT_OK;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  main().then((code) => process.exit(code), (err) => {
    console.error(err);
    process.exit(EXIT_FAILED);
  });
}
