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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-trimean";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes pttri band thresholds on envelope (2.0 / 5.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([]),
      );
    expect(out.tight_pttri_max).toBe(2.0);
    expect(out.wide_pttri_min).toBe(5.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null pttri in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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
        expect(band.partner_peak_to_trimean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_trimean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → pttri null (no range/trimean contrast)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_trimean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → pttri 0 (tight; range 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_trimean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → pttri 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_trimean).toBe(0);
  });

  it("uniform ramp [1..10] → Q1 3, med 5.5, Q3 8, trimean 5.5, range 9, pttri 1.6364 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_trimean).toBe(1.6364);
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.tight_pttri_max);
  });

  it("upper-outlier [1×9, 10] → Q1 1, med 1, Q3 1, trimean 1, range 9, pttri 9.0 (wide — UPPER-OUTLIER against UNIFORM FLOOR)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_trimean).toBe(9.0);
    expect(band.partner_peak_to_trimean!).toBeGreaterThanOrEqual(
      out.wide_pttri_min,
    );
  });

  it("two-shoulders [1×8, 5×2] → Q1 1, med 1, Q3 1, trimean 1, range 4, pttri 4.0 (spread — TOP-HEAVY interior)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_trimean).toBe(4.0);
    // spread band [2.0, 5.0)
    expect(band.partner_peak_to_trimean!).toBeGreaterThanOrEqual(
      out.tight_pttri_max,
    );
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.wide_pttri_min);
  });

  it("50/50 split [1×5, 10×5] → Q1 1, med 5.5, Q3 10, trimean 5.5, range 9, pttri 1.6364 (TIGHT — BIMODAL SYMMETRIC SPLIT; median coincides with midhinge so PTTRI == PTMH)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_trimean).toBe(1.6364);
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.tight_pttri_max);
  });

  it("extreme outlier [1×9, 100] → Q1 1, med 1, Q3 1, trimean 1, range 99, pttri 99.0 (wide — EXTREME OUTLIER)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_trimean).toBe(99.0);
    expect(band.partner_peak_to_trimean!).toBeGreaterThanOrEqual(
      out.wide_pttri_min,
    );
  });

  it("two-partner pool [1, 9] → Q1 1, med 5, Q3 9, trimean 5, range 8, pttri 1.6 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_trimean).toBe(1.6);
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.tight_pttri_max);
  });

  it("two-partner pool [1, 100] → Q1 1, med 50.5, Q3 100, trimean 50.5, range 99, pttri 1.9604 (TIGHT — ISOLATED HIGH PARTNER; trimean captures both partners; matches P11.254 PTMH 1.9604 exactly since median coincides with midhinge)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_trimean).toBe(1.9604);
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.tight_pttri_max);
  });

  it("small pool [10, 1, 1] → sorted [1,1,10] Q1 1, med 1, Q3 10, trimean 3.25, range 9, pttri 2.7692 (SPREAD — SMALL-VALUE-DOMINATED with LARGE-PARTNER PROMOTION into Q3; contrast P11.240 PTM 9.0 wide + P11.254 PTMH 1.6364 tight — PTTRI is the ONLY surface that lands this regime in the SPREAD band)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([10, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_trimean).toBe(2.7692);
    expect(band.partner_peak_to_trimean!).toBeGreaterThanOrEqual(
      out.tight_pttri_max,
    );
    expect(band.partner_peak_to_trimean!).toBeLessThan(out.wide_pttri_min);
  });

  it("rank-order invariance: same shares in any input order yield same pttri", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(a.transitions.improved.bands.medium.partner_peak_to_trimean).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_trimean,
    );
  });

  it("codomain: pttri >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_trimean).not.toBeNull();
      expect(band.partner_peak_to_trimean!).toBeGreaterThanOrEqual(0);
    }
  });

  it("PTM-PTMH sandwich invariant: min(PTM, PTMH) <= PTTRI <= max(PTM, PTMH) for every non-flat pool (trimean = (midhinge + median) / 2 by construction)", () => {
    // Algebraic identity: trimean = (midhinge + median) / 2, so
    // trimean sits BETWEEN median and midhinge on the number line
    // (equality iff median == midhinge). By monotonicity of the
    // reciprocal on positive denominators, range/trimean sits
    // BETWEEN range/median and range/midhinge -- i.e., PTTRI is
    // sandwiched between PTM and PTMH. We reproduce Q1 + Q3 + median
    // here and verify the sandwich on non-flat pools + equality on
    // flat pools.
    function medianSorted(a: readonly number[]): number {
      const n = a.length;
      const m = Math.floor(n / 2);
      return n % 2 === 1 ? a[m] : (a[m - 1] + a[m]) / 2;
    }
    function q1(sorted: readonly number[]): number {
      return medianSorted(sorted.slice(0, Math.floor(sorted.length / 2)));
    }
    function q3(sorted: readonly number[]): number {
      const n = sorted.length;
      const half = Math.floor(n / 2);
      return medianSorted(sorted.slice(n % 2 === 1 ? half + 1 : half));
    }
    const cases: { pool: number[]; nonFlat: boolean }[] = [
      { pool: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], nonFlat: true },
      { pool: [1, 1, 1, 1, 1, 1, 1, 1, 1, 10], nonFlat: true },
      { pool: [10, 1, 1], nonFlat: true },
      { pool: [1, 100], nonFlat: true },
      { pool: [3, 3, 3, 3], nonFlat: false },
    ];
    for (const { pool, nonFlat } of cases) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      const pttri = band.partner_peak_to_trimean!;
      const sorted = [...pool].sort((a, b) => a - b);
      const range = sorted[sorted.length - 1] - sorted[0];
      const M = medianSorted(sorted);
      const Q1 = q1(sorted);
      const Q3 = q3(sorted);
      const midhinge = (Q1 + Q3) / 2;
      const ptm = M === 0 ? null : range / M;
      const ptmh = midhinge === 0 ? null : range / midhinge;
      if (nonFlat && ptm !== null && ptmh !== null) {
        const lo = Math.min(ptm, ptmh);
        const hi = Math.max(ptm, ptmh);
        // pttri is rounded to 4 decimals; ptm/ptmh here are raw, so
        // allow a 5e-4 slack to absorb the quantization gap.
        expect(pttri).toBeGreaterThanOrEqual(lo - 5e-4);
        expect(pttri).toBeLessThanOrEqual(hi + 5e-4);
      } else if (!nonFlat) {
        expect(pttri).toBe(0);
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — metric-pool parity", () => {
  it("metric_peak_to_trimean computed identically from KPI-count map (10-KPI uniform ramp → 1.6364)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_trimean).toBe(1.6364);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
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

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PEAK-TO-TRIMEAN heading + PTTRI labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-TRIMEAN");
    expect(html).toContain("PTTRI ");
    expect(html).toContain("wide");
    expect(html).toContain("partner PTTRI");
    expect(html).toContain("KPI PTTRI");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (pttri == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (pttri = 1.6364)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders tight label for BIMODAL SYMMETRIC SPLIT (pttri = 1.6364; matches P11.254 PTMH exactly)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for TOP-HEAVY interior [1×8, 5×2] (pttri = 4.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("renders spread label for SMALL-VALUE-DOMINATED with LARGE-PARTNER PROMOTION [10, 1, 1] (pttri = 2.7692; UNIQUE PTTRI regime — PTM wide, PTMH tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([10, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("renders wide label for UPPER-OUTLIER against UNIFORM FLOOR [1×9, 10] (pttri = 9.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimean(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToTrimeanSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
