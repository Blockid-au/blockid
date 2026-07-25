import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerMetricPersistenceScorecard,
  formatDigestSnapshotPerMetricPersistenceScorecardSection,
} from "./digest-snapshot-per-metric-persistence-scorecard";

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

describe("computeDigestSnapshotPerMetricPersistenceScorecard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    expect(scorecard.window_size).toBe(3);
    expect(scorecard.first_week).toBe("2026-W28");
    expect(scorecard.last_week).toBe("2026-W30");
    expect(scorecard.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(scorecard.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero rows on empty trend", () => {
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(scorecard.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricPersistenceScorecard — grouping", () => {
  it("emits one row per KPI that qualifies on EITHER axis", () => {
    // MRR qualifies on both axes (steadily doubling), churn qualifies on both
    // axes (steadily halving). Expect both KPIs as rows.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const keys = scorecard.rows.map((r) => r.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });

  it("omits KPIs missing from BOTH axes (silent skip)", () => {
    // Only MRR has data — churn KPI should not emit a row.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const keys = scorecard.rows.map((r) => r.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).not.toContain("attributed_churn_30d");
  });

  it("zero-fills the missing-axis block when a KPI qualifies on only one axis", () => {
    // MRR: 10000 → 10200 → 10400 → 10600 (all +2% — direction persists but
    // magnitude does NOT clear the 25% threshold on any transition).
    // Expect the MRR row to appear with direction populated and magnitude
    // zero-filled so ops can see the "sustained direction inside the amber
    // band" pattern at a glance.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10400)]),
      mrrSnap(3, [mrrRow("ACME", 10600)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const mrr = scorecard.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.direction.total_streaks).toBeGreaterThan(0);
    expect(mrr!.magnitude.total_streaks).toBe(0);
    expect(mrr!.magnitude.p50_length).toBe(0);
    expect(mrr!.magnitude.p90_length).toBe(0);
    expect(mrr!.magnitude.mean_length).toBe(0);
    expect(mrr!.magnitude.max_length).toBe(0);
  });

  it("carries threshold override through the envelope", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const widened = computeDigestSnapshotPerMetricPersistenceScorecard(
      trend,
      DEFAULT_MIN_STREAK_LENGTH,
      0.5,
    );
    expect(widened.threshold).toBe(0.5);
  });

  it("orders rows in HEADLINE_METRICS spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const emittedKeys = scorecard.rows.map((r) => r.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key).filter((k) =>
      emittedKeys.includes(k),
    );
    expect(emittedKeys).toEqual(specOrder);
  });
});

describe("computeDigestSnapshotPerMetricPersistenceScorecard — values", () => {
  it("mirrors upstream P11.97 direction scalars + P11.99 magnitude scalars for a KPI qualifying on both axes", () => {
    // MRR: two partner streaks — ACME 100→200→400 (2 +100% steps = length 2),
    // ZEBRA 20→40→80→160→320 (4 +100% steps = length 4). Both axes hit the
    // same length distribution since every transition is same-sign AND >25%.
    // Sorted lengths = [2,4]. p50 index = ceil(50*2/100)-1 = 0 → 2. p90 index
    // = ceil(90*2/100)-1 = 1 → 4. mean = 3.0. max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 80)]),
      mrrSnap(3, [mrrRow("ACME", 400), mrrRow("ZEBRA", 160)]),
      mrrSnap(4, [mrrRow("ACME", 400), mrrRow("ZEBRA", 320)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const mrr = scorecard.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    // Direction: both partners' streaks are same-sign +100% runs; length-2
    // + length-4 fold identical to magnitude.
    expect(mrr!.direction.total_streaks).toBe(2);
    expect(mrr!.direction.p50_length).toBe(2);
    expect(mrr!.direction.p90_length).toBe(4);
    expect(mrr!.direction.mean_length).toBe(3);
    expect(mrr!.direction.max_length).toBe(4);
    // Magnitude: same distribution because every transition clears 25%.
    expect(mrr!.magnitude.total_streaks).toBe(2);
    expect(mrr!.magnitude.p50_length).toBe(2);
    expect(mrr!.magnitude.p90_length).toBe(4);
    expect(mrr!.magnitude.mean_length).toBe(3);
    expect(mrr!.magnitude.max_length).toBe(4);
  });

  it("captures the direction-persistent-but-not-magnitude-persistent asymmetry", () => {
    // MRR moves +2%/+2%/+2% (sustained direction but well below 25%).
    // Direction axis: length 3 for the sole partner ACME. Magnitude axis:
    // zero qualifying streaks. Scorecard row should show the direction
    // scalars populated + magnitude zero-filled.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10404)]),
      mrrSnap(3, [mrrRow("ACME", 10612)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const mrr = scorecard.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr).toBeDefined();
    expect(mrr!.direction.max_length).toBe(3);
    expect(mrr!.magnitude.total_streaks).toBe(0);
  });
});

describe("formatDigestSnapshotPerMetricPersistenceScorecardSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardSection(scorecard),
    ).toBe("");
  });

  it("returns '' when zero rows qualify", () => {
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardSection(scorecard),
    ).toBe("");
  });

  it("renders a single consolidated table with a twin-block header + per-KPI rows + threshold caption", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 20)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerMetricPersistenceScorecard(trend);
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardSection(scorecard);
    expect(html).toContain("<table");
    // One consolidated table (not one per KPI).
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    // Twin-block header labels the two axes explicitly.
    expect(html).toContain("Direction axis");
    expect(html).toContain("Magnitude axis");
    expect(html).toContain("P11.97");
    expect(html).toContain("P11.99");
    // Both KPI rows land in the same table.
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("attributed_churn_30d");
    // Caption embeds the magnitude threshold percent (the only tunable band
    // in the scorecard — direction axis has no threshold).
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });
});
