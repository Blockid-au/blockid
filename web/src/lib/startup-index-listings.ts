// Startup Value Index listings — the "Markets" view aggregator (T0230, v2.15).
//
// Builds the ranked listing table + the per-ticker detail data from existing
// svi_analyses + founder_profiles + svi_accounts. Anonymous-by-default; only
// surfaces `publicName` when the founder explicitly opted in.

import { createHash } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

const SECTOR_LABEL: Record<string, string> = {
  saas: "SaaS",
  fintech: "Fintech",
  ai: "AI / ML",
  healthtech: "Health Tech",
  marketplace: "Marketplace",
  deeptech: "Deep Tech",
  ecommerce: "eCommerce",
  default: "Other",
};

const STAGE_LABEL = ["Concept", "Validated", "MVP", "Traction", "Revenue", "Growth", "Scale", "Mature"];

export interface ListingRow {
  ticker: string;
  slug: string;             // latest analysis slug — for /s/[slug]
  identityHash: string;     // safe to expose, deterministic
  sector: string;
  sectorLabel: string;
  stage: number;
  stageLabel: string;
  svi: number;
  deltaWeek: number;
  valuationAud: number;
  sparkline: number[];      // 7-point SVI history (daily aggregation)
  publicName: string | null;
  publicVisible: boolean;
  hasRevenue: boolean;
  lastAnalysisAt: string;
  analysesCount: number;
}

export interface ListingFilter {
  sector?: string;        // "all" or sector slug
  stage?: number | "all";
  publicOnly?: boolean;
  revenueOnly?: boolean;
}

export type ListingSort = "svi" | "delta" | "valuation" | "stage" | "recent";

export interface ListingsResult {
  rows: ListingRow[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  generatedAt: string;
}

interface AnalysisRow {
  id: string;
  email: string;
  total_svi: number | null;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
}

interface FounderProfileRow {
  email: string;
  full_name: string | null;
  public_visible: boolean;
}

interface SviAccountRow {
  email: string;
  startup_name: string | null;
}

function hashEmail(email: string): string {
  // Same scheme used by the page so tickers stay stable. SHA-256 truncated
  // to 12 hex chars — safe to expose, deterministic, irreversible without
  // the original email.
  return createHash("sha256").update(`bsi-au:${email.toLowerCase().trim()}`).digest("hex").slice(0, 12);
}

function tickerOf(sector: string | undefined, slug: string): string {
  const prefix = (sector ?? "default").toUpperCase().slice(0, 4);
  const tail = slug.slice(-3).toUpperCase();
  return `${prefix}-${tail}`;
}

function extractSector(row: AnalysisRow): string {
  const a = (row.analysis_json ?? {}) as { sector?: string; signals?: { sector?: string } };
  return (a.sector ?? a.signals?.sector ?? "default").toLowerCase();
}

function extractStage(row: AnalysisRow): number {
  const a = (row.analysis_json ?? {}) as { stage?: number };
  return typeof a.stage === "number" ? Math.max(0, Math.min(7, a.stage)) : 0;
}

function extractValuation(row: AnalysisRow): number {
  const a = (row.analysis_json ?? {}) as { deepValuation?: { blendedValuation?: { midAud?: number } } };
  return Math.max(0, Math.min(2_000_000_000, a.deepValuation?.blendedValuation?.midAud ?? 0));
}

function extractHasRevenue(row: AnalysisRow): boolean {
  const a = (row.analysis_json ?? {}) as { signals?: { hasRevenue?: boolean } };
  return Boolean(a.signals?.hasRevenue);
}

// Build a 7-day daily sparkline from a sorted-newest-first list of analyses.
// Pads forward with the most recent score if a day has no data.
function buildSparkline(history: AnalysisRow[], days = 7): number[] {
  if (history.length === 0) return [];
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const bucket: number[] = new Array(days).fill(0);
  const counts: number[] = new Array(days).fill(0);

  for (const a of history) {
    if (a.total_svi == null) continue;
    const ts = new Date(a.created_at).getTime();
    const dayOffset = Math.floor((today.getTime() - ts) / (24 * 60 * 60 * 1000));
    if (dayOffset < 0 || dayOffset >= days) continue;
    const idx = days - 1 - dayOffset; // newest day at end
    bucket[idx] += a.total_svi;
    counts[idx]++;
  }

  let last = history[history.length - 1].total_svi ?? 0;
  const out: number[] = new Array(days).fill(0);
  for (let i = 0; i < days; i++) {
    if (counts[i] > 0) {
      out[i] = Math.round(bucket[i] / counts[i]);
      last = out[i];
    } else {
      out[i] = last;
    }
  }
  return out;
}

// ─── Listings ────────────────────────────────────────────────────────────

export async function computeListings(args: {
  filter?: ListingFilter;
  sort?: ListingSort;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}): Promise<ListingsResult> {
  const filter = args.filter ?? {};
  const sort = args.sort ?? "svi";
  const order = args.order ?? "desc";
  const page = Math.max(1, args.page ?? 1);
  const pageSize = Math.min(100, Math.max(10, args.pageSize ?? 50));

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return { rows: [], total: 0, page, pageSize, totalPages: 0, generatedAt: new Date().toISOString() };
  }

  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
  const { data: analyses } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, created_at, analysis_json")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  const analysisRows = (analyses as AnalysisRow[] | null) ?? [];

