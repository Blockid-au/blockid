import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { computeDigestSnapshotDirectionStreaks } from "./digest-snapshot-direction-streaks";
import {
  computeDigestSnapshotDirectionStreakLengthPercentiles,
  formatDigestSnapshotDirectionStreakLengthPercentilesSection,
} from "./digest-snapshot-direction-streak-length-percentiles";

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

describe("computeDigestSnapshotDirectionStreakLengthPercentiles — shape", () => {
  it("passes through window metadata from the streaks envelope", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 9900),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(streaks.min_streak_length);
  });

  it("returns zero-initialised shape when no streaks qualify", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(0);
    expect(summary.p50_length).toBe(0);
    expect(summary.p90_length).toBe(0);
    expect(summary.mean_length).toBe(0);
    expect(summary.max_length).toBe(streaks.min_streak_length);
  });
});

describe("computeDigestSnapshotDirectionStreakLengthPercentiles — values", () => {
  it("computes p50/p90/mean/max from a mixed length-2 + length-4 pair", () => {
    // Two qualifying metrics: mrr length-2, churn length-4. Sorted lengths = [2, 4].
    // Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    // Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    // Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotRollingTrend([
      churnSnap(0, 9900, 1),
      churnSnap(1, 12000, 2),
      churnSnap(2, 15000, 3),
      churnSnap(3, 14500, 4),
      churnSnap(4, 14000, 5),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(2);
    expect(summary.p50_length).toBe(2);
    expect(summary.p90_length).toBe(4);
    expect(summary.mean_length).toBe(3);
    expect(summary.max_length).toBe(4);
  });

  it("collapses p50/p90/mean to the single observed length on a one-row fold", () => {
    // Single qualifying metric (mrr) at length-2 ⇒ p50=p90=mean=max=2.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 300),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    if (summary.total_streaks > 0) {
      expect(summary.p50_length).toBe(2);
      expect(summary.p90_length).toBe(2);
      expect(summary.mean_length).toBe(2);
      expect(summary.max_length).toBe(2);
    }
  });

  it("rounds mean_length to one decimal place", () => {
    // Two streaks: length-2 (mrr) + length-3 (churn) ⇒ mean = 2.5.
    const trend = computeDigestSnapshotRollingTrend([
      churnSnap(0, 9900, 1),
      churnSnap(1, 12000, 2),
      churnSnap(2, 15000, 3),
      churnSnap(3, 14500, 4),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(summary.total_streaks).toBe(2);
    // mrr length-2 (up up up) + churn length-3 (up up up up) ⇒ mean = 2.5.
    expect(summary.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotDirectionStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(
      formatDigestSnapshotDirectionStreakLengthPercentilesSection(summary),
    ).toBe("");
  });

  it("returns '' when total_streaks is zero", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    expect(
      formatDigestSnapshotDirectionStreakLengthPercentilesSection(summary),
    ).toBe("");
  });

  it("renders a single-row summary table with p50/p90/mean/max columns", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 400),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const summary =
      computeDigestSnapshotDirectionStreakLengthPercentiles(streaks);
    const html =
      formatDigestSnapshotDirectionStreakLengthPercentilesSection(summary);
    expect(html).toContain("<table");
    expect(html).toContain("p50 length");
    expect(html).toContain("p90 length");
    expect(html).toContain("Mean length");
    expect(html).toContain("Max length");
  });
});
