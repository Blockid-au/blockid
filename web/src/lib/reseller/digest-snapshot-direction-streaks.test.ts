import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotDirectionStreaks,
  formatDigestSnapshotDirectionStreaksSection,
} from "./digest-snapshot-direction-streaks";

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

describe("computeDigestSnapshotDirectionStreaks — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 9900),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    expect(streaks.window_size).toBe(3);
    expect(streaks.first_week).toBe("2026-W28");
    expect(streaks.last_week).toBe("2026-W30");
    expect(streaks.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("returns empty rows on empty trend", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    expect(streaks.window_size).toBe(0);
    expect(streaks.rows).toEqual([]);
  });

  it("handles a malformed trend (non-array metrics coerced to empty)", () => {
    const streaks = computeDigestSnapshotDirectionStreaks({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      metrics: undefined as unknown as never,
    });
    expect(streaks.rows).toEqual([]);
    expect(streaks.window_size).toBe(4);
  });

  it("coerces minStreakLength < 1 to DEFAULT_MIN_STREAK_LENGTH", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    expect(computeDigestSnapshotDirectionStreaks(trend, 0).min_streak_length).toBe(
      DEFAULT_MIN_STREAK_LENGTH,
    );
    expect(computeDigestSnapshotDirectionStreaks(trend, -5).min_streak_length).toBe(
      DEFAULT_MIN_STREAK_LENGTH,
    );
    expect(computeDigestSnapshotDirectionStreaks(trend, NaN).min_streak_length).toBe(
      DEFAULT_MIN_STREAK_LENGTH,
    );
  });

  it("floors fractional minStreakLength", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    expect(computeDigestSnapshotDirectionStreaks(trend, 3.7).min_streak_length).toBe(
      3,
    );
  });
});

describe("computeDigestSnapshotDirectionStreaks — detection", () => {
  it("detects a monotonically increasing 3-week window (length 2 up-streak)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 9900),
      mrrSnap(1, 12000),
      mrrSnap(2, 15000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const mrr = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.direction).toBe("up");
    expect(mrr!.length).toBe(2);
    expect(mrr!.first_week).toBe("2026-W28");
    expect(mrr!.last_week).toBe("2026-W30");
    expect(mrr!.start_total).toBe(9900);
    expect(mrr!.end_total).toBe(15000);
    expect(mrr!.cumulative_delta).toBe(5100);
  });

  it("detects a monotonically decreasing 4-week window (length 3 down-streak)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 20000),
      mrrSnap(1, 18000),
      mrrSnap(2, 14000),
      mrrSnap(3, 10000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend);
    const mrr = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr!.direction).toBe("down");
    expect(mrr!.length).toBe(3);
    expect(mrr!.cumulative_delta).toBe(-10000);
  });

  it("excludes a metric whose longest streak is below minStreakLength", () => {
    // 3-point series with sign flip: up then down → longest streak length 1.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 9900),
      mrrSnap(1, 12000),
      mrrSnap(2, 8000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(streaks.rows.find((r) => r.key === "attributed_mrr")).toBeUndefined();
  });

  it("returns the longest run when two runs share a window", () => {
    // Pattern: 100 → 200 → 300 → 250 → 240 → 230 → 220 (up 2, down 4)
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 300),
      mrrSnap(3, 250),
      mrrSnap(4, 240),
      mrrSnap(5, 230),
      mrrSnap(6, 220),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const mrr = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr!.direction).toBe("down");
    expect(mrr!.length).toBe(4);
    expect(mrr!.start_total).toBe(300);
    expect(mrr!.end_total).toBe(220);
    expect(mrr!.cumulative_delta).toBe(-80);
  });

  it("a zero transition breaks the streak (flat weeks are not up or down)", () => {
    // 100 → 200 → 200 → 300 → 400: two length-1 up runs bracketing a flat.
    // Longest streak is length 2 (the trailing 200→300→400 run).
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 200),
      mrrSnap(3, 300),
      mrrSnap(4, 400),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const mrr = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr!.direction).toBe("up");
    expect(mrr!.length).toBe(2);
    expect(mrr!.start_total).toBe(200);
    expect(mrr!.end_total).toBe(400);
  });

  it("all-flat series produces no streak row", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 100),
      mrrSnap(2, 100),
      mrrSnap(3, 100),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(streaks.rows.find((r) => r.key === "attributed_mrr")).toBeUndefined();
  });

  it("a null point breaks the streak (mid-window gap is signal loss)", () => {
    // 100 → 200 → skipped → 300 → 400: streak = 1 (leading) + 1 (trailing).
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      snap("2026-W30", T(14), { attributed_mrr: { skipped_reason: "gap" } }),
      mrrSnap(3, 300),
      mrrSnap(4, 400),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(streaks.rows.find((r) => r.key === "attributed_mrr")).toBeUndefined();
  });

  it("null point does not extend a streak across the gap (2 up + gap + 2 up = length 1 each)", () => {
    // Series with a null in the middle — pre-gap and post-gap runs both hit
    // length 1 (each has only two non-null neighbours), so with min=2 nothing
    // qualifies. The check guards against a naive implementation that treats
    // the gap as a continuation.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      snap("2026-W30", T(14), { attributed_mrr: { skipped_reason: "gap" } }),
      mrrSnap(3, 300),
      mrrSnap(4, 400),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    // Confirms zero rows across the entire metric set — no fabricated
    // "3-week up" streak that spans the gap.
    expect(streaks.rows).toEqual([]);
  });

  it("sorts qualified streaks by length desc", () => {
    // attributed_mrr: length 4 down (100→90→80→70→60→...→70). attributed_churn_30d: length 2 up.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 100 }] },
        attributed_churn_30d: { rows: [{ churned_count: 1 }] },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 90 }] },
        attributed_churn_30d: { rows: [{ churned_count: 2 }] },
      }),
      snap("2026-W30", T(14), {
        attributed_mrr: { rows: [{ mrr_cents: 80 }] },
        attributed_churn_30d: { rows: [{ churned_count: 3 }] },
      }),
      snap("2026-W31", T(21), {
        attributed_mrr: { rows: [{ mrr_cents: 70 }] },
        attributed_churn_30d: { rows: [{ churned_count: 3 }] }, // flat → breaks
      }),
      snap("2026-W32", T(28), {
        attributed_mrr: { rows: [{ mrr_cents: 60 }] },
        attributed_churn_30d: { rows: [{ churned_count: 4 }] },
      }),
    ];
    const trend = computeDigestSnapshotRollingTrend(snaps);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(streaks.rows[0].key).toBe("attributed_mrr");
    expect(streaks.rows[0].length).toBe(4);
    // Longer window may or may not include churn depending on flat-break; if
    // it does, it MUST rank after mrr because mrr's length is strictly greater.
    for (let i = 1; i < streaks.rows.length; i++) {
      expect(streaks.rows[i].length).toBeLessThanOrEqual(streaks.rows[i - 1].length);
    }
  });
});

