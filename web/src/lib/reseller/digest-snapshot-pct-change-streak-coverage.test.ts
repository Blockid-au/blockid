import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  computeDigestSnapshotPctChangeStreakCoverage,
  formatDigestSnapshotPctChangeStreakCoverageSection,
} from "./digest-snapshot-pct-change-streak-coverage";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-pct-change-streaks";

function snap(week: string, capturedAt: Date, envelope: Record<string, unknown>) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrSnap(idx: number, cents: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: cents }] },
  });
}

function churnSnap(idx: number, count: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_churn_30d: { rows: [{ churned_count: count }] },
  });
}

// A snapshot with BOTH mrr and churn so the trend has 2 metrics observable.
function bothSnap(idx: number, mrrCents: number, churnCount: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: mrrCents }] },
    attributed_churn_30d: { rows: [{ churned_count: churnCount }] },
  });
}

describe("computeDigestSnapshotPctChangeStreakCoverage — shape", () => {
  it("passes through window metadata + tuning constants + fixed denominator", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
      mrrSnap(2, 10500),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(cov.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    // Denominator is the canonical KPI ladder length, NOT the observed count.
    expect(cov.total_metrics).toBe(HEADLINE_METRICS.length);
  });

  it("returns empty coverage on empty trend", () => {
    const cov = computeDigestSnapshotPctChangeStreakCoverage(
      computeDigestSnapshotRollingTrend([]),
    );
    expect(cov.metrics_with_streak).toBe(0);
    // coverage_rate_pct is 0.0 (not null) when total_metrics > 0 and none qualify.
    expect(cov.coverage_rate_pct).toBe(0);
    expect(cov.min_length).toBeNull();
    expect(cov.max_length).toBeNull();
    expect(cov.median_length).toBeNull();
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the streak detector", () => {
    // Passing 0 should NOT trigger a catch-everything streak walker; the
    // underlying computeDigestSnapshotPctChangeStreaks coerces to default.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend, 0);
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD via the streak detector", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10100),
      mrrSnap(2, 10200),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend, 2, -50);
    expect(cov.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    // 1% and 1% transitions don't cross the 25% floor.
    expect(cov.metrics_with_streak).toBe(0);
  });
});

describe("computeDigestSnapshotPctChangeStreakCoverage — bucket-counts", () => {
  it("counts a single metric with a length-2 streak", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000), // +50%
      mrrSnap(2, 10500), // -30%  → length-2 run
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(1);
    expect(cov.min_length).toBe(2);
    expect(cov.max_length).toBe(2);
    expect(cov.median_length).toBe(2);
    // coverage_rate = 1 / HEADLINE_METRICS.length × 100
    const expected =
      Math.round((1 / HEADLINE_METRICS.length) * 1000) / 10;
    expect(cov.coverage_rate_pct).toBe(expected);
  });

  it("counts two metrics with distinct streak lengths and computes median", () => {
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 10000, 10),
      bothSnap(1, 15000, 20), // mrr +50%, churn +100%
      bothSnap(2, 10500, 5), // mrr -30% (len-2), churn -75% (len-2)
      bothSnap(3, 5000, 40), // mrr -52% (len-3), churn +700% (len-3)
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(2);
    expect(cov.min_length).toBe(3);
    expect(cov.max_length).toBe(3);
    expect(cov.median_length).toBe(3);
  });

  it("median linear-interpolates on even count of qualifying metrics", () => {
    // mrr streak length 2, churn streak length 3 → sorted [2,3] → median 2.5.
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 10000, 10),
      bothSnap(1, 15000, 20), // mrr +50%, churn +100%
      bothSnap(2, 10500, 5), // mrr -30% (len-2 for mrr), churn -75% (len-2)
      bothSnap(3, 10600, 40), // mrr +0.9% breaks mrr streak at 2, churn +700% (len-3)
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(2);
    expect(cov.min_length).toBe(2);
    expect(cov.max_length).toBe(3);
    expect(cov.median_length).toBe(2.5);
  });

  it("caller-widened min length can drop a length-2 metric from coverage", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
      mrrSnap(2, 10500),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend, 3);
    expect(cov.min_streak_length).toBe(3);
    expect(cov.metrics_with_streak).toBe(0);
    expect(cov.coverage_rate_pct).toBe(0);
    expect(cov.min_length).toBeNull();
  });

  it("sub-threshold moves produce zero coverage", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10500), // +5%
      mrrSnap(2, 10800), // +2.9%
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(0);
    expect(cov.coverage_rate_pct).toBe(0);
    expect(cov.max_length).toBeNull();
  });

  it("launch-week (prev=0) transitions cannot fabricate a streak", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 0),
      mrrSnap(1, 15000), // undefined pct — filtered
      mrrSnap(2, 10500), // -30% but only one qualifying transition after break
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(0);
  });

  it("mid-window null total severs a would-be streak", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000), // +50%
      churnSnap(2, 20), // mrr absent for W30 → null point
      mrrSnap(3, 10500), // -30% but the streak was severed
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(0);
  });
});

describe("formatDigestSnapshotPctChangeStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(formatDigestSnapshotPctChangeStreakCoverageSection(cov)).toBe("");
  });

  it("returns empty when zero metrics qualify", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10500),
      mrrSnap(2, 10800),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    expect(formatDigestSnapshotPctChangeStreakCoverageSection(cov)).toBe("");
  });

  it("renders the six-column topline table when at least one metric qualifies", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
      mrrSnap(2, 10500),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    const html = formatDigestSnapshotPctChangeStreakCoverageSection(cov);
    expect(html).toContain("Total metrics");
    expect(html).toContain("With streak");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain(String(HEADLINE_METRICS.length));
    // Threshold + min_streak_length echoed into the preamble.
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+ consecutive`);
    // Week labels round-tripped.
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
  });

  it("HTML-escapes the week labels", () => {
    const trend = computeDigestSnapshotRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 15000 }] },
      }),
      snap("W3\"quote", T(14), {
        attributed_mrr: { rows: [{ mrr_cents: 10500 }] },
      }),
    ]);
    const cov = computeDigestSnapshotPctChangeStreakCoverage(trend);
    const html = formatDigestSnapshotPctChangeStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
  });
});
