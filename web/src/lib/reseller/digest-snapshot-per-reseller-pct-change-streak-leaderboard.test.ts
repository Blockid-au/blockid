import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_PER_RESELLER_TOP_N,
  computeDigestSnapshotPerResellerPctChangeStreakLeaderboard,
  formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection,
} from "./digest-snapshot-per-reseller-pct-change-streak-leaderboard";

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

describe("computeDigestSnapshotPerResellerPctChangeStreakLeaderboard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold + top_n_per_reseller", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(board.top_n_per_reseller).toBe(DEFAULT_PER_RESELLER_TOP_N);
  });

  it("returns zero groups on empty trend", () => {
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.groups).toHaveLength(0);
  });

  it("coerces topN < 1 back to DEFAULT_PER_RESELLER_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend, 0)
        .top_n_per_reseller,
    ).toBe(DEFAULT_PER_RESELLER_TOP_N);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend, -5)
        .top_n_per_reseller,
    ).toBe(DEFAULT_PER_RESELLER_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend, 3.7)
        .top_n_per_reseller,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
        trend,
        DEFAULT_PER_RESELLER_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
        trend,
        DEFAULT_PER_RESELLER_TOP_N,
        DEFAULT_MIN_STREAK_LENGTH,
        0,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
        trend,
        DEFAULT_PER_RESELLER_TOP_N,
        DEFAULT_MIN_STREAK_LENGTH,
        -10,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLeaderboard — grouping", () => {
  it("emits one group per partner with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 7500)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 11250)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const codes = board.groups.map((g) => g.reseller_code);
    expect(codes).toEqual(["ACME", "ZEBRA"]);
  });

  it("omits partners with zero qualifying rows (silent skip)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5100)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 5200)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].reseller_code).toBe("ACME");
    for (const g of board.groups) {
      expect(g.rows.length).toBeGreaterThan(0);
    }
  });

  it("orders groups by reseller_code asc (alphabetical, deterministic)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("ZEBRA", 10000),
        mrrRow("ACME", 10000),
        mrrRow("MID", 10000),
      ]),
      mrrSnap(1, [
        mrrRow("ZEBRA", 15000),
        mrrRow("ACME", 15000),
        mrrRow("MID", 15000),
      ]),
      mrrSnap(2, [
        mrrRow("ZEBRA", 22500),
        mrrRow("ACME", 22500),
        mrrRow("MID", 22500),
      ]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
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
        [mrrRow("INFOVISION", 15000)],
        [churnRow("INFOVISION", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("INFOVISION", 22500)],
        [churnRow("INFOVISION", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.reseller_code).toBe("INFOVISION");
    expect(g.top_n).toBe(DEFAULT_PER_RESELLER_TOP_N);
    expect(g.total_qualified).toBe(2);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLeaderboard — ranking within a group", () => {
  it("assigns rank 1..N in sort order per group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("INFOVISION", 10000)],
        [churnRow("INFOVISION", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("INFOVISION", 15000)],
        [churnRow("INFOVISION", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("INFOVISION", 22500)],
        [churnRow("INFOVISION", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].rank).toBe(1);
    expect(g.rows[1].rank).toBe(2);
  });

  it("ranks longer streaks above shorter within a partner group (persistence-first)", () => {
    // ACME: MRR runs 3 transitions of >=25% (length 3), churn runs 2 transitions (length 2)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 15000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 22500)],
        [churnRow("ACME", 20)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 33750)],
        [churnRow("ACME", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.rows[0].length).toBe(3);
    expect(g.rows[1].key).toBe("attributed_churn_30d");
    expect(g.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by cumulative_abs_pct desc (volatility)", () => {
    // ACME: MRR +50%/+50% => cumulative 100%. Churn 40 -> 25 (-37.5%) -> 10 (-60%) => cumulative 97.5%.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 15000)],
        [churnRow("ACME", 25)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 22500)],
        [churnRow("ACME", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.rows[0].cumulative_abs_pct).toBeCloseTo(100, 1);
    expect(g.rows[1].key).toBe("attributed_churn_30d");
    expect(g.rows[1].cumulative_abs_pct).toBeLessThan(
      g.rows[0].cumulative_abs_pct,
    );
  });

  it("tiebreaks equal length + equal cumulative_abs_pct by HEADLINE_METRICS spec order", () => {
    // MRR: 100 -> 150 (+50%) -> 225 (+50%) => cumulative 100%, length 2
    // Churn: 40 -> 20 (-50%) -> 10 (-50%) => cumulative 100%, length 2
    // Both length 2, both cumulative 100% → tiebreak by spec order (attributed_mrr before attributed_churn_30d)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 100)],
        [churnRow("ACME", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 150)],
        [churnRow("ACME", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 225)],
        [churnRow("ACME", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].length).toBe(2);
    expect(g.rows[1].length).toBe(2);
    expect(g.rows[0].cumulative_abs_pct).toBeCloseTo(100, 1);
    expect(g.rows[1].cumulative_abs_pct).toBeCloseTo(100, 1);
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.rows[1].key).toBe("attributed_churn_30d");
  });

  it("does not crowd out a small-partner leader with a large-partner leader (per-partner equal footing)", () => {
    // ACME leads on MRR volatility only; ZEBRA leads on churn volatility only.
    // Each should be #1 on their own book.
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
        [mrrRow("ACME", 40000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const acme = board.groups.find((g) => g.reseller_code === "ACME");
    const zebra = board.groups.find((g) => g.reseller_code === "ZEBRA");
    expect(acme?.rows[0].key).toBe("attributed_mrr");
    expect(acme?.rows[0].rank).toBe(1);
    expect(zebra?.rows[0].key).toBe("attributed_churn_30d");
    expect(zebra?.rows[0].rank).toBe(1);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLeaderboard — top-N slicing", () => {
  it("slices each group to topN and reports total_qualified from the pre-slice count", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 25)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 10)]),
    ]);
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
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
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
      trend,
      50,
    );
    const g = board.groups[0];
    expect(g.top_n).toBe(50);
    expect(g.rows).toHaveLength(1);
    expect(g.total_qualified).toBe(1);
  });

  it("caller-widened min streak length drops shorter runs before ranking", () => {
    // ACME MRR: 3-transition streak (length 3). Churn: only length 2.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 40)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 20)]),
      bothSnap(3, [mrrRow("ACME", 33750)], [churnRow("ACME", 10)]),
    ]);
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
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

  it("caller-widened threshold drops sub-threshold runs before ranking", () => {
    // MRR jumps +50%/+50% → passes threshold=45%.
    // Churn -20%/-20% → drops below threshold=45%.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 100)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 80)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 64)]),
    ]);
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
      trend,
      DEFAULT_PER_RESELLER_TOP_N,
      DEFAULT_MIN_STREAK_LENGTH,
      45,
    );
    expect(board.threshold).toBe(45);
    const g = board.groups[0];
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].key).toBe("attributed_mrr");
    expect(g.total_qualified).toBe(1);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLeaderboard — parity with per-reseller detector", () => {
  it("every leaderboard entry across all groups carries length >= min_streak_length and a non-degenerate window", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("INFOVISION", 10000)],
        [churnRow("INFOVISION", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("INFOVISION", 15000)],
        [churnRow("INFOVISION", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("INFOVISION", 22500)],
        [churnRow("INFOVISION", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    for (const g of board.groups) {
      for (const row of g.rows) {
        expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
        expect(row.first_week).not.toBe(row.last_week);
        expect(row.cumulative_abs_pct).toBeGreaterThanOrEqual(
          board.threshold * row.length,
        );
      }
    }
  });
});

describe("formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("returns empty when zero groups qualify", () => {
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("renders one H4 caption per partner group plus KPI + Length + Window + |Δ%| columns", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("KPI");
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

  it("renders 'Top N of M' caption when total_qualified > top_n in a group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 25)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 10)]),
    ]);
    const board = computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(
      trend,
      1,
    );
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 of 2 KPIs for ACME");
  });

  it("renders singular KPI caption when only one row qualifies in a group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 KPI for INFOVISION");
    expect(html).not.toContain("Top 1 KPIs");
  });

  it("renders |Δ%| cells to one decimal place", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("50.0%");
    expect(html).toContain("100.0%");
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
      computeDigestSnapshotPerResellerPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLeaderboardSection(board);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).not.toContain("<img>EVIL");
    expect(html).toContain("&lt;img&gt;EVIL");
  });
});
