// Investor Portal helpers — data access for the investor workspace.
//
// Backs three surfaces:
//   1. Deal Flow Inbox — verified startups matched against the investor's
//      stated preferences (sector, stage, cheque size band, geo).
//   2. Watchlist — investor bookmarks with grouping tags (following /
//      contacted / passed) and 90-day SVI trend.
//   3. Portfolio — invested companies with ownership%, quarterly reports,
//      and LP export gates (feature='investor.portfolio' + 'investor.lp_export').
//
// Preferences live on app_users.investor_prefs (jsonb). The column may not
// exist yet on legacy installs — every read/write catches the "column does
// not exist" error and degrades to an empty prefs object so the UI still
// renders.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { listWatchlist, type WatchlistRow } from "@/lib/watchlist";

// ---------------------------------------------------------------------------
// Preference schema — stored as jsonb on app_users.investor_prefs.
// All arrays are logical unions ("show me any startup matching one of these").
// Cheque-size is a coarse band so we don't leak absolute AUM figures.
// ---------------------------------------------------------------------------

export type StageBand =
  | "pre_seed"
  | "seed"
  | "series_a"
  | "series_b"
  | "growth"
  | "any";

export type ChequeBand =
  | "under_25k"
  | "25k_100k"
  | "100k_500k"
  | "500k_2m"
  | "2m_plus"
  | "any";

export interface InvestorPreferences {
  sectors: string[];        // e.g. ["fintech","healthtech","climate"]
  stages: StageBand[];      // e.g. ["seed","series_a"]
  geos: string[];           // ISO country codes e.g. ["AU","NZ","US"]
  cheque_band: ChequeBand;  // single band
  min_svi: number | null;   // 0-100 floor, null = any
  updated_at: string | null;
}

export const DEFAULT_PREFS: InvestorPreferences = {
  sectors: [],
  stages: ["any"],
  geos: ["AU"],
  cheque_band: "any",
  min_svi: null,
  updated_at: null,
};

// ---------------------------------------------------------------------------
// Deal-flow row — flattened view over svi_index_snapshots + scores that the
// UI can render without further joins.
// ---------------------------------------------------------------------------

export interface DealFlowRow {
  score_id: string;
  company_name: string | null;
  total_score: number;
  sector: string | null;
  stage: string | null;
  jurisdiction: string | null;   // ISO country
  updated_at: string;
}

export interface DealFlowFilters {
  stage?: StageBand | null;
  sector?: string | null;
  minScore?: number | null;
  jurisdiction?: string | null;
  limit?: number;
}

// ---------------------------------------------------------------------------
// Portfolio row — represents a live investment. Persisted in
// investor_portfolio if present; otherwise this returns an empty list so
// the UI can prompt the user to add their first holding.
// ---------------------------------------------------------------------------

export interface PortfolioRow {
  id: string;
  startup_id: string;
  company_name: string;
  valuation_aud: number | null;
  ownership_pct: number | null;
  latest_quarterly_report_id: string | null;
  invested_at: string;
}

// ---------------------------------------------------------------------------
// getInvestorPreferences — read from app_users.investor_prefs.
// Tolerates the column being missing on legacy installs.
// ---------------------------------------------------------------------------

export async function getInvestorPreferences(
  userId: string,
): Promise<InvestorPreferences> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return DEFAULT_PREFS;

  try {
    const { data, error } = await supabase
      .from("app_users")
      .select("investor_prefs")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // Column missing = degrade to defaults; anything else, log + degrade.
      if (!/column.*investor_prefs/i.test(error.message ?? "")) {
        console.error("[blockid:investor-portal] prefs read failed", error);
      }
      return DEFAULT_PREFS;
    }
    const raw = (data as { investor_prefs?: unknown } | null)?.investor_prefs;
    if (!raw || typeof raw !== "object") return DEFAULT_PREFS;
    return normalisePrefs(raw as Partial<InvestorPreferences>);
  } catch (err) {
    console.error("[blockid:investor-portal] prefs read threw", err);
    return DEFAULT_PREFS;
  }
}

// ---------------------------------------------------------------------------
// setInvestorPreferences — merge + persist. Returns the merged view even
// when the column is missing so the caller can echo the effective state.
// ---------------------------------------------------------------------------