  // Group analyses by identity hash; keep history sorted oldest-first for sparkline
  const byHash = new Map<string, { history: AnalysisRow[]; email: string }>();
  for (const row of analysisRows) {
    if (!row.email) continue;
    const hash = hashEmail(row.email);
    const bucket = byHash.get(hash) ?? { history: [], email: row.email };
    bucket.history.push(row);
    byHash.set(hash, bucket);
  }

  // Load founder profiles once (just the ones with public_visible flag)
  const { data: profiles } = await supabase
    .from("founder_profiles")
    .select("email, full_name, public_visible");
  const profilesByEmail = new Map<string, FounderProfileRow>();
  for (const p of (profiles as FounderProfileRow[] | null) ?? []) {
    if (p.email) profilesByEmail.set(p.email.toLowerCase().trim(), p);
  }

  // Load startup_names for additional context
  const { data: accounts } = await supabase
    .from("svi_accounts")
    .select("email, startup_name");
  const accountsByEmail = new Map<string, SviAccountRow>();
  for (const a of (accounts as SviAccountRow[] | null) ?? []) {
    if (a.email) accountsByEmail.set(a.email.toLowerCase().trim(), a);
  }

  // Build ListingRow per identity
  const rows: ListingRow[] = [];
  for (const [identityHash, { history, email }] of byHash) {
    // Sort newest-first for "latest"
    const sortedNew = [...history].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sortedNew[0];
    if (!latest || latest.total_svi == null) continue;

    const sector = extractSector(latest);
    const stage = extractStage(latest);
    const valuationAud = extractValuation(latest);
    const hasRevenue = extractHasRevenue(latest);

    // 7-day delta = latest - latest-older-than-7-days (fallback oldest)
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const priorWeek = sortedNew.find((r) => new Date(r.created_at).getTime() < weekAgo);
    const deltaWeek = priorWeek?.total_svi != null ? latest.total_svi - priorWeek.total_svi : 0;

    // Sparkline needs oldest-first
    const sortedOld = [...history].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    const sparkline = buildSparkline(sortedOld, 7);

    const profile = profilesByEmail.get(email.toLowerCase().trim());
    const account = accountsByEmail.get(email.toLowerCase().trim());
    const publicVisible = profile?.public_visible ?? false;
    const publicName = publicVisible ? (profile?.full_name ?? account?.startup_name ?? null) : null;

    rows.push({
      ticker: tickerOf(sector, latest.id),
      slug: latest.id,
      identityHash,
      sector,
      sectorLabel: SECTOR_LABEL[sector] ?? SECTOR_LABEL["default"],
      stage,
      stageLabel: STAGE_LABEL[stage] ?? `Stage ${stage}`,
      svi: latest.total_svi,
      deltaWeek,
      valuationAud,
      sparkline,
      publicName,
      publicVisible,
      hasRevenue,
      lastAnalysisAt: latest.created_at,
      analysesCount: history.length,
    });
  }

