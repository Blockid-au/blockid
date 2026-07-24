import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerMetricPctChangeCoverage,
  formatDigestSnapshotPerResellerMetricPctChangeCoverageSection,
} from "./digest-snapshot-per-reseller-metric-pct-change-coverage";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerMetricPctChangeCoverage — shape", () => {
  it("passes through window metadata + threshold from the trend envelope", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    expect(coverage.window_size).toBe(2);
    expect(coverage.first_week).toBe("2026-W28");
    expect(coverage.last_week).toBe("2026-W29");
    expect(coverage.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("emits one row per HEADLINE_METRICS spec key in spec order", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    expect(coverage.rows.map((r) => r.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
  });

  it("emits every metric row with zero totals on an empty trend", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    for (const r of coverage.rows) {
      expect(r.total_rows).toBe(0);
      expect(r.computable_rows).toBe(0);
      expect(r.material_rows).toBe(0);
      expect(r.material_rate_pct).toBeNull();
      expect(r.min_pct).toBeNull();
      expect(r.median_pct).toBeNull();
      expect(r.max_pct).toBeNull();
    }
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const coverage = computeDigestSnapshotPerResellerMetricPctChangeCoverage({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
    } as never);
    expect(coverage.window_size).toBe(4);
    expect(coverage.rows.every((r) => r.total_rows === 0)).toBe(true);
  });
});

