import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import {
  DEFAULT_LEADERBOARD_TOP_N,
  computeDigestSnapshotPctChangeStreakLeaderboard,
  formatDigestSnapshotPctChangeStreakLeaderboardSection,
} from "./digest-snapshot-pct-change-streak-leaderboard";

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

describe("computeDigestSnapshotPctChangeStreakLeaderboard — shape", () => {
  it("passes through window metadata + defaults", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]), // +40
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]), // -30
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(board.top_n).toBe(DEFAULT_LEADERBOARD_TOP_N);
  });

  it("returns zero rows on empty trend", () => {
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.rows).toHaveLength(0);
    expect(board.total_qualified).toBe(0);
  });

  it("coerces topN < 1 back to DEFAULT_LEADERBOARD_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(trend, 0).top_n,
    ).toBe(DEFAULT_LEADERBOARD_TOP_N);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(trend, -5).top_n,
    ).toBe(DEFAULT_LEADERBOARD_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(trend, 3.7).top_n,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(
        trend,
        DEFAULT_LEADERBOARD_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(
        trend,
        DEFAULT_LEADERBOARD_TOP_N,
        DEFAULT_MIN_STREAK_LENGTH,
        0,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(
      computeDigestSnapshotPctChangeStreakLeaderboard(
        trend,
        DEFAULT_LEADERBOARD_TOP_N,
        DEFAULT_MIN_STREAK_LENGTH,
        -10,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPctChangeStreakLeaderboard — ranking", () => {
  it("assigns rank 1..N in sort order", () => {
    // INFOVISION mrr: length-3 |pct| run (+40/-30/+50/-40 all >= 25).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]), // +40
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]), // -30
      mrrSnap(3, [mrrRow("INFOVISION", 14700)]), // +50
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.rows[0].rank).toBe(1);
    expect(board.rows[0].reseller_code).toBe("INFOVISION");
    expect(board.rows[0].length).toBe(3);
  });

  it("ranks longer streaks above shorter streaks (persistence-first)", () => {
    // ACME length-3 |pct|-material run; ZEBRA length-2.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 14000), mrrRow("ZEBRA", 14000)]), // both +40
      mrrSnap(2, [mrrRow("ACME", 9800), mrrRow("ZEBRA", 9800)]), // both -30
      mrrSnap(3, [mrrRow("ACME", 14700), mrrRow("ZEBRA", 10000)]), // ACME +50, ZEBRA +2 (breaks streak)
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[0].length).toBe(3);
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
    expect(board.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by cumulative_abs_pct desc (total volatility)", () => {
    // Both length-2.
    // ACME: 10000 → 15000 (+50) → 10000 (-33.3) — cumulative_abs_pct = 83.3
    // ZEBRA: 10000 → 13000 (+30) → 10000 (-23.1 breaks!) — need ZEBRA all >=25 too
    //   ZEBRA: 10000 → 13000 (+30) → 9700 (-25.4) — cumulative_abs_pct = 55.4
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 9700)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[0].cumulative_abs_pct).toBeGreaterThan(
      board.rows[1].cumulative_abs_pct,
    );
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
  });

  it("tiebreaks equal length + equal cumulative_abs_pct by reseller_code asc", () => {
    // Both length-2, mirror-image swings so |pct| sums match.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ZEBRA", 14000), mrrRow("ACME", 14000)]), // both +40
      mrrSnap(2, [mrrRow("ZEBRA", 9800), mrrRow("ACME", 9800)]), // both -30
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
    expect(board.rows[0].cumulative_abs_pct).toBe(
      board.rows[1].cumulative_abs_pct,
    );
  });

  it("cumulative_abs_pct sums |pct| across the qualifying transitions", () => {
    // INFOVISION mrr: 10000 → 14000 (+40) → 9800 (-30) — sum = 70.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(board.rows[0].cumulative_abs_pct).toBeCloseTo(70, 1);
  });
});

