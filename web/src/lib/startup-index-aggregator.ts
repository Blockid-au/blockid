// Startup Value Index aggregator (T0228, v2.14).
//
// All numbers shown on startupvalueindex.com are computed here from existing
// svi_analyses rows. No new tables, no real-time — daily SSR is plenty.
//
// Public surface: computeIndexHeadlines() returns one shape the page renders.

import { getSupabaseAdmin } from "@/lib/supabase";

const SECTOR_META: Record<string, { label: string; emoji: string }> = {
  saas:        { label: "SaaS",         emoji: "📊" },
  fintech:     { label: "Fintech",      emoji: "💳" },
  ai:          { label: "AI / ML",      emoji: "🤖" },
  healthtech:  { label: "Health Tech",  emoji: "🩺" },
  marketplace: { label: "Marketplace",  emoji: "🛒" },
  deeptech:    { label: "Deep Tech",    emoji: "🔬" },
  ecommerce:   { label: "eCommerce",    emoji: "🛍️" },
};

const STAGE_LABELS = ["Concept", "Validated", "MVP", "Traction", "Revenue", "Growth", "Scale", "Mature"];

export interface IndexHeadlines {
  bsiAu: {
    value: number;             // median SVI
    deltaDay: number;
    deltaWeek: number;
    sparkline7d: number[];     // last 7 daily medians (oldest first)
    totalCompanies: number;
    totalCoverageAud: number;  // sum of blended valuations
    analysesToday: number;
    analysesYesterday: number;
  };
  sectorIndices: Array<{
    sector: string;
    label: string;
    emoji: string;
    value: number;
    deltaWeek: number;
    count: number;
  }>;
  stageIndices: Array<{
    stage: number;
    label: string;
    value: number;
    count: number;
  }>;
  topMovers: {
    winners: Array<{ ticker: string; slug: string; sector: string; svi: number; deltaWeek: number }>;
    losers: Array<{ ticker: string; slug: string; sector: string; svi: number; deltaWeek: number }>;
  };
  generatedAt: string;
  /** Pretty citation snippet: "BSI-AU as of 2026-06-18: 105 (n=138)" */
  citation: string;
}

interface AnalysisRow {
  id: string;
  email: string;
  total_svi: number | null;
  created_at: string;
  analysis_json: Record<string, unknown> | null;
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid];
}

function tickerForSector(sector: string | undefined, slug: string): string {
  const prefix = (sector ?? "default").toUpperCase().slice(0, 4);
  const tail = slug.slice(-3).toUpperCase();
  return `${prefix}-${tail}`;
}

// Pull every analysis once and bucket in-memory. 90-day window is plenty.
async function loadAnalyses(windowDays = 90): Promise<AnalysisRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from("svi_analyses")
    .select("id, email, total_svi, created_at, analysis_json")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(5000);
  return (data as AnalysisRow[] | null) ?? [];
}

function extractSector(row: AnalysisRow): string {
  const a = (row.analysis_json ?? {}) as { sector?: string; signals?: { sector?: string } };
  return (a.sector ?? a.signals?.sector ?? "default").toLowerCase();
}

function extractStage(row: AnalysisRow): number {
  const a = (row.analysis_json ?? {}) as { stage?: number };
  return typeof a.stage === "number" ? a.stage : 0;
}

function extractBlendedValuation(row: AnalysisRow): number {
  const a = (row.analysis_json ?? {}) as { deepValuation?: { blendedValuation?: { midAud?: number } } };
  return Math.max(0, Math.min(2_000_000_000, a.deepValuation?.blendedValuation?.midAud ?? 0));
}

