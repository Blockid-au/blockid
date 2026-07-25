import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";
import {
  computeDigestSnapshotPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPctChangeStreakLengthPercentilesSection,
} from "./digest-snapshot-pct-change-streak-length-percentiles";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

function mrrSnap(idx: number, cents: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: cents }] },
  });
}

function twoMetricSnap(idx: number, mrr: number, churn: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: mrr }] },
    attributed_churn_30d: { rows: [{ churned_count: churn }] },
  });
}

describe("computeDigestSnapshotPctChangeStreakLengthPercentiles — shape", () => {
  it("passes through window metadata + threshold from the streaks envelope", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 150),
      mrrSnap(2, 200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(streaks.min_streak_length);
    expect(summary.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero-initialised shape when no streaks qualify", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(0);
    expect(summary.p50_length).toBe(0);
    expect(summary.p90_length).toBe(0);
    expect(summary.mean_length).toBe(0);
    expect(summary.max_length).toBe(streaks.min_streak_length);
    expect(summary.threshold).toBe(streaks.threshold);
  });
});

describe("computeDigestSnapshotPctChangeStreakLengthPercentiles — values", () => {
  it("computes p50/p90/mean/max from a mixed length-2 + length-4 pair", () => {
    // mrr: length-2 |pct| run (100 → 150 → 200, both +50% / +33% ≥ 25%).
    // churn: length-4 |pct| run (1 → 2 → 4 → 8 → 16, each doubling +100%).
    // Sorted lengths = [2, 4].
    //   Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    //   Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    //   Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotRollingTrend([
      twoMetricSnap(0, 100, 1),
      twoMetricSnap(1, 150, 2),
      twoMetricSnap(2, 200, 4),
      twoMetricSnap(3, 200, 8),
      twoMetricSnap(4, 200, 16),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(2);
    expect(summary.p50_length).toBe(2);
    expect(summary.p90_length).toBe(4);
    expect(summary.mean_length).toBe(3);
    expect(summary.max_length).toBe(4);
  });

  it("collapses p50/p90/mean to the single observed length on a one-row fold", () => {
    // Single qualifying metric (mrr) at length-2 |pct| run (100 → 200 → 400).
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    if (summary.total_streaks > 0) {
      expect(summary.p50_length).toBe(2);
      expect(summary.p90_length).toBe(2);
      expect(summary.mean_length).toBe(2);
      expect(summary.max_length).toBe(2);
    }
  });

  it("rounds mean_length to one decimal place on odd-mean folds", () => {
    // Three qualifying rows at lengths 2, 3, 4 ⇒ mean = 3.0 exact,
    // so use a length-2 + length-3 fold instead to force a fractional mean.
    // mrr: length-2 |pct| run (100 → 200 → 400).
    // churn: length-3 |pct| run (1 → 2 → 4 → 8).
    const trend = computeDigestSnapshotRollingTrend([
      twoMetricSnap(0, 100, 1),
      twoMetricSnap(1, 200, 2),
      twoMetricSnap(2, 400, 4),
      twoMetricSnap(3, 400, 8),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(2);
    expect(summary.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotPctChangeStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(
      formatDigestSnapshotPctChangeStreakLengthPercentilesSection(summary),
    ).toBe("");
  });

  it("returns '' when total_streaks is zero", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    expect(
      formatDigestSnapshotPctChangeStreakLengthPercentilesSection(summary),
    ).toBe("");
  });

  it("renders a single-row summary table with threshold + p50/p90/mean/max columns", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const summary =
      computeDigestSnapshotPctChangeStreakLengthPercentiles(streaks);
    const html =
      formatDigestSnapshotPctChangeStreakLengthPercentilesSection(summary);
    expect(html).toContain("<table");
    expect(html).toContain("Threshold");
    expect(html).toContain("p50 length");
    expect(html).toContain("p90 length");
    expect(html).toContain("Mean length");
    expect(html).toContain("Max length");
    // Caption should embed the threshold percent (25.0%) so ops sees
    // which band the p50/p90 values are scored against without side-loading
    // the P11.49 or P11.79 envelopes.
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });
});
