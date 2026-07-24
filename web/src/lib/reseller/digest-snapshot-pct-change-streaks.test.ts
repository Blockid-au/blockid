import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotRollingTrend } from "./digest-snapshot-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_MIN_STREAK_LENGTH,
  computeDigestSnapshotPctChangeStreaks,
  formatDigestSnapshotPctChangeStreaksSection,
} from "./digest-snapshot-pct-change-streaks";

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

describe("computeDigestSnapshotPctChangeStreaks — shape", () => {
  it("passes through window metadata + defaults", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
      mrrSnap(2, 10500),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    expect(streaks.window_size).toBe(3);
    expect(streaks.first_week).toBe("2026-W28");
    expect(streaks.last_week).toBe("2026-W30");
    expect(streaks.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(streaks.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on empty trend", () => {
    const streaks = computeDigestSnapshotPctChangeStreaks(
      computeDigestSnapshotRollingTrend([]),
    );
    expect(streaks.rows).toEqual([]);
    expect(streaks.window_size).toBe(0);
  });

  it("coerces non-array metrics to empty", () => {
    const streaks = computeDigestSnapshotPctChangeStreaks({
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
    expect(
      computeDigestSnapshotPctChangeStreaks(trend, 0).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPctChangeStreaks(trend, -3).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPctChangeStreaks(trend, NaN).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    expect(
      computeDigestSnapshotPctChangeStreaks(trend, 3.7).min_streak_length,
    ).toBe(3);
  });

  it("coerces non-positive threshold to PCT_CHANGE_MATERIAL_THRESHOLD", () => {
    const trend = computeDigestSnapshotRollingTrend([]);
    expect(computeDigestSnapshotPctChangeStreaks(trend, 2, 0).threshold).toBe(
      PCT_CHANGE_MATERIAL_THRESHOLD,
    );
    expect(computeDigestSnapshotPctChangeStreaks(trend, 2, -5).threshold).toBe(
      PCT_CHANGE_MATERIAL_THRESHOLD,
    );
    expect(
      computeDigestSnapshotPctChangeStreaks(trend, 2, NaN).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPctChangeStreaks — streak walker", () => {
  it("surfaces a length-2 run of sign-alternating |pct| swings", () => {
    // 10000 → 13000 (+30%) → 9750 (-25%) → 12200 (+25.1%)
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000),
      mrrSnap(2, 9750),
      mrrSnap(3, 12200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const row = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(row).toBeDefined();
    expect(row!.length).toBe(3);
    expect(row!.first_week).toBe("2026-W28");
    expect(row!.last_week).toBe("2026-W31");
    expect(row!.transitions.map((t) => t.pct_change)).toEqual([30, -25, 25.1]);
  });

  it("breaks the streak on a sub-threshold transition", () => {
    // 10000 → 13000 (+30%) → 13800 (+6.2%, sub-threshold) → 18000 (+30.4%)
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000),
      mrrSnap(2, 13800),
      mrrSnap(3, 18000),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend, 2);
    // Two isolated material transitions (length-1 each) — neither reaches
    // the default min length of 2 so the row drops out.
    expect(streaks.rows).toEqual([]);
  });

  it("breaks the streak on a launch-week (prev=0) transition", () => {
    // 0 → 5000 (undefined) → 7000 (+40%) → 3000 (-57.1%) → 4000 (+33.3%)
    // Streak starts from the 5000 → 7000 transition since 0 → 5000 is a
    // launch-week transition and gets suppressed.
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 0),
      mrrSnap(1, 5000),
      mrrSnap(2, 7000),
      mrrSnap(3, 3000),
      mrrSnap(4, 4000),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const row = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(row).toBeDefined();
    expect(row!.length).toBe(3);
    expect(row!.first_week).toBe("2026-W29");
    expect(row!.last_week).toBe("2026-W32");
  });

  it("breaks the streak on a null point (mid-window gap)", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000), // +50%
      snap("2026-W30", T(14), {}), // null (section absent)
      mrrSnap(3, 20000),
      mrrSnap(4, 30000), // +50%
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    // Two isolated length-1 runs — neither reaches min length 2.
    const row = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(row).toBeUndefined();
  });

  it("captures min/max |pct| per row", () => {
    // +30, -50, +26 → max 50, min 26
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000),
      mrrSnap(2, 6500),
      mrrSnap(3, 8190),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const row = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(row!.max_abs_pct).toBe(50);
    expect(row!.min_abs_pct).toBe(26);
  });

  it("respects a caller-widened min streak length", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000), // +30
      mrrSnap(2, 9750), // -25
    ]);
    const rowsDefault = computeDigestSnapshotPctChangeStreaks(trend, 2);
    expect(rowsDefault.rows).toHaveLength(1);
    const rowsWide = computeDigestSnapshotPctChangeStreaks(trend, 3);
    expect(rowsWide.rows).toEqual([]);
  });

  it("keeps the earlier-starting run on tied lengths", () => {
    // +30, +40, -10 (sub), +30, +40 → two length-2 runs; earlier one wins
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000), // +30
      mrrSnap(2, 18200), // +40
      mrrSnap(3, 16400), // -9.9 (sub-threshold)
      mrrSnap(4, 21320), // +30
      mrrSnap(5, 29850), // +40
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const row = streaks.rows.find((r) => r.key === "attributed_mrr");
    expect(row!.length).toBe(2);
    expect(row!.first_week).toBe("2026-W28");
    expect(row!.last_week).toBe("2026-W30");
  });

  it("emits deterministic ordering (length desc, spec order tie-break)", () => {
    // attributed_mrr: length 2; attributed_churn_30d: length 2; MRR wins by spec order.
    const trend = computeDigestSnapshotRollingTrend([
      snap("2026-W28", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
        attributed_churn_30d: { rows: [{ churned_count: 100 }] },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 14000 }] }, // +40
        attributed_churn_30d: { rows: [{ churned_count: 200 }] }, // +100
      }),
      snap("2026-W30", T(14), {
        attributed_mrr: { rows: [{ mrr_cents: 10000 }] }, // -28.6
        attributed_churn_30d: { rows: [{ churned_count: 100 }] }, // -50
      }),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const keys = streaks.rows.map((r) => r.key);
    expect(keys.indexOf("attributed_mrr")).toBeLessThan(
      keys.indexOf("attributed_churn_30d"),
    );
  });
});