describe("formatDigestSnapshotDirectionStreaksSection", () => {
  it("returns empty string when window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(formatDigestSnapshotDirectionStreaksSection(streaks)).toBe("");
  });

  it("returns empty string when no metric qualifies", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 100), // sign flip → longest streak length 1
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    expect(formatDigestSnapshotDirectionStreaksSection(streaks)).toBe("");
  });

  it("renders an HTML table with direction arrows + formatted cells", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 20000),
      mrrSnap(1, 15000),
      mrrSnap(2, 10000),
      mrrSnap(3, 5000),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotDirectionStreaksSection(streaks);
    expect(html).toContain("Sustained-direction streaks");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
    expect(html).toContain("&darr;");
    expect(html).toContain("down");
    expect(html).toContain("A$200.00");
    expect(html).toContain("A$50.00");
    // Cumulative delta on cents metric renders with sign + A$ prefix.
    expect(html).toContain("-A$150.00");
  });

  it("renders count-unit metrics without the A$ prefix", () => {
    const snaps = [0, 1, 2, 3].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_churn_30d: { rows: [{ churned_count: i + 1 }] },
      }),
    );
    const trend = computeDigestSnapshotRollingTrend(snaps);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotDirectionStreaksSection(streaks);
    expect(html).toContain("&uarr;");
    expect(html).toContain("up");
    expect(html).toContain("+3"); // cumulative delta 1 → 4
    expect(html).not.toContain("A$3");
  });

  it("escapes HTML in week labels + metric names", () => {
    const trend = computeDigestSnapshotRollingTrend([
      snap("<w0>", T(0), { attributed_mrr: { rows: [{ mrr_cents: 100 }] } }),
      snap("<w1>", T(7), { attributed_mrr: { rows: [{ mrr_cents: 200 }] } }),
      snap("<w2>", T(14), { attributed_mrr: { rows: [{ mrr_cents: 300 }] } }),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotDirectionStreaksSection(streaks);
    expect(html).not.toContain("<w0>");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w2&gt;");
  });

  it("highlights down streaks (background style applied)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 300),
      mrrSnap(1, 200),
      mrrSnap(2, 100),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotDirectionStreaksSection(streaks);
    expect(html).toContain('background:#fff8e1');
  });

  it("does not highlight up streaks", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 100),
      mrrSnap(1, 200),
      mrrSnap(2, 300),
    ]);
    const streaks = computeDigestSnapshotDirectionStreaks(trend, 2);
    const html = formatDigestSnapshotDirectionStreaksSection(streaks);
    // No highlight row-attribute for the up streak
    expect(html).not.toContain('background:#fff8e1');
    expect(html).toContain("&uarr;");
  });
});