  // Apply filters
  let filtered = rows.filter((r) => {
    if (filter.sector && filter.sector !== "all" && r.sector !== filter.sector) return false;
    if (filter.stage != null && filter.stage !== "all" && r.stage !== filter.stage) return false;
    if (filter.publicOnly && !r.publicVisible) return false;
    if (filter.revenueOnly && !r.hasRevenue) return false;
    return true;
  });

  // Sort
  const dir = order === "asc" ? 1 : -1;
  filtered.sort((a, b) => {
    switch (sort) {
      case "delta":     return (a.deltaWeek - b.deltaWeek) * dir;
      case "valuation": return (a.valuationAud - b.valuationAud) * dir;
      case "stage":     return (a.stage - b.stage) * dir;
      case "recent":    return (new Date(a.lastAnalysisAt).getTime() - new Date(b.lastAnalysisAt).getTime()) * dir;
      case "svi":
      default:          return (a.svi - b.svi) * dir;
    }
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const offset = (page - 1) * pageSize;
  const pageRows = filtered.slice(offset, offset + pageSize);

  return {
    rows: pageRows,
    total,
    page,
    pageSize,
    totalPages,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Detail per ticker ─────────────────────────────────────────────────

export interface ListingDetail {
  ticker: string;
  slug: string;
  publicName: string | null;
  publicVisible: boolean;
  sector: string;
  sectorLabel: string;
  stage: number;
  stageLabel: string;
  svi: number;
  deltaWeek: number;
  valuationAud: number;
  sviHistory: Array<{ date: string; svi: number }>;
  analysesCount: number;
  lastAnalysisAt: string;
  hasRevenue: boolean;
  // Snapshots from the latest analysis
  antlerSignals: Array<{ key: string; label: string; score: number }> | null;
  acceleratorReadiness: { overallPct: number; topGaps: Array<{ criterion: string; source: string }> } | null;
  perspectives: Array<{ label: string; lowAud: number; midAud: number; highAud: number; weight: number }> | null;
  inputSummaryProjectName: string | null;
  generatedAt: string;
}

export async function computeListingDetail(ticker: string): Promise<ListingDetail | null> {
  // Listings call to find the matching identity hash + latest slug
  const { rows } = await computeListings({ pageSize: 100, sort: "recent" });
  // Note: we may need more than 100 — for v2.15 we filter by ticker prefix
  // after pulling broad set. Lookup is O(n) which is fine at our scale.
  const match = rows.find((r) => r.ticker.toLowerCase() === ticker.toLowerCase());
  if (!match) {
    // Fallback search across all rows (no pagination)
    const supabase = getSupabaseAdmin();
    if (!supabase) return null;
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from("svi_analyses")
      .select("id, email, total_svi, created_at, analysis_json")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(5000);
    const all = (data as AnalysisRow[] | null) ?? [];
    const latest = all.find((r) => tickerOf(extractSector(r), r.id).toLowerCase() === ticker.toLowerCase());
    if (!latest) return null;
    return buildDetailFromRow(latest, supabase, all);
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  // Pull the latest analysis JSON
  const { data: latestRow } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, created_at, analysis_json")
    .eq("id", match.slug)
    .maybeSingle();
  if (!latestRow) return null;

  // Fetch all history for this email so we can chart
  const { data: history } = await supabase
    .from("svi_analyses")
    .select("id, created_at, total_svi")
    .eq("email", latestRow.email)
    .order("created_at", { ascending: true });

  return buildDetailFromRow(latestRow as AnalysisRow, supabase, undefined, history ?? undefined, match);
}

interface MinimalHistoryRow { id: string; created_at: string; total_svi: number | null }

async function buildDetailFromRow(
  latest: AnalysisRow,
  _supabase: ReturnType<typeof getSupabaseAdmin>,
  fallbackAll?: AnalysisRow[],
  prefetchedHistory?: MinimalHistoryRow[],
  matchRow?: ListingRow,
): Promise<ListingDetail | null> {
  const a = (latest.analysis_json ?? {}) as Record<string, unknown>;
  const sector = extractSector(latest);
  const stage = extractStage(latest);
  const valuationAud = extractValuation(latest);

  // Build history
  let historyAnalyses: MinimalHistoryRow[] = [];
  if (prefetchedHistory) {
    historyAnalyses = prefetchedHistory;
  } else if (fallbackAll) {
    historyAnalyses = fallbackAll
      .filter((r) => r.email === latest.email)
      .map((r) => ({ id: r.id, created_at: r.created_at, total_svi: r.total_svi }));
  }
  const sviHistory = historyAnalyses
    .filter((h) => h.total_svi != null)
    .map((h) => ({ date: h.created_at.slice(0, 10), svi: h.total_svi as number }));

  // Public name / visibility
  let publicName: string | null = matchRow?.publicName ?? null;
  let publicVisible = matchRow?.publicVisible ?? false;
  if (!matchRow && _supabase) {
    const { data: prof } = await _supabase
      .from("founder_profiles")
      .select("full_name, public_visible")
      .eq("email", latest.email.toLowerCase().trim())
      .maybeSingle();
    publicVisible = (prof?.public_visible as boolean) ?? false;
    publicName = publicVisible ? ((prof?.full_name as string) ?? null) : null;
  }

  // Antler signals snapshot
  const antler = a.antlerSignals as { signals?: Array<{ key: string; label: string; score: number }> } | undefined;
  const antlerSignals = antler?.signals?.map((s) => ({ key: s.key, label: s.label, score: s.score })) ?? null;

  // Accelerator readiness
  const acc = a.acceleratorReadiness as {
    overallPct?: number;
    highLeverageGaps?: Array<{ entry: { criterion: string; source_name: string } }>;
  } | undefined;
  const acceleratorReadiness = acc
    ? {
        overallPct: acc.overallPct ?? 0,
        topGaps: (acc.highLeverageGaps ?? []).slice(0, 3).map((g) => ({ criterion: g.entry.criterion, source: g.entry.source_name })),
      }
    : null;

  // Deep valuation perspectives
  const dv = a.deepValuation as { perspectives?: Array<{ label: string; lowAud: number; midAud: number; highAud: number; weight: number }> } | undefined;
  const perspectives = dv?.perspectives ?? null;

  const inputSummary = a.inputSummary as { projectName?: string } | undefined;

  // Compute 7d delta
  const weekAgoTs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const prior = sviHistory.find((h) => new Date(h.date).getTime() < weekAgoTs);
  const deltaWeek = prior ? (latest.total_svi ?? 0) - prior.svi : 0;

  return {
    ticker: tickerOf(sector, latest.id),
    slug: latest.id,
    publicName,
    publicVisible,
    sector,
    sectorLabel: SECTOR_LABEL[sector] ?? SECTOR_LABEL["default"],
    stage,
    stageLabel: STAGE_LABEL[stage] ?? `Stage ${stage}`,
    svi: latest.total_svi ?? 0,
    deltaWeek,
    valuationAud,
    sviHistory,
    analysesCount: historyAnalyses.length,
    lastAnalysisAt: latest.created_at,
    hasRevenue: extractHasRevenue(latest),
    antlerSignals,
    acceleratorReadiness,
    perspectives,
    inputSummaryProjectName: inputSummary?.projectName ?? null,
    generatedAt: new Date().toISOString(),
  };
}
