import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPerMetricDirectionStreakCoverage,
  formatDigestSnapshotPerMetricDirectionStreakCoverageSection,
} from "./digest-snapshot-per-metric-direction-streak-coverage";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrRow(code: string, cents: number) {
  return { reseller_code: code, mrr_cents: cents };
}

function churnRow(code: string, count: number) {
  return { reseller_code: code, churned_count: count };
}

function mrrSnap(
  idx: number,
  rows: Array<{ reseller_code: string; mrr_cents: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows },
  });
}

function bothSnap(
  idx: number,
  mrrRows: Array<{ reseller_code: string; mrr_cents: number }>,
  churnRows: Array<{ reseller_code: string; churned_count: number }>,
) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: mrrRows },
    attributed_churn_30d: { rows: churnRows },
  });
}

describe("computeDigestSnapshotPerMetricDirectionStreakCoverage — shape", () => {
  it("passes through window metadata + min_streak_length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("emits one row per HEADLINE_METRICS section even on empty trend (stable KPI ladder)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    expect(cov.rows).toHaveLength(HEADLINE_METRICS.length);
    expect(cov.rows.map((r) => r.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
    for (const r of cov.rows) {
      expect(r.total_partners).toBe(0);
      expect(r.partners_with_streak).toBe(0);
      expect(r.coverage_rate_pct).toBeNull();
      expect(r.min_length).toBeNull();
      expect(r.max_length).toBeNull();
      expect(r.median_length).toBeNull();
    }
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend, 0)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend, -5)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend, 3.7)
        .min_streak_length,
    ).toBe(3);
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakCoverage — per-metric buckets", () => {
  it("counts a single partner on an up-streak (up_rate 100, down_rate 0)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(1);
    expect(mrr.partners_up_streak).toBe(1);
    expect(mrr.partners_down_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(100);
    expect(mrr.up_coverage_rate_pct).toBe(100);
    expect(mrr.down_coverage_rate_pct).toBe(0);
    expect(mrr.min_length).toBe(2);
    expect(mrr.max_length).toBe(2);
    expect(mrr.median_length).toBe(2);
  });

  it("counts a single partner on a down-streak (mirror image)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9900)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.partners_with_streak).toBe(1);
    expect(mrr.partners_up_streak).toBe(0);
    expect(mrr.partners_down_streak).toBe(1);
    expect(mrr.up_coverage_rate_pct).toBe(0);
    expect(mrr.down_coverage_rate_pct).toBe(100);
  });

  it("partitions up/down cleanly across partners for the same KPI (each partner on at most one side)", () => {
    // INFOVISION climbs, ACME slides — both on attributed_mrr.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000), mrrRow("ACME", 18000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 14000), mrrRow("ACME", 16000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(2);
    expect(mrr.partners_with_streak).toBe(2);
    expect(mrr.partners_up_streak).toBe(1);
    expect(mrr.partners_down_streak).toBe(1);
    expect(mrr.coverage_rate_pct).toBe(100);
    expect(mrr.up_coverage_rate_pct).toBe(50);
    expect(mrr.down_coverage_rate_pct).toBe(50);
    // Invariant: partitions sum to the streaked-partner count.
    expect(mrr.partners_up_streak + mrr.partners_down_streak).toBe(
      mrr.partners_with_streak,
    );
  });

  it("captures the streak-length distribution across streaking partners for a KPI", () => {
    // INFOVISION mrr length-3 (10000 → 12000 → 14000 → 16000)
    // ACME mrr length-2 (20000 → 18000 → 16000 → 16000 flat break)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000), mrrRow("ACME", 18000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 14000), mrrRow("ACME", 16000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 16000), mrrRow("ACME", 16000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.partners_with_streak).toBe(2);
    expect(mrr.min_length).toBe(2);
    expect(mrr.max_length).toBe(3);
    expect(mrr.median_length).toBe(2.5);
  });

  it("keeps a KPI with observed partners but zero streaks visible with rate=0", () => {
    // Alternating up/down keeps every partner at length-1 max.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(0);
    expect(mrr.up_coverage_rate_pct).toBe(0);
    expect(mrr.down_coverage_rate_pct).toBe(0);
    expect(mrr.min_length).toBeNull();
    expect(mrr.max_length).toBeNull();
    expect(mrr.median_length).toBeNull();
  });

  it("emits rows in canonical HEADLINE_METRICS order (stable KPI ladder week over week)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 9900)], [churnRow("INFOVISION", 30)]),
      bothSnap(1, [mrrRow("INFOVISION", 12000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 10)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    expect(cov.rows.map((r) => r.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
    // KPIs with data expose non-null coverage; KPIs with no data expose null.
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    const churn = cov.rows.find((r) => r.key === "attributed_churn_30d")!;
    const unrelated = cov.rows.find((r) => r.key === "ledger_drift_events")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_up_streak).toBe(1);
    expect(churn.total_partners).toBe(1);
    expect(churn.partners_down_streak).toBe(1);
    expect(unrelated.total_partners).toBe(0);
    expect(unrelated.coverage_rate_pct).toBeNull();
  });

  it("distinguishes systemic-pressure KPIs (5 down) from mixed KPIs (3 up / 2 down) at identical composite coverage", () => {
    // Five partners all sliding on attributed_mrr — 100% down_coverage.
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, codes.map((c) => mrrRow(c, 20000))),
      mrrSnap(1, codes.map((c) => mrrRow(c, 18000))),
      mrrSnap(2, codes.map((c) => mrrRow(c, 15000))),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.partners_with_streak).toBe(5);
    expect(mrr.partners_up_streak).toBe(0);
    expect(mrr.partners_down_streak).toBe(5);
    expect(mrr.up_coverage_rate_pct).toBe(0);
    expect(mrr.down_coverage_rate_pct).toBe(100);
  });

  it("uses distinct-partner denominator per metric (dup partner rows do not double-count)", () => {
    // Even if the trend accidentally saw a partner twice we count them once.
    // Real trend fold dedupes upstream, but the denominator math must be safe
    // against duplicate reseller_code entries in the trend row list.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.coverage_rate_pct).toBe(100);
  });

  it("caller-widened min streak length drops a length-2 partner from the coverage", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov = computeDigestSnapshotPerMetricDirectionStreakCoverage(
      trend,
      3,
    );
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(cov.min_streak_length).toBe(3);
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(0);
  });
});

describe("formatDigestSnapshotPerMetricDirectionStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when zero KPIs have any observed partners", () => {
    const cov = computeDigestSnapshotPerMetricDirectionStreakCoverage(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when every observed partner is flat (zero qualifying streaks)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("renders the twelve-column table with headers + week labels + min_streak_length constant", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(cov);
    expect(html).toContain("Section");
    expect(html).toContain("Metric");
    expect(html).toContain("Total partners");
    expect(html).toContain("With streak");
    expect(html).toContain("Up");
    expect(html).toContain("Down");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Up rate");
    expect(html).toContain("Down rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+`);
  });

  it("HTML-escapes week labels (metric keys are canonical constants so cannot leak)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 9900)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 12000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 15000)] },
      }),
    ]);
    const cov =
      computeDigestSnapshotPerMetricDirectionStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
  });
});
