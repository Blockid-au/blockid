// mandate-fit-refresh — the nightly investors → startups pass (G13-W3-T2,
// BA spec §B.8 "Two directions, one scorer", §C.3 bounded, D.2 R9).
//
//   every ACTIVE mandate × every VISIBLE project
//     → scoreFit()  (lib/investors/fit-v2.ts)
//     → upsert mandate_fit_scores (mandate_id, project_id)  in batches of 500
//
// "Visible" = the founder consented, one of three ways (never assumed):
//   1. projects.public_index = true            — founder published to the index
//   2. evaluations.consent_tier ≥ reports_shared — founder claimed an evaluator's
//                                               entry and approved the share
//   3. scores.investor_visible = true          — the /score opt-in (0122),
//                                               resolved to a project through
//                                               svi_accounts.email → project_id
// Everything else is invisible to every mandate.
//
// Per project the scorer gets: the startup_taxonomy row (or null →
// unclassified), the latest svi_snapshots.svi_total, projects.stage as the
// stage fallback. Revenue / growth / raise are NOT read here yet (connector
// snapshots + funding intake wiring is a follow-up), so a mandate with a
// revenue floor scores "not verified" (5 of 10) rather than gating — exactly
// the §B.8 rule for unknown data.
//
// Rows for every pair are persisted, including sub-floor and gated ones
// (score 0 + blockers[]), so deal-flow filters (`fit ≥ N`) and the dossier
// prefill can explain a miss. Fit rows of deactivated mandates are deleted.
//
// Supabase is injected (`db`) so the cron test runs with a fake; no
// `server-only` for the same reason (route + test import it).

import { getSupabaseAdmin } from "@/lib/supabase";
import { scoreFit, type FitStartup, type FitStartupTaxonomy } from "./fit-v2";
import { MANDATE_COLUMNS, isMissingRelation, mandateFromRow, type InvestorMandate } from "./mandates";

/** Minimal Supabase surface (same shape radar-sweep.ts / investor-match.ts use). */
export interface SupabaseLike {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

type Row = Record<string, unknown>;

export const FIT_REFRESH_BATCH = 500;
export const IN_CHUNK = 200;

/** Consent tiers that make a project visible to mandates (lib/mentor/access-tiers.ts ladder ≥ reports_shared). */
export const VISIBLE_CONSENT_TIERS = ["reports_shared", "full_mentor"] as const;

export interface LoadedStartup extends FitStartup {
  project_id: string;
  name: string | null;
  snapshot_id: string | null;
  snapshot_at: string | null;
  /** SVI of the newest snapshot ≥ 30 d old (for the "moved ≥ 5 pts" filter); null when none. */
  svi_30d_ago: number | null;
  archived: boolean;
}

function chunks<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

// ─── Readers ─────────────────────────────────────────────────────────────────

/** Every active mandate (all orgs). Empty + `migrated:false` before 0393. */
export async function listActiveMandates(db: SupabaseLike): Promise<{ migrated: boolean; mandates: InvestorMandate[]; inactiveIds: string[] }> {
  const { data, error } = await db.from("investor_mandates").select(`${MANDATE_COLUMNS}`).limit(5000);
  if (error) {
    if (isMissingRelation(error)) return { migrated: false, mandates: [], inactiveIds: [] };
    throw new Error(`investor_mandates read failed: ${error.message ?? error}`);
  }
  const all = ((data ?? []) as Row[]).map(mandateFromRow);
  return {
    migrated: true,
    mandates: all.filter((m) => m.is_active),
    inactiveIds: all.filter((m) => !m.is_active).map((m) => m.id),
  };
}

/** Project ids the founders made visible (union of the three consent sources). Each source degrades alone. */
export async function listVisibleProjectIds(db: SupabaseLike): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data } = await db.from("projects").select("id").eq("public_index", true).is("archived_at", null).limit(5000);
    for (const r of (data ?? []) as Row[]) if (r.id) out.add(String(r.id));
  } catch {
    /* column missing on a legacy install */
  }
  try {
    const { data } = await db.from("evaluations").select("project_id").in("consent_tier", [...VISIBLE_CONSENT_TIERS]).limit(5000);
    for (const r of (data ?? []) as Row[]) if (r.project_id) out.add(String(r.project_id));
  } catch {
    /* evaluations optional */
  }
  try {
    const { data: scores } = await db.from("scores").select("email").eq("investor_visible", true).limit(5000);
    const emails = Array.from(new Set(((scores ?? []) as Row[]).map((r) => String(r.email ?? "").toLowerCase()).filter(Boolean)));
    for (const chunk of chunks(emails, IN_CHUNK)) {
      const { data: accounts } = await db.from("svi_accounts").select("email, project_id").in("email", chunk).not("project_id", "is", null);
      for (const r of (accounts ?? []) as Row[]) if (r.project_id) out.add(String(r.project_id));
    }
  } catch {
    /* scores / svi_accounts optional */
  }
  return out;
}