export async function setInvestorPreferences(
  userId: string,
  patch: Partial<InvestorPreferences>,
): Promise<{ ok: boolean; prefs: InvestorPreferences; reason?: string }> {
  const current = await getInvestorPreferences(userId);
  const merged: InvestorPreferences = normalisePrefs({
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  });

  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, prefs: merged, reason: "not_configured" };

  try {
    const { error } = await supabase
      .from("app_users")
      .update({ investor_prefs: merged })
      .eq("id", userId);

    if (error) {
      if (/column.*investor_prefs/i.test(error.message ?? "")) {
        // Column not yet migrated — accept in-memory only.
        return { ok: false, prefs: merged, reason: "column_missing" };
      }
      console.error("[blockid:investor-portal] prefs write failed", error);
      return { ok: false, prefs: merged, reason: "db_error" };
    }
    return { ok: true, prefs: merged };
  } catch (err) {
    console.error("[blockid:investor-portal] prefs write threw", err);
    return { ok: false, prefs: merged, reason: "db_error" };
  }
}

// ---------------------------------------------------------------------------
// getDealFlow — return the top N startups matching the investor's stated
// preferences. Reads from scores (canonical) and enriches with the latest
// svi_index_snapshots row for sector/stage where available. Falls back to
// a plain scores query if svi_index_snapshots isn't populated.
// ---------------------------------------------------------------------------

export async function getDealFlow(
  userId: string,
  filters: DealFlowFilters = {},
): Promise<DealFlowRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const prefs = await getInvestorPreferences(userId);
  const limit = Math.min(filters.limit ?? 50, 200);
  const minScore = filters.minScore ?? prefs.min_svi ?? 0;

  // Base query — scores table. Latest 500 verified rows above minScore.
  const { data: scoreRows, error: scoreErr } = await supabase
    .from("scores")
    .select("id, email, company_name, total_score, created_at")
    .gte("total_score", minScore)
    .order("created_at", { ascending: false })
    .limit(500);

  if (scoreErr) {
    console.error("[blockid:investor-portal] dealflow scores read failed", scoreErr);
    return [];
  }

  const scores = (scoreRows as Array<{
    id: string;
    email: string;
    company_name: string | null;
    total_score: number;
    created_at: string;
  }> | null) ?? [];

  if (scores.length === 0) return [];

  // Enrich with sector/stage from svi_index_snapshots where available.
  // We index snapshots by score/company email → not a hard join, so we
  // gather the most recent snapshot per email opportunistically.
  const emails = scores.map((s) => s.email).filter((e): e is string => !!e);
  let snapByEmail: Map<string, { sector: string | null; stage: string | null; state: string | null }> = new Map();
  if (emails.length) {
    try {
      const { data: snapRows } = await supabase
        .from("svi_index_snapshots")
        .select("account_id, sector, stage, state, snapshot_date")
        .order("snapshot_date", { ascending: false })
        .limit(1000);

      // svi_index_snapshots uses account_id, not email; treat as best-effort.
      // For the MVP we index by account_id as a stand-in and reconcile in W6.
      snapByEmail = new Map(
        ((snapRows as Array<{
          account_id: string;
          sector: string | null;
          stage: string | null;
          state: string | null;
        }> | null) ?? []).map((r) => [r.account_id, {
          sector: r.sector,
          stage: r.stage,
          state: r.state,
        }]),
      );
    } catch {
      // Snapshot table optional at this stage — keep going.
    }
  }

  const enriched: DealFlowRow[] = scores.map((s) => {
    const snap = snapByEmail.get(s.email) ?? null;
    return {
      score_id: s.id,
      company_name: s.company_name ?? null,
      total_score: s.total_score,
      sector: snap?.sector ?? null,
      stage: snap?.stage ?? null,
      jurisdiction: snap?.state ? juriFromState(snap.state) : "AU",
      updated_at: s.created_at,
    };
  });

  // Apply post-fetch filters — preference-based and explicit filter chips.
  const wantsSectors = filters.sector
    ? [filters.sector]
    : prefs.sectors.length
    ? prefs.sectors
    : null;
  const wantsStage = filters.stage && filters.stage !== "any"
    ? filters.stage
    : null;
  const wantsGeo = filters.jurisdiction ?? (prefs.geos.length ? prefs.geos : null);

  const filtered = enriched.filter((row) => {
    if (wantsSectors && row.sector && !wantsSectors.includes(row.sector)) return false;
    if (wantsStage && row.stage && !matchesStage(row.stage, wantsStage)) return false;
    if (wantsGeo && row.jurisdiction) {
      const geos = Array.isArray(wantsGeo) ? wantsGeo : [wantsGeo];
      if (!geos.includes(row.jurisdiction)) return false;
    }
    return true;
  });

  return filtered.slice(0, limit);
}

// ---------------------------------------------------------------------------
// getWatchlist — thin wrapper over the existing watchlist module so the
// investor page has a single import surface.
// ---------------------------------------------------------------------------

export async function getWatchlist(userId: string): Promise<WatchlistRow[]> {
  return listWatchlist(userId);
}

// ---------------------------------------------------------------------------
// addToWatchlist — deliberate no-op if a ticker is missing; the workspace
// UI passes both ticker+slug from the deal-flow row.
// ---------------------------------------------------------------------------

