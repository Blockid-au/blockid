// report-kpis (S-R5): pure KPI maths + the loader's degrade paths.

import { describe, expect, it } from "vitest";
import { setComparablesForTests } from "@/lib/valuation/comparables-repo";
import { CLARITY_TARGET_MEDIAN, CLARITY_TARGET_N, computeClarityKpi, computeReportKpis, loadReportKpis, median, type ReportKpiDb } from "./report-kpis";

const NOW = new Date("2026-09-16T12:00:00Z");
const COMPS = { n: 32, withMultiplesN: 32, source: "static" as const, copy: "AU comparables: 32 raises tracked" };

describe("computeReportKpis", () => {
  it("reports/day over 7 days, today's count, grounded median + gate share, COGS median across tiers in A$", () => {
    const k = computeReportKpis({
      now: NOW,
      snapshots: [
        { created_at: "2026-09-16T09:00:00Z", grounded: "0.92" },
        { created_at: "2026-09-16T08:00:00Z", grounded: 0.7 },
        { created_at: "2026-09-14T08:00:00Z", grounded: "0.85" },
        { created_at: "2026-09-12T08:00:00Z", grounded: null },
        { created_at: "2026-09-01T08:00:00Z", grounded: "0.1" }, // outside the window
      ],
      spend: { day: "2026-09-16", usdToAud: 1.5, reports: { standard: { count: 4, spent_usd: 1.2, calls: 100 }, free: { count: 10, spent_usd: 0.2, calls: 120 }, premium: { count: 0, spent_usd: 0, calls: 0 } } },
      comparables: COMPS,
    });
    expect(k).toMatchObject({ windowDays: 7, reportsTotal: 4, reportsPerDay: 0.57, reportsToday: 2, groundedMedian: 0.85, groundedAtGateShare: 0.67, groundedSampled: 3, comparablesN: 32, comparablesSource: "static", cogsDay: "2026-09-16" });
    expect(k.cogsByTier).toEqual([
      { tier: "free", count: 10, avgAud: 0.03 },
      { tier: "standard", count: 4, avgAud: 0.45 },
    ]);
    expect(k.cogsMedianAud).toBe(0.24);
  });

  it("empty inputs → nulls, never NaN", () => {
    const k = computeReportKpis({ now: NOW, snapshots: [], spend: null, comparables: COMPS });
    expect(k).toMatchObject({ reportsTotal: 0, reportsPerDay: 0, reportsToday: 0, cogsMedianAud: null, cogsByTier: [], groundedMedian: null, groundedAtGateShare: null, groundedSampled: 0 });
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });
});

