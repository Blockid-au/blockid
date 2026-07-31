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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-l-cv";

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

/**
 * Emit partner-count pool [counts[0], counts[1], ...] in the medium band
 * (hot_score 4). Each partner code gets its own row-per-KPI count.
 */
function partnerPool(counts: number[]): PerPairHotCellRow[] {
  const rows: PerPairHotCellRow[] = [];
  const codes = "ABCDEFGHIJKL".split("");
  counts.forEach((c, idx) => {
    for (let i = 0; i < c; i++) {
      rows.push(cell(codes[idx], KPI_CATALOG[i], "improved", 4));
    }
  });
  return rows;
}

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes low_l_cv_max=0.20 + high_l_cv_min=0.40 + highly_concentrated_l_cv_min=0.60 + min_pool_count=3 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([]),
    );
    expect(out.low_l_cv_max).toBe(0.2);
    expect(out.high_l_cv_min).toBe(0.4);
    expect(out.highly_concentrated_l_cv_min).toBe(0.6);
    expect(out.min_pool_count_for_l_cv).toBe(3);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null lambdas/tau2 in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
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
        expect(band.partner_lambda1).toBeNull();
        expect(band.partner_lambda2).toBeNull();
        expect(band.partner_l_cv).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_l_cv).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — small_pool structural null (pool_count < 3)", () => {
  it("solo cell (1 partner) → tau2 null (small_pool — L-moment estimators undefined for n<3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_lambda1).toBeNull();
    expect(band.partner_lambda2).toBeNull();
    expect(band.partner_l_cv).toBeNull();
  });

  it("two-partner pool → tau2 null (small_pool — needs at least three cells to avoid endpoint leakage on b1)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([4, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_l_cv).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — flat non-zero pool (lambda2 == 0, tau2 = 0 — MEASURED balanced verdict, not degenerate)", () => {
  it("flat 3-partner pool [1,1,1] → lambda2 == 0, tau2 = 0 (balanced — measured zero-dispersion verdict)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_lambda1).toBe(1);
    expect(band.partner_lambda2).toBe(0);
    // Key semantic difference from L-skewness / L-kurtosis: tau2 uses
    // lambda2 in the NUMERATOR so lambda2 == 0 is a MEASURED verdict of
    // zero dispersion, NOT a degenerate indeterminacy.
    expect(band.partner_l_cv).toBe(0);
  });

  it("flat 8-partner pool [3,3,3,3,3,3,3,3] → lambda2 == 0, tau2 = 0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([3, 3, 3, 3, 3, 3, 3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(24);
    expect(band.partner_lambda1).toBe(3);
    expect(band.partner_lambda2).toBe(0);
    expect(band.partner_l_cv).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — arithmetic (pool_count >= 3)", () => {
  it("uniform ramp 3-partner pool [3,2,1] → sorted [1,2,3], tau2 = 1/3 (uniform reference)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(6);
    // n=3, sorted [1,2,3]:
    // b0 = 6/3 = 2
    // b1 = (1/3)*(1/2)*[1*2 + 2*3] = 8/6 ≈ 1.3333
    // lambda1 = 2, lambda2 = 2*1.3333 - 2 ≈ 0.6667
    // tau2 = 0.6667/2 ≈ 0.3333 (uniform reference)
    expect(band.partner_lambda1).toBe(2);
    expect(band.partner_lambda2).toBe(0.6667);
    expect(band.partner_l_cv).toBe(0.3333);
  });

  it("uniform ramp 5-partner pool [5,4,3,2,1] → sorted [1,2,3,4,5], tau2 = 1/3 (uniform reference)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(15);
    // n=5, sorted [1,2,3,4,5]:
    // b0 = 15/5 = 3
    // b1 = (1/5)*[0.25*2 + 0.5*3 + 0.75*4 + 1*5] = (1/5)*10 = 2
    // lambda1 = 3, lambda2 = 4 - 3 = 1
    // tau2 = 1/3 ≈ 0.3333 → moderate (uniform-ramp-like dispersion)
    expect(band.partner_lambda1).toBe(3);
    expect(band.partner_lambda2).toBe(1);
    expect(band.partner_l_cv).toBe(0.3333);
  });

  it("uniform ramp 8-partner pool [8,7,6,5,4,3,2,1] → sorted [1..8], tau2 = 1/3 (uniform reference)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(36);
    // n=8, sorted [1..8]:
    // b0 = 36/8 = 4.5
    // b1 = (1/8)*(1/7)*[1*2 + 2*3 + 3*4 + 4*5 + 5*6 + 6*7 + 7*8]
    //    = (1/56)*168 = 3
    // lambda1 = 4.5, lambda2 = 6 - 4.5 = 1.5
    // tau2 = 1.5/4.5 = 0.3333
    expect(band.partner_lambda1).toBe(4.5);
    expect(band.partner_lambda2).toBe(1.5);
    expect(band.partner_l_cv).toBe(0.3333);
  });

  it("symmetric bimodal 8-partner pool [10,10,10,10,1,1,1,1] → tau2 ≈ 0.467 (concentrated — mass split into two humps)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(44);
    // n=8, sorted [1,1,1,1,10,10,10,10]:
    // b0 = 44/8 = 5.5
    // b1 = (1/8)*(1/7)*[1*1 + 2*1 + 3*1 + 4*10 + 5*10 + 6*10 + 7*10]
    //    = (1/56)*226 ≈ 4.0357
    // lambda1 = 5.5, lambda2 ≈ 2.5714
    // tau2 ≈ 0.4675 → concentrated band [0.40, 0.60)
    expect(band.partner_lambda1).toBe(5.5);
    expect(band.partner_lambda2).toBe(2.5714);
    expect(band.partner_l_cv).toBe(0.4675);
    expect(band.partner_l_cv!).toBeGreaterThanOrEqual(out.high_l_cv_min);
    expect(band.partner_l_cv!).toBeLessThan(out.highly_concentrated_l_cv_min);
  });

  it("single-outlier 5-partner pool [1000,1,1,1,1] → sorted [1,1,1,1,1000], tau2 ≈ 0.995 (highly_concentrated — near-saturated bound)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([1000, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(1004);
    // n=5, sorted [1,1,1,1,1000]:
    // b0 = 1004/5 = 200.8
    // b1 = (1/5)*(1/4)*[1*1 + 2*1 + 3*1 + 4*1000] = (1/20)*4006 = 200.3
    // lambda1 = 200.8, lambda2 = 400.6 - 200.8 = 199.8
    // tau2 = 199.8/200.8 ≈ 0.9950 → highly_concentrated band [0.60, +∞)
    expect(band.partner_lambda1).toBe(200.8);
    expect(band.partner_lambda2).toBe(199.8);
    expect(band.partner_l_cv).toBe(0.995);
    expect(band.partner_l_cv!).toBeGreaterThanOrEqual(
      out.highly_concentrated_l_cv_min,
    );
  });

  it("bounded codomain invariant: 0 <= tau2 <= 1 for sample PWM estimator on non-negative variates", () => {
    // Hosking 1990 §2.3 bounds tau2 on [0, +1] for non-negative
    // variates on the sample-PWM codomain. Since pool_cells count
    // integers are strictly non-negative by construction, this
    // invariant holds for every real pool this surface will ever see.
    const pathological: number[][] = [
      [100, 100, 1, 1, 1, 1, 1, 1],
      [50, 7, 6, 5, 4, 3, 2, 1],
      [1, 50, 49, 48, 47, 46, 45, 44],
      [1000, 1, 1, 1, 1],
      [1, 1, 1, 1, 1000],
      [10, 10, 10, 10, 1, 1, 1, 1],
      [1, 1, 1],
      [3, 3, 3, 3, 3],
    ];
    for (const counts of pathological) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
        envelope(partnerPool(counts)),
      );
      const bands = ["small", "medium", "large"] as const;
      for (const b of bands) {
        const tau2 = out.transitions.improved.bands[b].partner_l_cv;
        if (tau2 !== null) {
          expect(tau2).toBeGreaterThanOrEqual(0);
          expect(tau2).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — metric-pool parity", () => {
  it("metric_l_cv computed identically from KPI-count map", () => {
    // 8 KPIs with counts matching partner pool [8,7,6,5,4,3,2,1] → tau2 1/3.
    const rows: PerPairHotCellRow[] = [];
    const kpiCounts: [KnownKpiSection, number][] = [
      ["attributed_mrr", 8],
      ["commission_cleared_mtd", 7],
      ["attributed_net_contribution", 6],
      ["contribution_margin_pct", 5],
      ["clawback_exposure", 4],
      ["budget_utilization", 3],
      ["sandbox_share_of_budget", 2],
      ["attributed_churn_30d", 1],
    ];
    const codes = "ABCDEFGHIJKL".split("");
    kpiCounts.forEach(([kpi, count]) => {
      for (let i = 0; i < count; i++) {
        rows.push(cell(codes[i], kpi, "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(8);
    expect(band.metric_lambda1).toBe(4.5);
    expect(band.metric_lambda2).toBe(1.5);
    expect(band.metric_l_cv).toBe(0.3333);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
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

  it("degraded + rotated + undecidable transitions each track independently", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "degraded", 4),
      cell("B", "attributed_mrr", "rotated", 4),
      cell("C", "attributed_mrr", "undecidable", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(out),
    ).toBe("");
  });

  it("renders L-CV heading + tau2 + lambda1..2 labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([1000, 1, 1, 1, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).toContain("L-CV");
    expect(html).toContain("tau2");
    expect(html).toContain("lambda1");
    expect(html).toContain("lambda2");
    expect(html).toContain("highly_concentrated");
    expect(html).toContain("partner tau2");
    expect(html).toContain("KPI tau2");
  });

  it("renders small_pool label for pool_count in [1,2]", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([4, 3])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).toContain("small_pool");
  });

  it("renders balanced label for flat pool (tau2 = 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([1, 1, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).toContain("balanced");
  });

  it("renders concentrated label for bimodal pool (tau2 in [0.40, 0.60))", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).toContain("concentrated");
  });

  it("renders moderate label for uniform ramp (tau2 = 1/3 → moderate band [0.20, 0.40))", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).toContain("moderate");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolLCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolLCvSection(
      out,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