// Hash email so we can group an identity without exposing PII.
function hashEmail(email: string): string {
  let h = 0;
  for (let i = 0; i < email.length; i++) {
    h = (h * 31 + email.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

export async function computeIndexHeadlines(windowDays = 90): Promise<IndexHeadlines> {
  const rows = await loadAnalyses(windowDays);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayTs = today.getTime();
  const yesterdayTs = todayTs - 24 * 60 * 60 * 1000;
  const weekAgoTs = todayTs - 7 * 24 * 60 * 60 * 1000;

  const allSvis: number[] = [];
  let coverageAud = 0;
  let analysesToday = 0;
  let analysesYesterday = 0;

  const dailyMedians: Array<{ ts: number; svis: number[] }> = [];
  for (let d = 6; d >= 0; d--) {
    dailyMedians.push({ ts: todayTs - d * 24 * 60 * 60 * 1000, svis: [] });
  }

  const sectorBuckets = new Map<string, { sviAll: number[]; sviWeek: number[] }>();
  const stageBuckets = new Map<number, { svis: number[] }>();
  const identityBuckets = new Map<string, { recent: AnalysisRow[]; sector: string }>();

  for (const row of rows) {
    if (row.total_svi == null) continue;
    const svi = row.total_svi;
    allSvis.push(svi);
    coverageAud += extractBlendedValuation(row);

    const rowTs = new Date(row.created_at).getTime();
    if (rowTs >= todayTs) analysesToday++;
    else if (rowTs >= yesterdayTs) analysesYesterday++;

    // Daily sparkline last 7d
    for (const day of dailyMedians) {
      if (rowTs >= day.ts && rowTs < day.ts + 24 * 60 * 60 * 1000) {
        day.svis.push(svi);
      }
    }

    const sector = extractSector(row);
    const sBucket = sectorBuckets.get(sector) ?? { sviAll: [], sviWeek: [] };
    sBucket.sviAll.push(svi);
    if (rowTs >= weekAgoTs) sBucket.sviWeek.push(svi);
    sectorBuckets.set(sector, sBucket);

    const stage = extractStage(row);
    const stBucket = stageBuckets.get(stage) ?? { svis: [] };
    stBucket.svis.push(svi);
    stageBuckets.set(stage, stBucket);

    const id = hashEmail(row.email);
    const idBucket = identityBuckets.get(id) ?? { recent: [], sector };
    idBucket.recent.push(row);
    identityBuckets.set(id, idBucket);
  }

  // ─── BSI-AU ───────────────────────────────────────────────────────────
  const bsiAu = median(allSvis);
  const sparkline7d = dailyMedians.map((d) => median(d.svis) || bsiAu);
  const deltaDay = sparkline7d[6] - sparkline7d[5];
  const deltaWeek = sparkline7d[6] - sparkline7d[0];

  // ─── Sector indices ───────────────────────────────────────────────────
  const sectorIndices = Array.from(sectorBuckets.entries())
    .filter(([s, b]) => SECTOR_META[s] && b.sviAll.length >= 1)
    .map(([s, b]) => {
      const meta = SECTOR_META[s];
      const value = median(b.sviAll);
      const valueWeek = b.sviWeek.length > 0 ? median(b.sviWeek) : value;
      return {
        sector: s,
        label: meta.label,
        emoji: meta.emoji,
        value,
        deltaWeek: valueWeek - value,
        count: b.sviAll.length,
      };
    })
    .sort((a, b) => b.count - a.count);

  // ─── Stage indices ────────────────────────────────────────────────────
  const stageIndices = Array.from(stageBuckets.entries())
    .filter(([, b]) => b.svis.length >= 1)
    .map(([stage, b]) => ({
      stage,
      label: STAGE_LABELS[stage] ?? `Stage ${stage}`,
      value: median(b.svis),
      count: b.svis.length,
    }))
    .sort((a, b) => a.stage - b.stage);

  // ─── Top movers — per-identity week-over-week ─────────────────────────
  type MoverRow = { ticker: string; slug: string; sector: string; svi: number; deltaWeek: number };
  const movers: MoverRow[] = [];
  for (const [, bucket] of identityBuckets) {
    if (bucket.recent.length < 2) continue;
    // Compare latest analysis vs latest analysis older than 7 days
    const sortedById = [...bucket.recent].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sortedById[0];
    const priorWeek = sortedById.find((r) => new Date(r.created_at).getTime() < weekAgoTs);
    if (!latest || !priorWeek || latest.total_svi == null || priorWeek.total_svi == null) continue;
    const delta = latest.total_svi - priorWeek.total_svi;
    if (Math.abs(delta) < 1) continue;
    movers.push({
      ticker: tickerForSector(bucket.sector, latest.id),
      slug: latest.id,
      sector: bucket.sector,
      svi: latest.total_svi,
      deltaWeek: delta,
    });
  }
  const winners = [...movers].sort((a, b) => b.deltaWeek - a.deltaWeek).slice(0, 5);
  const losers = [...movers].sort((a, b) => a.deltaWeek - b.deltaWeek).slice(0, 5);

  const dateStr = new Date().toISOString().slice(0, 10);
  return {
    bsiAu: {
      value: bsiAu,
      deltaDay,
      deltaWeek,
      sparkline7d,
      totalCompanies: identityBuckets.size,
      totalCoverageAud: Math.round(coverageAud),
      analysesToday,
      analysesYesterday,
    },
    sectorIndices,
    stageIndices,
    topMovers: { winners, losers },
    generatedAt: new Date().toISOString(),
    citation: `BSI-AU as of ${dateStr}: ${bsiAu} (n=${identityBuckets.size} companies, window=${windowDays}d)`,
  };
}
