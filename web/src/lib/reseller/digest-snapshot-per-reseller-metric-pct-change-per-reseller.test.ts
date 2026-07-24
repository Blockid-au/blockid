import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE,
  computeDigestSnapshotPerResellerMetricPctChangePerReseller,
  formatDigestSnapshotPerResellerMetricPctChangePerResellerSection,
} from "./digest-snapshot-per-reseller-metric-pct-change-per-reseller";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerMetricPctChangePerReseller — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    expect(perReseller.window_size).toBe(2);
    expect(perReseller.first_week).toBe("2026-W28");
    expect(perReseller.last_week).toBe("2026-W29");
    expect(perReseller.top_n_per_reseller).toBe(
      DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE,
    );
    expect(perReseller.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    expect(perReseller.window_size).toBe(0);
    expect(perReseller.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller({
        window_size: 4,
        first_week: "2026-W28",
        last_week: "2026-W31",
        rows: undefined as unknown as never,
      } as never);
    expect(perReseller.rows).toEqual([]);
    expect(perReseller.window_size).toBe(4);
  });

  it("coerces topNPerReseller < 1 to DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 0)
        .top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, -3)
        .top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, NaN)
        .top_n_per_reseller,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_PCT_CHANGE);
  });

  it("respects explicit topNPerReseller when >= 1", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 3)
        .top_n_per_reseller,
    ).toBe(3);
    expect(
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 12)
        .top_n_per_reseller,
    ).toBe(12);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChangePerReseller — pct math + filters", () => {
  it("excludes launch-week rows (first_total === 0)", () => {
    const snaps = [0, 5000].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    expect(perReseller.rows.length).toBe(0);
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const aaa = perReseller.rows.find((r) => r.reseller_code === "AAA");
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const mrr = perReseller.rows.find((r) => r.key === "attributed_mrr")!;
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const mrr = perReseller.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.pct_change).toBe(-25);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChangePerReseller — grouping guarantees coverage", () => {
  it("gives each partner its own spotlight even when one partner would monopolise a pooled ranking", () => {
    // Partner P1 has three big movers across three metrics (all >70%).
    // Partner Q1 has one smaller mover (+40%) in one metric.
    // Pooled top-3 |pct_change| (P11.39 shape) would return only P1's rows —
    // per-reseller grouping guarantees Q1 still surfaces.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "P1", mrr_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "P1",
              churned_count: 10,
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
            {
              reseller_code: "Q1",
              churned_count: 10,
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
          ],
        },
        gst_reconciliation_delta: {
          rows: [
            {
              reseller_code: "P1",
              net_gst_cents: 100,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "P1", mrr_cents: 190 }], // +90%
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "P1",
              churned_count: 18, // +80%
              attributed_denominator: 100,
              churn_rate_pct: 18,
            },
            {
              reseller_code: "Q1",
              churned_count: 14, // +40%
              attributed_denominator: 100,
              churn_rate_pct: 14,
            },
          ],
        },
        gst_reconciliation_delta: {
          rows: [
            {
              reseller_code: "P1",
              net_gst_cents: 170, // +70%
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 1);
    const codes = perReseller.rows.map((r) => r.reseller_code);
    expect(codes).toContain("P1");
    expect(codes).toContain("Q1");
    // Top per-partner mover chosen by |pct_change| desc within each bucket.
    const p1Row = perReseller.rows.find((r) => r.reseller_code === "P1")!;
    expect(p1Row.pct_change).toBe(90);
    expect(p1Row.key).toBe("attributed_mrr");
    const q1Row = perReseller.rows.find((r) => r.reseller_code === "Q1")!;
    expect(q1Row.pct_change).toBe(40);
    expect(q1Row.key).toBe("attributed_churn_30d");
  });

  it("orders rows by reseller_code asc, not by |pct_change| across partners", () => {
    // Two partners with movers; verify the emitted order matches alphabetical
    // reseller_code order even when the pct-change ranking would flip them.
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
            { reseller_code: "BETA", mrr_cents: 500 }, // +400%
            { reseller_code: "ALPHA", mrr_cents: 110 }, // +10%
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    // ALPHA (smaller |pct|) still appears first because reseller_code asc
    // dominates.
    expect(perReseller.rows.map((r) => r.reseller_code)).toEqual([
      "ALPHA",
      "BETA",
    ]);
  });

  it("within a reseller bucket sorts by |pct_change| desc, then HEADLINE_METRICS spec order", () => {
    // Two metrics for the same partner with the same |pct_change|;
    // HEADLINE_METRICS spec order (attributed_mrr precedes
    // attributed_churn_30d) breaks the tie.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "INFOVISION",
              churned_count: 5,
              attributed_denominator: 100,
              churn_rate_pct: 5,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 200 }], // +100%
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "INFOVISION",
              churned_count: 10, // +100%
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 2);
    const infoRows = perReseller.rows.filter(
      (r) => r.reseller_code === "INFOVISION",
    );
    expect(infoRows.map((r) => r.key)).toEqual([
      "attributed_mrr",
      "attributed_churn_30d",
    ]);
    expect(infoRows.map((r) => r.rank_in_reseller)).toEqual([1, 2]);
  });

  it("caps rows per reseller at top_n_per_reseller", () => {
    // Partner P1 has movers across three metrics; topN=2 caps the emitted
    // rows to the top-2 by |pct_change|.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "P1", mrr_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "P1",
              churned_count: 10,
              attributed_denominator: 100,
              churn_rate_pct: 10,
            },
          ],
        },
        gst_reconciliation_delta: {
          rows: [
            {
              reseller_code: "P1",
              net_gst_cents: 100,
            },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "P1", mrr_cents: 200 }], // +100%
        },
        attributed_churn_30d: {
          rows: [
            {
              reseller_code: "P1",
              churned_count: 15, // +50%
              attributed_denominator: 100,
              churn_rate_pct: 15,
            },
          ],
        },
        gst_reconciliation_delta: {
          rows: [
            {
              reseller_code: "P1",
              net_gst_cents: 175, // +75%
            },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend, 2);
    const p1Rows = perReseller.rows.filter((r) => r.reseller_code === "P1");
    expect(p1Rows.length).toBe(2);
    expect(p1Rows.map((r) => r.pct_change)).toEqual([100, 75]);
    expect(p1Rows.map((r) => r.rank_in_reseller)).toEqual([1, 2]);
  });
});

