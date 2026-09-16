// report-kpis (S-R5): pure KPI maths + the loader's degrade paths.

import { describe, expect, it } from "vitest";
import { setComparablesForTests } from "@/lib/valuation/comparables-repo";
import { computeReportKpis, loadReportKpis, median, type ReportKpiDb } from "./report-kpis";

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
    setComparablesForTests(null);
  });
});