describe("loadReportKpis", () => {
  it("reads the 7-day snapshots with the JSON-path grounded share and degrades on a query error / no db", async () => {
    setComparablesForTests([]);
    const seen: string[] = [];
    const db: ReportKpiDb = {
      from: () => ({
        select: (cols: string) => {
          seen.push(cols);
          return { gte: () => ({ not: () => ({ order: () => ({ limit: async () => ({ data: [{ created_at: "2026-09-16T09:00:00Z", grounded: "0.9" }], error: null }) }) }) }) };
        },
      }),
    };
    const k = await loadReportKpis(db, { now: () => NOW, readSpend: () => ({ day: "2026-09-16", usdToAud: 1.5, reports: { standard: { count: 2, spent_usd: 0.5, calls: 40 } } }) });
    expect(seen[0]).toBe("created_at, grounded:report_v2->quality->>groundedShare");
    expect(k).toMatchObject({ reportsTotal: 1, groundedMedian: 0.9, cogsMedianAud: 0.38, comparablesN: 32, comparablesSource: "static" });
    expect(k.comparablesCopy).toContain("32 raises tracked");

    const broken: ReportKpiDb = { from: () => ({ select: () => ({ gte: () => ({ not: () => ({ order: () => ({ limit: async () => ({ data: null, error: { message: "column report_v2 does not exist" } }) }) }) }) }) }) };
    expect((await loadReportKpis(broken, { now: () => NOW, readSpend: () => null })).reportsTotal).toBe(0);
    expect((await loadReportKpis(null, { now: () => NOW, readSpend: () => null })).cogsMedianAud).toBeNull();
  });

  // G19-S46: the admin tile reads the same tbr-quality.jsonl summary /api/status.tbr_quality publishes.
  it("carries the pipeline telemetry summary from the injected reader and null when it fails", async () => {
    setComparablesForTests([]);
    const pipeline = { last24h: { runs: 3, groundedShareMedian: 0.91, costUsdMedian: 0.012, degradedShare: 0 }, status: "ok" as const };
    const k = await loadReportKpis(null, { now: () => NOW, readSpend: () => null, readQuality: async () => pipeline });
    expect(k.pipeline).toEqual(pipeline);
    const failed = await loadReportKpis(null, { now: () => NOW, readSpend: () => null, readQuality: async () => { throw new Error("EACCES"); } });
    expect(failed.pipeline).toBeNull();
    expect(computeReportKpis({ snapshots: [], spend: null, comparables: { n: 0, withMultiplesN: 0, source: "static", copy: "" }, now: NOW }).pipeline).toBeNull();
    setComparablesForTests(null);
  });

  it("G19-S45: reads the 30-day tbr_clarity:% answers through .like() and folds them into kpis.clarity", async () => {
    setComparablesForTests([]);
    const likes: Array<[string, string]> = [];
    const db: ReportKpiDb = {
      from: (table: string) => ({
        select: () => ({
          gte: () => ({
            not: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }),
            like: (col: string, pattern: string) => {
              likes.push([col, pattern]);
              return {
                limit: async () => ({
                  data: table === "nps_responses" ? [{ created_at: "2026-09-15T09:00:00Z", score: 9, context: "tbr_clarity:s1" }, { created_at: "2026-09-14T09:00:00Z", score: "8", context: "tbr_clarity:s2" }, { created_at: "2026-09-10T09:00:00Z", score: 5, context: "tbr_clarity:s3" }] : [],
                  error: null,
                }),
              };
            },
          }),
        }),
      }),
    };
    const k = await loadReportKpis(db, { now: () => NOW, readSpend: () => null });
    expect(likes).toEqual([["context", "tbr_clarity:%"]]);
    expect(k.clarity).toMatchObject({ windowDays: 30, n: 3, median: 8, shareAtLeast8: 0.67, targetMedian: 8.5, targetN: 30, onTarget: false });
    setComparablesForTests(null);
  });
});

// ── G19-S45 (D6): clarity KPI maths ──────────────────────────────────────────
describe("computeClarityKpi", () => {
  const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

  it("median over the 30-day window, N, share ≥ 8; rows outside the window, non-clarity contexts and out-of-range scores are ignored", () => {
    const k = computeClarityKpi(
      [
        { created_at: day(1), score: 10, context: "tbr_clarity:a" },
        { created_at: day(2), score: 9, context: "tbr_clarity:b" },
        { created_at: day(3), score: "8", context: "tbr_clarity:c" },
        { created_at: day(4), score: 4, context: "tbr_clarity:d" },
        { created_at: day(45), score: 0, context: "tbr_clarity:old" },
        { created_at: day(1), score: 1, context: "dashboard" },
        { created_at: day(1), score: 99, context: "tbr_clarity:bad" },
        { created_at: day(1), score: null, context: "tbr_clarity:null" },
      ],
      NOW,
    );
    expect(k).toEqual({ windowDays: 30, n: 4, median: 8.5, shareAtLeast8: 0.75, targetMedian: CLARITY_TARGET_MEDIAN, targetN: CLARITY_TARGET_N, onTarget: false });
  });

  it("on target only when median ≥ 8.5 AND N ≥ 30; empty → nulls, never NaN", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ created_at: day(i % 20), score: i % 2 ? 9 : 10, context: "tbr_clarity:x" }));
    expect(computeClarityKpi(rows, NOW)).toMatchObject({ n: 30, median: 9.5, onTarget: true });
    expect(computeClarityKpi(rows.slice(0, 29), NOW).onTarget).toBe(false);
    expect(computeClarityKpi([], NOW)).toMatchObject({ n: 0, median: null, shareAtLeast8: null, onTarget: false });
  });
});
