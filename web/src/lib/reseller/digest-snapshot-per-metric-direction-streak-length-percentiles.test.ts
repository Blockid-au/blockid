import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles,
  formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection,
} from "./digest-snapshot-per-metric-direction-streak-length-percentiles";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";

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

describe("computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles — shape", () => {
  it("passes through window metadata + min_streak_length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("returns zero groups on empty trend", () => {
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(summary.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles — grouping", () => {
  it("emits one group per KPI with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const keys = summary.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });

  it("omits KPIs with zero qualifying rows (silent skip)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 12000)]),
      mrrSnap(2, [mrrRow("ACME", 15000)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const keys = summary.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).not.toContain("attributed_churn_30d");
  });

  it("orders groups in HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const emittedKeys = summary.groups.map((g) => g.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key).filter((k) =>
      emittedKeys.includes(k),
    );
    expect(emittedKeys).toEqual(specOrder);
  });
});

describe("computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles — values", () => {
  it("computes per-KPI p50/p90/mean/max from a mixed length-2 + length-4 fold on ONE KPI", () => {
    // MRR carries two qualifying partner streaks: ACME length-2 (3 snapshots)
    // + ZEBRA length-4 (5 snapshots). Sorted lengths within MRR = [2, 4].
    // Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    // Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    // Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 6000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 7000)]),
      mrrSnap(3, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 8000)]),
      mrrSnap(4, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 9000)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.total_streaks).toBe(2);
    expect(mrr!.p50_length).toBe(2);
    expect(mrr!.p90_length).toBe(4);
    expect(mrr!.mean_length).toBe(3);
    expect(mrr!.max_length).toBe(4);
  });

  it("scopes p50/p90/mean/max per KPI (sibling KPI's deeper tail does not shift this KPI's scalars)", () => {
    // MRR: length-2 ACME streak only. Churn: length-4 ZEBRA streak only.
    // Expect MRR summary = 2/2/2/2. Expect Churn summary = 4/4/4/4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ZEBRA", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ZEBRA", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ZEBRA", 20)]),
      bothSnap(3, [mrrRow("ACME", 15000)], [churnRow("ZEBRA", 15)]),
      bothSnap(4, [mrrRow("ACME", 15000)], [churnRow("ZEBRA", 10)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr")!;
    const churn = summary.groups.find((g) => g.key === "attributed_churn_30d")!;
    expect(mrr.p50_length).toBe(2);
    expect(mrr.p90_length).toBe(2);
    expect(mrr.mean_length).toBe(2);
    expect(mrr.max_length).toBe(2);
    expect(churn.p50_length).toBe(4);
    expect(churn.p90_length).toBe(4);
    expect(churn.mean_length).toBe(4);
    expect(churn.max_length).toBe(4);
  });

  it("rounds mean_length to one decimal place", () => {
    // MRR: ACME length-2 (3 snapshots) + ZEBRA length-3 (4 snapshots).
    // Mean = (2+3)/2 = 2.5.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 200)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 300)]),
      mrrSnap(3, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr")!;
    expect(mrr.total_streaks).toBe(2);
    expect(mrr.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    expect(
      formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("renders a single per-metric summary table with KPI/Metric/p50/p90/mean/max columns and one row per KPI", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricDirectionStreakLengthPercentiles(trend);
    const html =
      formatDigestSnapshotPerMetricDirectionStreakLengthPercentilesSection(
        summary,
      );
    expect(html).toContain("<table");
    // One consolidated table across KPIs (vs P11.85's one table per KPI).
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("KPI");
    expect(html).toContain("Metric");
    expect(html).toContain("p50 length");
    expect(html).toContain("p90 length");
    expect(html).toContain("Mean length");
    expect(html).toContain("Max length");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("attributed_churn_30d");
  });
});
