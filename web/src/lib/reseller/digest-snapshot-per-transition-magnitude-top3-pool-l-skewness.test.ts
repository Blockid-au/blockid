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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-l-skewness";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes symmetric_l_skewness_abs_max=0.1 + strong_l_skewness_abs_min=0.3 + min_pool_count=4 on envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([]),
      );
    expect(out.symmetric_l_skewness_abs_max).toBe(0.1);
    expect(out.strong_l_skewness_abs_min).toBe(0.3);
    expect(out.min_pool_count_for_l_skewness).toBe(4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null lambdas/tau3 in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
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
        expect(band.partner_l_skewness).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_l_skewness).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — small_pool structural null (pool_count < 4)", () => {
  it("solo cell (1 partner) → tau3 null (small_pool — L-moment estimators undefined for n<4)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_lambda1).toBeNull();
    expect(band.partner_lambda2).toBeNull();
    expect(band.partner_lambda3).toBeNull();
    expect(band.partner_l_skewness).toBeNull();
  });

  it("three-partner pool → tau3 null (small_pool — needs at least four cells for the Tukey-hinge-friendly floor)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_l_skewness).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — degenerate flat pool (lambda2 == 0)", () => {
  it("flat 4-partner pool [1,1,1,1] → lambda2 == 0, tau3 null (degenerate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_lambda1).toBe(1);
    expect(band.partner_lambda2).toBe(0);
    expect(band.partner_l_skewness).toBeNull();
  });

  it("flat 8-partner pool [3,3,3,3,3,3,3,3] → lambda2 == 0, tau3 null (degenerate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([3, 3, 3, 3, 3, 3, 3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(24);
    expect(band.partner_lambda1).toBe(3);
    expect(band.partner_lambda2).toBe(0);
    expect(band.partner_l_skewness).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — arithmetic (pool_count >= 4)", () => {
  it("uniform ramp 4-partner pool [4,3,2,1] → sorted [1,2,3,4], tau3 = 0 (symmetric — uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    // n=4, sorted [1,2,3,4]:
    // b0 = 10/4 = 2.5
    // b1 = (1/4)*[(1/3)*2 + (2/3)*3 + (3/3)*4] = (1/4)*(20/3) = 5/3 ≈ 1.6667
    // b2 = (1/4)*(1/6)*[2*3 + 6*4] = (1/4)*(30/6) = 1.25
    // lambda1 = 2.5
    // lambda2 = 10/3 - 2.5 = 5/6 ≈ 0.8333
    // lambda3 = 7.5 - 10 + 2.5 = 0
    // tau3 = 0 → symmetric (uniform reference)
    expect(band.partner_lambda1).toBe(2.5);
    expect(band.partner_lambda2).toBe(0.8333);
    expect(band.partner_lambda3).toBe(0);
    expect(band.partner_l_skewness).toBe(0);
    expect(Math.abs(band.partner_l_skewness!)).toBeLessThan(
      out.symmetric_l_skewness_abs_max,
    );
  });

  it("uniform ramp 8-partner pool [8,7,6,5,4,3,2,1] → sorted [1..8], tau3 = 0 (symmetric — uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(36);
    // n=8, sorted [1,2,3,4,5,6,7,8]:
    // b0 = 36/8 = 4.5, b1 = 168/(7*8) = 3, b2 = 756/(42*8) = 2.25
    // lambda1 = 4.5, lambda2 = 6 - 4.5 = 1.5, lambda3 = 13.5 - 18 + 4.5 = 0
    // tau3 = 0.
    expect(band.partner_lambda1).toBe(4.5);
    expect(band.partner_lambda2).toBe(1.5);
    expect(band.partner_lambda3).toBe(0);
    expect(band.partner_l_skewness).toBe(0);
  });

  it("symmetric bimodal 8-partner pool [10,10,10,10,1,1,1,1] → sorted [1,1,1,1,10,10,10,10], tau3 = 0 (symmetric about mean)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(44);
    // Reflecting 1↔10 around mean 5.5 → symmetric distribution about the
    // mean, so L-skewness must read 0.
    expect(band.partner_lambda1).toBe(5.5);
    expect(band.partner_l_skewness).toBe(0);
  });

  it("heavy right-tail 8-partner pool [100,100,1,1,1,1,1,1] → tau3 ≈ 0.6667 (strong_right)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(206);
    // n=8, sorted [1,1,1,1,1,1,100,100]:
    // b0 = 206/8 = 25.75
    // b1 = 1315/(7*8) ≈ 23.4821
    // b2 = 7240/(42*8) ≈ 21.5476
    // lambda1 = 25.75, lambda2 ≈ 21.2143, lambda3 ≈ 14.1429
    // tau3 ≈ 0.6667 → strong_right (≥ 0.3)
    expect(band.partner_lambda1).toBe(25.75);
    expect(band.partner_lambda2).toBe(21.2143);
    expect(band.partner_lambda3).toBe(14.1429);
    expect(band.partner_l_skewness).toBe(0.6667);
    expect(band.partner_l_skewness!).toBeGreaterThanOrEqual(
      out.strong_l_skewness_abs_min,
    );
  });

  it("right-skew ramp 8-partner pool [50,7,6,5,4,3,2,1] → sorted [1,2,3,4,5,6,7,50], tau3 ≈ 0.7778 (strong_right)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([50, 7, 6, 5, 4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    // n=8, sorted [1,2,3,4,5,6,7,50]:
    // b0 = 78/8 = 9.75, b1 = 66/8 = 8.25, b2 = 60/8 = 7.5
    // lambda1 = 9.75, lambda2 = 16.5 - 9.75 = 6.75, lambda3 = 45 - 49.5 + 9.75 = 5.25
    // tau3 = 5.25/6.75 = 0.7778 → strong_right
    expect(band.partner_lambda2).toBe(6.75);
    expect(band.partner_lambda3).toBe(5.25);
    expect(band.partner_l_skewness).toBe(0.7778);
  });

  it("left-skew ramp 8-partner pool [1,50,49,48,47,46,45,44] → sorted [1,44,45,46,47,48,49,50], tau3 ≈ -0.7778 (strong_left, mirror)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([1, 50, 49, 48, 47, 46, 45, 44])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    // n=8, sorted [1,44,45,46,47,48,49,50]:
    // b0 = 330/8 = 41.25, b1 = 192/8 = 24, b2 = 130/8 = 16.25
    // lambda1 = 41.25, lambda2 = 48 - 41.25 = 6.75, lambda3 = 97.5 - 144 + 41.25 = -5.25
    // tau3 = -0.7778 → strong_left (mirror of right-skew ramp)
    expect(band.partner_lambda2).toBe(6.75);
    expect(band.partner_lambda3).toBe(-5.25);
    expect(band.partner_l_skewness).toBe(-0.7778);
    expect(band.partner_l_skewness!).toBeLessThanOrEqual(
      -out.strong_l_skewness_abs_min,
    );
  });

  it("bounded codomain invariant: |tau3| always <= 1", () => {
    // Hosking 1990 §2.3: L-skewness is bounded on [-1, +1] for any
    // valid sample. Sweep a few pathological pools to confirm.
    const pathological: number[][] = [
      [100, 100, 1, 1, 1, 1, 1, 1],
      [50, 7, 6, 5, 4, 3, 2, 1],
      [1, 50, 49, 48, 47, 46, 45, 44],
      [1000, 1, 1, 1],
      [1, 1, 1, 1000],
    ];
    for (const counts of pathological) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
          envelope(partnerPool(counts)),
        );
      const bands = ["small", "medium", "large"] as const;
      for (const b of bands) {
        const tau3 =
          out.transitions.improved.bands[b].partner_l_skewness;
        if (tau3 !== null) {
          expect(Math.abs(tau3)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — metric-pool parity", () => {
  it("metric_l_skewness computed identically from KPI-count map", () => {
    // 8 KPIs with counts matching partner pool [8,7,6,5,4,3,2,1] → tau3 0.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(8);
    expect(band.metric_lambda1).toBe(4.5);
    expect(band.metric_lambda2).toBe(1.5);
    expect(band.metric_l_skewness).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(rows),
      );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      ),
    ).toBe("");
  });

  it("renders L-SKEWNESS heading + tau3 + lambda1/2/3 labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).toContain("L-SKEWNESS");
    expect(html).toContain("tau3");
    expect(html).toContain("lambda1");
    expect(html).toContain("lambda2");
    expect(html).toContain("lambda3");
    expect(html).toContain("strong_right");
    expect(html).toContain("partner tau3");
    expect(html).toContain("KPI tau3");
  });

  it("renders small_pool label for pool_count in [1,3]", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([3, 2, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label when the pool is flat (lambda2 == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).toContain("degenerate");
  });

  it("renders strong_left label for left-skewed pool", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([1, 50, 49, 48, 47, 46, 45, 44])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).toContain("strong_left");
  });

  it("renders symmetric label for a symmetric pool (uniform ramp)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).toContain("symmetric");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewness(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolLSkewnessSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
