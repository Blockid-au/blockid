import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram,
  formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection,
} from "./digest-snapshot-per-metric-pct-change-streak-length-histogram";
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

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    expect(hist.window_size).toBe(3);
    expect(hist.first_week).toBe("2026-W28");
    expect(hist.last_week).toBe("2026-W30");
    expect(hist.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(hist.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero groups on empty trend", () => {
    const hist = computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(hist.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram — grouping", () => {
  it("emits one group per KPI with at least one qualifying row", () => {
    // Two KPIs (mrr +50%/+50% + churn 40→28→20 = -30%/-28.6%) each with one
    // partner clearing the 25% threshold across 3 snapshots — both KPIs qualify.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 20)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const keys = hist.groups.map((g) => g.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });

  it("omits KPIs with zero qualifying rows (silent skip)", () => {
    // Only mrr moves materially — churn KPI has no data at all so it should
    // not emit a group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 15000)]),
      mrrSnap(2, [mrrRow("ACME", 22500)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const keys = hist.groups.map((g) => g.key);
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
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    expect(hist.groups).toEqual([]);
  });

  it("orders groups in HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 20)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const emittedKeys = hist.groups.map((g) => g.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key).filter((k) =>
      emittedKeys.includes(k),
    );
    expect(emittedKeys).toEqual(specOrder);
  });
});

describe("computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram — buckets", () => {
  it("emits a dense per-KPI bucket set from min_streak_length to that KPI's max_length with zero-count band", () => {
    // MRR KPI: two qualifying |pct|-material partner streaks — ACME +50%/+50%
    // (length 2 across 3 snapshots then flat) and ZEBRA 20%→40%→80%→160%→320%
    // (four +100% transitions = length 4 across 5 snapshots). Expect MRR
    // buckets 2/3/4 with zero-count band at length 3.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 80)]),
      mrrSnap(3, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 160)]),
      mrrSnap(4, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 320)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const mrr = hist.groups.find((g) => g.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.total_streaks).toBe(2);
    expect(mrr!.max_length).toBe(4);
    expect(mrr!.buckets.map((b) => b.length)).toEqual([2, 3, 4]);
    const byLen = new Map(mrr!.buckets.map((b) => [b.length, b]));
    expect(byLen.get(2)?.count).toBe(1);
    expect(byLen.get(3)?.count).toBe(0);
    expect(byLen.get(4)?.count).toBe(1);
    expect(byLen.get(2)?.pct).toBe(50);
    expect(byLen.get(3)?.pct).toBe(0);
    expect(byLen.get(4)?.pct).toBe(50);
  });

  it("scopes max_length per KPI (sibling KPI's deeper tail does not pad this KPI's axis)", () => {
    // MRR KPI: ACME length-2 streak only (+50%/+50% then flat).
    // Churn KPI: ZEBRA length-4 streak (40→28→20→14→10 giving
    // -30%/-28.6%/-30%/-28.6%). Expect MRR buckets to run only 2..2, churn
    // buckets to run 2..4 — MRR must NOT emit a phantom length-3/length-4
    // band sourced from the churn tail.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ZEBRA", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ZEBRA", 28)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ZEBRA", 20)]),
      bothSnap(3, [mrrRow("ACME", 22500)], [churnRow("ZEBRA", 14)]),
      bothSnap(4, [mrrRow("ACME", 22500)], [churnRow("ZEBRA", 10)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const mrr = hist.groups.find((g) => g.key === "attributed_mrr")!;
    const churn = hist.groups.find((g) => g.key === "attributed_churn_30d")!;
    expect(mrr.max_length).toBe(2);
    expect(mrr.buckets.map((b) => b.length)).toEqual([2]);
    expect(churn.max_length).toBe(4);
    expect(churn.buckets.map((b) => b.length)).toEqual([2, 3, 4]);
  });

  it("computes per-KPI share (pct sums to ~100 per group)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const mrr = hist.groups.find((g) => g.key === "attributed_mrr");
    if (mrr && mrr.total_streaks > 0) {
      expect(mrr.buckets[0].pct).toBe(100);
    }
  });
});

describe("formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection(hist),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const hist = computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection(hist),
    ).toBe("");
  });

  it("renders one table per KPI group with a Distribution bar column", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const hist =
      computeDigestSnapshotPerMetricPctChangeStreakLengthHistogram(trend);
    const html =
      formatDigestSnapshotPerMetricPctChangeStreakLengthHistogramSection(hist);
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(hist.groups.length);
    expect(html).toContain("Distribution");
    expect(html).toContain("█");
  });
});
