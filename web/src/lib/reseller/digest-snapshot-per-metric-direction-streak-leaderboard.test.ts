import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import {
  DEFAULT_PER_METRIC_TOP_N,
  computeDigestSnapshotPerMetricDirectionStreakLeaderboard,
  formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection,
} from "./digest-snapshot-per-metric-direction-streak-leaderboard";

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

describe("computeDigestSnapshotPerMetricDirectionStreakLeaderboard — shape", () => {
  it("passes through window metadata + min_streak_length + top_n_per_metric", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.top_n_per_metric).toBe(DEFAULT_PER_METRIC_TOP_N);
  });

  it("returns zero groups on empty trend", () => {
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.groups).toHaveLength(0);
  });

  it("coerces topN < 1 back to DEFAULT_PER_METRIC_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend, 0)
        .top_n_per_metric,
    ).toBe(DEFAULT_PER_METRIC_TOP_N);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend, -5)
        .top_n_per_metric,
    ).toBe(DEFAULT_PER_METRIC_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend, 3.7)
        .top_n_per_metric,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
        trend,
        DEFAULT_PER_METRIC_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLeaderboard — grouping", () => {
  it("emits one group per KPI that has at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 12000)], [churnRow("INFOVISION", 30)]),
      bothSnap(2, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const keys = board.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
    expect(keys.length).toBe(2);
  });

  it("omits KPIs with zero qualifying rows (silent skip, not empty group)", () => {
    // Only mrr has movement; other KPI sections have nothing in the envelope.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].key).toBe("attributed_mrr");
    for (const g of board.groups) {
      expect(g.rows.length).toBeGreaterThan(0);
    }
  });

  it("group order matches HEADLINE_METRICS spec order", () => {
    // Both mrr and churn have qualifying streaks; churn appears BEFORE mrr in
    // spec order? Check the actual ordering constant against emitted groups.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("A", 10000)], [churnRow("A", 40)]),
      bothSnap(1, [mrrRow("A", 12000)], [churnRow("A", 30)]),
      bothSnap(2, [mrrRow("A", 15000)], [churnRow("A", 20)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const specKeys = HEADLINE_METRICS.map((s) => s.key);
    const groupKeys = board.groups.map((g) => g.key);
    // groupKeys must be a subsequence of specKeys (spec-order preserving).
    let cursor = 0;
    for (const gk of groupKeys) {
      const idx = specKeys.indexOf(gk, cursor);
      expect(idx).toBeGreaterThanOrEqual(0);
      cursor = idx + 1;
    }
  });

  it("carries metric_name + unit on each group so the formatter needs no side-lookup", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const g = board.groups.find((g) => g.key === "attributed_mrr");
    expect(g?.metric_name).toBe("mrr_cents");
    expect(g?.unit).toBe("cents");
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLeaderboard — ranking within a group", () => {
  it("assigns rank 1..N in sort order per group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 18000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].rank).toBe(1);
    expect(g.rows[0].reseller_code).toBe("INFOVISION");
    expect(g.rows[0].length).toBe(3);
    expect(g.rows[0].direction).toBe("up");
  });

  it("ranks longer streaks above shorter within a group (persistence-first)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 12000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(3, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.rows[0].length).toBe(3);
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
    expect(g.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by |cumulative_delta| desc (steepness)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 14000), mrrRow("ZEBRA", 10100)]),
      mrrSnap(2, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 10200)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(Math.abs(g.rows[0].cumulative_delta)).toBe(8000);
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
    expect(Math.abs(g.rows[1].cumulative_delta)).toBe(200);
  });

  it("tiebreaks equal length + equal magnitude by reseller_code asc", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ZEBRA", 14000), mrrRow("ACME", 14000)]),
      mrrSnap(2, [mrrRow("ZEBRA", 18000), mrrRow("ACME", 18000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
  });

  it("does not crowd out a small-metric leader with a volatile-metric leader (per-metric equal footing)", () => {
    // ACME is #1 on mrr with length-3, ZEBRA is #1 on churn with length-2. A
    // flat P11.65 leaderboard would rank ACME above ZEBRA and might crowd it
    // out on a tiny top_n; per-metric grouping guarantees ZEBRA is #1 on the
    // churn group regardless of mrr magnitude.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 20000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 30000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const mrrG = board.groups.find((g) => g.key === "attributed_mrr");
    const churnG = board.groups.find((g) => g.key === "attributed_churn_30d");
    expect(mrrG?.rows[0].reseller_code).toBe("ACME");
    expect(churnG?.rows[0].reseller_code).toBe("ZEBRA");
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLeaderboard — top-N slicing", () => {
  it("slices each group to topN and reports total_qualified from the pre-slice count", () => {
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
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
      trend,
      3,
    );
    expect(board.top_n_per_metric).toBe(3);
    const g = board.groups[0];
    expect(g.top_n).toBe(3);
    expect(g.rows).toHaveLength(3);
    expect(g.total_qualified).toBe(5);
    expect(g.rows.map((r) => r.reseller_code)).toEqual(["A", "B", "C"]);
  });

  it("returns all rows when topN exceeds total_qualified (no padding)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
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
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 12000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(3, [mrrRow("ACME", 18000), mrrRow("ZEBRA", 15000)]),
    ]);
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
      trend,
      DEFAULT_PER_METRIC_TOP_N,
      3,
    );
    expect(board.min_streak_length).toBe(3);
    const g = board.groups[0];
    expect(g.rows).toHaveLength(1);
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.total_qualified).toBe(1);
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLeaderboard — parity with per-reseller detector", () => {
  it("every leaderboard entry across all groups carries length >= min_streak_length and a non-degenerate window", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    for (const g of board.groups) {
      for (const row of g.rows) {
        expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
        expect(row.first_week).not.toBe(row.last_week);
      }
    }
  });
});

describe("formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    expect(
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("returns empty when zero groups qualify", () => {
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("renders one H4 caption per group plus a Partner column and up-arrow for up streaks", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Partner");
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
    const board = computeDigestSnapshotPerMetricDirectionStreakLeaderboard(
      trend,
      3,
    );
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
    expect(html).toContain(
      "Top 3 of 5 partners on attributed_mrr / mrr_cents",
    );
  });

  it("renders singular partner caption when only one row qualifies in a group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 partner on attributed_mrr / mrr_cents");
    expect(html).not.toContain("Top 1 partners");
  });

  it("renders down arrow for down streaks", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 22500)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
    expect(html).toContain("&darr;");
    expect(html).toContain("down");
  });

  it("HTML-escapes week labels + reseller codes (metric keys are canonical constants)", () => {
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
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
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
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
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
      computeDigestSnapshotPerMetricDirectionStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLeaderboardSection(board);
    expect(html).toContain("attributed_churn_30d");
    expect(html).toContain("churned_count");
    expect(html).not.toContain("A$40.00");
  });
});
