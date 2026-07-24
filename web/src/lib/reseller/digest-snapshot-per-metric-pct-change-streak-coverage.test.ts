import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPerMetricPctChangeStreakCoverage,
  formatDigestSnapshotPerMetricPctChangeStreakCoverageSection,
} from "./digest-snapshot-per-metric-pct-change-streak-coverage";

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

describe("computeDigestSnapshotPerMetricPctChangeStreakCoverage — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(cov.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("emits one row per HEADLINE_METRICS section even on empty trend (stable KPI ladder)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
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
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend, 0)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend, -5)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend, 3.7)
        .min_streak_length,
    ).toBe(3);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(
        trend,
        DEFAULT_MIN_STREAK_LENGTH,
        0,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakCoverage(
        trend,
        DEFAULT_MIN_STREAK_LENGTH,
        -10,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakCoverage — per-metric buckets", () => {
  it("counts a single partner on an up |pct|-material streak", () => {
    // 10000 → 15000 (+50%) → 22500 (+50%): length-2 streak
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(1);
    expect(mrr.coverage_rate_pct).toBe(100);
    expect(mrr.min_length).toBe(2);
    expect(mrr.max_length).toBe(2);
    expect(mrr.median_length).toBe(2);
  });

  it("counts a single partner on a down |pct|-material streak (sign-blind)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 5000)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.partners_with_streak).toBe(1);
    expect(mrr.coverage_rate_pct).toBe(100);
  });

  it("counts an oscillating same-magnitude streak (|pct| is signless-material)", () => {
    // +35%, -30%, +40% all above threshold — length-3 streak regardless of sign flips
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13500)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9450)]),
      mrrSnap(3, [mrrRow("INFOVISION", 13230)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.partners_with_streak).toBe(1);
    expect(mrr.max_length).toBe(3);
  });

  it("counts multiple partners on the same KPI, mixed lengths for the length distribution", () => {
    // INFOVISION mrr length-3 (10000 → 15000 → 22500 → 33750)
    // ACME mrr length-2 (20000 → 10000 → 5000 → 5000 flat break)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000), mrrRow("ACME", 10000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500), mrrRow("ACME", 5000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 33750), mrrRow("ACME", 5000)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(2);
    expect(mrr.partners_with_streak).toBe(2);
    expect(mrr.coverage_rate_pct).toBe(100);
    expect(mrr.min_length).toBe(2);
    expect(mrr.max_length).toBe(3);
    expect(mrr.median_length).toBe(2.5);
  });

  it("keeps a KPI with observed partners but zero qualifying streaks visible with rate=0", () => {
    // Tiny 1% moves — none above 25% threshold.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10200)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(0);
    expect(mrr.min_length).toBeNull();
    expect(mrr.max_length).toBeNull();
    expect(mrr.median_length).toBeNull();
  });

  it("emits rows in canonical HEADLINE_METRICS order (stable KPI ladder week over week)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    expect(cov.rows.map((r) => r.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    const churn = cov.rows.find((r) => r.key === "attributed_churn_30d")!;
    const unrelated = cov.rows.find((r) => r.key === "ledger_drift_events")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(1);
    expect(churn.total_partners).toBe(1);
    expect(churn.partners_with_streak).toBe(1);
    expect(unrelated.total_partners).toBe(0);
    expect(unrelated.coverage_rate_pct).toBeNull();
  });

  it("distinguishes systemic-pressure KPIs (5 streaking) from idiosyncratic KPIs (1 streaking)", () => {
    // Five partners all swinging materially on attributed_mrr.
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, codes.map((c) => mrrRow(c, 10000))),
      mrrSnap(1, codes.map((c) => mrrRow(c, 15000))),
      mrrSnap(2, codes.map((c) => mrrRow(c, 22500))),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(5);
    expect(mrr.partners_with_streak).toBe(5);
    expect(mrr.coverage_rate_pct).toBe(100);
  });

  it("uses distinct-partner denominator per metric (not HEADLINE_METRICS.length)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_partners).toBe(1);
    expect(mrr.coverage_rate_pct).toBe(100);
  });

  it("caller-widened min streak length drops a length-2 partner from the coverage", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(
      trend,
      3,
    );
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(cov.min_streak_length).toBe(3);
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(0);
  });

  it("caller-widened threshold drops sub-threshold streaks from coverage", () => {
    // 50% moves stay above 25% default but drop below a 60% caller override.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(
      trend,
      DEFAULT_MIN_STREAK_LENGTH,
      60,
    );
    const mrr = cov.rows.find((r) => r.key === "attributed_mrr")!;
    expect(cov.threshold).toBe(60);
    expect(mrr.total_partners).toBe(1);
    expect(mrr.partners_with_streak).toBe(0);
    expect(mrr.coverage_rate_pct).toBe(0);
  });
});

describe("formatDigestSnapshotPerMetricPctChangeStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when zero KPIs have any observed partners", () => {
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when every observed partner is flat (zero qualifying streaks)", () => {
    // Sub-threshold 1% moves.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10200)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("renders the eight-column table with headers + week labels + threshold + min_streak_length constants", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(cov);
    expect(html).toContain("Section");
    expect(html).toContain("Metric");
    expect(html).toContain("Total partners");
    expect(html).toContain("With streak");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+`);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
  });

  it("HTML-escapes week labels (metric keys are canonical constants so cannot leak)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 10000)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 15000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("INFOVISION", 22500)] },
      }),
    ]);
    const cov = computeDigestSnapshotPerMetricPctChangeStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
  });
});