describe("formatDigestSnapshotPctChangeStreaksSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 15000),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    expect(formatDigestSnapshotPctChangeStreaksSection(streaks)).toBe("");
  });

  it("returns empty on zero qualifying rows", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 10100),
      mrrSnap(2, 10200),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    expect(formatDigestSnapshotPctChangeStreaksSection(streaks)).toBe("");
  });

  it("renders headers, length column, and transitions cell", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000), // +30
      mrrSnap(2, 9750), // -25
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const html = formatDigestSnapshotPctChangeStreaksSection(streaks);
    expect(html).toContain("Sustained |pct|-material streaks");
    expect(html).toContain("Length");
    expect(html).toContain("Transitions");
    expect(html).toContain("+30.0%");
    expect(html).toContain("-25.0%");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
  });

  it("HTML-escapes week labels", () => {
    const trend = computeDigestSnapshotRollingTrend([
      snap("<script>W28", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
      }),
      snap("<script>W29", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 13000 }] },
      }),
      snap("<script>W30", T(14), {
        attributed_mrr: { rows: [{ mrr_cents: 9750 }] },
      }),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const html = formatDigestSnapshotPctChangeStreaksSection(streaks);
    expect(html).not.toContain("<script>W");
    expect(html).toContain("&lt;script&gt;W28");
  });

  it("references the threshold constant in the preamble", () => {
    const trend = computeDigestSnapshotRollingTrend([
      mrrSnap(0, 10000),
      mrrSnap(1, 13000),
      mrrSnap(2, 9750),
    ]);
    const streaks = computeDigestSnapshotPctChangeStreaks(trend);
    const html = formatDigestSnapshotPctChangeStreaksSection(streaks);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
  });
});
