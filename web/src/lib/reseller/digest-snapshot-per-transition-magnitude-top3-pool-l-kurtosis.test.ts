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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-l-kurtosis";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes l_kurtosis_normal_reference=0.1226 + mesokurtic_deviation_max=0.05 + strong_deviation_min=0.15 + min_pool_count=5 on envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([]),
      );
    expect(out.l_kurtosis_normal_reference).toBe(0.1226);
    expect(out.mesokurtic_l_kurtosis_deviation_max).toBe(0.05);
    expect(out.strong_l_kurtosis_deviation_min).toBe(0.15);
    expect(out.min_pool_count_for_l_kurtosis).toBe(5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null lambdas/tau4 in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
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
        expect(band.partner_lambda3).toBeNull();
        expect(band.partner_lambda4).toBeNull();
        expect(band.partner_l_kurtosis).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_l_kurtosis).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — small_pool structural null (pool_count < 5)", () => {
  it("solo cell (1 partner) → tau4 null (small_pool — L-moment estimators undefined for n<5)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_lambda1).toBeNull();
    expect(band.partner_lambda2).toBeNull();
    expect(band.partner_lambda3).toBeNull();
    expect(band.partner_lambda4).toBeNull();
    expect(band.partner_l_kurtosis).toBeNull();
  });

  it("four-partner pool → tau4 null (small_pool — needs at least five cells to avoid endpoint leakage on b3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_l_kurtosis).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — degenerate flat pool (lambda2 == 0)", () => {
  it("flat 5-partner pool [1,1,1,1,1] → lambda2 == 0, tau4 null (degenerate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_lambda1).toBe(1);
    expect(band.partner_lambda2).toBe(0);
    expect(band.partner_l_kurtosis).toBeNull();
  });

  it("flat 8-partner pool [3,3,3,3,3,3,3,3] → lambda2 == 0, tau4 null (degenerate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([3, 3, 3, 3, 3, 3, 3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(24);
    expect(band.partner_lambda1).toBe(3);
    expect(band.partner_lambda2).toBe(0);
    expect(band.partner_l_kurtosis).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — arithmetic (pool_count >= 5)", () => {
  it("uniform ramp 5-partner pool [5,4,3,2,1] → sorted [1,2,3,4,5], tau4 = 0 (uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([5, 4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(15);
    // n=5, sorted [1,2,3,4,5]:
    // b0 = 15/5 = 3
    // b1 = (1/5)*[0.25*2 + 0.5*3 + 0.75*4 + 1*5] = (1/5)*10 = 2
    // b2 = (1/5)*(1/12)*[2*3 + 6*4 + 12*5] = (1/5)*(90/12) = 1.5
    // b3 = (1/5)*(1/24)*[6*4 + 24*5] = (1/5)*(144/24) = 1.2
    // lambda1 = 3
    // lambda2 = 4 - 3 = 1
    // lambda3 = 9 - 12 + 3 = 0
    // lambda4 = 24 - 45 + 24 - 3 = 0
    // tau4 = 0 → uniform reference (mild_light since 0 < 0.0726)
    expect(band.partner_lambda1).toBe(3);
    expect(band.partner_lambda2).toBe(1);
    expect(band.partner_lambda3).toBe(0);
    expect(band.partner_lambda4).toBe(0);
    expect(band.partner_l_kurtosis).toBe(0);
  });

  it("uniform ramp 8-partner pool [8,7,6,5,4,3,2,1] → sorted [1..8], tau4 = 0 (uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(36);
    // n=8, sorted [1..8]:
    // b0 = 4.5, b1 = 3, b2 = 2.25, b3 = 3024/(210*8) = 1.8
    // lambda1 = 4.5, lambda2 = 1.5, lambda3 = 0
    // lambda4 = 36 - 67.5 + 36 - 4.5 = 0
    // tau4 = 0.
    expect(band.partner_lambda1).toBe(4.5);
    expect(band.partner_lambda2).toBe(1.5);
    expect(band.partner_lambda3).toBe(0);
    expect(band.partner_lambda4).toBe(0);
    expect(band.partner_l_kurtosis).toBe(0);
  });

  it("symmetric bimodal 8-partner pool [10,10,10,10,1,1,1,1] → tau4 = -0.5 (strong_light — bimodal platykurtic)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(44);
    // n=8, sorted [1,1,1,1,10,10,10,10]:
    // b0 = 5.5, b1 = 226/56 ≈ 4.0357, b2 = 1048/336 ≈ 3.119,
    // b3 = 4146/1680 ≈ 2.4679
    // lambda1 = 5.5, lambda2 ≈ 2.5714, lambda3 = 0
    // lambda4 ≈ 49.357 - 93.571 + 48.429 - 5.5 = -1.286
    // tau4 = -1.286/2.571 ≈ -0.5 → strong_light (mass split into two
    // humps → tails empty relative to interior)
    expect(band.partner_lambda1).toBe(5.5);
    expect(band.partner_lambda2).toBe(2.5714);
    expect(band.partner_lambda3).toBe(0);
    expect(band.partner_lambda4).toBe(-1.2857);
    expect(band.partner_l_kurtosis).toBe(-0.5);
    const deviation = band.partner_l_kurtosis! - out.l_kurtosis_normal_reference;
    expect(deviation).toBeLessThanOrEqual(-out.strong_l_kurtosis_deviation_min);
  });

  it("single-outlier 5-partner pool [1000,1,1,1,1] → sorted [1,1,1,1,1000], tau4 = 1 (extreme heavy tail — bound saturated)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([1000, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(1004);
    // n=5, sorted [1,1,1,1,1000]:
    // b0 = 1004/5 = 200.8
    // b1 = (1/5)*(1/4)*[1*1 + 2*1 + 3*1 + 4*1000] = 4006/20 = 200.3
    // b2 = (1/5)*(1/12)*[2*1 + 6*1 + 12*1000] = 12008/60 ≈ 200.133
    // b3 = (1/5)*(1/24)*[6*1 + 24*1000] = 24006/120 = 200.05
    // lambda1 = 200.8
    // lambda2 = 400.6 - 200.8 = 199.8
    // lambda3 = 1200.8 - 1201.8 + 200.8 = 199.8
    // lambda4 = 4001 - 6004 + 2403.6 - 200.8 = 199.8
    // tau4 = 199.8/199.8 = 1.0 → strong_heavy (bound saturated)
    expect(band.partner_lambda1).toBe(200.8);
    expect(band.partner_lambda2).toBe(199.8);
    expect(band.partner_l_kurtosis).toBe(1);
    expect(band.partner_l_kurtosis!).toBeGreaterThanOrEqual(
      out.l_kurtosis_normal_reference + out.strong_l_kurtosis_deviation_min,
    );
  });

  it("bounded codomain invariant: |tau4| <= 1 for sample PWM estimator", () => {
    // Hosking 1990 §2.3 bounds tau4 on (-0.25, +1] for continuous
    // distributions with tau3 = 0; the sample-PWM estimator on finite
    // discrete pools can drop below -0.25 (e.g. a perfectly bimodal
    // n=8 pool [1,1,1,1,10,10,10,10] reads tau4 = -0.5). The
    // universal loose bound |tau4| <= 1 always holds so use that as
    // the compact-codomain invariant for the digest surface.
    const pathological: number[][] = [
      [100, 100, 1, 1, 1, 1, 1, 1],
      [50, 7, 6, 5, 4, 3, 2, 1],
      [1, 50, 49, 48, 47, 46, 45, 44],
      [1000, 1, 1, 1, 1],
      [1, 1, 1, 1, 1000],
      [10, 10, 10, 10, 1, 1, 1, 1],
    ];
    for (const counts of pathological) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
          envelope(partnerPool(counts)),
        );
      const bands = ["small", "medium", "large"] as const;
      for (const b of bands) {
        const tau4 =
          out.transitions.improved.bands[b].partner_l_kurtosis;
        if (tau4 !== null) {
          expect(Math.abs(tau4)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — metric-pool parity", () => {
  it("metric_l_kurtosis computed identically from KPI-count map", () => {
    // 8 KPIs with counts matching partner pool [8,7,6,5,4,3,2,1] → tau4 0.
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(8);
    expect(band.metric_lambda1).toBe(4.5);
    expect(band.metric_lambda2).toBe(1.5);
    expect(band.metric_lambda4).toBe(0);
    expect(band.metric_l_kurtosis).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(rows),
      );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      ),
    ).toBe("");
  });

  it("renders L-KURTOSIS heading + tau4 + lambda1..4 labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([1000, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).toContain("L-KURTOSIS");
    expect(html).toContain("tau4");
    expect(html).toContain("lambda1");
    expect(html).toContain("lambda2");
    expect(html).toContain("lambda3");
    expect(html).toContain("lambda4");
    expect(html).toContain("strong_heavy");
    expect(html).toContain("partner tau4");
    expect(html).toContain("KPI tau4");
  });

  it("renders small_pool label for pool_count in [1,4]", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([4, 3, 2, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label when the pool is flat (lambda2 == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).toContain("degenerate");
  });

  it("renders strong_light label for bimodal pool (tau4 < -0.0274)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).toContain("strong_light");
  });

  it("renders mild_light for uniform ramp (tau4 = 0 → deviation -0.1226 → platykurtic)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).toContain("platykurtic");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosis(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLKurtosisSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
