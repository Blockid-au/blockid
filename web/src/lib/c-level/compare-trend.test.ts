import { describe, it, expect } from "vitest";
import {
  compareTrendAcross12Weeks,
  primaryMetricForRole,
  type TrendSnapshot,
} from "./compare-trend";

const mkSnap = (week: number, isoDate: string, extra: Partial<TrendSnapshot> = {}): TrendSnapshot => ({
  week_number: week,
  snapshot_date: isoDate,
  ...extra,
});

describe("compare-trend: basic direction detection", () => {
  it("detects upward trend", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { dcf_valuation_base: 1_000_000 }),
      mkSnap(2, "2026-06-08", { dcf_valuation_base: 1_100_000 }),
      mkSnap(3, "2026-06-15", { dcf_valuation_base: 1_200_000 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "dcf_valuation_base");
    expect(r.direction).toBe("up");
    expect(r.deltaPct).toBeCloseTo(20, 1);
  });

  it("detects downward trend", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { runway_months: 18 }),
      mkSnap(2, "2026-06-08", { runway_months: 15 }),
      mkSnap(3, "2026-06-15", { runway_months: 12 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "runway_months");
    expect(r.direction).toBe("down");
    expect(r.deltaPct).toBeLessThan(0);
  });

  it("detects flat trend", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { svi_score: 130 }),
      mkSnap(2, "2026-06-08", { svi_score: 130.5 }),
      mkSnap(3, "2026-06-15", { svi_score: 130 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "svi_score");
    expect(r.direction).toBe("flat");
  });

  it("returns insufficient-data for < 2 valid points", () => {
    const snaps: TrendSnapshot[] = [mkSnap(1, "2026-06-01", { arr_aud: 50_000 })];
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.direction).toBe("insufficient-data");
  });

  it("returns insufficient-data for empty input", () => {
    const r = compareTrendAcross12Weeks([], "arr_aud");
    expect(r.direction).toBe("insufficient-data");
  });
});

describe("compare-trend: sort + trim", () => {
  it("sorts unsorted snapshots by date", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(3, "2026-06-15", { arr_aud: 300 }),
      mkSnap(1, "2026-06-01", { arr_aud: 100 }),
      mkSnap(2, "2026-06-08", { arr_aud: 200 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.sparkline).toEqual([100, 200, 300]);
  });

  it("trims to last 12 weeks", () => {
    const snaps: TrendSnapshot[] = Array.from({ length: 15 }, (_, i) =>
      mkSnap(i + 1, `2026-01-${String(i + 1).padStart(2, "0")}`, { arr_aud: (i + 1) * 100 }),
    );
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.sparkline).toHaveLength(12);
    expect(r.sparkline[0]).toBe(400); // Week 4 (dropped 1,2,3)
    expect(r.sparkline[11]).toBe(1500);
  });

  it("skips snapshots missing the requested metric", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { arr_aud: 100 }),
      mkSnap(2, "2026-06-08", {}), // missing metric
      mkSnap(3, "2026-06-15", { arr_aud: 300 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.sparkline).toEqual([100, 300]);
  });
});

describe("compare-trend: week-over-week alerts", () => {
  it("triggers critical alert when valuation drops > 15% WoW", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { dcf_valuation_base: 1_000_000 }),
      mkSnap(2, "2026-06-08", { dcf_valuation_base: 1_000_000 }),
      mkSnap(3, "2026-06-15", { dcf_valuation_base: 800_000 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "dcf_valuation_base");
    expect(r.alert).not.toBeNull();
    expect(r.alert?.severity).toBe("critical");
    expect(r.weekOverWeekPct).toBeCloseTo(-20, 1);
  });

  it("no alert on healthy upward WoW", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { dcf_valuation_base: 1_000_000 }),
      mkSnap(2, "2026-06-08", { dcf_valuation_base: 1_050_000 }),
      mkSnap(3, "2026-06-15", { dcf_valuation_base: 1_100_000 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "dcf_valuation_base");
    expect(r.alert).toBeNull();
  });

  it("alerts when churn (good-is-smaller) rises > 15% WoW", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { churn_rate_pct: 3.0 }),
      mkSnap(2, "2026-06-08", { churn_rate_pct: 3.0 }),
      mkSnap(3, "2026-06-15", { churn_rate_pct: 4.0 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "churn_rate_pct");
    expect(r.alert?.severity).toBe("critical");
  });

  it("no alert when a good-is-smaller metric decreases", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { churn_rate_pct: 4.0 }),
      mkSnap(2, "2026-06-08", { churn_rate_pct: 3.5 }),
      mkSnap(3, "2026-06-15", { churn_rate_pct: 3.0 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "churn_rate_pct");
    expect(r.alert).toBeNull();
  });

  it("no alert on modest 10% WoW drop (below threshold)", () => {
    const snaps: TrendSnapshot[] = [
      mkSnap(1, "2026-06-01", { arr_aud: 100_000 }),
      mkSnap(2, "2026-06-08", { arr_aud: 100_000 }),
      mkSnap(3, "2026-06-15", { arr_aud: 90_000 }),
    ];
    const r = compareTrendAcross12Weeks(snaps, "arr_aud");
    expect(r.alert).toBeNull();
  });
});

describe("compare-trend: primaryMetricForRole", () => {
  it("CFO → dcf_valuation_base", () => {
    expect(primaryMetricForRole("cfo")).toBe("dcf_valuation_base");
  });
  it("CEO → runway_months", () => {
    expect(primaryMetricForRole("ceo")).toBe("runway_months");
  });
  it("CMO → cac_payback_months", () => {
    expect(primaryMetricForRole("cmo")).toBe("cac_payback_months");
  });
  it("CTO → svi_score (proxy)", () => {
    expect(primaryMetricForRole("cto")).toBe("svi_score");
  });
  it("CDO → svi_score (proxy)", () => {
    expect(primaryMetricForRole("cdo")).toBe("svi_score");
  });
});
