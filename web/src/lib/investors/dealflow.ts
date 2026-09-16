// Deal-flow v2 — `mandate_fit_scores` ⋈ `startup_taxonomy` ⋈ latest
// snapshot, keyed on project_id (G13-W3-T2, BA spec §B.8 "Filters / saved
// views", §B.10 T4, Appendix 1 GET /api/investor/dealflow).
//
// Replaces `getDealFlow()` in lib/investor-portal.ts, which guessed sector /
// stage by indexing svi_index_snapshots by account_id and looking that map up
// with scores.email (Gap 4 — the join never matched). Here:
//
//   1. the caller's mandate (default, or `filters.mandate_id`)
//   2. mandate_fit_scores for it, fit ≥ min_fit (default FIT_FLOOR_V2 = 40)
//   3. loadFitStartups() — taxonomy row + project name + latest / 30 d-old SVI
//   4. filters (industry / business model / stage / state / tags / min SVI /
//      "moved ≥ 5 pts in 30 d") then sort (fit | svi | updated)
//
// Rows carry the fit reasons / gaps / blockers so the table can show chips,
// and `unclassified` so a startup without a confirmed industry is badged
// rather than mislabelled (DQ-1). Company names are shown because every
// project here consented (public index / claimed share / score opt-in).
//
// Saved views (§B.10 T6): `app_users.investor_prefs.saved_views[]`, ≤ 10,
// normalised by lib/investors/saved-views.ts on every prefs write.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getInvestorPreferences, setInvestorPreferences } from "@/lib/investor-portal";
import { isIndustry, type Industry } from "@/lib/taxonomy/startup-taxonomy";
import { FIT_FLOOR_V2 } from "./fit-v2";
import { loadFitStartups, type LoadedStartup } from "./fit-refresh";
import { isMissingRelation, listMandates, type InvestorMandate } from "./mandates";
import { EMPTY_FILTERS, SAVED_VIEWS_MAX, newViewId, normaliseSavedViews, type DealFlowFiltersV2, type SavedView } from "./saved-views";

type Row = Record<string, unknown>;

export const DEALFLOW_MAX_ROWS = 500;
/** "moved ≥ 5 pts in 30 d" threshold (§B.8 filter bar). */
export const MOVED_THRESHOLD = 5;

export interface DealFlowRowV2 {
  project_id: string;
  company_name: string | null;
  svi: number | null;
  /** latest − newest snapshot ≥ 30 d old; null when no baseline. */
  svi_delta_30d: number | null;
  industry: Industry;
  industry_secondary: string | null;
  business_model: string;
  stage_key: string;
  hq_state: string | null;
  tags: string[];
  /** industry is `unclassified` (or no taxonomy row) → badge "Unclassified" (DQ-1). */
  unclassified: boolean;
  fit: number;
  reasons: string[];
  gaps: string[];
  blockers: string[];
  computed_at: string | null;
  updated_at: string | null;
}

export interface DealFlowV2 {
  /** false → 0393 not applied (or Supabase unavailable): render "not migrated". */
  migrated: boolean;
  /** The mandate the rows were scored against; null → "write a mandate" empty state. */
  mandate: InvestorMandate | null;
  mandates: InvestorMandate[];
  rows: DealFlowRowV2[];
  /** Rows that passed the fit floor before the other filters (for "n of m" copy). */
  total_above_floor: number;
  /** When the cron has never run for this mandate. */
  never_computed: boolean;
  views: SavedView[];
}

