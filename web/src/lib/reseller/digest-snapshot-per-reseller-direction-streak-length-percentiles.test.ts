import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles,
  formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection,
} from "./digest-snapshot-per-reseller-direction-streak-length-percentiles";

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

describe("computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles — shape", () => {
  it("passes through window metadata + min_streak_length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    expect(summary.window_size).toBe(3);
    expect(summary.first_week).toBe("2026-W28");
    expect(summary.last_week).toBe("2026-W30");
    expect(summary.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("returns zero groups on empty trend", () => {
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(summary.groups).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles — grouping", () => {
  it("emits one group per partner with at least one qualifying row", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 6000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 7000)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    expect(summary.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "ZEBRA",
    ]);
  });

  it("omits partners with zero qualifying rows (silent skip)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(1, [mrrRow("ACME", 12000), mrrRow("ZEBRA", 5000)]),
      mrrSnap(2, [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    expect(summary.groups).toHaveLength(1);
    expect(summary.groups[0].reseller_code).toBe("ACME");
  });

  it("orders groups by reseller_code asc", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("ZEBRA", 10000),
        mrrRow("ACME", 10000),
        mrrRow("MID", 10000),
      ]),
      mrrSnap(1, [
        mrrRow("ZEBRA", 12000),
        mrrRow("ACME", 12000),
        mrrRow("MID", 12000),
      ]),
      mrrSnap(2, [
        mrrRow("ZEBRA", 15000),
        mrrRow("ACME", 15000),
        mrrRow("MID", 15000),
      ]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    expect(summary.groups.map((g) => g.reseller_code)).toEqual([
      "ACME",
      "MID",
      "ZEBRA",
    ]);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles — values", () => {
  it("computes per-partner p50/p90/mean/max from a mixed length-2 + length-4 fold", () => {
    // ACME carries two qualifying streaks: mrr length-2 (going up 3 snapshots)
    // + churn length-4 (going down 5 snapshots). Sorted lengths = [2, 4].
    // Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    // Nearest-rank p90 index = ceil(90*2/100)-1 = 1 → 4.
    // Mean = (2+4)/2 = 3.0, max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
      bothSnap(3, [mrrRow("ACME", 15000)], [churnRow("ACME", 15)]),
      bothSnap(4, [mrrRow("ACME", 15000)], [churnRow("ACME", 10)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    const acme = summary.groups.find((g) => g.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.total_streaks).toBe(2);
    expect(acme!.p50_length).toBe(2);
    expect(acme!.p90_length).toBe(4);
    expect(acme!.mean_length).toBe(3);
    expect(acme!.max_length).toBe(4);
  });

  it("scopes p50/p90/mean/max per partner (sibling deeper tail does not shift this partner's scalars)", () => {
    // ACME: length-2 mrr streak only. ZEBRA: length-4 churn streak only.
    // Expect ACME summary = 2/2/2/2. Expect ZEBRA summary = 4/4/4/4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 12000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 30)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 15)],
      ),
      bothSnap(
        4,
        [mrrRow("ACME", 15000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
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

  it("rounds mean_length to one decimal place", () => {
    // ACME: length-2 mrr streak (3 snapshots) + length-3 churn streak (4 snapshots).
    // Mean = (2+3)/2 = 2.5.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]),
      bothSnap(3, [mrrRow("ACME", 15000)], [churnRow("ACME", 15)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    const acme = summary.groups.find((g) => g.reseller_code === "ACME")!;
    expect(acme.total_streaks).toBe(2);
    expect(acme.mean_length).toBe(2.5);
  });
});

describe("formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
    ]);
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    expect(
      formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection(
        summary,
      ),
    ).toBe("");
  });

  it("returns '' when zero groups qualify", () => {
    const summary =
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection(
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
      computeDigestSnapshotPerResellerDirectionStreakLengthPercentiles(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakLengthPercentilesSection(
        summary,
      );
    expect(html).toContain("<table");
    // One consolidated table across partners (vs P11.81's one table per partner).
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("Partner");
    expect(html).toContain("p50 length");
    expect(html).toContain("p90 length");
    expect(html).toContain("Mean length");
    expect(html).toContain("Max length");
    expect(html).toContain("ACME");
    expect(html).toContain("ZEBRA");
  });
});