export async function addToWatchlist(
  userId: string,
  ticker: string,
  slug?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };
  const normalised = ticker.trim().toUpperCase();
  if (!/^[A-Z]{1,8}-[A-Z0-9]{1,8}$/.test(normalised)) {
    return { ok: false, reason: "invalid_ticker" };
  }
  const { data: existing } = await supabase
    .from("watchlist")
    .select("id")
    .eq("account_id", userId)
    .eq("ticker", normalised)
    .maybeSingle();
  if (existing) return { ok: true };
  const { error } = await supabase.from("watchlist").insert({
    account_id: userId,
    ticker: normalised,
    slug: slug ?? null,
  });
  if (error) {
    console.error("[blockid:investor-portal] watchlist insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true };
}

// ---------------------------------------------------------------------------
// moveWatchlistTag — update notes with a tag prefix so we can group into
// following / contacted / passed without introducing a new column yet.
// Tag lives in notes as `#tag:following` etc; watchlist_notes writes through.
// ---------------------------------------------------------------------------

export type WatchlistTag = "following" | "contacted" | "passed";

export async function moveWatchlistTag(
  userId: string,
  ticker: string,
  tag: WatchlistTag,
): Promise<{ ok: boolean; reason?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, reason: "not_configured" };
  const normalised = ticker.trim().toUpperCase();

  const { data: row } = await supabase
    .from("watchlist")
    .select("id, notes")
    .eq("account_id", userId)
    .eq("ticker", normalised)
    .maybeSingle();
  if (!row) return { ok: false, reason: "not_found" };

  const cleaned = ((row as { notes: string | null }).notes ?? "")
    .replace(/#tag:(following|contacted|passed)/g, "")
    .trim();
  const newNotes = `#tag:${tag}${cleaned ? ` ${cleaned}` : ""}`;

  const { error } = await supabase
    .from("watchlist")
    .update({ notes: newNotes })
    .eq("id", (row as { id: string }).id);
  if (error) {
    console.error("[blockid:investor-portal] watchlist tag update failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true };
}

export function readWatchlistTag(notes: string | null): WatchlistTag {
  if (!notes) return "following";
  const m = /#tag:(following|contacted|passed)/.exec(notes);
  return (m?.[1] as WatchlistTag | undefined) ?? "following";
}

// ---------------------------------------------------------------------------
// getPortfolio — read the investor_portfolio table if it exists.
// Returns an empty array (with reason logged) when the table is missing.
// ---------------------------------------------------------------------------

export async function getPortfolio(userId: string): Promise<PortfolioRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("investor_portfolio")
      .select(
        "id, startup_id, company_name, valuation_aud, ownership_pct, latest_quarterly_report_id, invested_at",
      )
      .eq("investor_user_id", userId)
      .order("invested_at", { ascending: false });

    if (error) {
      if (!/relation.*investor_portfolio.*does not exist/i.test(error.message ?? "")) {
        console.error("[blockid:investor-portal] portfolio read failed", error);
      }
      return [];
    }
    return (data as PortfolioRow[] | null) ?? [];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalisePrefs(p: Partial<InvestorPreferences>): InvestorPreferences {
  return {
    sectors: Array.isArray(p.sectors) ? p.sectors.slice(0, 20).map(String) : [],
    stages: Array.isArray(p.stages) && p.stages.length
      ? (p.stages.slice(0, 6) as StageBand[])
      : ["any"],
    geos: Array.isArray(p.geos) ? p.geos.slice(0, 20).map(String) : ["AU"],
    cheque_band: (p.cheque_band as ChequeBand) ?? "any",
    min_svi: typeof p.min_svi === "number" ? Math.max(0, Math.min(100, p.min_svi)) : null,
    updated_at: typeof p.updated_at === "string" ? p.updated_at : null,
  };
}

function matchesStage(startupStage: string, filter: StageBand): boolean {
  const s = startupStage.toLowerCase().replace(/[\s_-]/g, "");
  const f = filter.toLowerCase().replace(/[\s_-]/g, "");
  if (s === f) return true;
  // Loose synonyms
  if (f === "preseed" && /(idea|preseed|pre-seed)/.test(s)) return true;
  if (f === "seed" && /^seed/.test(s)) return true;
  if (f === "seriesa" && /(a|seriesa)/.test(s)) return true;
  return s.startsWith(f);
}

function juriFromState(state: string): string {
  // Australian states → AU; anything looking like an ISO2 country → itself.
  const upper = state.toUpperCase();
  if (/^(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)$/.test(upper)) return "AU";
  if (/^[A-Z]{2}$/.test(upper)) return upper;
  return "AU";
}
