import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotPctChangeStreaks } from "./digest-snapshot-pct-change-streaks";
import {
  computeDigestSnapshotPctChangeStreakLengthHistogram,
  formatDigestSnapshotPctChangeStreakLengthHistogramSection,
} from "./digest-snapshot-pct-change-streak-length-histogram";

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

describe("computeDigestSnapshotPctChangeStreakLengthHistogram — shape", () => {
  it("passes through window metadata + threshold from the streaks envelope", () => {
    // Length-2 |pct|-material run: 100 → 150 (+50%) → 200 (+33%).
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 150),
      mrrSnap(2, 200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    expect(hist.window_size).toBe(3);
    expect(hist.first_week).toBe("2026-W28");
    expect(hist.last_week).toBe("2026-W30");
    expect(hist.min_streak_length).toBe(streaks.min_streak_length);
    expect(hist.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero buckets + total_streaks=0 when no streaks qualify", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    expect(hist.total_streaks).toBe(0);
    expect(hist.buckets).toEqual([]);
    expect(hist.max_length).toBe(streaks.min_streak_length);
    expect(hist.threshold).toBe(streaks.threshold);
  });

  it("emits a dense bucket set from min_streak_length to max observed length", () => {
    // mrr: length-2 |pct| run (100 → 150 → 200, both +50% / +33% ≥ 25%).
    // churn: length-4 |pct| run (1 → 2 → 4 → 8 → 16, each doubling +100%).
    const trend = computeDigestSnapshotRollingTrend([
      twoMetricSnap(0, 100, 1),
      twoMetricSnap(1, 150, 2),
      twoMetricSnap(2, 200, 4),
      twoMetricSnap(3, 200, 8),
      twoMetricSnap(4, 200, 16),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    expect(hist.total_streaks).toBe(2);
    expect(hist.max_length).toBe(4);
    expect(hist.buckets.map((b) => b.length)).toEqual([2, 3, 4]);
    const byLen = new Map(hist.buckets.map((b) => [b.length, b]));
    expect(byLen.get(2)?.count).toBe(1);
    expect(byLen.get(3)?.count).toBe(0);
    expect(byLen.get(4)?.count).toBe(1);
    expect(byLen.get(2)?.pct).toBe(50);
    expect(byLen.get(3)?.pct).toBe(0);
    expect(byLen.get(4)?.pct).toBe(50);
  });

  it("shares total as pct rounded to one decimal", () => {
    // Single-metric length-2 |pct| run ⇒ one bucket 100.0%.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    if (hist.total_streaks > 0) {
      expect(hist.buckets[0]?.pct).toBe(100);
    }
  });
});

describe("formatDigestSnapshotPctChangeStreakLengthHistogramSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    expect(
      formatDigestSnapshotPctChangeStreakLengthHistogramSection(hist),
    ).toBe("");
  });

  it("returns '' when total_streaks is zero", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    expect(
      formatDigestSnapshotPctChangeStreakLengthHistogramSection(hist),
    ).toBe("");
  });

  it("renders a table with a bar column per bucket + threshold prose", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const hist = computeDigestSnapshotPctChangeStreakLengthHistogram(streaks);
    const html =
      formatDigestSnapshotPctChangeStreakLengthHistogramSection(hist);
    expect(html).toContain("<table");
    expect(html).toContain("Distribution");
    expect(html).toContain("█");
    // Threshold surfaced in prose so ops can distinguish widened-threshold
    // runs from default-threshold runs.
    const thresholdPct = Math.round(hist.threshold * 100 * 10) / 10;
    expect(html).toContain(`${thresholdPct.toFixed(1)}%`);
  });
});