describe("formatDigestSnapshotPerResellerMetricPctChangePerResellerSection", () => {
  it("returns empty string on window_size < 2", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    expect(perReseller.rows.length).toBe(0);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
      ),
    ).toBe("");
  });

  it("renders reseller/rank/section/metric/pct columns with signed percent formatting", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
      );
    expect(html).toContain("INFOVISION");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("+25.0%");
    expect(html).toContain("<th>Reseller</th>");
    expect(html).toContain("<th>Rank</th>");
    expect(html).toContain("<th>Section</th>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("#1");
  });

  it("amber-highlights rows above the threshold and leaves smaller rows plain", () => {
    // Two partners — one with a >threshold mover, one below.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA_BIG", mrr_cents: 10000 },
            { reseller_code: "ZZZ_SMALL", mrr_cents: 10000 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA_BIG", mrr_cents: 13000 }, // +30%
            { reseller_code: "ZZZ_SMALL", mrr_cents: 10500 }, // +5%
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
      );
    const bigRow = html.match(
      /<tr[^>]*>\s*<td>AAA_BIG<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(bigRow).toBeDefined();
    expect(bigRow!).toContain('style="background:#fff8e1"');
    const smallRow = html.match(
      /<tr[^>]*>\s*<td>ZZZ_SMALL<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(smallRow).toBeDefined();
    expect(smallRow!).not.toContain("background");
  });

  it("escapes HTML in reseller_code and week labels", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(
        i === 0 ? '2026-W28"' : "2026-W<script>",
        T(i * 7),
        {
          attributed_mrr: {
            rows: [
              { reseller_code: "<script>alert(1)</script>", mrr_cents: cents },
            ],
          },
        },
      ),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
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
    const perReseller =
      computeDigestSnapshotPerResellerMetricPctChangePerReseller(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangePerResellerSection(
        perReseller,
      );
    expect(html).toContain(`${perReseller.threshold}%`);
  });
});