function strs(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}
function num(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Pure: apply the non-fit filters + sort to loaded rows (exported for the test). */
export function applyDealFlowFilters(rows: DealFlowRowV2[], f: DealFlowFiltersV2): DealFlowRowV2[] {
  const has = (list: readonly string[], v: string | null) => v !== null && list.includes(v);
  const out = rows.filter((r) => {
    if (f.industry.length && !has(f.industry, r.industry) && !has(f.industry, r.industry_secondary)) return false;
    if (f.business_model.length && !has(f.business_model, r.business_model)) return false;
    if (f.stage.length && !has(f.stage, r.stage_key)) return false;
    if (f.state.length && !has(f.state, r.hq_state)) return false;
    if (f.tags.length && !f.tags.some((t) => r.tags.includes(t))) return false;
    if (typeof f.min_svi === "number" && (r.svi === null || r.svi < f.min_svi)) return false;
    if (f.moved && (r.svi_delta_30d === null || Math.abs(r.svi_delta_30d) < MOVED_THRESHOLD)) return false;
    return true;
  });
  const by = f.sort ?? "fit";
  out.sort((a, b) => {
    if (by === "svi") return (b.svi ?? -1) - (a.svi ?? -1) || b.fit - a.fit;
    if (by === "updated") return String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")) || b.fit - a.fit;
    return b.fit - a.fit || (b.svi ?? -1) - (a.svi ?? -1) || a.project_id.localeCompare(b.project_id);
  });
  return out;
}

/** Pure: one fit row + its loaded startup → a table row (exported for the test). */
export function toDealFlowRow(fit: Row, s: LoadedStartup | undefined): DealFlowRowV2 {
  const t = s?.taxonomy ?? null;
  const industryRaw = t?.industry ?? "unclassified";
  const industry: Industry = isIndustry(industryRaw) ? industryRaw : "unclassified";
  const delta = s && s.svi !== null && s.svi_30d_ago !== null ? Math.round(s.svi - s.svi_30d_ago) : null;
  return {
    project_id: String(fit.project_id),
    company_name: s?.name ?? null,
    svi: s?.svi ?? null,
    svi_delta_30d: delta,
    industry,
    industry_secondary: t?.industry_secondary ?? null,
    business_model: t?.business_model ?? "unclassified",
    stage_key: t?.stage_key ?? s?.stage_key ?? "idea",
    hq_state: t?.hq_state ?? null,
    tags: t ? [...t.tags] : [],
    unclassified: industry === "unclassified",
    fit: Math.round(num(fit.score) ?? 0),
    reasons: strs(fit.reasons),
    gaps: strs(fit.gaps),
    blockers: strs(fit.blockers),
    computed_at: typeof fit.computed_at === "string" ? fit.computed_at : null,
    updated_at: s?.snapshot_at ?? null,
  };
}

/** The investor's deal-flow for one mandate. Never throws. */
export async function getDealFlowV2(userId: string, filters: Partial<DealFlowFiltersV2> = {}): Promise<DealFlowV2> {
  const f: DealFlowFiltersV2 = { ...EMPTY_FILTERS, ...filters };
  const empty: DealFlowV2 = { migrated: false, mandate: null, mandates: [], rows: [], total_above_floor: 0, never_computed: true, views: [] };
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return empty;

  const [list, prefs] = await Promise.all([listMandates(userId), getInvestorPreferences(userId)]);
  const views = normaliseSavedViews(prefs.saved_views);
  if (!list.migrated) return { ...empty, views };
  const mandate = (f.mandate_id ? list.mandates.find((m) => m.id === f.mandate_id) : null) ?? list.primary;
  if (!mandate) return { ...empty, migrated: true, mandates: list.mandates, views };

  const minFit = typeof f.min_fit === "number" ? f.min_fit : FIT_FLOOR_V2;
  let fitRows: Row[] = [];
  try {
    const { data, error } = await supabase
      .from("mandate_fit_scores")
      .select("project_id, score, reasons, gaps, blockers, computed_at")
      .eq("mandate_id", mandate.id)
      .gte("score", minFit)
      .order("score", { ascending: false })
      .limit(DEALFLOW_MAX_ROWS);
    if (error) {
      if (isMissingRelation(error)) return { ...empty, views };
      console.error("[blockid:dealflow] fit read failed", error);
      return { ...empty, migrated: true, mandate, mandates: list.mandates, views };
    }
    fitRows = (data ?? []) as Row[];
  } catch (err) {
    console.error("[blockid:dealflow] fit read threw", err);
    return { ...empty, migrated: true, mandate, mandates: list.mandates, views };
  }

  let neverComputed = fitRows.length === 0;
  if (neverComputed) {
    try {
      const { count } = await supabase.from("mandate_fit_scores").select("project_id", { count: "exact", head: true }).eq("mandate_id", mandate.id);
      neverComputed = !count;
    } catch {
      /* keep the empty state honest */
    }
  }

  const startups = await loadFitStartups(supabase, fitRows.map((r) => String(r.project_id)));
  const rows = fitRows
    .filter((r) => {
      const s = startups.get(String(r.project_id));
      return s && !s.archived;
    })
    .map((r) => toDealFlowRow(r, startups.get(String(r.project_id))));

  return {
    migrated: true,
    mandate,
    mandates: list.mandates,
    rows: applyDealFlowFilters(rows, f),
    total_above_floor: rows.length,
    never_computed: neverComputed,
    views,
  };
}

// ─── Saved views ─────────────────────────────────────────────────────────────

export async function listSavedViews(userId: string): Promise<SavedView[]> {
  const prefs = await getInvestorPreferences(userId);
  return normaliseSavedViews(prefs.saved_views);
}

export type SaveViewResult = { ok: true; view: SavedView; views: SavedView[] } | { ok: false; reason: "limit_reached" | "db_error" | "column_missing"; views: SavedView[] };

/** Append a view (≤ SAVED_VIEWS_MAX); same name replaces. */
export async function saveView(userId: string, input: { name: string; filters: DealFlowFiltersV2; sort?: SavedView["sort"] }, now: Date = new Date()): Promise<SaveViewResult> {
  const current = await listSavedViews(userId);
  const existing = current.find((v) => v.name.toLowerCase() === input.name.toLowerCase());
  const view: SavedView = {
    id: existing?.id ?? newViewId(current),
    name: input.name,
    filters: input.filters,
    sort: input.sort ?? input.filters.sort ?? "fit",
    created_at: existing?.created_at ?? now.toISOString(),
  };
  const next = existing ? current.map((v) => (v.id === existing.id ? view : v)) : [...current, view];
  if (next.length > SAVED_VIEWS_MAX) return { ok: false, reason: "limit_reached", views: current };
  const res = await setInvestorPreferences(userId, { saved_views: next });
  if (!res.ok) return { ok: false, reason: res.reason === "column_missing" ? "column_missing" : "db_error", views: current };
  return { ok: true, view, views: normaliseSavedViews(res.prefs.saved_views) };
}

export async function deleteView(userId: string, viewId: string): Promise<{ ok: boolean; views: SavedView[] }> {
  const current = await listSavedViews(userId);
  const next = current.filter((v) => v.id !== viewId);
  if (next.length === current.length) return { ok: false, views: current };
  const res = await setInvestorPreferences(userId, { saved_views: next });
  return { ok: res.ok, views: res.ok ? next : current };
}
