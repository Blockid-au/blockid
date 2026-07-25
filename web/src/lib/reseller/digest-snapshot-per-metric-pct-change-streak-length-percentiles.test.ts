import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection,
} from "./digest-snapshot-per-metric-pct-change-streak-length-percentiles";
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

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(summary.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero groups on empty trend", () => {
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(summary.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles — grouping", () => {
  it("emits one group per KPI with at least one qualifying row", () => {
    // Two KPIs each with one partner clearing the 25% threshold across 3
    // snapshots — both KPIs should qualify.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const keys = summary.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });

  it("omits KPIs with zero qualifying rows (silent skip)", () => {
    // Only mrr moves materially — churn KPI has no data at all so it should
    // not emit a group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const keys = summary.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).not.toContain("attributed_churn_30d");
  });

  it("omits sub-threshold KPIs (silent skip when |pct| below threshold)", () => {
    // MRR moves ~2% per step — well below the 25% threshold — so MRR
    // should not emit a group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10400)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    expect(summary.groups).toEqual([]);
  });

  it("carries threshold override through the envelope", () => {
    // Threshold-passthrough is the magnitude-axis extension over P11.97's
    // direction-side per-metric summary — the caller-supplied threshold must
    // land on the returned envelope so JSONL consumers can pin per-KPI shape
    // shifts to the exact amber band that produced them.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const widened =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(
        trend,
        DEFAULT_MIN_STREAK_LENGTH,
        0.5,
      );
    expect(widened.threshold).toBe(0.5);
  });

  it("orders groups in HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const emittedKeys = summary.groups.map((g) => g.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key).filter((k) =>
      emittedKeys.includes(k),
    );
    expect(emittedKeys).toEqual(specOrder);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles — values", () => {
  it("computes per-KPI p50/p90/mean/max from a mixed length-2 + length-4 |pct| fold on ONE KPI", () => {
    // MRR carries two qualifying |pct|-material partner streaks:
    //   • ACME: 100 → 200 → 400 (both +100%) = length-2 run then flat.
    //   • ZEBRA: 20 → 40 → 80 → 160 → 320 (four +100% transitions) = length-4.
    // Sorted lengths within MRR = [2, 4].
    //   Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    //   Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    //   Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 80)]),
      mrrSnap(3, [mrrRow("ACME", 400), mrrRow("ZEBRA", 160)]),
      mrrSnap(4, [mrrRow("ACME", 400), mrrRow("ZEBRA", 320)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.total_streaks).toBe(2);
    expect(mrr!.p50_length).toBe(2);
    expect(mrr!.p90_length).toBe(4);
    expect(mrr!.mean_length).toBe(3);
    expect(mrr!.max_length).toBe(4);
  });

  it("scopes p50/p90/mean/max per KPI (sibling KPI's deeper tail does not shift this KPI's scalars)", () => {
    // MRR: ACME length-2 streak only (+100%/+100% then flat).
    // Churn: ZEBRA length-4 streak (40 → 28 → 20 → 14 → 10 giving
    // -30%/-28.6%/-30%/-28.6%).
    // Expect MRR summary = 2/2/2/2. Expect Churn summary = 4/4/4/4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ZEBRA", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ZEBRA", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ZEBRA", 20)]),
      bothSnap(3, [mrrRow("ACME", 400)], [churnRow("ZEBRA", 14)]),
      bothSnap(4, [mrrRow("ACME", 400)], [churnRow("ZEBRA", 10)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr")!;
    const churn = summary.groups.find(
      (g) => g.key === "attributed_churn_30d",
    )!;
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
    //   ACME: 100 → 200 → 400 (two +100% transitions) = length 2.
    //   ZEBRA: 100 → 200 → 400 → 800 (three +100% transitions) = length 3.
    // Sorted MRR lengths = [2, 3]. Mean = (2+3)/2 = 2.5.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 400)]),
      mrrSnap(3, [mrrRow("ACME", 400), mrrRow("ZEBRA", 800)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const mrr = summary.groups.find((g) => g.key === "attributed_mrr")!;
    expect(mrr.total_streaks).toBe(2);
    expect(mrr.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("renders a single consolidated table with KPI/Metric/p50/p90/Mean/Max columns and one row per KPI, and embeds the threshold percent in the caption", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const summary =
      computeDigestSnapshotPerMetricPctChangeStreakLengthPercentiles(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLengthPercentilesSection(
        summary,
      );
    expect(html).toContain("<table");
    // One consolidated table across KPIs (vs P11.87's one table per KPI).
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
    // Caption should embed the threshold percent so ops sees which band the
    // p50/p90 values are scored against — matches P11.87/P11.91/P11.95
    // caption pattern on the magnitude axis.
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });
});
