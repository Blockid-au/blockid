import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerPersistenceScorecard,
  formatDigestSnapshotPerResellerPersistenceScorecardSection,
} from "./digest-snapshot-per-reseller-persistence-scorecard";

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

describe("computeDigestSnapshotPerResellerPersistenceScorecard — shape", () => {
  it("passes through window metadata + min_streak_length + threshold", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 100)]),
      mrrSnap(1, [mrrRow("INFOVISION", 200)]),
      mrrSnap(2, [mrrRow("INFOVISION", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    expect(scorecard.window_size).toBe(3);
    expect(scorecard.first_week).toBe("2026-W28");
    expect(scorecard.last_week).toBe("2026-W30");
    expect(scorecard.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(scorecard.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns zero rows on empty trend", () => {
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(scorecard.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerPersistenceScorecard — grouping", () => {
  it("emits one row per partner that qualifies on EITHER axis", () => {
    // Both partners double every week → qualify on BOTH direction and
    // magnitude axes. Expect both partners as rows.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 80)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const codes = scorecard.rows.map((r) => r.reseller_code);
    expect(codes).toContain("ACME");
    expect(codes).toContain("ZEBRA");
  });

  it("orders rows by reseller_code asc", () => {
    // Feed rows in a non-alphabetical order and expect emitted rows sorted
    // alphabetically to match P11.55 / P11.73 / P11.81 / P11.93 / P11.95
    // posture.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ZEBRA", 100), mrrRow("ACME", 100), mrrRow("MID", 100)]),
      mrrSnap(1, [mrrRow("ZEBRA", 200), mrrRow("ACME", 200), mrrRow("MID", 200)]),
      mrrSnap(2, [mrrRow("ZEBRA", 400), mrrRow("ACME", 400), mrrRow("MID", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    expect(scorecard.rows.map((r) => r.reseller_code)).toEqual([
      "ACME",
      "MID",
      "ZEBRA",
    ]);
  });

  it("omits partners missing from BOTH axes (silent skip)", () => {
    // Only ACME has data — no other partner should emit a row.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    expect(scorecard.rows.map((r) => r.reseller_code)).toEqual(["ACME"]);
  });

  it("zero-fills the missing-axis block when a partner qualifies on only one axis", () => {
    // ACME: 10000 → 10200 → 10400 → 10600 (all +2% — direction persists but
    // magnitude does NOT clear the 25% threshold on any transition). Expect
    // the ACME row to appear with direction populated and magnitude zero-
    // filled so ops can see the "sustained direction inside the amber band"
    // pattern at a glance.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10400)]),
      mrrSnap(3, [mrrRow("ACME", 10600)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const acme = scorecard.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.direction.total_streaks).toBeGreaterThan(0);
    expect(acme!.magnitude.total_streaks).toBe(0);
    expect(acme!.magnitude.p50_length).toBe(0);
    expect(acme!.magnitude.p90_length).toBe(0);
    expect(acme!.magnitude.mean_length).toBe(0);
    expect(acme!.magnitude.max_length).toBe(0);
  });

  it("carries threshold override through the envelope", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
      mrrSnap(2, [mrrRow("ACME", 400)]),
    ]);
    const widened = computeDigestSnapshotPerResellerPersistenceScorecard(
      trend,
      DEFAULT_MIN_STREAK_LENGTH,
      0.5,
    );
    expect(widened.threshold).toBe(0.5);
  });
});

describe("computeDigestSnapshotPerResellerPersistenceScorecard — values", () => {
  it("mirrors upstream P11.93 direction scalars + P11.95 magnitude scalars for a partner qualifying on both axes", () => {
    // ACME carries two qualifying streaks per axis: mrr length-2 (3 up
    // snapshots, each transition ≥ +30% to clear the 25% amber band on both
    // axes) + churn length-4 (5 down snapshots, each transition ≤ -25% same
    // reason). Both axes see the same length distribution since every
    // transition is same-sign AND clears the 25% threshold. Sorted lengths
    // per axis = [2, 4]. Nearest-rank p50 index = ceil(50*2/100)-1 = 0 → 2.
    // p90 index = ceil(90*2/100)-1 = 1 → 4. mean = 3.0. max = 4.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 40)]),
      bothSnap(1, [mrrRow("ACME", 13000)], [churnRow("ACME", 30)]),
      bothSnap(2, [mrrRow("ACME", 17000)], [churnRow("ACME", 20)]),
      bothSnap(3, [mrrRow("ACME", 17000)], [churnRow("ACME", 15)]),
      bothSnap(4, [mrrRow("ACME", 17000)], [churnRow("ACME", 10)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const acme = scorecard.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.direction.total_streaks).toBe(2);
    expect(acme!.direction.p50_length).toBe(2);
    expect(acme!.direction.p90_length).toBe(4);
    expect(acme!.direction.mean_length).toBe(3);
    expect(acme!.direction.max_length).toBe(4);
    expect(acme!.magnitude.total_streaks).toBe(2);
    expect(acme!.magnitude.p50_length).toBe(2);
    expect(acme!.magnitude.p90_length).toBe(4);
    expect(acme!.magnitude.mean_length).toBe(3);
    expect(acme!.magnitude.max_length).toBe(4);
  });

  it("captures the direction-persistent-but-not-magnitude-persistent asymmetry per partner", () => {
    // ACME moves +2%/+2%/+2% (sustained direction but well below 25%).
    // Direction axis: length 3 for ACME. Magnitude axis: zero qualifying
    // streaks. Scorecard row should show ACME's direction scalars populated
    // + magnitude zero-filled.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("ACME", 10200)]),
      mrrSnap(2, [mrrRow("ACME", 10404)]),
      mrrSnap(3, [mrrRow("ACME", 10612)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const acme = scorecard.rows.find((r) => r.reseller_code === "ACME");
    expect(acme).toBeDefined();
    expect(acme!.direction.max_length).toBe(3);
    expect(acme!.magnitude.total_streaks).toBe(0);
  });

  it("scopes scalars per partner — one partner's tail does not shift another's", () => {
    // ACME has a length-2 up-streak (mrr only, each transition ≥ +30% so
    // magnitude clears the 25% amber band). ZEBRA has a length-4 down-streak
    // (churn only, each transition ≤ -25% same reason). Each partner's
    // scorecard row should carry its own scalar reduction, not a pooled
    // distribution.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(
        0,
        [mrrRow("ACME", 10000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 40)],
      ),
      bothSnap(
        1,
        [mrrRow("ACME", 13000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 30)],
      ),
      bothSnap(
        2,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 20)],
      ),
      bothSnap(
        3,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 15)],
      ),
      bothSnap(
        4,
        [mrrRow("ACME", 17000), mrrRow("ZEBRA", 5000)],
        [churnRow("ZEBRA", 10)],
      ),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const acme = scorecard.rows.find((r) => r.reseller_code === "ACME")!;
    const zebra = scorecard.rows.find((r) => r.reseller_code === "ZEBRA")!;
    expect(acme.direction.max_length).toBe(2);
    expect(zebra.direction.max_length).toBe(4);
    expect(acme.magnitude.max_length).toBe(2);
    expect(zebra.magnitude.max_length).toBe(4);
  });
});

describe("formatDigestSnapshotPerResellerPersistenceScorecardSection", () => {
  it("returns '' when window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100)]),
      mrrSnap(1, [mrrRow("ACME", 200)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardSection(scorecard),
    ).toBe("");
  });

  it("returns '' when zero rows qualify", () => {
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(
        computeDigestSnapshotPerResellerRollingTrend([]),
      );
    expect(
      formatDigestSnapshotPerResellerPersistenceScorecardSection(scorecard),
    ).toBe("");
  });

  it("renders a single consolidated table with a twin-block header + per-partner rows + threshold caption", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("ACME", 100), mrrRow("ZEBRA", 20)]),
      mrrSnap(1, [mrrRow("ACME", 200), mrrRow("ZEBRA", 40)]),
      mrrSnap(2, [mrrRow("ACME", 400), mrrRow("ZEBRA", 80)]),
    ]);
    const scorecard =
      computeDigestSnapshotPerResellerPersistenceScorecard(trend);
    const html =
      formatDigestSnapshotPerResellerPersistenceScorecardSection(scorecard);
    expect(html).toContain("<table");
    const tableCount = (html.match(/<table/g) ?? []).length;
    expect(tableCount).toBe(1);
    expect(html).toContain("Direction axis");
    expect(html).toContain("Magnitude axis");
    expect(html).toContain("P11.93");
    expect(html).toContain("P11.95");
    expect(html).toContain("ACME");
    expect(html).toContain("ZEBRA");
    const thresholdPct = (PCT_CHANGE_MATERIAL_THRESHOLD * 100).toFixed(1);
    expect(html).toContain(`${thresholdPct}%`);
  });
});
