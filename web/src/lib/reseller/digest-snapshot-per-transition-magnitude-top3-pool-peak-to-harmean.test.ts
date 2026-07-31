import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
} from "./digest-snapshot-per-transition-magnitude-drilldown";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-harmean";

type TransitionToken = PerPairHotCellRow["transition"];

function cell(
  code: string,
  key: KnownKpiSection,
  transition: TransitionToken,
  hot_score: number,
  overrides: Partial<PerPairHotCellRow> = {},
): PerPairHotCellRow {
  const base: PerPairHotCellRow = {
    reseller_code: code,
    key,
    metric_name: `${key} name`,
    unit: "cents",
    transition,
    from_verdict: transition === "first_classification" ? null : "flat",
    to_verdict: "sustained_both_axes",
    delta_rank: (() => {
      switch (transition) {
        case "improved":
          return hot_score;
        case "degraded":
          return -hot_score;
        case "rotated":
        case "stable":
          return 0;
        case "undecidable":
        case "first_classification":
          return null;
      }
    })(),
    summary: `stub ${code} × ${key} ${transition}`,
    hot_score,
  };
  return { ...base, ...overrides };
}

function envelope(
  rows: PerPairHotCellRow[],
  overrides: Partial<Omit<DigestSnapshotPerPairHotCells, "rows">> = {},
): DigestSnapshotPerPairHotCells {
  return {
    window_size: 4,
    first_week: "2026-W28",
    last_week: "2026-W31",
    sustained_p90_threshold: 3,
    threshold: 0.25,
    rows,
    ...overrides,
  };
}

const KPI_CATALOG: KnownKpiSection[] = [
  "attributed_mrr",
  "commission_cleared_mtd",
  "attributed_net_contribution",
  "contribution_margin_pct",
  "clawback_exposure",
  "budget_utilization",
  "sandbox_share_of_budget",
  "attributed_churn_30d",
  "tier_mix",
  "ledger_drift_events",
];

