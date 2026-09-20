// Report KPIs for the /admin dashboard tile (G13-W5-R5 / S-R5, spec §E.5
// "dashboard tile in /dashboard/admin" + §C.8 COGS targets).
//
//   reports/day        Trusted Business Reports persisted in the last 7 days
//                      (svi_snapshots rows carrying report_v2), as a daily
//                      average, plus today's count.
//   COGS median (A$)   per-report cost from content/reports/ai-spend-daily.json
//                      (`reports[tier]` buckets written by recordReportSpend):
//                      the median of the per-tier average cost, converted at
//                      the ledger's USD→AUD rate. Target ≤ A$0.60 standard.
//   grounded share     median `report_v2.quality.groundedShare` over the same
//                      7 days + the share of reports at / above the 0.80 gate
//                      (§C.9 citation gate; §E.5 internal twin ≥ 0.85 median).
//   comparables N      verified AU comparable raises (comparables-repo) and
//                      how many carry a disclosed multiple; the copy line.
//   clarity (G19-S45)  the one-question report-clarity survey (D6): median
//                      score over the last 30 days, N, and the share of
//                      answers ≥ 8. `nps_responses` rows whose `context`
//                      starts with `tbr_clarity:`. KPI: median ≥ 8.5, N ≥ 30.
//   pipeline (G19-S46) per-run telemetry from content/reports/tbr-quality.jsonl
//                      (the same reducer /api/status.tbr_quality uses): runs
//                      in 24 h, grounded median, cost median (USD), degraded
//                      share, verdict ok | watch | missing.
//
// `computeReportKpis` is pure (tests); `loadReportKpis` does the reads and
// degrades to nulls — a missing column / file never breaks the dashboard.

import { comparablesCopyLine, comparablesCounts, primeComparables } from "@/lib/valuation/comparables-repo.server";
import { readTbrQualityStatus, type TbrQualityStatus } from "@/lib/report-pipeline/quality-log";

export const GROUNDED_GATE = 0.8;
export const GROUNDED_TARGET_MEDIAN = 0.85;
export const COGS_TARGET_AUD = 0.6;
/** G19-S45 (D6): clarity-survey KPI — median ≥ 8.5 with N ≥ 30 in the 30-day window. */
export const CLARITY_TARGET_MEDIAN = 8.5;
export const CLARITY_TARGET_N = 30;
export const CLARITY_WINDOW_DAYS = 30;
export const CLARITY_HIGH_SCORE = 8;
export const CLARITY_CONTEXT_PREFIX = "tbr_clarity:";

export interface ClarityResponseRow {
  created_at: string;
  score: number | string | null;
  context?: string | null;
}

export interface ClarityKpi {
  windowDays: number;
  n: number;
  median: number | null;
  /** Share of answers ≥ 8 (0–1), null when N = 0. */
  shareAtLeast8: number | null;
  targetMedian: number;
  targetN: number;
  /** true only when both the median and the N target are met. */
  onTarget: boolean;
}

export function computeClarityKpi(rows: ClarityResponseRow[], now: Date = new Date(), windowDays = CLARITY_WINDOW_DAYS): ClarityKpi {
  const since = now.getTime() - windowDays * 86_400_000;
  const scores = rows
    .filter((r) => (r.context === undefined || r.context === null || r.context.startsWith(CLARITY_CONTEXT_PREFIX)) && Date.parse(r.created_at) >= since)
    // `Number(null)` is 0 — a stub row (D30 drip, unanswered) must not count as a zero.
    .map((r) => (r.score === null || r.score === undefined || r.score === "" ? NaN : Number(r.score)))
    .filter((s) => Number.isFinite(s) && s >= 0 && s <= 10);
  const med = median(scores);
  const n = scores.length;
  return {
    windowDays,
    n,
    median: med === null ? null : Math.round(med * 10) / 10,
    shareAtLeast8: n ? Math.round((scores.filter((s) => s >= CLARITY_HIGH_SCORE).length / n) * 100) / 100 : null,
    targetMedian: CLARITY_TARGET_MEDIAN,
    targetN: CLARITY_TARGET_N,
    onTarget: med !== null && med >= CLARITY_TARGET_MEDIAN && n >= CLARITY_TARGET_N,
  };
}

export interface ReportKpiSnapshotRow {
  created_at: string;
  /** `report_v2->quality->>groundedShare` (string from PostgREST) or a number. */
  grounded?: string | number | null;
}

export interface ReportKpiSpend {
  day?: string;
  reports?: Record<string, { count: number; spent_usd: number; calls: number }>;
  usdToAud?: number;
}

export interface ReportKpis {
  windowDays: number;
  reportsTotal: number;
  reportsPerDay: number;
  reportsToday: number;
  cogsMedianAud: number | null;
  cogsByTier: Array<{ tier: string; count: number; avgAud: number }>;
  cogsDay: string | null;
  groundedMedian: number | null;
  groundedAtGateShare: number | null;
  groundedSampled: number;
  comparablesN: number;
  comparablesWithMultiplesN: number;
  comparablesSource: "table" | "static";
  comparablesCopy: string;
  /** G19-S45 (D6): report-clarity survey KPI. */
  clarity: ClarityKpi;
  /** G19-S46: last-24 h pipeline telemetry (tbr-quality.jsonl); null when the reader was not run. */
  pipeline: TbrQualityStatus | null;
}

