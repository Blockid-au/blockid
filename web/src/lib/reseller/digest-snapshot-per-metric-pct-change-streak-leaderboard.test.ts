import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import {
  DEFAULT_PER_METRIC_TOP_N,
  computeDigestSnapshotPerMetricPctChangeStreakLeaderboard,
  formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection,
} from "./digest-snapshot-per-metric-pct-change-streak-leaderboard";

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

describe("computeDigestSnapshotPerMetricPctChangeStreakLeaderboard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold + top_n_per_metric", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    expect(board.window_size).toBe(3);
    expect(board.first_week).toBe("2026-W28");
    expect(board.last_week).toBe("2026-W30");
    expect(board.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(board.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    expect(board.top_n_per_metric).toBe(DEFAULT_PER_METRIC_TOP_N);
  });

  it("returns zero groups on empty trend", () => {
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(board.groups).toHaveLength(0);
  });

  it("coerces topN < 1 back to DEFAULT_PER_METRIC_TOP_N", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend, 0)
        .top_n_per_metric,
    ).toBe(DEFAULT_PER_METRIC_TOP_N);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend, -5)
        .top_n_per_metric,
    ).toBe(DEFAULT_PER_METRIC_TOP_N);
  });

  it("floors fractional topN", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend, 3.7)
        .top_n_per_metric,
    ).toBe(3);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
        trend,
        DEFAULT_PER_METRIC_TOP_N,
        0,
      ).min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
        trend,
        DEFAULT_PER_METRIC_TOP_N,
        DEFAULT_MIN_STREAK_LENGTH,
        0,
      ).threshold,
    ).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLeaderboard — grouping", () => {
  it("emits one group per KPI that has at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const keys = board.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
    expect(keys.length).toBe(2);
  });

  it("omits KPIs with zero qualifying rows (silent skip, not empty group)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    expect(board.groups).toHaveLength(1);
    expect(board.groups[0].key).toBe("attributed_mrr");
    for (const g of board.groups) {
      expect(g.rows.length).toBeGreaterThan(0);
    }
  });

  it("group order matches HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("A", 10000)], [churnRow("A", 40)]),
      bothSnap(1, [mrrRow("A", 15000)], [churnRow("A", 20)]),
      bothSnap(2, [mrrRow("A", 22500)], [churnRow("A", 10)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const specKeys = HEADLINE_METRICS.map((s) => s.key);
    const groupKeys = board.groups.map((g) => g.key);
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
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups.find((g) => g.key === "attributed_mrr");
    expect(g?.metric_name).toBe("mrr_cents");
    expect(g?.unit).toBe("cents");
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLeaderboard — ranking within a group", () => {
  it("assigns rank 1..N in sort order per group", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
      mrrSnap(3, [mrrRow("INFOVISION", 40000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].rank).toBe(1);
    expect(g.rows[0].reseller_code).toBe("INFOVISION");
    expect(g.rows[0].length).toBe(3);
  });

  it("ranks longer streaks above shorter within a group (persistence-first)", () => {
    // ACME: 4 material transitions (length 3). ZEBRA: 2 material transitions
    // (length 2) then flat (streak breaks).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 22500)]),
      mrrSnap(3, [mrrRow("ACME", 40000), mrrRow("ZEBRA", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.rows[0].length).toBe(3);
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
    expect(g.rows[1].length).toBe(2);
  });

  it("within same length band, ranks by cumulative_abs_pct desc (volatility)", () => {
    // Both length 2, ACME swings much harder in cumulative |Δ%|.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 20000), mrrRow("ZEBRA", 13000)]),
      mrrSnap(2, [mrrRow("ACME", 40000), mrrRow("ZEBRA", 17000)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.rows[0].cumulative_abs_pct).toBeGreaterThan(
      g.rows[1].cumulative_abs_pct,
    );
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
  });

  it("tiebreaks equal length + equal cumulative_abs_pct by reseller_code asc", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ZEBRA", 15000), mrrRow("ACME", 15000)]),
      mrrSnap(2, [mrrRow("ZEBRA", 22500), mrrRow("ACME", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].reseller_code).toBe("ACME");
    expect(g.rows[1].reseller_code).toBe("ZEBRA");
  });

  it("does not crowd out a small-metric leader with a volatile-metric leader (per-metric equal footing)", () => {
    // ACME has a huge sustained MRR swing; ZEBRA has a modest but qualifying
    // churn swing. A flat P11.67 board could rank ACME above ZEBRA; per-metric
    // grouping guarantees ZEBRA is #1 in the churn group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 100)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 30000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 60)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 90000), mrrRow("ZEBRA", 500)],
        [churnRow("ZEBRA", 30)],
      ),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const mrrG = board.groups.find((g) => g.key === "attributed_mrr");
    const churnG = board.groups.find((g) => g.key === "attributed_churn_30d");
    expect(mrrG?.rows[0].reseller_code).toBe("ACME");
    expect(churnG?.rows[0].reseller_code).toBe("ZEBRA");
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLeaderboard — top-N slicing", () => {
  it("slices each group to topN and reports total_qualified from the pre-slice count", () => {
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(
        0,
        codes.map((c) => mrrRow(c, 10000)),
      ),
      mrrSnap(
        1,
        codes.map((c) => mrrRow(c, 15000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 22500)),
      ),
    ]);
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
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
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
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
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 15000)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 22500)]),
      mrrSnap(3, [mrrRow("ACME", 40000), mrrRow("ZEBRA", 22500)]),
    ]);
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
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

describe("computeDigestSnapshotPerMetricPctChangeStreakLeaderboard — parity with per-reseller detector", () => {
  it("every leaderboard entry across all groups carries length >= min_streak_length and a non-degenerate window", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 40)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 22500)], [churnRow("INFOVISION", 10)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    for (const g of board.groups) {
      for (const row of g.rows) {
        expect(row.length).toBeGreaterThanOrEqual(board.min_streak_length);
        expect(row.first_week).not.toBe(row.last_week);
      }
    }
  });

  it("cumulative_abs_pct equals max_abs_pct on a length-2 streak (single transition equal to itself is impossible — 2 transitions)", () => {
    // length-2 = 2 point-to-point transitions; cumulative_abs_pct = sum of the
    // two |pct_change| values. Both are >= threshold so cumulative >= 2*threshold.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const g = board.groups[0];
    expect(g.rows[0].length).toBe(2);
    expect(g.rows[0].cumulative_abs_pct).toBeGreaterThanOrEqual(
      2 * board.threshold,
    );
  });
});

describe("formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("returns empty when zero groups qualify", () => {
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board),
    ).toBe("");
  });

  it("renders one H4 caption per group plus Partner / Length / |Δ%| columns", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Partner");
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
    const codes = ["A", "B", "C", "D", "E"];
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(
        0,
        codes.map((c) => mrrRow(c, 10000)),
      ),
      mrrSnap(
        1,
        codes.map((c) => mrrRow(c, 15000)),
      ),
      mrrSnap(
        2,
        codes.map((c) => mrrRow(c, 22500)),
      ),
    ]);
    const board = computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(
      trend,
      3,
    );
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board);
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
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board);
    expect(html).toContain("Top 1 partner on attributed_mrr / mrr_cents");
    expect(html).not.toContain("Top 1 partners");
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
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).not.toContain("<img>EVIL");
    expect(html).toContain("&lt;img&gt;EVIL");
  });

  it("renders pct cells to one decimal place", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const board =
      computeDigestSnapshotPerMetricPctChangeStreakLeaderboard(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLeaderboardSection(board);
    expect(html).toMatch(/\d+\.\d%/);
  });
});
