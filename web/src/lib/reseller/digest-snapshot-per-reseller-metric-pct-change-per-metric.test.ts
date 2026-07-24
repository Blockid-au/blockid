import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE,
  computeDigestSnapshotPerResellerMetricPctChangePerMetric,
  formatDigestSnapshotPerResellerMetricPctChangePerMetricSection,
} from "./digest-snapshot-per-reseller-metric-pct-change-per-metric";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerMetricPctChangePerMetric — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    expect(perMetric.window_size).toBe(2);
    expect(perMetric.first_week).toBe("2026-W28");
    expect(perMetric.last_week).toBe("2026-W29");
    expect(perMetric.top_n_per_metric).toBe(
      DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE,
    );
    expect(perMetric.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    expect(perMetric.window_size).toBe(0);
    expect(perMetric.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        rows: undefined as unknown as never,
      } as never);
    expect(perMetric.rows).toEqual([]);
    expect(perMetric.window_size).toBe(4);
  });

  it("coerces topNPerMetric < 1 to DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 0)
        .top_n_per_metric,
    ).toBe(DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, -3)
        .top_n_per_metric,
    ).toBe(DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, NaN)
        .top_n_per_metric,
    ).toBe(DEFAULT_TOP_N_PER_METRIC_PCT_CHANGE);
  });

  it("respects explicit topNPerMetric when >= 1", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 3)
        .top_n_per_metric,
    ).toBe(3);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 12)
        .top_n_per_metric,
    ).toBe(12);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChangePerMetric — pct math + filters", () => {
  it("excludes launch-week rows (first_total === 0)", () => {
    const snaps = [0, 5000].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    expect(perMetric.rows.length).toBe(0);
  });

  it("excludes rows where either bookend is null (single-week partner)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "AAA", mrr_cents: 1000 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [] },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const aaa = perMetric.rows.find((r) => r.reseller_code === "AAA");
    expect(aaa).toBeUndefined();
  });

  it("computes signed percent change rounded to one decimal", () => {
    const snaps = [10000, 12345].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const mrr = perMetric.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.first_total).toBe(10000);
    expect(mrr.last_total).toBe(12345);
    expect(mrr.pct_change).toBe(23.5);
  });

  it("emits negative pct on a regression", () => {
    const snaps = [10000, 7500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const mrr = perMetric.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.pct_change).toBe(-25);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChangePerMetric — grouping guarantees coverage", () => {
  it("gives each metric its own spotlight even when one metric would monopolise a pooled ranking", () => {
    // Metric A (attributed_mrr): three big movers (+90/+80/+70%).
    // Metric B (attributed_churn_30d): one smaller mover (+40%).
    // Pooled top-3 (P11.39 shape) would return only attributed_mrr rows —
    // per-metric grouping guarantees attributed_churn_30d still surfaces.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 100 },
            { reseller_code: "P2", mrr_cents: 100 },
            { reseller_code: "P3", mrr_cents: 100 },
          ],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "Q1",
              churned_count: 10,
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 190 }, // +90%
            { reseller_code: "P2", mrr_cents: 180 }, // +80%
            { reseller_code: "P3", mrr_cents: 170 }, // +70%
          ],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "Q1",
              churned_count: 14, // +40%
              attributed_denominator: 100,
              churn_rate_pct: 14,
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 1);
    // Exactly one row per metric — coverage guaranteed even against a pooled
    // ranking that would have dropped attributed_churn_30d.
    const keys = perMetric.rows.map((r) => r.key);
    expect(keys).toContain("attributed_mrr");
    expect(keys).toContain("attributed_churn_30d");
    // Top per-metric mover chosen by |pct_change| desc within each bucket.
    const mrrRow = perMetric.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrrRow.reseller_code).toBe("P1");
    expect(mrrRow.pct_change).toBe(90);
    const churnRow = perMetric.rows.find(
      (r) => r.key === "attributed_churn_30d",
    )!;
    expect(churnRow.reseller_code).toBe("Q1");
    expect(churnRow.pct_change).toBe(40);
  });

  it("orders rows by HEADLINE_METRICS spec order, not by |pct_change| across metrics", () => {
    // Two metrics with movers; verify the emitted order matches spec order
    // (attributed_mrr precedes attributed_churn_30d in HEADLINE_METRICS).
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "MRR1", mrr_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "CHR1",
              churned_count: 5,
              attributed_denominator: 100,
              churn_rate_pct: 5,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "MRR1", mrr_cents: 110 }], // +10%
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "CHR1",
              churned_count: 10, // +100% (larger |pct|)
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    // attributed_mrr (smaller |pct|) still appears first because
    // HEADLINE_METRICS spec order dominates.
    expect(perMetric.rows.map((r) => r.key)).toEqual([
      "attributed_mrr",
      "attributed_churn_30d",
    ]);
  });

  it("within a metric bucket sorts by |pct_change| desc, then reseller_code asc", () => {
    // Two partners with the same |pct_change|; alphabetical tie-break.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BETA", mrr_cents: 100 },
            { reseller_code: "ALPHA", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BETA", mrr_cents: 200 },
            { reseller_code: "ALPHA", mrr_cents: 200 },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 2);
    const mrrRows = perMetric.rows.filter((r) => r.key === "attributed_mrr");
    expect(mrrRows[0].reseller_code).toBe("ALPHA");
    expect(mrrRows[1].reseller_code).toBe("BETA");
    expect(mrrRows[0].rank_in_metric).toBe(1);
    expect(mrrRows[1].rank_in_metric).toBe(2);
  });

  it("caps rows per metric at top_n_per_metric", () => {
    const week1: Array<{ reseller_code: string; mrr_cents: number }> = [];
    const week2: Array<{ reseller_code: string; mrr_cents: number }> = [];
    for (let i = 0; i < 5; i++) {
      week1.push({ reseller_code: `P${i}`, mrr_cents: 100 });
      week2.push({ reseller_code: `P${i}`, mrr_cents: 100 + (i + 1) * 10 });
    }
    const snaps = [
      snap("2026-W28", T(0), { attributed_mrr: { rows: week1 } }),
      snap("2026-W29", T(7), { attributed_mrr: { rows: week2 } }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend, 2);
    const mrrRows = perMetric.rows.filter((r) => r.key === "attributed_mrr");
    expect(mrrRows.length).toBe(2);
    expect(mrrRows.map((r) => r.reseller_code)).toEqual(["P4", "P3"]);
    expect(mrrRows.map((r) => r.rank_in_metric)).toEqual([1, 2]);
  });
});

