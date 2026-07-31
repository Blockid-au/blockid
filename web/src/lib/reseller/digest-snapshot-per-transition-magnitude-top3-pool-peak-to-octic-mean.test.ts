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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-octic-mean";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes ptom band thresholds on envelope (1.25 / 1.35)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([]),
      );
    expect(out.tight_ptom_max).toBe(1.25);
    expect(out.wide_ptom_min).toBe(1.35);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ptom in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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
        expect(band.partner_peak_to_octic_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_octic_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ptom null (no range/OM contrast)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_octic_mean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → ptom 0 (tight; range 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_octic_mean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → ptom 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_octic_mean).toBe(0);
  });

  it("uniform ramp [1..10] → sum(x^8) 167731333, OM 7.9998, range 9, ptom 1.125 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_octic_mean).toBe(1.125);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("upper-outlier [1×9, 10] → OM 7.4989, range 9, ptom 1.2002 (TIGHT — MILD OUTLIER absorbed by octic mean where P11.268 PTSEM reads tight + P11.266 PTSM reads tight + P11.264 PTQNM reads tight + P11.252 PTRMS reads spread + P11.246 PTMEAN reads spread + P11.248 PTGM + P11.250 PTH read wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_octic_mean).toBe(1.2002);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("two-shoulders [1×8, 5×2] → OM 4.0888, range 4, ptom 0.9783 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_octic_mean).toBe(0.9783);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("50/50 split [1×5, 10×5] → OM 9.17, range 9, ptom 0.9815 (tight — BIMODAL SPLIT well-absorbed)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_octic_mean).toBe(0.9815);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("extreme outlier [1×9, 100] → OM 74.9894, range 99, ptom 1.3202 (SPREAD — EXTREME OUTLIER approaches 10^(1/8) asymptote ~ 1.3335)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_octic_mean).toBe(1.3202);
    expect(band.partner_peak_to_octic_mean!).toBeGreaterThanOrEqual(
      out.tight_ptom_max,
    );
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.wide_ptom_min,
    );
  });

  it("two-partner pool [1, 9] → OM 8.253, range 8, ptom 0.9693 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_octic_mean).toBe(0.9693);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("two-partner pool [1, 100] → OM 91.7004, range 99, ptom 1.0796 (TIGHT — ISOLATED HIGH PARTNER; octic mean captures the outlier)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_octic_mean).toBe(1.0796);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("small pool [10, 1, 1] → OM 8.7169, range 9, ptom 1.0325 (TIGHT — SMALL-VALUE-DOMINATED with LARGE-PARTNER DAMPENING; approaches 3-partner asymptote 3^(1/8) ~ 1.1472)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([10, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_octic_mean).toBe(1.0325);
    expect(band.partner_peak_to_octic_mean!).toBeLessThan(
      out.tight_ptom_max,
    );
  });

  it("rank-order invariance: same shares in any input order yield same ptom", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(
      a.transitions.improved.bands.medium.partner_peak_to_octic_mean,
    ).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_octic_mean,
    );
  });

  it("codomain: ptom >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_octic_mean).not.toBeNull();
      expect(band.partner_peak_to_octic_mean!).toBeGreaterThanOrEqual(0);
    }
  });

  it("Power Mean invariant: PTOM <= PTSEM for every non-flat pool (octic_mean >= septic_mean by M_8 >= M_7)", () => {
    // Algebraic identity: for non-negative reals octic_mean = (mean
    // of x^8)^(1/8) >= (mean of x^7)^(1/7) = septic_mean by the
    // Power Mean inequality (M_8 >= M_7). By monotonicity of the
    // reciprocal on positive denominators, ptom = range/octic_mean
    // <= range/septic_mean = ptsem. We reproduce septic_mean +
    // octic_mean here and verify the invariant on non-flat pools +
    // equality on flat pools.
    const cases: { pool: number[]; nonFlat: boolean }[] = [
      { pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nonFlat: true },
      { pool: [1, 1, 1, 1, 1, 1, 1, 1, 1, 10], nonFlat: true },
      { pool: [1, 1, 1, 1, 1, 1, 1, 1, 1, 100], nonFlat: true },
      { pool: [10, 1, 1], nonFlat: true },
      { pool: [1, 100], nonFlat: true },
      { pool: [3, 3, 3, 3], nonFlat: false },
    ];
    for (const { pool, nonFlat } of cases) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      const ptom = band.partner_peak_to_octic_mean!;
      const values = [...pool];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      const septic_mean = Math.pow(
        values.reduce((a, v) => a + v * v * v * v * v * v * v, 0) /
          values.length,
        1 / 7,
      );
      const ptsem = septic_mean === 0 ? null : range / septic_mean;
      if (nonFlat && ptsem !== null) {
        // ptom is rounded to 4 decimals; ptsem here is raw, so
        // allow a 5e-4 slack to absorb the quantization gap.
        expect(ptom).toBeLessThanOrEqual(ptsem + 5e-4);
      } else if (!nonFlat) {
        expect(ptom).toBe(0);
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — metric-pool parity", () => {
  it("metric_peak_to_octic_mean computed identically from KPI-count map (10-KPI uniform ramp → 1.125)", () => {
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_octic_mean).toBe(1.125);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
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

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PEAK-TO-OCTIC-MEAN heading + PTOM labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-OCTIC-MEAN");
    expect(html).toContain("PTOM ");
    expect(html).toContain("spread");
    expect(html).toContain("partner PTOM");
    expect(html).toContain("KPI PTOM");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (ptom == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (ptom = 1.125)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for MILD OUTLIER [1×9, 10] (ptom = 1.2002; where PTSEM reads tight + PTSM reads tight + PTQNM reads tight + PTRMS reads spread + PTGM + PTH read wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for EXTREME OUTLIER [1×9, 100] (ptom = 1.3202)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToOcticMeanSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
