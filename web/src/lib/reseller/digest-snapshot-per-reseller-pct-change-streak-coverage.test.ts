import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-pct-change-streaks";
import {
  computeDigestSnapshotPerResellerPctChangeStreakCoverage,
  formatDigestSnapshotPerResellerPctChangeStreakCoverageSection,
} from "./digest-snapshot-per-reseller-pct-change-streak-coverage";

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

describe("computeDigestSnapshotPerResellerPctChangeStreakCoverage — shape", () => {
  it("passes through window metadata + tuning constants", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9750)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(cov.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(cov.rows).toEqual([]);
    expect(cov.window_size).toBe(0);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend, 0)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend, -5)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("coerces non-positive threshold back to PCT_CHANGE_MATERIAL_THRESHOLD via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10200)]),
    ]);
    const cov = computeDigestSnapshotPerResellerPctChangeStreakCoverage(
      trend,
      2,
      -50,
    );
    expect(cov.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION");
    // 1% and 1% transitions don't cross the 25% floor.
    expect(info?.metrics_with_streak).toBe(0);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeStreakCoverage — per-partner buckets", () => {
  it("counts a partner with one qualifying metric (length-2 streak)", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]), // +50%
      mrrSnap(2, [mrrRow("INFOVISION", 10500)]), // -30% → length-2
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(cov.rows).toHaveLength(1);
    const info = cov.rows[0];
    expect(info.reseller_code).toBe("INFOVISION");
    expect(info.total_metrics).toBe(1);
    expect(info.metrics_with_streak).toBe(1);
    expect(info.coverage_rate_pct).toBe(100);
    expect(info.min_length).toBe(2);
    expect(info.max_length).toBe(2);
    expect(info.median_length).toBe(2);
  });

  it("counts a partner with multiple metrics — some on streak, some flat", () => {
    // INFOVISION mrr streaks length-2; INFOVISION churn stays sub-threshold.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 10000)], [churnRow("INFOVISION", 10)]),
      bothSnap(1, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 11)]),
      bothSnap(2, [mrrRow("INFOVISION", 10500)], [churnRow("INFOVISION", 12)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(cov.rows).toHaveLength(1);
    const info = cov.rows[0];
    expect(info.total_metrics).toBe(2);
    expect(info.metrics_with_streak).toBe(1);
    expect(info.coverage_rate_pct).toBe(50);
    expect(info.min_length).toBe(2);
    expect(info.max_length).toBe(2);
    expect(info.median_length).toBe(2);
  });

  it("captures the streak-length distribution when a partner has multiple qualifying metrics", () => {
    // ACME mrr streak length-3, ACME churn streak length-2 → sorted [2,3] → median 2.5.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 10)]),
      bothSnap(1, [mrrRow("ACME", 15000)], [churnRow("ACME", 20)]), // mrr +50, churn +100
      bothSnap(2, [mrrRow("ACME", 10500)], [churnRow("ACME", 5)]), // mrr -30, churn -75
      bothSnap(3, [mrrRow("ACME", 5000)], [churnRow("ACME", 5)]), // mrr -52.4, churn flat
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(acme.total_metrics).toBe(2);
    expect(acme.metrics_with_streak).toBe(2);
    expect(acme.min_length).toBe(2);
    expect(acme.max_length).toBe(3);
    expect(acme.median_length).toBe(2.5);
  });

  it("orders rows alphabetically by reseller_code", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("ZETA", 1000),
        mrrRow("ACME", 1000),
        mrrRow("INFOVISION", 1000),
      ]),
      mrrSnap(1, [
        mrrRow("ZETA", 1400),
        mrrRow("ACME", 1400),
        mrrRow("INFOVISION", 1400),
      ]),
      mrrSnap(2, [
        mrrRow("ZETA", 900),
        mrrRow("ACME", 900),
        mrrRow("INFOVISION", 900),
      ]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(cov.rows.map((r) => r.reseller_code)).toEqual([
      "ACME",
      "INFOVISION",
      "ZETA",
    ]);
  });

  it("surfaces counter-balanced partners the P11.53 portfolio topline would hide", () => {
    // INFOVISION oscillates +30, -30, +30 while ACME mirrors -30, +30, -30.
    // Portfolio total stays flat → P11.53 would show zero streak coverage.
    // Per-partner drill-down correctly shows both partners on length-3 runs.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 13000), mrrRow("ACME", 7000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9100), mrrRow("ACME", 9100)]),
      mrrSnap(3, [mrrRow("INFOVISION", 11830), mrrRow("ACME", 6370)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(info.metrics_with_streak).toBe(1);
    expect(info.max_length).toBe(3);
    expect(acme.metrics_with_streak).toBe(1);
    expect(acme.max_length).toBe(3);
  });

  it("keeps a partner with zero qualifying metrics in the ladder (visible flat)", () => {
    // INFOVISION streaks; ACME stays sub-threshold. Both should surface.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000), mrrRow("ACME", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10500), mrrRow("ACME", 10200)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(acme.total_metrics).toBe(1);
    expect(acme.metrics_with_streak).toBe(0);
    expect(acme.coverage_rate_pct).toBe(0);
    expect(acme.min_length).toBeNull();
    expect(acme.max_length).toBeNull();
    expect(acme.median_length).toBeNull();
  });

  it("caller-widened min streak length can drop a length-2 metric from a partner's coverage", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10500)]),
    ]);
    const cov = computeDigestSnapshotPerResellerPctChangeStreakCoverage(
      trend,
      3,
    );
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(cov.min_streak_length).toBe(3);
    expect(info.total_metrics).toBe(1);
    expect(info.metrics_with_streak).toBe(0);
    expect(info.coverage_rate_pct).toBe(0);
  });

  it("launch-week (prev=0) partners cannot fabricate coverage", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 0)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10500)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    // Only one qualifying transition after the launch-week break — no streak.
    expect(info.metrics_with_streak).toBe(0);
  });

  it("uses the observed per-partner denominator, not HEADLINE_METRICS.length", () => {
    // INFOVISION only produces mrr trend → total_metrics === 1, coverage 100%.
    // If the denominator were HEADLINE_METRICS.length (>1) the coverage_rate_pct
    // would be < 100 — this test locks in the per-partner observed-count posture.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10500)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(info.total_metrics).toBe(1);
    expect(info.coverage_rate_pct).toBe(100);
  });
});

describe("formatDigestSnapshotPerResellerPctChangeStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when zero partners are observed", () => {
    const cov = computeDigestSnapshotPerResellerPctChangeStreakCoverage(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when every observed partner is sub-threshold flat", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 10100)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10200)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(cov),
    ).toBe("");
  });

  it("renders the seven-column table with headers + partner code + week labels + tuning constants", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10500)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(cov);
    expect(html).toContain("Reseller");
    expect(html).toContain("Total metrics");
    expect(html).toContain("With streak");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+`);
  });

  it("HTML-escapes reseller_code and week labels", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 10000)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 15000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 10500)] },
      }),
    ]);
    const cov =
      computeDigestSnapshotPerResellerPctChangeStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).toContain("&lt;x&gt;PARTNER");
    expect(html).not.toContain(">PARTNER</td");
  });
});