describe("computeDigestSnapshotPctChangeStreakLeaderboard — top-N slicing", () => {
  it("slices to topN and reports total_qualified from the pre-slice count", () => {
    // 5 partners all on length-2 |pct|-material runs (same transitions).
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(
        0,
        codes.map((c) => mrrRow(c, 10000)),
      ),
      mrrSnap(
        1,
        codes.map((c) => mrrRow(c, 14000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 9800)),
      ),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend, 3);
    expect(board.top_n).toBe(3);
    expect(board.rows).toHaveLength(3);
    expect(board.total_qualified).toBe(5);
    expect(board.rows.map((r) => r.reseller_code)).toEqual(["A", "B", "C"]);
  });

  it("returns all rows when topN exceeds total_qualified (no padding)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend, 50);
    expect(board.top_n).toBe(50);
    expect(board.rows).toHaveLength(1);
    expect(board.total_qualified).toBe(1);
  });

  it("caller-widened min streak length drops shorter runs before ranking", () => {
    // ACME length-3, ZEBRA length-2. Widen min to 3 → ZEBRA drops.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 14000), mrrRow("ZEBRA", 14000)]),
      mrrSnap(2, [mrrRow("ACME", 9800), mrrRow("ZEBRA", 9800)]),
      mrrSnap(3, [mrrRow("ACME", 14700), mrrRow("ZEBRA", 10000)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(
      trend,
      DEFAULT_LEADERBOARD_TOP_N,
      3,
    );
    expect(board.min_streak_length).toBe(3);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.total_qualified).toBe(1);
  });

  it("caller-widened threshold drops sub-threshold streaks", () => {
    // INFOVISION mrr: +40 / -30 both qualify at default 25. At threshold 45,
    // neither transition qualifies → no rows.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(
      trend,
      DEFAULT_LEADERBOARD_TOP_N,
      DEFAULT_MIN_STREAK_LENGTH,
      45,
    );
    expect(board.threshold).toBe(45);
    expect(board.rows).toHaveLength(0);
    expect(board.total_qualified).toBe(0);
  });
});

describe("computeDigestSnapshotPctChangeStreakLeaderboard — parity with P11.51 detector", () => {
  it("every leaderboard entry has length >= min_streak_length and first_week != last_week", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 14000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 9800)], [churnRow("INFOVISION", 10)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    for (const row of board.rows) {
      expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
      expect(row.first_week).not.toBe(row.last_week);
    }
  });
});

describe("formatDigestSnapshotPctChangeStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    expect(formatDigestSnapshotPctChangeStreakLeaderboardSection(board)).toBe(
      "",
    );
  });

  it("returns empty on zero qualifying rows", () => {
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(formatDigestSnapshotPctChangeStreakLeaderboardSection(board)).toBe(
      "",
    );
  });

  it("renders the leaderboard table with rank + partner + metric + length + window + max/min/cumulative |pct| columns", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    const html = formatDigestSnapshotPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Partner");
    expect(html).toContain("Section");
    expect(html).toContain("Metric");
    expect(html).toContain("Length");
    expect(html).toContain("Window");
    expect(html).toContain("Max |&Delta;%|");
    expect(html).toContain("Min |&Delta;%|");
    expect(html).toContain("Cumulative |&Delta;%|");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
  });

  it("renders 'Top N of M' caption when total_qualified > top_n", () => {
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(
        0,
        codes.map((c) => mrrRow(c, 10000)),
      ),
      mrrSnap(
        1,
        codes.map((c) => mrrRow(c, 14000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 9800)),
      ),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend, 3);
    const html = formatDigestSnapshotPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Top 3 of 5 sustained-|pct|-material streaks");
  });

  it("renders singular caption when only one row qualifies", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    const html = formatDigestSnapshotPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 sustained-|pct|-material streak ");
    expect(html).not.toContain("Top 1 sustained-|pct|-material streaks");
  });

  it("echoes threshold + min_streak_length constants into preamble", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 14000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9800)]),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    const html = formatDigestSnapshotPctChangeStreakLeaderboardSection(board);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+`);
  });

  it("HTML-escapes week labels + reseller codes (metric keys are canonical constants so cannot leak)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 10000)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 14000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 9800)] },
      }),
    ]);
    const board = computeDigestSnapshotPctChangeStreakLeaderboard(trend);
    const html = formatDigestSnapshotPctChangeStreakLeaderboardSection(board);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).not.toContain("<img>EVIL");
    expect(html).toContain("&lt;img&gt;EVIL");
  });
});
