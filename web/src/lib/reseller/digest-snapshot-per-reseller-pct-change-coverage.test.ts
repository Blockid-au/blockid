import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { PCT_CHANGE_MATERIAL_THRESHOLD } from "./digest-snapshot-metric-pct-change";
import { computeDigestSnapshotPerResellerRollingTrend } from "./digest-snapshot-per-reseller-rolling-trend";
import {
  computeDigestSnapshotPerResellerPctChangeCoverage,
  formatDigestSnapshotPerResellerPctChangeCoverageSection,
} from "./digest-snapshot-per-reseller-pct-change-coverage";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerPctChangeCoverage — shape", () => {
  it("passes through window metadata + threshold from the trend envelope", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    expect(coverage.window_size).toBe(2);
    expect(coverage.first_week).toBe("2026-W28");
    expect(coverage.last_week).toBe("2026-W29");
    expect(coverage.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });

  it("emits an empty rows list when the trend has no rows", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    expect(coverage.rows).toEqual([]);
  });

  it("handles a malformed trend gracefully (non-array rows coerced to empty)", () => {
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage({
      window_size: 4,
      first_week: "2026-W28",
      last_week: "2026-W31",
      rows: undefined as unknown as never,
    } as never);
    expect(coverage.window_size).toBe(4);
    expect(coverage.rows).toEqual([]);
  });

  it("emits partners in alphabetical order regardless of trend row order", () => {
    // Interleave partner appearance so trend row order is not alphabetical.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "ZULU", mrr_cents: 100 },
            { reseller_code: "ALPHA", mrr_cents: 100 },
            { reseller_code: "MIKE", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "ZULU", mrr_cents: 130 },
            { reseller_code: "ALPHA", mrr_cents: 130 },
            { reseller_code: "MIKE", mrr_cents: 130 },
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    expect(coverage.rows.map((r) => r.reseller_code)).toEqual([
      "ALPHA",
      "MIKE",
      "ZULU",
    ]);
  });
});

describe("computeDigestSnapshotPerResellerPctChangeCoverage — bucket counts", () => {
  it("counts total_rows per partner across every metric they touched", () => {
    // Partner A touches attributed_mrr + attributed_net_contribution.
    // Partner B touches only attributed_mrr.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "A", mrr_cents: 10000 },
            { reseller_code: "B", mrr_cents: 10000 },
          ],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "A", net_contribution_cents: 5000 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "A", mrr_cents: 12500 },
            { reseller_code: "B", mrr_cents: 12500 },
          ],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "A", net_contribution_cents: 6250 }],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const a = coverage.rows.find((r) => r.reseller_code === "A")!;
    const b = coverage.rows.find((r) => r.reseller_code === "B")!;
    expect(a.total_rows).toBe(2);
    expect(a.computable_rows).toBe(2);
    expect(a.material_rows).toBe(2); // +25% mrr + +25% net both clear the floor
    expect(a.material_rate_pct).toBe(100);
    expect(b.total_rows).toBe(1);
    expect(b.computable_rows).toBe(1);
  });

  it("distinguishes material rate correctly when some computable rows are below threshold", () => {
    // Single partner with 4 metric trends: +30%, +5%, -50%, +10%.
    // Two of four cross the ≥25 floor → material_rate_pct = 50.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 100 }],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 100 }],
        },
        commission_cleared_mtd: {
          rows: [{ reseller_code: "P", cleared_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 130 }], // +30
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 105 }], // +5
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 50 }], // -50
        },
        commission_cleared_mtd: {
          rows: [{ reseller_code: "P", cleared_cents: 110 }], // +10
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const p = coverage.rows.find((r) => r.reseller_code === "P")!;
    expect(p.total_rows).toBe(4);
    expect(p.computable_rows).toBe(4);
    expect(p.material_rows).toBe(2);
    expect(p.material_rate_pct).toBe(50);
    expect(p.min_pct).toBe(-50);
    expect(p.max_pct).toBe(30);
  });

  it("excludes launch-week (first_total===0) and single-point rows from computable_rows", () => {
    // Partner Q has attributed_mrr launch-week (0 → 5000) + only-week-2
    // attributed_net_contribution presence.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "Q", mrr_cents: 0 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "Q", mrr_cents: 5000 }],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "Q", net_contribution_cents: 999 }],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const q = coverage.rows.find((r) => r.reseller_code === "Q")!;
    // Two trend rows: attributed_mrr (first=0 → uncomputable) +
    // attributed_net_contribution (single-point → delta null → uncomputable).
    expect(q.total_rows).toBe(2);
    expect(q.computable_rows).toBe(0);
    expect(q.material_rows).toBe(0);
    expect(q.material_rate_pct).toBeNull();
    expect(q.min_pct).toBeNull();
    expect(q.max_pct).toBeNull();
    expect(q.median_pct).toBeNull();
  });

  it("computes median across an odd-count and even-count bucket deterministically", () => {
    // Odd: 3 trends at +10 / +20 / +30 for partner P (metric spec fill).
    const oddSnaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 100 }],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 110 }], // +10
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 120 }], // +20
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 130 }], // +30
        },
      }),
    ];
    const oddTrend = computeDigestSnapshotPerResellerRollingTrend(oddSnaps);
    const oddCoverage =
      computeDigestSnapshotPerResellerPctChangeCoverage(oddTrend);
    const oddP = oddCoverage.rows.find((r) => r.reseller_code === "P")!;
    expect(oddP.median_pct).toBe(20);

    const evenSnaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 100 }],
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 100 }],
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 100 }],
        },
        commission_cleared_mtd: {
          rows: [{ reseller_code: "P", cleared_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "P", mrr_cents: 110 }], // +10
        },
        attributed_net_contribution: {
          rows: [{ reseller_code: "P", net_contribution_cents: 120 }], // +20
        },
        attributed_churn_30d: {
          rows: [{ reseller_code: "P", churned_count: 130 }], // +30
        },
        commission_cleared_mtd: {
          rows: [{ reseller_code: "P", cleared_cents: 140 }], // +40
        },
      }),
    ];
    const evenTrend = computeDigestSnapshotPerResellerRollingTrend(evenSnaps);
    const evenCoverage =
      computeDigestSnapshotPerResellerPctChangeCoverage(evenTrend);
    const evenP = evenCoverage.rows.find((r) => r.reseller_code === "P")!;
    // (20 + 30) / 2 = 25
    expect(evenP.median_pct).toBe(25);
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
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const x = coverage.rows.find((r) => r.reseller_code === "X")!;
    // (500 - (-500)) / |-500| * 100 = 200
    expect(x.computable_rows).toBe(1);
    expect(x.min_pct).toBe(200);
    expect(x.max_pct).toBe(200);
    expect(x.median_pct).toBe(200);
    expect(x.material_rows).toBe(1);
    expect(x.material_rate_pct).toBe(100);
  });

  it("partners running only launch-week rows still surface with zero-computable posture", () => {
    // Partner LAUNCH only appears with 0 → non-zero on both metrics.
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "LAUNCH", mrr_cents: 0 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "LAUNCH", mrr_cents: 5000 }],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const launch = coverage.rows.find((r) => r.reseller_code === "LAUNCH")!;
    expect(launch.total_rows).toBe(1);
    expect(launch.computable_rows).toBe(0);
    expect(launch.material_rate_pct).toBeNull();
  });
});

