import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram,
  formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection,
} from "./digest-snapshot-per-reseller-pct-change-streak-length-histogram";

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

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 22500)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    expect(hist.window_size).toBe(3);
    expect(hist.first_week).toBe("2026-W28");
    expect(hist.last_week).toBe("2026-W30");
    expect(hist.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(hist.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero groups on empty trend", () => {
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(hist.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram — grouping", () => {
  it("emits one group per partner with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 7500)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 11250)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    expect(hist.groups.map((g) => g.reseller_code)).toEqual(["ACME", "ZEBRA"]);
  });

  it("omits partners with zero qualifying rows (silent skip)", () => {
    // ZEBRA MRR moves ~2% per step which is well below the 25% threshold,
    // so ZEBRA has no qualifying streak and should not emit a group.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5100)]),
      mrrSnap(2, [mrrRow("ACME", 22500), mrrRow("ZEBRA", 5200)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    expect(hist.groups).toHaveLength(1);
    expect(hist.groups[0].reseller_code).toBe("ACME");
  });

  it("orders groups by reseller_code asc", () => {
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
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    expect(hist.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "MID",
      "ZEBRA",
    ]);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram — buckets", () => {
  it("emits a dense per-partner bucket set from min_streak_length to that partner's max_length", () => {
    // ACME: two qualifying |pct|-material streaks — MRR length-2 (3 snapshots
    // with +50%/+50% jumps) + churn length-4 (5 snapshots with 40→28→20→14→10
    // giving -30%/-28.6%/-30%/-28.6%). Expect ACME buckets 2/3/4 with zero at
    // length 3.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 28)]),
      bothSnap(2, [mrrRow("ACME", 22500)], [churnRow("ACME", 20)]),
      bothSnap(3, [mrrRow("ACME", 22500)], [churnRow("ACME", 14)]),
      bothSnap(4, [mrrRow("ACME", 22500)], [churnRow("ACME", 10)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    const acme = hist.groups.find((g) => g.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.total_streaks).toBe(2);
    expect(acme!.max_length).toBe(4);
    expect(acme!.buckets.map((b) => b.length)).toEqual([2, 3, 4]);
    const byLen = new Map(acme!.buckets.map((b) => [b.length, b]));
    expect(byLen.get(2)?.count).toBe(1);
    expect(byLen.get(3)?.count).toBe(0);
    expect(byLen.get(4)?.count).toBe(1);
    expect(byLen.get(2)?.pct).toBe(50);
    expect(byLen.get(3)?.pct).toBe(0);
    expect(byLen.get(4)?.pct).toBe(50);
  });

  it("scopes max_length per partner (sibling's deeper tail does not pad this partner's axis)", () => {
    // ACME: length-2 MRR streak only (3 snapshots +50%/+50%). ZEBRA: length-4
    // churn streak (5 snapshots -30%/-28.6%/-30%/-28.6%). Expect ACME buckets
    // 2..2, ZEBRA buckets 2..4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 28)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 22500), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 22500), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 14)],
      ),
      bothSnap(
        4,
        [mrrRow("ACME", 22500), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    const acme = hist.groups.find((g) => g.reseller_code === "ACME")!;
    const zebra = hist.groups.find((g) => g.reseller_code === "ZEBRA")!;
    expect(acme.max_length).toBe(2);
    expect(acme.buckets.map((b) => b.length)).toEqual([2]);
    expect(zebra.max_length).toBe(4);
    expect(zebra.buckets.map((b) => b.length)).toEqual([2, 3, 4]);
  });

  it("computes per-partner share (pct sums to ~100 per group)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    const info = hist.groups.find((g) => g.reseller_code === "INFOVISION");
    if (info && info.total_streaks > 0) {
      expect(info.buckets[0].pct).toBe(100);
    }
  });
});

describe("formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
        hist,
      ),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
        hist,
      ),
    ).toBe("");
  });

  it("renders one table per partner group with a Distribution bar column", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 400)]),
    ]);
    const hist =
      computeDigestSnapshotPerResellerPctChangeStreakLengthHistogram(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakLengthHistogramSection(
        hist,
      );
    expect(html).toContain("ACME");
    expect(html).toContain("ZEBRA");
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(hist.groups.length);
    expect(html).toContain("Distribution");
    expect(html).toContain("█");
  });
});
