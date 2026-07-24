import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  DEFAULT_PER_RESELLER_TOP_N,
  computeDigestSnapshotPerResellerDirectionStreakLeaderboard,
  formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection,
} from "./digest-snapshot-per-reseller-direction-streak-leaderboard";

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

describe("computeDigestSnapshotPerResellerDirectionStreakLeaderboard — shape", () => {
  it("passes through window metadata + min_streak_length + top_n_per_reseller", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.top_n_per_reseller).toBe(DEFAULT_PER_RESELLER_TOP_N);
  });

  it("returns zero groups on empty trend", () => {
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.groups).toHaveLength(0);
  });

  it("coerces topN < 1 back to DEFAULT_PER_RESELLER_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend, 0)
        .top_n_per_reseller,
    ).toBe(DEFAULT_PER_RESELLER_TOP_N);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend, -5)
        .top_n_per_reseller,
    ).toBe(DEFAULT_PER_RESELLER_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend, 3.7)
        .top_n_per_reseller,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
        trend,
        DEFAULT_PER_RESELLER_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLeaderboard — grouping", () => {
  it("emits one group per partner with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 6000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 7000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const codes = board.groups.map((g) => g.reseller_code);
    expect(codes).toEqual(["ACME", "ZEBRA"]);
  });

  it("omits partners with zero qualifying rows (silent skip)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].reseller_code).toBe("ACME");
    for (const g of board.groups) {
      expect(g.rows.length).toBeGreaterThan(0);
    }
  });

  it("orders groups by reseller_code asc (alphabetical, deterministic)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 10000), mrrRow("ACME", 10000), mrrRow("MID", 10000)]),
      mrrSnap(1, [mrrRow("ZEBRA", 12000), mrrRow("ACME", 12000), mrrRow("MID", 12000)]),
      mrrSnap(2, [mrrRow("ZEBRA", 15000), mrrRow("ACME", 15000), mrrRow("MID", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    expect(board.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "MID",
      "ZEBRA",
    ]);
  });

  it("carries reseller_code + top_n + total_qualified on each group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("INFOVISION", 10000)],
        [churnRow("INFOVISION", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("INFOVISION", 12000)],
        [churnRow("INFOVISION", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("INFOVISION", 15000)],
        [churnRow("INFOVISION", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.reseller_code).toBe("INFOVISION");
    expect(g.top_n).toBe(DEFAULT_PER_RESELLER_TOP_N);
    expect(g.total_qualified).toBe(2);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLeaderboard — ranking within a group", () => {
  it("assigns rank 1..N in sort order per group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("INFOVISION", 10000)],
        [churnRow("INFOVISION", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("INFOVISION", 12000)],
        [churnRow("INFOVISION", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("INFOVISION", 15000)],
        [churnRow("INFOVISION", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].rank).toBe(1);
    expect(g.rows[1].rank).toBe(2);
  });

  it("ranks longer streaks above shorter within a partner group (persistence-first)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 12000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 15000)],
        [churnRow("ACME", 30)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 18000)],
        [churnRow("ACME", 20)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.rows[0].length).toBe(3);
    expect(g.rows[1].key).toBe("attributed_churn_30d");
    expect(g.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by |cumulative_delta| desc (steepness)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 14000)],
        [churnRow("ACME", 25)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 18000)],
        [churnRow("ACME", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(Math.abs(g.rows[0].cumulative_delta)).toBe(8000);
    expect(g.rows[1].key).toBe("attributed_churn_30d");
    expect(Math.abs(g.rows[1].cumulative_delta)).toBe(30);
  });

  it("tiebreaks equal length + equal magnitude by HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 100)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 105)],
        [churnRow("ACME", 35)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 110)],
        [churnRow("ACME", 30)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].length).toBe(2);
    expect(g.rows[1].length).toBe(2);
    expect(Math.abs(g.rows[0].cumulative_delta)).toBe(10);
    expect(Math.abs(g.rows[1].cumulative_delta)).toBe(10);
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.rows[1].key).toBe("attributed_churn_30d");
  });

  it("does not crowd out a small-partner leader with a large-partner leader (per-partner equal footing)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 20000)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 30000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const acme = board.groups.find((g) => g.reseller_code === "ACME");
    const zebra = board.groups.find((g) => g.reseller_code === "ZEBRA");
    expect(acme?.rows[0].key).toBe("attributed_mrr");
    expect(zebra?.rows[0].key).toBe("attributed_churn_30d");
    expect(zebra?.rows[0].rank).toBe(1);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLeaderboard — top-N slicing", () => {
  it("slices each group to topN and reports total_qualified from the pre-slice count", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
    ]);
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      trend,
      1,
    );
    expect(board.top_n_per_reseller).toBe(1);
    const g = board.groups[0];
    expect(g.top_n).toBe(1);
    expect(g.rows).toHaveLength(1);
    expect(g.total_qualified).toBe(2);
  });

  it("returns all rows when topN exceeds total_qualified (no padding)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      trend,
      50,
    );
    const g = board.groups[0];
    expect(g.top_n).toBe(50);
    expect(g.rows).toHaveLength(1);
    expect(g.total_qualified).toBe(1);
  });

  it("caller-widened min streak length drops shorter runs before ranking", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 40)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 30)]),
      bothSnap(3, [mrrRow("ACME", 18000)], [churnRow("ACME", 20)]),
    ]);
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      trend,
      DEFAULT_PER_RESELLER_TOP_N,
      3,
    );
    expect(board.min_streak_length).toBe(3);
    const g = board.groups[0];
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.total_qualified).toBe(1);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLeaderboard — parity with per-reseller detector", () => {
  it("every leaderboard entry across all groups carries length >= min_streak_length and a non-degenerate window", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    for (const g of board.groups) {
      for (const row of g.rows) {
        expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
        expect(row.first_week).not.toBe(row.last_week);
      }
    }
  });
});

describe("formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    expect(
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("returns empty when zero groups qualify", () => {
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("renders one H4 caption per partner group plus a KPI column and up-arrow for up streaks", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("KPI");
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

  it("renders 'Top N of M' caption when total_qualified > top_n in a group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
    ]);
    const board = computeDigestSnapshotPerResellerDirectionStreakLeaderboard(
      trend,
      1,
    );
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 of 2 KPIs for ACME");
  });

  it("renders singular KPI caption when only one row qualifies in a group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 KPI for INFOVISION");
    expect(html).not.toContain("Top 1 KPIs");
  });

  it("renders down arrow for down streaks", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 22500)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("&darr;");
    expect(html).toContain("down");
  });

  it("HTML-escapes week labels + reseller codes + metric names", () => {
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
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
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
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("A$123.45");
    expect(html).toContain("A$300.00");
  });

  it("renders count-unit metrics without an AUD prefix", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [], [churnRow("INFOVISION", 30)]),
      bothSnap(2, [], [churnRow("INFOVISION", 20)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLeaderboardSection(board);
    expect(html).toContain("attributed_churn_30d");
    expect(html).toContain("churned_count");
    expect(html).not.toContain("A$40.00");
  });
});