describe("formatDigestSnapshotPerResellerPctChangeCoverageSection", () => {
  it("returns empty string on window_size < 2", () => {
    const trend = computeDigestSnapshotPerResellerRollingTrend([]);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    expect(
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage),
    ).toBe("");
  });

  it("returns empty string when the rows list is empty", () => {
    const snaps = [snap("2026-W28", T(0), {}), snap("2026-W29", T(7), {})];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    expect(coverage.rows).toEqual([]);
    expect(
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage),
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
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
    expect(html).toContain("INFOVISION");
    expect(html).toContain("<th>Reseller</th>");
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

  it("amber-highlights partners with any material mover, red-highlights zero-computable rows", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BIG", mrr_cents: 10000 },
            { reseller_code: "LAUNCH", mrr_cents: 0 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "BIG", mrr_cents: 13000 }, // +30 material
            { reseller_code: "LAUNCH", mrr_cents: 5000 }, // launch, uncomputable
          ],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
    const bigRow = html.match(
      /<tr[^>]*>\s*<td>BIG<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(bigRow).toBeDefined();
    expect(bigRow!).toContain('style="background:#fff8e1"');
    const launchRow = html.match(
      /<tr[^>]*>\s*<td>LAUNCH<\/td>[\s\S]*?<\/tr>/,
    )?.[0];
    expect(launchRow).toBeDefined();
    expect(launchRow!).toContain('style="background:#ffebee"');
  });

  it("renders em-dashes for null pct cells (uncomputable partners)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "LAUNCH", mrr_cents: 0 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "LAUNCH", mrr_cents: 5000 }],
        },
      }),
    ];
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
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
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
    expect(html).toContain("&quot;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("escapes HTML in reseller_code labels", () => {
    const snaps = [10000, 12500].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: '<script>alert("x")</script>', mrr_cents: cents }],
        },
      }),
    );
    const trend = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('<script>alert("x")</script>');
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
    const coverage = computeDigestSnapshotPerResellerPctChangeCoverage(trend);
    const html =
      formatDigestSnapshotPerResellerPctChangeCoverageSection(coverage);
    expect(html).toContain(`${PCT_CHANGE_MATERIAL_THRESHOLD}%`);
    expect(coverage.threshold).toBe(PCT_CHANGE_MATERIAL_THRESHOLD);
  });
});