/** Taxonomy + latest SVI + project row for each id — the scorer's startup side. Batched `.in()` reads. */
export async function loadFitStartups(db: SupabaseLike, projectIds: readonly string[], now: Date = new Date()): Promise<Map<string, LoadedStartup>> {
  const out = new Map<string, LoadedStartup>();
  const ids = Array.from(new Set(projectIds.filter(Boolean)));
  if (ids.length === 0) return out;
  const cutoff = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  for (const chunk of chunks(ids, IN_CHUNK)) {
    const [projects, taxonomies, latest, older] = await Promise.all([
      db.from("projects").select("id, name, industry, stage, archived_at").in("id", chunk),
      db.from("startup_taxonomy").select("project_id, industry, industry_secondary, business_model, customer_types, stage_key, hq_state, hq_country, geo_scope, tags").in("project_id", chunk),
      db.from("svi_snapshots").select("id, project_id, svi_total, stage, created_at").in("project_id", chunk).order("created_at", { ascending: false }).limit(chunk.length * 4),
      db.from("svi_snapshots").select("project_id, svi_total, created_at").in("project_id", chunk).lte("created_at", cutoff).order("created_at", { ascending: false }).limit(chunk.length * 4),
    ]);
    const taxByProject = new Map<string, FitStartupTaxonomy>();
    for (const r of ((taxonomies?.data ?? []) as Row[])) {
      taxByProject.set(String(r.project_id), {
        industry: String(r.industry ?? "unclassified"),
        industry_secondary: r.industry_secondary ? String(r.industry_secondary) : null,
        business_model: String(r.business_model ?? "unclassified"),
        customer_types: Array.isArray(r.customer_types) ? r.customer_types.map(String) : [],
        stage_key: String(r.stage_key ?? "idea"),
        hq_state: r.hq_state ? String(r.hq_state) : null,
        hq_country: r.hq_country ? String(r.hq_country) : "AU",
        geo_scope: r.geo_scope ? String(r.geo_scope) : null,
        tags: Array.isArray(r.tags) ? r.tags.map(String) : [],
      });
    }
    const latestByProject = new Map<string, Row>();
    for (const r of ((latest?.data ?? []) as Row[])) {
      const pid = String(r.project_id);
      if (!latestByProject.has(pid)) latestByProject.set(pid, r);
    }
    const olderByProject = new Map<string, Row>();
    for (const r of ((older?.data ?? []) as Row[])) {
      const pid = String(r.project_id);
      if (!olderByProject.has(pid)) olderByProject.set(pid, r);
    }
    for (const p of ((projects?.data ?? []) as Row[])) {
      const pid = String(p.id);
      const snap = latestByProject.get(pid) ?? null;
      const old = olderByProject.get(pid) ?? null;
      const svi = snap ? num(snap.svi_total) : null;
      // Δ30d baseline must not be the latest row itself.
      const oldSvi = old && snap && old.created_at !== snap.created_at ? num(old.svi_total) : old && !snap ? num(old.svi_total) : null;
      const stageNum = num(p.stage);
      out.set(pid, {
        project_id: pid,
        name: typeof p.name === "string" ? p.name : null,
        taxonomy: taxByProject.get(pid) ?? null,
        svi,
        stage_key: stageNum !== null ? stageKeyFromNumber(stageNum) : null,
        state: null,
        revenue_aud: null,
        growth_pct: null,
        raise_aud: null,
        snapshot_id: snap ? String(snap.id) : null,
        snapshot_at: snap && typeof snap.created_at === "string" ? snap.created_at : null,
        svi_30d_ago: oldSvi,
        archived: !!p.archived_at,
      });
    }
  }
  return out;
}