function partnerPool(counts: number[]): PerPairHotCellRow[] {
  const rows: PerPairHotCellRow[] = [];
  const codes = "ABCDEFGHIJKLMNOPQRST".split("");
  counts.forEach((c, idx) => {
    for (let i = 0; i < c; i++) {
      rows.push(
        cell(codes[idx], KPI_CATALOG[i % KPI_CATALOG.length], "improved", 4),
      );
    }
  });
  return rows;
}

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)], {
        window_size: 7,
        first_week: "2026-W25",
        last_week: "2026-W31",
        sustained_p90_threshold: 5,
        threshold: 0.4,
      }),
    );
    expect(out.window_size).toBe(7);
    expect(out.first_week).toBe("2026-W25");
    expect(out.last_week).toBe("2026-W31");
    expect(out.sustained_p90_threshold).toBe(5);
    expect(out.threshold).toBe(0.4);
  });

  it("keeps null first_week / last_week when envelope carries null", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes pth band thresholds on envelope (3.0 / 5.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([]),
    );
    expect(out.tight_pth_max).toBe(3.0);
    expect(out.wide_pth_min).toBe(5.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null pth in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([]),
    );
    for (const t of [
      "improved",
      "degraded",
      "rotated",
      "undecidable",
    ] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        const band = out.transitions[t].bands[b];
        expect(band.partner_pool_count).toBe(0);
        expect(band.partner_pool_cells).toBe(0);
        expect(band.partner_peak_to_harmean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_harmean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    expect(Object.keys(out.transitions).sort()).toEqual(
      ["degraded", "improved", "rotated", "undecidable"].sort(),
    );
    for (const t of [
      "improved",
      "degraded",
      "rotated",
      "undecidable",
    ] as const) {
      expect(Object.keys(out.transitions[t].bands).sort()).toEqual(
        ["large", "medium", "small"].sort(),
      );
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → pth null (no range/harmean contrast)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_harmean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → pth 0 (tight; range 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_harmean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → pth 0 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_harmean).toBe(0);
  });

  it("uniform ramp [1..10] → harmean 3.4142, range 9, pth = 2.6361 (tight; well under 3.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_harmean).toBe(2.6361);
    // tight band (< 3.0)
    expect(band.partner_peak_to_harmean!).toBeLessThan(out.tight_pth_max);
  });

  it("upper-outlier [1×9, 10] → harmean 1.0989, range 9, pth = 8.19 (wide — ISOLATED OUTLIER)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_harmean).toBe(8.19);
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.wide_pth_min,
    );
  });

  it("two-shoulders [1×8, 5×2] → harmean 1.1905, range 4, pth = 3.36 (spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_harmean).toBe(3.36);
    // spread band [3.0, 5.0)
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.tight_pth_max,
    );
    expect(band.partner_peak_to_harmean!).toBeLessThan(out.wide_pth_min);
  });

  it("50/50 split [1×5, 10×5] → harmean 1.8182, range 9, pth = 4.95 (SPREAD — BIMODAL SPLIT; contrast with P11.246 PTMEAN 1.6364 tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_harmean).toBe(4.95);
    // spread band [3.0, 5.0) — contrast with PTMEAN tight
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.tight_pth_max,
    );
    expect(band.partner_peak_to_harmean!).toBeLessThan(out.wide_pth_min);
  });

  it("extreme outlier [1×9, 100] → harmean 1.1099, range 99, pth = 89.1913 (wide — EXTREME OUTLIER)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_harmean).toBe(89.199);
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.wide_pth_min,
    );
  });

  it("two-partner pool [1, 9] → harmean 1.8, range 8, pth = 4.4444 (spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 9])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_harmean).toBe(4.4444);
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.tight_pth_max,
    );
    expect(band.partner_peak_to_harmean!).toBeLessThan(out.wide_pth_min);
  });

  it("two-partner pool [1, 100] → harmean 1.9802, range 99, pth = 50.0 (WIDE — ISOLATED HIGH PARTNER; contrast with P11.246 PTMEAN 1.9604 tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_harmean).toBe(49.995);
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.wide_pth_min,
    );
  });

  it("small pool [10, 1, 1] → harmean 1.4286, range 9, pth = 6.3 (WIDE — SMALL-VALUE-DOMINATED; contrast with P11.248 PTGM 4.1774 spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([10, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_harmean).toBe(6.3);
    expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(
      out.wide_pth_min,
    );
  });

  it("rank-order invariance: same shares in any input order yield same pth", () => {
    const a = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const b = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(a.transitions.improved.bands.medium.partner_peak_to_harmean).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_harmean,
    );
  });

  it("codomain: pth >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_harmean).not.toBeNull();
      expect(band.partner_peak_to_harmean!).toBeGreaterThanOrEqual(0);
    }
  });

  it("AM-GM-HM invariant: pth >= ptmean for every non-flat pool (harmean <= mean)", () => {
    // For every non-flat non-solo pool with positive values, harmean
    // <= mean by AM-GM-HM inequality, so pth = range/harmean >=
    // ptmean = range/mean. We reproduce PTMEAN's compute here
    // (arithmetic mean) and verify the strict inequality on non-flat
    // pools + equality on flat pools.
    const cases: { pool: number[]; nonFlat: boolean }[] = [
      { pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nonFlat: true },
      { pool: [1, 1, 1, 1, 1, 1, 1, 1, 1, 10], nonFlat: true },
      { pool: [1, 100], nonFlat: true },
      { pool: [3, 3, 3, 3], nonFlat: false },
    ];
    for (const { pool, nonFlat } of cases) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      const pth = band.partner_peak_to_harmean!;
      const values = pool;
      const sum = values.reduce((a, b) => a + b, 0);
      const mean = sum / values.length;
      const range = Math.max(...values) - Math.min(...values);
      const ptmean = range / mean;
      if (nonFlat) {
        expect(pth).toBeGreaterThan(ptmean - 1e-9);
      } else {
        expect(pth).toBe(0);
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — metric-pool parity", () => {
  it("metric_peak_to_harmean computed identically from KPI-count map (10-KPI uniform ramp → 2.6361)", () => {
    const rows: PerPairHotCellRow[] = [];
    const kpiCounts: [KnownKpiSection, number][] = [
      ["attributed_mrr", 10],
      ["commission_cleared_mtd", 9],
      ["attributed_net_contribution", 8],
      ["contribution_margin_pct", 7],
      ["clawback_exposure", 6],
      ["budget_utilization", 5],
      ["sandbox_share_of_budget", 4],
      ["attributed_churn_30d", 3],
      ["tier_mix", 2],
      ["ledger_drift_events", 1],
    ];
    const codes = "ABCDEFGHIJKL".split("");
    kpiCounts.forEach(([kpi, count]) => {
      for (let i = 0; i < count; i++) {
        rows.push(cell(codes[i], kpi, "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_harmean).toBe(2.6361);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(rows),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.large.partner_pool_count).toBe(1);
  });

  it("ignores unknown transitions (stable, first_classification)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "stable", 2),
      cell("B", "attributed_mrr", "first_classification", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(rows),
    );
    expect(out.total_hot_cells).toBe(0);
    for (const t of [
      "improved",
      "degraded",
      "rotated",
      "undecidable",
    ] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        expect(out.transitions[t].bands[b].partner_pool_count).toBe(0);
      }
    }
  });

  it("degraded + rotated + undecidable each track independently", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "degraded", 4),
      cell("B", "attributed_mrr", "rotated", 4),
      cell("C", "attributed_mrr", "undecidable", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(
      1,
    );
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PEAK-TO-HARMEAN heading + PTH labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-HARMEAN");
    expect(html).toContain("PTH ");
    expect(html).toContain("wide");
    expect(html).toContain("partner PTH");
    expect(html).toContain("KPI PTH");
  });

  it("renders solo label for pool_count == 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (pth == 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (pth = 2.636)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for BIMODAL SPLIT (pth = 4.95; contrast with P11.246 PTMEAN tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("renders wide label for SMALL-VALUE-DOMINATED [10, 1, 1] (pth = 6.3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([10, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("renders wide label for ISOLATED HIGH PARTNER two-partner [1, 100] (pth = 50.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope(partnerPool([1, 100])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmean(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToHarmeanSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
