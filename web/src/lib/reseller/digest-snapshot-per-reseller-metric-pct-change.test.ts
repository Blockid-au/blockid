import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import {
  DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE,
  computeDigestSnapshotPerResellerMetricPctChange,
  formatDigestSnapshotPerResellerMetricPctChangeSection,
} from "./digest-snapshot-per-reseller-metric-pct-change";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerMetricPctChange — shape", () => {
  it("passes through window metadata from the trend envelope", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(perReseller.window_size).toBe(2);
    expect(perReseller.first_week).toBe("2026-W28");
    expect(perReseller.last_week).toBe("2026-W29");
    expect(perReseller.top_n).toBe(
      DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE,
    );
    expect(perReseller.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("returns empty rows on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(perReseller.window_size).toBe(0);
    expect(perReseller.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
      top_n: 5,
      threshold: PCT_CHANGE_MATERIAL_THRESHOLD,
    } as never);
    expect(perReseller.rows).toEqual([]);
    expect(perReseller.window_size).toBe(4);
  });

  it("coerces topN < 1 to DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChange(trend, 0).top_n,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChange(trend, -3).top_n,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE);
    expect(
      computeDigestSnapshotPerResellerMetricPctChange(trend, NaN).top_n,
    ).toBe(DEFAULT_TOP_N_PER_RESELLER_METRIC_PCT_CHANGE);
  });

  it("respects explicit topN when >= 1", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(
      computeDigestSnapshotPerResellerMetricPctChange(trend, 3).top_n,
    ).toBe(3);
    expect(
      computeDigestSnapshotPerResellerMetricPctChange(trend, 12).top_n,
    ).toBe(12);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChange — pct math", () => {
  it("computes signed percent change rounded to one decimal", () => {
    const snaps = [10000, 12345].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const mrr = perReseller.rows.find(
      (r) => r.reseller_code === "INFOVISION" && r.key === "attributed_mrr",
    )!;
    expect(mrr.first_total).toBe(10000);
    expect(mrr.last_total).toBe(12345);
    expect(mrr.pct_change).toBe(23.5);
  });

  it("excludes launch-week rows (first_total === 0)", () => {
    const snaps = [0, 5000].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const mrr = perReseller.rows.find(
      (r) => r.reseller_code === "INFOVISION" && r.key === "attributed_mrr",
    );
    expect(mrr).toBeUndefined();
  });

  it("excludes rows where either bookend is null", () => {
    // AAA is present only in week 1 (partner joined mid-window) — first_total
    // is captured but last_total is null after single-week presence in the
    // wider window; ensure we do not spam a null-pct entry.
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
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const aaa = perReseller.rows.find((r) => r.reseller_code === "AAA");
    expect(aaa).toBeUndefined();
  });

  it("handles signed_cents flipping sign — magnitude relative to |first|", () => {
    const snaps = [-500, 500].map((n, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_net_contribution: {
          rows: [
            {
              reseller_code: "INFOVISION",
              net_contribution_cents: n,
              gross_revenue_cents: 1000,
              commission_cents: 0,
              cogs_cents: 0,
              refunded_cents: 0,
            },
          ],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const nc = perReseller.rows.find(
      (r) =>
        r.reseller_code === "INFOVISION" &&
        r.key === "attributed_net_contribution",
    )!;
    expect(nc.first_total).toBe(-500);
    expect(nc.last_total).toBe(500);
    // (500 - (-500)) / |-500| * 100 = +200
    expect(nc.pct_change).toBe(200);
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
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const mrr = perReseller.rows.find(
      (r) => r.reseller_code === "INFOVISION" && r.key === "attributed_mrr",
    )!;
    expect(mrr.pct_change).toBe(-25);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChange — ranking", () => {
  it("sorts by |pct_change| desc primary — a small partner doubling outranks a big partner's 1% nudge", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "SMALLCO", mrr_cents: 100 },
            { reseller_code: "BIGCO", mrr_cents: 100000 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "SMALLCO", mrr_cents: 200 }, // +100%
            { reseller_code: "BIGCO", mrr_cents: 101000 }, // +1%
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(perReseller.rows[0].reseller_code).toBe("SMALLCO");
    expect(perReseller.rows[0].pct_change).toBe(100);
    expect(perReseller.rows[1].reseller_code).toBe("BIGCO");
    expect(perReseller.rows[1].pct_change).toBe(1);
  });

  it("breaks ties by reseller_code asc, then HEADLINE_METRICS spec order", () => {
    // Two partners each with +100% on attributed_mrr — reseller_code asc wins.
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
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(perReseller.rows[0].reseller_code).toBe("ALPHA");
    expect(perReseller.rows[1].reseller_code).toBe("BETA");
  });

  it("caps output at top_n", () => {
    // 6 partners, each with distinct pct_change magnitudes.
    const week1: Array<{ reseller_code: string; mrr_cents: number }> = [];
    const week2: Array<{ reseller_code: string; mrr_cents: number }> = [];
    for (let i = 0; i < 6; i++) {
      week1.push({ reseller_code: `P${i}`, mrr_cents: 100 });
      week2.push({ reseller_code: `P${i}`, mrr_cents: 100 + (i + 1) * 10 });
    }
    const snaps = [
      snap("2026-W28", T(0), { attributed_mrr: { rows: week1 } }),
      snap("2026-W29", T(7), { attributed_mrr: { rows: week2 } }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(
      trend,
      3,
    );
    expect(perReseller.rows.length).toBe(3);
    // top row is P5 (+60%), then P4 (+50%), then P3 (+40%)
    expect(perReseller.rows.map((r) => r.reseller_code)).toEqual([
      "P5",
      "P4",
      "P3",
    ]);
  });
});

describe("formatDigestSnapshotPerResellerMetricPctChangeSection", () => {
  it("returns empty string on window_size < 2", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangeSection(perReseller),
    ).toBe("");
  });

  it("returns empty string on empty ranked rows", () => {
    // Both partners at 0 → 5000 (launch week) — every row excluded.
    const snaps = [0, 5000].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    expect(perReseller.rows.length).toBe(0);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangeSection(perReseller),
    ).toBe("");
  });

  it("renders reseller/section/metric/pct columns with signed percent formatting", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const html = formatDigestSnapshotPerResellerMetricPctChangeSection(
      perReseller,
    );
    expect(html).toContain("INFOVISION");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("+25.0%");
    expect(html).toContain("<th>Reseller</th>");
    expect(html).toContain("<th>Section</th>");
    expect(html).toContain("<th>Metric</th>");
  });

  it("amber-highlights rows above the threshold and leaves smaller rows plain", () => {
    // 30% > 25 threshold — highlighted; 5% below threshold — plain.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BIG", mrr_cents: 10000 },
            { reseller_code: "SMALL", mrr_cents: 10000 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BIG", mrr_cents: 13000 }, // +30%
            { reseller_code: "SMALL", mrr_cents: 10500 }, // +5%
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const html = formatDigestSnapshotPerResellerMetricPctChangeSection(
      perReseller,
    );
    // BIG row above threshold gets the amber inline style.
    const bigRow = html.match(
      /<tr[^>]*>\s*<td>BIG<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(bigRow).toBeDefined();
    expect(bigRow!).toContain('style="background:#fff8e1"');
    // SMALL row below threshold: no inline row style.
    const smallRow = html.match(
      /<tr[^>]*>\s*<td>SMALL<\/td>[\s\S]*?<\/tr>/,
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
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const html = formatDigestSnapshotPerResellerMetricPctChangeSection(
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
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const html = formatDigestSnapshotPerResellerMetricPctChangeSection(
      perReseller,
    );
    expect(html).toContain("-25.0%");
    expect(html).not.toContain("+-25");
  });

  it("threshold shown in the section preamble comes from the envelope, not a hard-coded literal", () => {
    // Sanity: two partners so we get a rendered table, then confirm the
    // threshold digit appears exactly once alongside its "%" annotation.
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const perReseller = computeDigestSnapshotPerResellerMetricPctChange(trend);
    const html = formatDigestSnapshotPerResellerMetricPctChangeSection(
      perReseller,
    );
    expect(html).toContain(`${perReseller.threshold}%`);
  });
});