export function median(values: number[]): number | null {
  const v = values.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

export function computeReportKpis(input: {
  snapshots: ReportKpiSnapshotRow[];
  spend: ReportKpiSpend | null;
  comparables: { n: number; withMultiplesN: number; source: "table" | "static"; copy: string };
  /** `nps_responses` rows with a `tbr_clarity:` context (last 30 days). */
  clarity?: ClarityResponseRow[];
  /** G19-S46: the tbr-quality.jsonl summary (readTbrQualityStatus). */
  pipeline?: TbrQualityStatus | null;
  now?: Date;
  windowDays?: number;
}): ReportKpis {
  const now = input.now ?? new Date();
  const windowDays = input.windowDays ?? 7;
  const today = now.toISOString().slice(0, 10);
  const since = now.getTime() - windowDays * 86_400_000;
  const rows = input.snapshots.filter((r) => Date.parse(r.created_at) >= since);
  const grounded = rows.map((r) => (r.grounded === null || r.grounded === undefined || r.grounded === "" ? NaN : Number(r.grounded))).filter((x) => Number.isFinite(x) && x >= 0 && x <= 1);
  const rate = input.spend?.usdToAud ?? 1.5;
  const cogsByTier = Object.entries(input.spend?.reports ?? {})
    .filter(([, b]) => b && b.count > 0)
    .map(([tier, b]) => ({ tier, count: b.count, avgAud: r2((b.spent_usd / b.count) * rate) }))
    .sort((a, b) => b.count - a.count);
  return {
    windowDays,
    reportsTotal: rows.length,
    reportsPerDay: r2(rows.length / windowDays),
    reportsToday: rows.filter((r) => r.created_at.slice(0, 10) === today).length,
    cogsMedianAud: cogsByTier.length ? r2(median(cogsByTier.map((t) => t.avgAud)) ?? 0) : null,
    cogsByTier,
    cogsDay: input.spend?.day ?? null,
    groundedMedian: grounded.length ? r2(median(grounded) ?? 0) : null,
    groundedAtGateShare: grounded.length ? r2(grounded.filter((g) => g >= GROUNDED_GATE).length / grounded.length) : null,
    groundedSampled: grounded.length,
    comparablesN: input.comparables.n,
    comparablesWithMultiplesN: input.comparables.withMultiplesN,
    comparablesSource: input.comparables.source,
    comparablesCopy: input.comparables.copy,
    clarity: computeClarityKpi(input.clarity ?? [], now),
    pipeline: input.pipeline ?? null,
  };
}

type KpiQueryResult = PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;

export interface ReportKpiDb {
  from(table: string): {
    select(cols: string): {
      gte(col: string, v: string): {
        not(col: string, op: string, v: null): { order(col: string, o: { ascending: boolean }): { limit(n: number): KpiQueryResult } };
        /** G19-S45: the clarity read — `.gte(created_at).like(context, 'tbr_clarity:%').limit(n)`. */
        like?(col: string, pattern: string): { limit(n: number): KpiQueryResult };
      };
    };
  };
}

export interface LoadReportKpiDeps {
  readSpend?: () => ReportKpiSpend | null;
  /** G19-S46: the tbr-quality.jsonl reader (defaults to the live-checkout file). */
  readQuality?: () => Promise<TbrQualityStatus | null>;
  now?: () => Date;
}

async function defaultReadSpend(): Promise<ReportKpiSpend | null> {
  try {
    const { readDailySpend, usdToAudRate } = await import("@/lib/ai/spend-guard");
    const s = readDailySpend();
    return { day: s.day, reports: s.reports ?? {}, usdToAud: usdToAudRate() };
  } catch {
    return null;
  }
}

/** Reads (7-day snapshots with grounded share, the spend ledger, the comparables cache) → KPIs. Never throws. */
export async function loadReportKpis(db: ReportKpiDb | null, deps: LoadReportKpiDeps = {}): Promise<ReportKpis> {
  const now = deps.now ?? (() => new Date());
  const since = new Date(now().getTime() - 7 * 86_400_000).toISOString();
  let snapshots: ReportKpiSnapshotRow[] = [];
  if (db) {
    try {
      const { data, error } = await db.from("svi_snapshots").select("created_at, grounded:report_v2->quality->>groundedShare").gte("created_at", since).not("report_v2", "is", null).order("created_at", { ascending: false }).limit(2000);
      if (!error && Array.isArray(data)) snapshots = data as ReportKpiSnapshotRow[];
    } catch {
      snapshots = [];
    }
  }
  // G19-S45 (D6): clarity-survey answers in the 30-day window.
  let clarity: ClarityResponseRow[] = [];
  if (db) {
    try {
      const since30 = new Date(now().getTime() - CLARITY_WINDOW_DAYS * 86_400_000).toISOString();
      const q = db.from("nps_responses").select("created_at, score, context").gte("created_at", since30);
      if (typeof q.like === "function") {
        const { data, error } = await q.like("context", `${CLARITY_CONTEXT_PREFIX}%`).limit(5000);
        if (!error && Array.isArray(data)) clarity = data as ClarityResponseRow[];
      }
    } catch {
      clarity = [];
    }
  }
  const spend = deps.readSpend ? deps.readSpend() : await defaultReadSpend();
  // G19-S46: the same 24 h reducer /api/status.tbr_quality publishes.
  const pipeline = await (deps.readQuality ? deps.readQuality() : readTbrQualityStatus(undefined, now().getTime())).catch(() => null);
  await primeComparables().catch(() => undefined);
  const c = comparablesCounts();
  return computeReportKpis({ snapshots, spend, comparables: { n: c.n, withMultiplesN: c.withMultiplesN, source: c.source, copy: comparablesCopyLine() }, clarity, pipeline, now: now() });
}
