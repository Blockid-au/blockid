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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-duodecic-mean";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes ptdum band thresholds on envelope (1.10 / 1.22)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([]),
      );
    expect(out.tight_ptdum_max).toBe(1.1);
    expect(out.wide_ptdum_min).toBe(1.22);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ptdum in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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
        expect(band.partner_peak_to_duodecic_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_duodecic_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ptdum null (no range/DUM contrast)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_duodecic_mean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → ptdum 0 (tight; range 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_duodecic_mean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → ptdum 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_duodecic_mean).toBe(0);
  });

  it("uniform ramp [1..10] → sum(x^12) 1367428536133, DUM 8.4721, range 9, ptdum 1.0623 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_duodecic_mean).toBe(1.0623);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("upper-outlier [1×9, 10] → DUM 8.2540, range 9, ptdum 1.0904 (TIGHT — MILD OUTLIER absorbed by duodecic mean where P11.276 PTUM reads tight + P11.274 PTDM reads tight + P11.272 PTNM reads tight + P11.270 PTOM reads tight + P11.268 PTSEM reads tight + P11.252 PTRMS reads spread + P11.246 PTMEAN reads spread + P11.248 PTGM + P11.250 PTH read wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_duodecic_mean).toBe(1.0904);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("two-shoulders [1×8, 5×2] → DUM 4.3724, range 4, ptdum 0.9148 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_duodecic_mean).toBe(0.9148);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("50/50 split [1×5, 10×5] → DUM 9.4387, range 9, ptdum 0.9535 (tight — BIMODAL SPLIT well-absorbed)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_duodecic_mean).toBe(0.9535);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("extreme outlier [1×9, 100] → DUM 82.5404, range 99, ptdum 1.1994 (SPREAD — EXTREME OUTLIER approaches 10^(1/12) asymptote ~ 1.2115)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_duodecic_mean).toBe(1.1994);
    expect(band.partner_peak_to_duodecic_mean!).toBeGreaterThanOrEqual(
      out.tight_ptdum_max,
    );
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.wide_ptdum_min,
    );
  });

  it("two-partner pool [1, 9] → DUM 8.4949, range 8, ptdum 0.9417 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_duodecic_mean).toBe(0.9417);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("two-partner pool [1, 100] → DUM 94.3874, range 99, ptdum 1.0489 (TIGHT — ISOLATED HIGH PARTNER; duodecic mean captures the outlier)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_duodecic_mean).toBe(1.0489);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("small pool [10, 1, 1] → DUM 9.1251, range 9, ptdum 0.9863 (TIGHT — SMALL-VALUE-DOMINATED with LARGE-PARTNER DAMPENING; approaches 3-partner asymptote 3^(1/12) ~ 1.0959)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([10, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_duodecic_mean).toBe(0.9863);
    expect(band.partner_peak_to_duodecic_mean!).toBeLessThan(
      out.tight_ptdum_max,
    );
  });

  it("rank-order invariance: same shares in any input order yield same ptdum", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(
      a.transitions.improved.bands.medium.partner_peak_to_duodecic_mean,
    ).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_duodecic_mean,
    );
  });

  it("codomain: ptdum >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_duodecic_mean).not.toBeNull();
      expect(band.partner_peak_to_duodecic_mean!).toBeGreaterThanOrEqual(0);
    }
  });

  it("Power Mean invariant: PTDUM <= PTUM for every non-flat pool (duodecic_mean >= undecic_mean by M_12 >= M_11)", () => {
    // Algebraic identity: for non-negative reals duodecic_mean = (mean
    // of x^12)^(1/12) >= (mean of x^11)^(1/11) = undecic_mean by the
    // Power Mean inequality (M_12 >= M_11). By monotonicity of the
    // reciprocal on positive denominators, ptdum = range/duodecic_mean
    // <= range/undecic_mean = ptum. We reproduce undecic_mean +
    // duodecic_mean here and verify the invariant on non-flat pools +
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
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      const ptdum = band.partner_peak_to_duodecic_mean!;
      const values = [...pool];
      const min = Math.min(...values);
      const max = Math.max(...values);
      const range = max - min;
      const undecic_mean = Math.pow(
        values.reduce((a, v) => {
          const sq = v * v;
          const quad = sq * sq;
          const oct = quad * quad;
          return a + oct * sq * v;
        }, 0) / values.length,
        1 / 11,
      );
      const ptum = undecic_mean === 0 ? null : range / undecic_mean;
      if (nonFlat && ptum !== null) {
        // ptdum is rounded to 4 decimals; ptum here is raw, so
        // allow a 5e-4 slack to absorb the quantization gap.
        expect(ptdum).toBeLessThanOrEqual(ptum + 5e-4);
      } else if (!nonFlat) {
        expect(ptdum).toBe(0);
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — metric-pool parity", () => {
  it("metric_peak_to_duodecic_mean computed identically from KPI-count map (10-KPI uniform ramp → 1.0623)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_duodecic_mean).toBe(1.0623);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
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

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PEAK-TO-DUODECIC-MEAN heading + PTDUM labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-DUODECIC-MEAN");
    expect(html).toContain("PTDUM ");
    expect(html).toContain("spread");
    expect(html).toContain("partner PTDUM");
    expect(html).toContain("KPI PTDUM");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (ptdum == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (ptdum = 1.0623)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for MILD OUTLIER [1×9, 10] (ptdum = 1.0904; where PTUM reads tight + PTDM reads tight + PTNM reads tight + PTOM reads tight + PTSEM reads tight + PTRMS reads spread + PTGM + PTH read wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for EXTREME OUTLIER [1×9, 100] (ptdum = 1.1994)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToDuodecicMeanSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