describe("formatDigestSnapshotPerResellerMetricPctChangePerMetricSection", () => {
  it("returns empty string on window_size < 2", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      ),
    ).toBe("");
  });

  it("returns empty string when every row is filtered (all launch-week)", () => {
    const snaps = [0, 5000].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    expect(perMetric.rows.length).toBe(0);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      ),
    ).toBe("");
  });

  it("renders section/metric/rank/reseller/pct columns with signed percent formatting", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      );
    expect(html).toContain("INFOVISION");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("+25.0%");
    expect(html).toContain("<th>Section</th>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("<th>Rank</th>");
    expect(html).toContain("<th>Reseller</th>");
    expect(html).toContain("#1");
  });

  it("amber-highlights rows above the threshold and leaves smaller rows plain", () => {
    // Two metrics — one with a >threshold mover, one below.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "BIG", mrr_cents: 10000 }],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "SMALL",
              churned_count: 100,
              attributed_denominator: 1000,
              churn_rate_pct: 10,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "BIG", mrr_cents: 13000 }], // +30%
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "SMALL",
              churned_count: 105, // +5%
              attributed_denominator: 1000,
              churn_rate_pct: 10.5,
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      );
    const bigRow = html.match(
      /<tr[^>]*>\s*<td>attributed_mrr<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(bigRow).toBeDefined();
    expect(bigRow!).toContain('style="background:#fff8e1"');
    const smallRow = html.match(
      /<tr[^>]*>\s*<td>attributed_churn_30d<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(smallRow).toBeDefined();
    expect(smallRow!).not.toContain("background");
  });

  it("escapes HTML in week labels", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(
        i === 0 ? '2026-W28"' : "2026-W<script>",
        T(i * 7),
        {
          attributed_mrr: {
            rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
          },
        },
      ),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      );
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("negative pct rows render with a leading minus", () => {
    const snaps = [10000, 7500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      );
    expect(html).toContain("-25.0%");
    expect(html).not.toContain("+-25");
  });

  it("threshold used in the preamble matches the envelope constant", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perMetric =
      computeDigestSnapshotPerResellerMetricPctChangePerMetric(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerMetricSection(
        perMetric,
      );
    expect(html).toContain(`${perMetric.threshold}%`);
  });
});
