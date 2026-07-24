import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { DEFAULT_MIN_STREAK_LENGTH } from "./digest-snapshot-per-reseller-direction-streaks";
import {
  computeDigestSnapshotPerResellerDirectionStreakCoverage,
  formatDigestSnapshotPerResellerDirectionStreakCoverageSection,
} from "./digest-snapshot-per-reseller-direction-streak-coverage";

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

describe("computeDigestSnapshotPerResellerDirectionStreakCoverage — shape", () => {
  it("passes through window metadata + min_streak_length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(cov.window_size).toBe(3);
    expect(cov.first_week).toBe("2026-W28");
    expect(cov.last_week).toBe("2026-W30");
    expect(cov.min_streak_length).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("returns empty rows on empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(cov.rows).toEqual([]);
    expect(cov.window_size).toBe(0);
  });

  it("coerces minStreakLength < 1 back to DEFAULT_MIN_STREAK_LENGTH via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend, 0)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend, -5)
        .min_streak_length,
    ).toBe(DEFAULT_MIN_STREAK_LENGTH);
  });

  it("floors fractional minStreakLength via the underlying detector", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend, 3.7)
        .min_streak_length,
    ).toBe(3);
  });
});

describe("computeDigestSnapshotPerResellerDirectionStreakCoverage — per-partner buckets", () => {
  it("counts a partner with a single up-streak metric (up_rate positive, down_rate zero)", () => {
    // Length-2 up-streak: 9900 → 12000 → 15000
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(cov.rows).toHaveLength(1);
    const info = cov.rows[0];
    expect(info.reseller_code).toBe("INFOVISION");
    expect(info.total_metrics).toBe(1);
    expect(info.metrics_with_streak).toBe(1);
    expect(info.metrics_up_streak).toBe(1);
    expect(info.metrics_down_streak).toBe(0);
    expect(info.coverage_rate_pct).toBe(100);
    expect(info.up_coverage_rate_pct).toBe(100);
    expect(info.down_coverage_rate_pct).toBe(0);
    expect(info.min_length).toBe(2);
    expect(info.max_length).toBe(2);
    expect(info.median_length).toBe(2);
  });

  it("counts a partner with a single down-streak metric (mirror image)", () => {
    // Length-2 down-streak: 15000 → 12000 → 9900
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 15000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 9900)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const info = cov.rows[0];
    expect(info.metrics_with_streak).toBe(1);
    expect(info.metrics_up_streak).toBe(0);
    expect(info.metrics_down_streak).toBe(1);
    expect(info.up_coverage_rate_pct).toBe(0);
    expect(info.down_coverage_rate_pct).toBe(100);
  });

  it("splits up/down cleanly when a partner has one metric per direction", () => {
    // INFOVISION mrr up-streak length-2 + INFOVISION churn down-streak length-2.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("INFOVISION", 9900)], [churnRow("INFOVISION", 30)]),
      bothSnap(1, [mrrRow("INFOVISION", 12000)], [churnRow("INFOVISION", 20)]),
      bothSnap(2, [mrrRow("INFOVISION", 15000)], [churnRow("INFOVISION", 10)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const info = cov.rows[0];
    expect(info.total_metrics).toBe(2);
    expect(info.metrics_with_streak).toBe(2);
    expect(info.metrics_up_streak).toBe(1);
    expect(info.metrics_down_streak).toBe(1);
    expect(info.coverage_rate_pct).toBe(100);
    expect(info.up_coverage_rate_pct).toBe(50);
    expect(info.down_coverage_rate_pct).toBe(50);
  });

  it("captures the streak-length distribution when a partner has multiple qualifying metrics", () => {
    // ACME mrr up-streak length-3 (10000 → 12000 → 14000 → 16000)
    // ACME churn down-streak length-2 (30 → 20 → 10 → 10 flat break, still length-2)
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      bothSnap(0, [mrrRow("ACME", 10000)], [churnRow("ACME", 30)]),
      bothSnap(1, [mrrRow("ACME", 12000)], [churnRow("ACME", 20)]),
      bothSnap(2, [mrrRow("ACME", 14000)], [churnRow("ACME", 10)]),
      bothSnap(3, [mrrRow("ACME", 16000)], [churnRow("ACME", 10)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(acme.total_metrics).toBe(2);
    expect(acme.metrics_with_streak).toBe(2);
    expect(acme.metrics_up_streak).toBe(1);
    expect(acme.metrics_down_streak).toBe(1);
    expect(acme.min_length).toBe(2);
    expect(acme.max_length).toBe(3);
    expect(acme.median_length).toBe(2.5);
  });

  it("orders rows alphabetically by reseller_code", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [
        mrrRow("ZETA", 9900),
        mrrRow("ACME", 15000),
        mrrRow("INFOVISION", 9900),
      ]),
      mrrSnap(1, [
        mrrRow("ZETA", 12000),
        mrrRow("ACME", 12000),
        mrrRow("INFOVISION", 12000),
      ]),
      mrrSnap(2, [
        mrrRow("ZETA", 15000),
        mrrRow("ACME", 9900),
        mrrRow("INFOVISION", 15000),
      ]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(cov.rows.map((r) => r.reseller_code)).toEqual([
      "ACME",
      "INFOVISION",
      "ZETA",
    ]);
  });

  it("surfaces counter-balanced partners the P11.57 portfolio topline would hide", () => {
    // INFOVISION climbs 4 weeks straight, ACME slides 4 weeks straight; the
    // aggregate portfolio total is flat. P11.57 would show zero streaks.
    // Per-partner drill-down correctly reports both partners on length-3
    // runs (one up, one down).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000), mrrRow("ACME", 20000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000), mrrRow("ACME", 18000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 14000), mrrRow("ACME", 16000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 16000), mrrRow("ACME", 14000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(info.metrics_with_streak).toBe(1);
    expect(info.metrics_up_streak).toBe(1);
    expect(info.metrics_down_streak).toBe(0);
    expect(info.max_length).toBe(3);
    expect(acme.metrics_with_streak).toBe(1);
    expect(acme.metrics_up_streak).toBe(0);
    expect(acme.metrics_down_streak).toBe(1);
    expect(acme.max_length).toBe(3);
  });

  it("keeps a partner with zero qualifying metrics in the ladder (visible flat)", () => {
    // INFOVISION climbs; ACME goes up then down (only length-1 runs, no streak).
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900), mrrRow("ACME", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000), mrrRow("ACME", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000), mrrRow("ACME", 10000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const acme = cov.rows.find((r) => r.reseller_code === "ACME")!;
    expect(acme.total_metrics).toBe(1);
    expect(acme.metrics_with_streak).toBe(0);
    expect(acme.metrics_up_streak).toBe(0);
    expect(acme.metrics_down_streak).toBe(0);
    expect(acme.coverage_rate_pct).toBe(0);
    expect(acme.up_coverage_rate_pct).toBe(0);
    expect(acme.down_coverage_rate_pct).toBe(0);
    expect(acme.min_length).toBeNull();
    expect(acme.max_length).toBeNull();
    expect(acme.median_length).toBeNull();
  });

  it("caller-widened min streak length can drop a length-2 metric from a partner's coverage", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov = computeDigestSnapshotPerResellerDirectionStreakCoverage(
      trend,
      3,
    );
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(cov.min_streak_length).toBe(3);
    expect(info.total_metrics).toBe(1);
    expect(info.metrics_with_streak).toBe(0);
    expect(info.coverage_rate_pct).toBe(0);
  });

  it("flat point severs a streak so an oscillating partner scores zero coverage", () => {
    // 10000 → 12000 → 12000 → 14000: an up transition, a flat break, another up
    // transition — max streak length is 1, below DEFAULT_MIN_STREAK_LENGTH=2.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(3, [mrrRow("INFOVISION", 14000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(info.metrics_with_streak).toBe(0);
  });

  it("uses the observed per-partner denominator, not HEADLINE_METRICS.length", () => {
    // INFOVISION only produces mrr trend → total_metrics === 1, coverage 100%.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const info = cov.rows.find((r) => r.reseller_code === "INFOVISION")!;
    expect(info.total_metrics).toBe(1);
    expect(info.coverage_rate_pct).toBe(100);
  });
});

describe("formatDigestSnapshotPerResellerDirectionStreakCoverageSection", () => {
  it("returns empty on window_size < 3", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when zero partners are observed", () => {
    const cov = computeDigestSnapshotPerResellerDirectionStreakCoverage(
      computeDigestSnapshotPerResellerRollingTrend([]),
    );
    expect(
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("returns empty when every observed partner is flat (zero qualifying streaks)", () => {
    // Alternating up/down keeps every partner at length-1 max.
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 10000)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 10000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(cov),
    ).toBe("");
  });

  it("renders the eleven-column table with headers + partner code + week labels + min_streak_length", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      mrrSnap(0, [mrrRow("INFOVISION", 9900)]),
      mrrSnap(1, [mrrRow("INFOVISION", 12000)]),
      mrrSnap(2, [mrrRow("INFOVISION", 15000)]),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(cov);
    expect(html).toContain("Reseller");
    expect(html).toContain("Total metrics");
    expect(html).toContain("With streak");
    expect(html).toContain("Up");
    expect(html).toContain("Down");
    expect(html).toContain("Coverage rate");
    expect(html).toContain("Up rate");
    expect(html).toContain("Down rate");
    expect(html).toContain("Min length");
    expect(html).toContain("Median length");
    expect(html).toContain("Max length");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W30");
    expect(html).toContain(`${DEFAULT_MIN_STREAK_LENGTH}+`);
  });

  it("HTML-escapes reseller_code and week labels", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([
      snap("<script>W1", T(0), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 9900)] },
      }),
      snap("W2", T(7), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 12000)] },
      }),
      snap('W3"quote', T(14), {
        attributed_mrr: { rows: [mrrRow("<x>PARTNER", 15000)] },
      }),
    ]);
    const cov =
      computeDigestSnapshotPerResellerDirectionStreakCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerDirectionStreakCoverageSection(cov);
    expect(html).not.toContain("<script>W1");
    expect(html).toContain("&lt;script&gt;W1");
    expect(html).toContain("W3&quot;quote");
    expect(html).toContain("&lt;x&gt;PARTNER");
    expect(html).not.toContain(">PARTNER</td");
  });
});
