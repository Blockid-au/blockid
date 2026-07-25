import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles,
  formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection,
} from "./digest-snapshot-per-reseller-pct-change-streak-length-percentiles";

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

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles — shape", () => {
  it("passes through window metadata + threshold from the streaks envelope", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(summary.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero groups on empty trend", () => {
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(summary.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles — grouping", () => {
  it("emits one group per partner with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    expect(summary.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "ZEBRA",
    ]);
  });

  it("omits partners with zero qualifying rows (silent skip)", () => {
    // ZEBRA is flat (100 → 100 → 100), never crosses the 25% threshold, so
    // must not appear as a zero-row noise group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 100)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 100)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].reseller_code).toBe("ACME");
  });

  it("carries threshold override through the envelope", () => {
    // Threshold-passthrough is the magnitude-axis extension over P11.93's
    // direction-side per-partner summary — the caller-supplied threshold
    // must land on the returned envelope so JSONL consumers can pin shape
    // shifts to the exact amber band that produced them.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const widened =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
        trend,
        DEFAULT_MIN_STREAK_LENGTH,
        0.5,
      );
    expect(widened.threshold).toBe(0.5);
  });

  it("orders groups by reseller_code asc", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("ZEBRA", 100),
        mrrRow("ACME", 100),
        mrrRow("MID", 100),
      ]),
      mrrSnap(1, [
        mrrRow("ZEBRA", 200),
        mrrRow("ACME", 200),
        mrrRow("MID", 200),
      ]),
      mrrSnap(2, [
        mrrRow("ZEBRA", 400),
        mrrRow("ACME", 400),
        mrrRow("MID", 400),
      ]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    expect(summary.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "MID",
      "ZEBRA",
    ]);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles — values", () => {
  it("computes per-partner p50/p90/mean/max from a mixed length-2 + length-4 |pct| fold", () => {
    // ACME carries two qualifying |pct|-material streaks:
    //   • mrr: 100 → 200 → 400 (both +100%) = length-2 run.
    //   • churn: 1 → 2 → 4 → 8 → 16 (each +100%) = length-4 run.
    // Sorted lengths = [2, 4].
    //   Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    //   Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    //   Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 1)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 2)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 4)]),
      bothSnap(3, [mrrRow("ACME", 400)], [churnRow("ACME", 8)]),
      bothSnap(4, [mrrRow("ACME", 400)], [churnRow("ACME", 16)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    const acme = summary.groups.find((g) => g.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.total_streaks).toBe(2);
    expect(acme!.p50_length).toBe(2);
    expect(acme!.p90_length).toBe(4);
    expect(acme!.mean_length).toBe(3);
    expect(acme!.max_length).toBe(4);
  });

  it("scopes p50/p90/mean/max per partner (sibling deeper tail does not shift this partner's scalars)", () => {
    // ACME: mrr length-2 |pct| run (100 → 200 → 400). ZEBRA: churn length-4
    // |pct| run (1 → 2 → 4 → 8 → 16). Expect ACME summary = 2/2/2/2.
    // Expect ZEBRA summary = 4/4/4/4 — ACME's shorter tail does NOT shrink
    // ZEBRA's scalars and vice versa (per-partner scoping is the whole point).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 100), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 1)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 200), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 2)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 400), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 4)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 400), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 8)],
      ),
      bothSnap(
        4,
        [mrrRow("ACME", 400), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 16)],
      ),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    const acme = summary.groups.find((g) => g.reseller_code === "ACME")!;
    const zebra = summary.groups.find((g) => g.reseller_code === "ZEBRA")!;
    expect(acme.p50_length).toBe(2);
    expect(acme.p90_length).toBe(2);
    expect(acme.mean_length).toBe(2);
    expect(acme.max_length).toBe(2);
    expect(zebra.p50_length).toBe(4);
    expect(zebra.p90_length).toBe(4);
    expect(zebra.mean_length).toBe(4);
    expect(zebra.max_length).toBe(4);
  });

  it("rounds mean_length to one decimal place on odd-mean folds", () => {
    // ACME: mrr length-2 |pct| run (100 → 200 → 400) + churn length-3 |pct|
    // run (1 → 2 → 4 → 8). Mean = (2+3)/2 = 2.5.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 100)], [churnRow("ACME", 1)]),
      bothSnap(1, [mrrRow("ACME", 200)], [churnRow("ACME", 2)]),
      bothSnap(2, [mrrRow("ACME", 400)], [churnRow("ACME", 4)]),
      bothSnap(3, [mrrRow("ACME", 400)], [churnRow("ACME", 8)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    const acme = summary.groups.find((g) => g.reseller_code === "ACME")!;
    expect(acme.total_streaks).toBe(2);
    expect(acme.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("renders a single per-partner summary table with p50/p90/mean/max columns and one row per partner", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 400)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerPctChangeStreakLengthPercentiles(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLengthPercentilesSection(
        summary,
      );
    expect(html).toContain("<table");
    // One consolidated table across partners (vs P11.83's one table per partner).
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("Partner");
    expect(html).toContain("p50 length");
    expect(html).toContain("p90 length");
    expect(html).toContain("Mean length");
    expect(html).toContain("Max length");
    expect(html).toContain("ACME");
    expect(html).toContain("ZEBRA");
    // Caption should embed the threshold percent so ops sees which band the
    // per-partner p50/p90 values are scored against without side-loading
    // the P11.51 or P11.83 envelopes.
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });
});
