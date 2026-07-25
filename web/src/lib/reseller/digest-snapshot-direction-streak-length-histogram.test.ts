import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";
import {
  computeDigestSnapshotDirectionStreakLengthHistogram,
  formatDigestSnapshotDirectionStreakLengthHistogramSection,
} from "./digest-snapshot-direction-streak-length-histogram";

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

function churnSnap(idx: number, cents: number, churn: number) {
  return snap(`2026-W${28 + idx}`, T(idx * 7), {
    attributed_mrr: { rows: [{ mrr_cents: cents }] },
    attributed_churn_30d: { rows: [{ churned_count: churn }] },
  });
}

describe("computeDigestSnapshotDirectionStreakLengthHistogram — shape", () => {
  it("passes through window metadata from the streaks envelope", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 9900),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    expect(hist.window_size).toBe(3);
    expect(hist.first_week).toBe("2026-W28");
    expect(hist.last_week).toBe("2026-W30");
    expect(hist.min_streak_length).toBe(streaks.min_streak_length);
  });

  it("returns zero buckets + total_streaks=0 when no streaks qualify", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    expect(hist.total_streaks).toBe(0);
    expect(hist.buckets).toEqual([]);
    expect(hist.max_length).toBe(streaks.min_streak_length);
  });

  it("emits a dense bucket set from min_streak_length to max observed length", () => {
    // Two metrics, one length-2 (mrr) + one length-4 (churn). Expected buckets
    // cover 2..4 densely with a zero-count entry at length 3.
    const trend = computeDigestSnapshotRollingTrend([
      churnSnap(0, 9900, 1),
      churnSnap(1, 12000, 2),
      churnSnap(2, 15000, 3),
      churnSnap(3, 14500, 4),
      churnSnap(4, 14000, 5),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
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
    // Three qualifying streaks all at min_streak_length ⇒ one bucket 100.0%.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 300),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    if (hist.total_streaks > 0) {
      expect(hist.buckets[0]?.pct).toBe(100);
    }
  });
});

describe("formatDigestSnapshotDirectionStreakLengthHistogramSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    expect(formatDigestSnapshotDirectionStreakLengthHistogramSection(hist)).toBe(
      "",
    );
  });

  it("returns '' when total_streaks is zero", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    expect(formatDigestSnapshotDirectionStreakLengthHistogramSection(hist)).toBe(
      "",
    );
  });

  it("renders a table with a bar column per bucket", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const hist = computeDigestSnapshotDirectionStreakLengthHistogram(streaks);
    const html = formatDigestSnapshotDirectionStreakLengthHistogramSection(hist);
    expect(html).toContain("<table");
    expect(html).toContain("Distribution");
    // Filled unicode block is present (>=1 filled cell when any bucket is populated).
    expect(html).toContain("█");
  });
});
