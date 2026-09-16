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
//
// `computeReportKpis` is pure (tests); `loadReportKpis` does the reads and
// degrades to nulls — a missing column / file never breaks the dashboard.

import { comparablesCopyLine, comparablesCounts, primeComparables } from "@/lib/valuation/comparables-repo";

export const GROUNDED_GATE = 0.8;
export const GROUNDED_TARGET_MEDIAN = 0.85;
export const COGS_TARGET_AUD = 0.6;

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
  };
}

export interface ReportKpiDb {
  from(table: string): {
    select(cols: string): { gte(col: string, v: string): { not(col: string, op: string, v: null): { order(col: string, o: { ascending: boolean }): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } } } };
  };
}

export interface LoadReportKpiDeps {
  readSpend?: () => ReportKpiSpend | null;
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
  const spend = deps.readSpend ? deps.readSpend() : await defaultReadSpend();
  await primeComparables().catch(() => undefined);
  const c = comparablesCounts();
  return computeReportKpis({ snapshots, spend, comparables: { n: c.n, withMultiplesN: c.withMultiplesN, source: c.source, copy: comparablesCopyLine() }, now: now() });
}