/** projects.stage (0–7) → canonical key (lib/journey-vocabulary.ts mapping, inlined to keep this module light). */
export function stageKeyFromNumber(n: number): string {
  const keys = ["idea", "validation", "mvp_early_revenue", "seed", "series_a", "series_b_c", "late_stage", "public_exit"];
  const i = Math.max(0, Math.min(7, Math.round(n)));
  return keys[i];
}

// ─── The pass ────────────────────────────────────────────────────────────────

export interface FitRefreshSummary {
  ok: boolean;
  dryRun: boolean;
  migrated: boolean;
  mandates: number;
  projects: number;
  pairs: number;
  upserts: number;
  deleted_inactive: number;
  batches: number;
  errors: number;
  ms: number;
  error?: string;
}

export interface FitRefreshOptions {
  db?: SupabaseLike | null;
  dryRun?: boolean;
  batchSize?: number;
  now?: Date;
}

/**
 * Recompute mandate_fit_scores for every active mandate × visible project.
 * Never throws — `{ ok:false, error }` on a hard failure; `migrated:false`
 * (ok) before 0393. Bounded: mandates × projects pairs in memory, upserts in
 * batches of `batchSize` (500).
 */
export async function runMandateFitRefresh(opts: FitRefreshOptions = {}): Promise<FitRefreshSummary> {
  const started = Date.now();
  const dryRun = opts.dryRun === true;
  const now = opts.now ?? new Date();
  const batchSize = Math.max(1, opts.batchSize ?? FIT_REFRESH_BATCH);
  const base: FitRefreshSummary = { ok: true, dryRun, migrated: true, mandates: 0, projects: 0, pairs: 0, upserts: 0, deleted_inactive: 0, batches: 0, errors: 0, ms: 0 };

  const db = opts.db ?? getSupabaseAdmin();
  if (!db) return { ...base, ok: false, error: "supabase_unavailable", ms: Date.now() - started };

  try {
    const { migrated, mandates, inactiveIds } = await listActiveMandates(db);
    if (!migrated) return { ...base, migrated: false, ms: Date.now() - started };
    base.mandates = mandates.length;

    // Fit rows of deactivated mandates go (cascade covers deleted ones).
    if (inactiveIds.length && !dryRun) {
      for (const chunk of chunks(inactiveIds, IN_CHUNK)) {
        const { error, count } = await db.from("mandate_fit_scores").delete({ count: "exact" }).in("mandate_id", chunk);
        if (error) base.errors += 1;
        else base.deleted_inactive += typeof count === "number" ? count : 0;
      }
    }
    if (mandates.length === 0) return { ...base, ms: Date.now() - started };

    const visible = await listVisibleProjectIds(db);
    const startups = await loadFitStartups(db, Array.from(visible), now);
    const live = Array.from(startups.values()).filter((s) => !s.archived);
    base.projects = live.length;
    if (live.length === 0) return { ...base, ms: Date.now() - started };

    const computedAt = now.toISOString();
    let batch: Row[] = [];
    const flush = async () => {
      if (batch.length === 0) return;
      base.batches += 1;
      if (!dryRun) {
        const { error } = await db.from("mandate_fit_scores").upsert(batch, { onConflict: "mandate_id,project_id" });
        if (error) {
          base.errors += 1;
          console.error("[mandate-fit-refresh] upsert batch failed", error.message ?? error);
        } else base.upserts += batch.length;
      } else base.upserts += batch.length;
      batch = [];
    };

    for (const m of mandates) {
      for (const s of live) {
        const fit = scoreFit(m, s);
        base.pairs += 1;
        batch.push({
          mandate_id: m.id,
          project_id: s.project_id,
          score: fit.score,
          reasons: fit.reasons,
          gaps: fit.gaps,
          blockers: fit.blockers,
          breakdown: fit.breakdown.map((b) => ({ axis: b.axis, weight: b.weight, points: b.points })),
          snapshot_id: s.snapshot_id,
          computed_at: computedAt,
        });
        if (batch.length >= batchSize) await flush();
      }
    }
    await flush();
    return { ...base, ok: base.errors === 0, ...(base.errors ? { error: "upsert_failed" } : {}), ms: Date.now() - started };
  } catch (err) {
    return { ...base, ok: false, error: err instanceof Error ? err.message : String(err), ms: Date.now() - started };
  }
}
