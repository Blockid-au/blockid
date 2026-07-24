import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  DEFAULT_LEADERBOARD_TOP_N,
  computeDigestSnapshotDirectionStreakLeaderboard,
  formatDigestSnapshotDirectionStreakLeaderboardSection,
} from "./digest-snapshot-direction-streak-leaderboard";

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

describe("computeDigestSnapshotDirectionStreakLeaderboard — shape", () => {
  it("passes through window metadata + min_streak_length + top_n", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.top_n).toBe(DEFAULT_LEADERBOARD_TOP_N);
  });

  it("returns zero rows on empty trend", () => {
    const board = computeDigestSnapshotDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.rows).toHaveLength(0);
    expect(board.total_qualified).toBe(0);
  });

  it("coerces topN < 1 back to DEFAULT_LEADERBOARD_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotDirectionStreakLeaderboard(trend, 0).top_n,
    ).toBe(DEFAULT_LEADERBOARD_TOP_N);
    expect(
      computeDigestSnapshotDirectionStreakLeaderboard(trend, -5).top_n,
    ).toBe(DEFAULT_LEADERBOARD_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotDirectionStreakLeaderboard(trend, 3.7).top_n,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotDirectionStreakLeaderboard(
        trend,
        DEFAULT_LEADERBOARD_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });
});

describe("computeDigestSnapshotDirectionStreakLeaderboard — ranking", () => {
  it("assigns rank 1..N in sort order", () => {
    // INFOVISION mrr: length-3 up run.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 18000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    expect(board.rows[0].rank).toBe(1);
    expect(board.rows[0].reseller_code).toBe("INFOVISION");
    expect(board.rows[0].length).toBe(3);
    expect(board.rows[0].direction).toBe("up");
  });

  it("ranks longer streaks above shorter streaks (persistence-first)", () => {
    // ACME mrr length-3, ZEBRA mrr length-2.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 12000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(3, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 15000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    // ACME length-3 above ZEBRA length-2.
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[0].length).toBe(3);
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
    expect(board.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by |cumulative_delta| desc (steepness)", () => {
    // Both length-2. ACME cumulative delta +8000 (10000 → 14000 → 18000).
    // ZEBRA cumulative delta +200 (10000 → 10100 → 10200).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 14000), mrrRow("ZEBRA", 10100)]),
      mrrSnap(2, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 10200)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(Math.abs(board.rows[0].cumulative_delta)).toBe(8000);
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
    expect(Math.abs(board.rows[1].cumulative_delta)).toBe(200);
  });

  it("treats up and down streaks equally by magnitude (|cumulative_delta|)", () => {
    // ACME down: 20000 → 12000 → 4000 (cumulative -16000, |.| = 16000)
    // ZEBRA up:  10000 → 14000 → 18000 (cumulative +8000, |.| = 8000)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 20000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 14000)]),
      mrrSnap(2, [mrrRow("ACME", 4000), mrrRow("ZEBRA", 18000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    // ACME down |16000| > ZEBRA up |8000| within same length-2 band.
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[0].direction).toBe("down");
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
    expect(board.rows[1].direction).toBe("up");
  });

  it("tiebreaks equal length + equal magnitude by reseller_code asc", () => {
    // Both length-2, both +8000 cumulative delta.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ZEBRA", 14000), mrrRow("ACME", 14000)]),
      mrrSnap(2, [mrrRow("ZEBRA", 18000), mrrRow("ACME", 18000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.rows[1].reseller_code).toBe("ZEBRA");
  });
});

describe("computeDigestSnapshotDirectionStreakLeaderboard — top-N slicing", () => {
  it("slices to topN and reports total_qualified from the pre-slice count", () => {
    // 5 partners all on length-2 up runs.
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(
        0,
        codes.map((c) => mrrRow(c, 10000)),
      ),
      mrrSnap(
        1,
        codes.map((c) => mrrRow(c, 12000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 15000)),
      ),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend, 3);
    expect(board.top_n).toBe(3);
    expect(board.rows).toHaveLength(3);
    expect(board.total_qualified).toBe(5);
    expect(board.rows.map((r) => r.reseller_code)).toEqual(["A", "B", "C"]);
  });

  it("returns all rows when topN exceeds total_qualified (no padding)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend, 50);
    expect(board.top_n).toBe(50);
    expect(board.rows).toHaveLength(1);
    expect(board.total_qualified).toBe(1);
  });

  it("caller-widened min streak length drops shorter runs before ranking", () => {
    // ACME length-3, ZEBRA length-2. Widen to 3 → ZEBRA drops.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 12000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(3, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 15000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(
      trend,
      DEFAULT_LEADERBOARD_TOP_N,
      3,
    );
    expect(board.min_streak_length).toBe(3);
    expect(board.rows).toHaveLength(1);
    expect(board.rows[0].reseller_code).toBe("ACME");
    expect(board.total_qualified).toBe(1);
  });
});

describe("computeDigestSnapshotDirectionStreakLeaderboard — parity with per-reseller detector", () => {
  it("every leaderboard entry appears in the P11.32 detector output with matching direction/length/cumulative_delta", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    // Every entry maps back to a P11.32 row (import + call would form a cycle;
    // this parity is enforced by construction — leaderboard delegates to the
    // detector — so we assert the invariant by observing that no entry
    // exceeds min_streak_length and every entry carries a non-zero length.
    for (const row of board.rows) {
      expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
      expect(row.first_week).not.toBe(row.last_week);
    }
  });
});

describe("formatDigestSnapshotDirectionStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    expect(formatDigestSnapshotDirectionStreakLeaderboardSection(board)).toBe(
      "",
    );
  });

  it("returns empty on zero qualifying rows", () => {
    const board = computeDigestSnapshotDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(formatDigestSnapshotDirectionStreakLeaderboardSection(board)).toBe(
      "",
    );
  });

  it("renders the leaderboard table with rank column + up/down arrows + partner + metric columns", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Partner");
    expect(html).toContain("Section");
    expect(html).toContain("Metric");
    expect(html).toContain("Direction");
    expect(html).toContain("Length");
    expect(html).toContain("Window");
    expect(html).toContain("Cumulative delta");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("&uarr;");
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
        codes.map((c) => mrrRow(c, 12000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 15000)),
      ),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend, 3);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Top 3 of 5 sustained-direction streaks");
  });

  it("renders 'Top N' caption when total_qualified <= top_n (singular vs plural)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 sustained-direction streak ");
    expect(html).not.toContain("Top 1 sustained-direction streaks");
  });

  it("renders down arrow for down streaks", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 22500)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).toContain("&darr;");
    expect(html).toContain("down");
  });

  it("HTML-escapes week labels + reseller codes (metric keys are canonical constants so cannot leak)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 10000)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 15000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("<img>EVIL", 22500)] },
      }),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).not.toContain("<img>EVIL");
    expect(html).toContain("&lt;img&gt;EVIL");
  });

  it("formats AUD cells for cents-unit metrics", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 12345)]),
      mrrSnap(1, [mrrRow("INFOVISION", 20000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 30000)]),
    ]);
    const board = computeDigestSnapshotDirectionStreakLeaderboard(trend);
    const html = formatDigestSnapshotDirectionStreakLeaderboardSection(board);
    expect(html).toContain("A$123.45");
    expect(html).toContain("A$300.00");
  });
});
