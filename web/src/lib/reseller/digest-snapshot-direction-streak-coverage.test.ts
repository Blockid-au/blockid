import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import {
  computeDigestSnapshotDirectionStreakCoverage,
  formatDigestSnapshotDirectionStreakCoverageSection,
} from "./digest-snapshot-direction-streak-coverage";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-direction-streaks";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";

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

function bothSnap(idx: number, mrrCents: number, churnCount: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: mrrCents }] },
    attributed_churn_30d: { rows: [{ churned_count: churnCount }] },
  });
}

describe("computeDigestSnapshotDirectionStreakCoverage — shape", () => {
  it("passes through window metadata + tuning constant + fixed denominator", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    // Denominator is the canonical KPI ladder length, NOT the observed count.
    expect(cov.total_metrics).toBe(HEADLINE_METRICS.length);
  });

  it("returns empty coverage on empty trend", () => {
    const cov = computeDigestSnapshotDirectionStreakCoverage(
      computeDigestSnapshotRollingTrend([]),
    );
    expect(cov.metrics_with_streak).toBe(0);
    expect(cov.metrics_up_streak).toBe(0);
    expect(cov.metrics_down_streak).toBe(0);
    // coverage_rate_pct is 0.0 (not null) when total_metrics > 0 and none qualify.
    expect(cov.coverage_rate_pct).toBe(0);
    expect(cov.up_coverage_rate_pct).toBe(0);
    expect(cov.down_coverage_rate_pct).toBe(0);
    expect(cov.min_length).toBeNull();
    expect(cov.max_length).toBeNull();
    expect(cov.median_length).toBeNull();
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the detector", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend, 0);
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength via the detector", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend, 3.7);
    expect(cov.min_streak_length).toBe(3);
  });
});

describe("computeDigestSnapshotDirectionStreakCoverage — bucket counts", () => {
  it("counts a single up-streak metric", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000), // +
      mrrSnap(2, 15000), // +  -> length-2 up run
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(1);
    expect(cov.metrics_up_streak).toBe(1);
    expect(cov.metrics_down_streak).toBe(0);
    expect(cov.min_length).toBe(2);
    expect(cov.max_length).toBe(2);
    expect(cov.median_length).toBe(2);
    const expected = Math.round((1 / HEADLINE_METRICS.length) * 1000) / 10;
    expect(cov.coverage_rate_pct).toBe(expected);
    expect(cov.up_coverage_rate_pct).toBe(expected);
    expect(cov.down_coverage_rate_pct).toBe(0);
  });

  it("counts a single down-streak metric", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 15000),
      mrrSnap(1, 12000), // -
      mrrSnap(2, 10000), // -  -> length-2 down run
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(1);
    expect(cov.metrics_up_streak).toBe(0);
    expect(cov.metrics_down_streak).toBe(1);
    const expected = Math.round((1 / HEADLINE_METRICS.length) * 1000) / 10;
    expect(cov.coverage_rate_pct).toBe(expected);
    expect(cov.up_coverage_rate_pct).toBe(0);
    expect(cov.down_coverage_rate_pct).toBe(expected);
  });

  it("splits up vs down across two metrics moving opposite directions", () => {
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 10000, 30),
      bothSnap(1, 12000, 20), // mrr +, churn -
      bothSnap(2, 15000, 10), // mrr +, churn -  -> mrr up-len-2, churn down-len-2
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(2);
    expect(cov.metrics_up_streak).toBe(1);
    expect(cov.metrics_down_streak).toBe(1);
    expect(cov.min_length).toBe(2);
    expect(cov.max_length).toBe(2);
    expect(cov.median_length).toBe(2);
  });

  it("median linear-interpolates on even count of qualifying metrics", () => {
    // mrr up-len-3, churn down-len-2 -> sorted [2,3] -> median 2.5.
    const trend = computeDigestSnapshotRollingTrend([
      bothSnap(0, 10000, 30),
      bothSnap(1, 12000, 20), // mrr +, churn -
      bothSnap(2, 15000, 10), // mrr +, churn -   (mrr up-2, churn down-2)
      bothSnap(3, 20000, 15), // mrr +, churn +   (mrr up-3, churn resets to up-1)
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    // mrr longest streak = up-3; churn longest streak = down-2 (broken by final +5).
    expect(cov.metrics_with_streak).toBe(2);
    expect(cov.metrics_up_streak).toBe(1);
    expect(cov.metrics_down_streak).toBe(1);
    expect(cov.min_length).toBe(2);
    expect(cov.max_length).toBe(3);
    expect(cov.median_length).toBe(2.5);
  });

  it("caller-widened min length can drop a length-2 metric from coverage", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend, 3);
    expect(cov.min_streak_length).toBe(3);
    expect(cov.metrics_with_streak).toBe(0);
    expect(cov.coverage_rate_pct).toBe(0);
    expect(cov.up_coverage_rate_pct).toBe(0);
    expect(cov.down_coverage_rate_pct).toBe(0);
    expect(cov.min_length).toBeNull();
    expect(cov.max_length).toBeNull();
    expect(cov.median_length).toBeNull();
  });

  it("flat transitions do not produce a streak", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10000),
      mrrSnap(2, 10000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(0);
  });

  it("mid-window null total severs a would-be streak", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000), // +
      churnSnap(2, 20), // mrr absent for W30 -> null point
      mrrSnap(3, 15000), // +, but the run was severed
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(cov.metrics_with_streak).toBe(0);
  });
});

describe("formatDigestSnapshotDirectionStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(formatDigestSnapshotDirectionStreakCoverageSection(cov)).toBe("");
  });

  it("returns empty when zero metrics qualify (all flat)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10000),
      mrrSnap(2, 10000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    expect(formatDigestSnapshotDirectionStreakCoverageSection(cov)).toBe("");
  });

  it("renders the ten-column topline table when at least one metric qualifies", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    const html = formatDigestSnapshotDirectionStreakCoverageSection(cov);
    expect(html).toContain("Total metrics");
    expect(html).toContain("With streak");
    expect(html).toContain("Up");
    expect(html).toContain("Down");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Up rate");
    expect(html).toContain("Down rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain(String(HEADLINE_METRICS.length));
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+ consecutive`);
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
  });

  it("HTML-escapes the week labels", () => {
    const trend = computeDigestSnapshotRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 12000 }] },
      }),
      snap("W3\"quote", T(14), {
        attributed_mrr: { rows: [{ mrr_cents: 15000 }] },
      }),
    ]);
    const cov = computeDigestSnapshotDirectionStreakCoverage(trend);
    const html = formatDigestSnapshotDirectionStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
  });
});
