import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  DEFAULT_TOP_N_PER_METRIC,
  computeDigestSnapshotTopMoversPerMetric,
  formatDigestSnapshotTopMoversPerMetricSection,
} from "./digest-snapshot-top-movers-per-metric";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotTopMoversPerMetric — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [9900, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(perMetric.window_size).toBe(2);
    expect(perMetric.first_week).toBe("2026-W28");
    expect(perMetric.last_week).toBe("2026-W29");
    expect(perMetric.top_n_per_metric).toBe(DEFAULT_TOP_N_PER_METRIC);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(perMetric.window_size).toBe(0);
    expect(perMetric.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const perMetric = computeDigestSnapshotTopMoversPerMetric({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
    });
    expect(perMetric.rows).toEqual([]);
    expect(perMetric.window_size).toBe(4);
  });

  it("coerces topNPerMetric < 1 to DEFAULT_TOP_N_PER_METRIC", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(computeDigestSnapshotTopMoversPerMetric(trend, 0).top_n_per_metric).toBe(
      DEFAULT_TOP_N_PER_METRIC,
    );
    expect(computeDigestSnapshotTopMoversPerMetric(trend, -3).top_n_per_metric).toBe(
      DEFAULT_TOP_N_PER_METRIC,
    );
    expect(computeDigestSnapshotTopMoversPerMetric(trend, NaN).top_n_per_metric).toBe(
      DEFAULT_TOP_N_PER_METRIC,
    );
  });
});

describe("computeDigestSnapshotTopMoversPerMetric — per-metric coverage", () => {
  it("guarantees a spotlight for each metric even when unit scales differ wildly", () => {
    // MRR delta (cents) is 500000 (A$5000). Churn delta (count) is 5. The
    // P11.24 raw-|delta| ranking would put MRR at rank 1 and never surface
    // churn in top-5 if MRR had multiple resellers. This section separates
    // them so both metrics get spotlight coverage.
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 500000 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "BBB", churned_count: i === 0 ? 0 : 5 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const keys = perMetric.rows.map((r) => r.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });

  it("preserves HEADLINE_METRICS spec order across metric groups", () => {
    // Seed a mover in three metrics — their spotlight rows must emerge in the
    // spec-order (churn is spec[6], drift is spec[7], mrr is spec[4]).
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "BBB", churned_count: i === 0 ? 0 : 2 }],
        },
        ledger_drift_events: {
          rows: [{ reseller_code: "CCC", total_drift_count: i === 0 ? 0 : 3 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const keys = perMetric.rows.map((r) => r.key);
    const specOrder = HEADLINE_METRICS.map((s) => s.key);
    const seenPositions = keys.map((k) => specOrder.indexOf(k));
    // Ordering across metric groups must be monotonically non-decreasing.
    for (let i = 1; i < seenPositions.length; i++) {
      expect(seenPositions[i]).toBeGreaterThanOrEqual(seenPositions[i - 1]);
    }
  });

  it("picks the biggest |delta| within each metric group", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 }, // +100
            { reseller_code: "BBB", mrr_cents: i === 0 ? 0 : 999 }, // +999
            { reseller_code: "CCC", mrr_cents: i === 0 ? 500 : 0 }, // -500
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend, 1);
    expect(perMetric.rows).toHaveLength(1);
    expect(perMetric.rows[0].key).toBe("attributed_mrr");
    expect(perMetric.rows[0].reseller_code).toBe("BBB");
    expect(perMetric.rows[0].abs_delta).toBe(999);
    expect(perMetric.rows[0].rank_in_metric).toBe(1);
  });

  it("respects topNPerMetric > 1 and emits ranks 1..N per metric", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 }, // +100
            { reseller_code: "BBB", mrr_cents: i === 0 ? 0 : 200 }, // +200
            { reseller_code: "CCC", mrr_cents: i === 0 ? 0 : 300 }, // +300
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend, 2);
    expect(perMetric.rows).toHaveLength(2);
    expect(perMetric.rows[0].reseller_code).toBe("CCC");
    expect(perMetric.rows[0].rank_in_metric).toBe(1);
    expect(perMetric.rows[1].reseller_code).toBe("BBB");
    expect(perMetric.rows[1].rank_in_metric).toBe(2);
  });

  it("tiebreaks equal |delta| by reseller_code asc within a metric group", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "ZED", mrr_cents: i === 0 ? 0 : 500 },
            { reseller_code: "ALPHA", mrr_cents: i === 0 ? 0 : 500 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend, 2);
    const codes = perMetric.rows.map((r) => r.reseller_code);
    expect(codes).toEqual(["ALPHA", "ZED"]);
  });

  it("excludes null-delta rows (partner with fewer than 2 non-null points)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: 9900 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [] },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(perMetric.rows.find((r) => r.reseller_code === "AAA")).toBeUndefined();
  });

  it("excludes zero-delta rows (flat lines are not movers)", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "FLAT", mrr_cents: 9900 },
            { reseller_code: "MOVER", mrr_cents: i === 0 ? 9900 : 12900 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(perMetric.rows.map((r) => r.reseller_code)).toEqual(["MOVER"]);
  });

  it("omits metrics with no non-null-non-zero movers (no forced empty spotlight)", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          // Only a flat partner — no mover for this metric.
          rows: [{ reseller_code: "FLAT", mrr_cents: 9900 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "AAA", churned_count: i === 0 ? 0 : 3 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const keys = perMetric.rows.map((r) => r.key);
    expect(keys).not.toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
  });
});