describe("computeDigestSnapshotPerResellerMetricPctChangeCoverage — bucket counts", () => {
  it("counts total_rows regardless of computability, computable_rows only when pct is defined", () => {
    // Partner A has a normal week-to-week move (+25%), partner B is a
    // launch-week (0 → 5000 — no pct), partner C shows up only in week 2.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "A", mrr_cents: 10000 },
            { reseller_code: "B", mrr_cents: 0 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "A", mrr_cents: 12500 },
            { reseller_code: "B", mrr_cents: 5000 },
            { reseller_code: "C", mrr_cents: 999 },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const mrr = coverage.rows.find((r) => r.key === "attributed_mrr")!;
    // Three trend rows total (A + B + C). Only A has a computable pct
    // (B has first_total 0, C is a single-point presence with delta null).
    expect(mrr.total_rows).toBe(3);
    expect(mrr.computable_rows).toBe(1);
    expect(mrr.material_rows).toBe(1); // +25% clears the ≥25 floor
    expect(mrr.material_rate_pct).toBe(100);
    expect(mrr.min_pct).toBe(25);
    expect(mrr.max_pct).toBe(25);
    expect(mrr.median_pct).toBe(25);
  });

  it("distinguishes material rate correctly when some computable rows are below threshold", () => {
    // Four partners: +30%, +5%, -50%, +10%. Two of four cross the ≥25 floor.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 100 },
            { reseller_code: "P2", mrr_cents: 100 },
            { reseller_code: "P3", mrr_cents: 100 },
            { reseller_code: "P4", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 130 }, // +30
            { reseller_code: "P2", mrr_cents: 105 }, // +5
            { reseller_code: "P3", mrr_cents: 50 }, // -50
            { reseller_code: "P4", mrr_cents: 110 }, // +10
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const mrr = coverage.rows.find((r) => r.key === "attributed_mrr")!;
    expect(mrr.total_rows).toBe(4);
    expect(mrr.computable_rows).toBe(4);
    expect(mrr.material_rows).toBe(2);
    expect(mrr.material_rate_pct).toBe(50);
    expect(mrr.min_pct).toBe(-50);
    expect(mrr.max_pct).toBe(30);
  });

  it("computes median across an odd-count and even-count bucket deterministically", () => {
    const oddSnaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 100 },
            { reseller_code: "P2", mrr_cents: 100 },
            { reseller_code: "P3", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 110 }, // +10
            { reseller_code: "P2", mrr_cents: 120 }, // +20
            { reseller_code: "P3", mrr_cents: 130 }, // +30
          ],
        },
      }),
    ];
    const oddTrend = computeDigestSnapshotPerResellerRollingTrend(oddSnaps);
    const oddCoverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(oddTrend);
    const oddMrr = oddCoverage.rows.find((r) => r.key === "attributed_mrr")!;
    expect(oddMrr.median_pct).toBe(20);

    const evenSnaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 100 },
            { reseller_code: "P2", mrr_cents: 100 },
            { reseller_code: "P3", mrr_cents: 100 },
            { reseller_code: "P4", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "P1", mrr_cents: 110 }, // +10
            { reseller_code: "P2", mrr_cents: 120 }, // +20
            { reseller_code: "P3", mrr_cents: 130 }, // +30
            { reseller_code: "P4", mrr_cents: 140 }, // +40
          ],
        },
      }),
    ];
    const evenTrend = computeDigestSnapshotPerResellerRollingTrend(evenSnaps);
    const evenCoverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(evenTrend);
    const evenMrr = evenCoverage.rows.find((r) => r.key === "attributed_mrr")!;
    // (20 + 30) / 2 = 25
    expect(evenMrr.median_pct).toBe(25);
  });

  it("keeps unrelated metrics at zero counts when only one metric has data", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const churn = coverage.rows.find((r) => r.key === "attributed_churn_30d")!;
    expect(churn.total_rows).toBe(0);
    expect(churn.computable_rows).toBe(0);
    expect(churn.material_rate_pct).toBeNull();
    expect(churn.min_pct).toBeNull();
  });

  it("handles a signed-cents metric that flips from negative to positive", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_net_contribution: {
          rows: [{ reseller_code: "X", net_contribution_cents: -500 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_net_contribution: {
          rows: [{ reseller_code: "X", net_contribution_cents: 500 }],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const net = coverage.rows.find(
      (r) => r.key === "attributed_net_contribution",
    )!;
    // (500 - (-500)) / |-500| * 100 = 200
    expect(net.computable_rows).toBe(1);
    expect(net.min_pct).toBe(200);
    expect(net.max_pct).toBe(200);
    expect(net.median_pct).toBe(200);
    expect(net.material_rows).toBe(1);
  });
});

describe("formatDigestSnapshotPerResellerMetricPctChangeCoverageSection", () => {
  it("returns empty string on window_size < 2", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage),
    ).toBe("");
  });

  it("returns empty string when every metric has zero total_rows", () => {
    const snaps = [
      snap("2026-W28", T(0), {}),
      snap("2026-W29", T(7), {}),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    expect(coverage.rows.every((r) => r.total_rows === 0)).toBe(true);
    expect(
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage),
    ).toBe("");
  });

  it("renders columns + counts + signed pct cells with 1-decimal precision", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage);
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("<th>Section</th>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("<th>Total</th>");
    expect(html).toContain("<th>Computable</th>");
    expect(html).toContain("<th>Material</th>");
    expect(html).toContain("<th>Material rate</th>");
    expect(html).toContain("<th>Min &Delta;%</th>");
    expect(html).toContain("<th>Median &Delta;%</th>");
    expect(html).toContain("<th>Max &Delta;%</th>");
    expect(html).toContain("+25.0%");
    expect(html).toContain("100.0%");
  });

  it("amber-highlights rows with any material mover, red-highlights zero-total rows", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "BIG", mrr_cents: 10000 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "BIG", mrr_cents: 13000 }], // +30 material
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage);
    const mrrRow = html.match(
      /<tr[^>]*>\s*<td>attributed_mrr<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(mrrRow).toBeDefined();
    expect(mrrRow!).toContain('style="background:#fff8e1"');
    const churnRow = html.match(
      /<tr[^>]*>\s*<td>attributed_churn_30d<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(churnRow).toBeDefined();
    expect(churnRow!).toContain('style="background:#ffebee"');
  });

  it("renders em-dashes for null pct cells (uncomputable metrics)", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage);
    expect(html).toContain("&mdash;");
  });

  it("escapes HTML in week labels", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(i === 0 ? '2026-W28"' : "2026-W<script>", T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage);
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("threshold referenced in the preamble matches the envelope constant", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage =
      computeDigestSnapshotPerResellerMetricPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerMetricPctChangeCoverageSection(coverage);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
    expect(coverage.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});
