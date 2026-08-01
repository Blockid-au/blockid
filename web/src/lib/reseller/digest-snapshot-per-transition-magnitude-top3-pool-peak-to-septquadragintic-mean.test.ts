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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-septquadragintic-mean";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes ptspqm band thresholds on envelope (1.005 / 1.09)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([]),
      );
    expect(out.tight_ptspqm_max).toBe(1.005);
    expect(out.wide_ptspqm_min).toBe(1.09);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ptspqm in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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
        expect(band.partner_peak_to_septquadragintic_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_septquadragintic_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ptspqm null (no range/SPQM contrast)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_septquadragintic_mean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → ptspqm 0 (tight; range 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → ptspqm 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0);
  });

  it("uniform ramp [1..10] → SPQM 9.5233, range 9, ptspqm 0.945 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.945);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("upper-outlier [1×9, 10] → SPQM 9.5219, range 9, ptspqm 0.9452 (TIGHT — MILD OUTLIER absorbed EVEN HARDER than P11.346 PTSXQM's 0.9462 tight landing)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.9452);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("two-shoulders [1×8, 5×2] → SPQM 4.8317, range 4, ptspqm 0.8279 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.8279);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("50/50 split [1×5, 10×5] → SPQM 9.8536, range 9, ptspqm 0.9134 (tight — BIMODAL SPLIT well-absorbed)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.9134);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("extreme outlier [1×9, 100] → SPQM 95.2190, range 99, ptspqm 1.0397 (SPREAD — EXTREME OUTLIER approaches 10^(1/47) asymptote ~ 1.0502)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(1.0397);
    expect(
      band.partner_peak_to_septquadragintic_mean!,
    ).toBeGreaterThanOrEqual(out.tight_ptspqm_max);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.wide_ptspqm_min,
    );
  });

  it("two-partner pool [1, 9] → SPQM 8.8682, range 8, ptspqm 0.9021 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.9021);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("two-partner pool [1, 100] → SPQM 98.5360, range 99, ptspqm 1.0047 (TIGHT — ISOLATED HIGH PARTNER has CROSSED BACK BELOW the 1.005 tight boundary at M_47; PTSPQM is the first dispersion surface in the septuplet to READ THIS AS TIGHT rather than spread)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(1.0047);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("small pool [10, 1, 1] → SPQM 9.7690, range 9, ptspqm 0.9213 (TIGHT — SMALL-VALUE-DOMINATED with LARGE-PARTNER DAMPENING; approaches 3-partner asymptote 3^(1/47) ~ 1.0237)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([10, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_septquadragintic_mean).toBe(0.9213);
    expect(band.partner_peak_to_septquadragintic_mean!).toBeLessThan(
      out.tight_ptspqm_max,
    );
  });

  it("rank-order invariance: same shares in any input order yield same ptspqm", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(
      a.transitions.improved.bands.medium
        .partner_peak_to_septquadragintic_mean,
    ).toBe(
      b.transitions.improved.bands.medium
        .partner_peak_to_septquadragintic_mean,
    );
  });

  it("codomain: ptspqm >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_septquadragintic_mean).not.toBeNull();
      expect(
        band.partner_peak_to_septquadragintic_mean!,
      ).toBeGreaterThanOrEqual(0);
    }
  });

  it("Power Mean invariant: PTSPQM <= PTSXQM for every non-flat pool (septquadragintic_mean >= sexquadragintic_mean by M_47 >= M_46)", () => {
    // Algebraic identity: septquadragintic_mean = (mean of x^47)^(1/47)
    // >= (mean of x^46)^(1/46) = sexquadragintic_mean by the Power
    // Mean inequality. So ptspqm = range/septquadragintic_mean <=
    // range/sexquadragintic_mean = ptsxqm.
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
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      const ptspqm = band.partner_peak_to_septquadragintic_mean!;
      const values = [...pool];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      const sexquadragintic_mean = Math.pow(
        values.reduce((a, v) => {
          const sq = v * v;
          const quad = sq * sq;
          const oct = quad * quad;
          // x^46 = (x^8)^5 * x^4 * x^2 -> oct*oct*oct*oct*oct * quad * sq
          return a + oct * oct * oct * oct * oct * quad * sq;
        }, 0) / values.length,
        1 / 46,
      );
      const ptsxqm =
        sexquadragintic_mean === 0 ? null : range / sexquadragintic_mean;
      if (nonFlat && ptsxqm !== null) {
        expect(ptspqm).toBeLessThanOrEqual(ptsxqm + 5e-4);
      } else if (!nonFlat) {
        expect(ptspqm).toBe(0);
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — metric-pool parity", () => {
  it("metric_peak_to_septquadragintic_mean computed identically from KPI-count map (10-KPI uniform ramp → 0.945)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_septquadragintic_mean).toBe(0.945);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
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

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection", () => {
  it("returns empty string when window_size < 3 (P11.129 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PEAK-TO-SEPTQUADRAGINTIC-MEAN heading + PTSPQM labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-SEPTQUADRAGINTIC-MEAN");
    expect(html).toContain("PTSPQM ");
    expect(html).toContain("spread");
    expect(html).toContain("partner PTSPQM");
    expect(html).toContain("KPI PTSPQM");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (ptspqm == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (ptspqm = 0.945)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for MILD OUTLIER [1×9, 10] (ptspqm = 0.9452)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for EXTREME OUTLIER [1×9, 100] (ptspqm = 1.0397)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSeptquadraginticMeanSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