describe("formatDigestSnapshotTopMoversPerMetricSection", () => {
  it("returns empty string on single-snapshot window", () => {
    const one = snap("2026-W28", T(0), {
      attributed_mrr: { rows: [{ reseller_code: "AAA", mrr_cents: 9900 }] },
    });
    const trend = computeDigestSnapshotPerResellerRollingTrend([one]);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(formatDigestSnapshotTopMoversPerMetricSection(perMetric)).toBe("");
  });

  it("returns empty string when no metric produced a spotlight", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "FLAT", mrr_cents: 9900 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    expect(formatDigestSnapshotTopMoversPerMetricSection(perMetric)).toBe("");
  });

  it("renders an HTML table with formatted cents + delta + week range + rank", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: i === 0 ? 9900 : 14800 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const html = formatDigestSnapshotTopMoversPerMetricSection(perMetric);
    expect(html).toContain("mover per metric");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W29");
    expect(html).toContain("AAA");
    expect(html).toContain("#1");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("+A$49.00");
  });

  it("pluralises the section heading when top_n_per_metric > 1", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: i === 0 ? 0 : 100 },
            { reseller_code: "BBB", mrr_cents: i === 0 ? 0 : 200 },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend, 2);
    const html = formatDigestSnapshotTopMoversPerMetricSection(perMetric);
    expect(html).toContain("Top 2 movers per metric");
  });

  it("escapes HTML in reseller codes and week labels", () => {
    const snaps = [0, 1].map((i) =>
      snap(`<w${i}>`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "<b>x</b>", mrr_cents: i === 0 ? 0 : 100 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const html = formatDigestSnapshotTopMoversPerMetricSection(perMetric);
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;b&gt;x&lt;/b&gt;");
    expect(html).toContain("&lt;w0&gt;");
    expect(html).toContain("&lt;w1&gt;");
  });

  it("renders count-unit metrics without the A$ prefix", () => {
    const snaps = [0, 1].map((i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_churn_30d: {
          rows: [{ reseller_code: "AAA", churned_count: i === 0 ? 0 : 3 }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric = computeDigestSnapshotTopMoversPerMetric(trend);
    const html = formatDigestSnapshotTopMoversPerMetricSection(perMetric);
    expect(html).toContain(">3<");
    expect(html).toContain("+3");
    expect(html).not.toContain("A$3");
  });
});
