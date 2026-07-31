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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-crow-siddiqui-kurtosis";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes crow_siddiqui_normal_reference=2.906 + mesokurtic_deviation_max=0.3 + strong_deviation_min=0.7 + min_pool_count=4 on envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([]),
      );
    expect(out.crow_siddiqui_normal_reference).toBe(2.906);
    expect(out.mesokurtic_crow_siddiqui_deviation_max).toBe(0.3);
    expect(out.strong_crow_siddiqui_deviation_min).toBe(0.7);
    expect(out.min_pool_count_for_crow_siddiqui).toBe(4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null percentiles/cs in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
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
        expect(band.partner_p025_cells).toBeNull();
        expect(band.partner_p25_cells).toBeNull();
        expect(band.partner_p75_cells).toBeNull();
        expect(band.partner_p975_cells).toBeNull();
        expect(band.partner_crow_siddiqui).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_crow_siddiqui).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — small_pool structural null (pool_count < 4)", () => {
  it("solo cell (1 partner) → cs null (small_pool — percentiles undefined for n<4)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_p025_cells).toBeNull();
    expect(band.partner_p975_cells).toBeNull();
    expect(band.partner_crow_siddiqui).toBeNull();
  });

  it("three-partner pool → cs null (small_pool — needs at least four cells for the Tukey hinge floor)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_crow_siddiqui).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — degenerate interior (P75 == P25)", () => {
  it("flat 4-partner pool [1,1,1,1] → P25==P75==1, cs null (degenerate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_p25_cells).toBe(1);
    expect(band.partner_p75_cells).toBe(1);
    expect(band.partner_crow_siddiqui).toBeNull();
  });

  it("single-outlier n=8 pool [10,1,1,1,1,1,1,1] → P25==P75==1, cs null (degenerate — outlier tucked into upper-tail P97.5)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(17);
    // Sorted [1,1,1,1,1,1,1,10]. All interior positions collapse to 1;
    // only P97.5 pulls up (idx=7*0.975=6.825 → sorted[6]+0.825*(sorted[7]-sorted[6])=1+0.825*9=8.425).
    // P25==P75==1 → degenerate.
    expect(band.partner_p25_cells).toBe(1);
    expect(band.partner_p75_cells).toBe(1);
    expect(band.partner_crow_siddiqui).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — arithmetic (pool_count >= 4)", () => {
  it("linear ramp 4-partner pool [4,3,2,1] → cs 1.9 (strong_light — uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    // Sorted [1,2,3,4]. n=4, R type-7 interp:
    // P2.5 (idx 3*0.025=0.075)=1+0.075=1.075.
    // P25 (idx 0.75)=1+0.75=1.75.
    // P75 (idx 2.25)=3+0.25=3.25.
    // P97.5 (idx 2.925)=3+0.925=3.925.
    // cs = (3.925-1.075)/(3.25-1.75) = 2.85/1.5 = 1.9.
    expect(band.partner_p025_cells).toBe(1.075);
    expect(band.partner_p25_cells).toBe(1.75);
    expect(band.partner_p75_cells).toBe(3.25);
    expect(band.partner_p975_cells).toBe(3.925);
    expect(band.partner_crow_siddiqui).toBe(1.9);
    // 1.9 - 2.906 = -1.006 ≤ -0.7 → strong_light (uniform reference band).
    expect(
      band.partner_crow_siddiqui! - out.crow_siddiqui_normal_reference,
    ).toBeLessThanOrEqual(-out.strong_crow_siddiqui_deviation_min);
  });

  it("linear ramp 8-partner pool [8,7,6,5,4,3,2,1] → cs 1.9 (strong_light — uniform reference)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(36);
    // Sorted [1,2,3,4,5,6,7,8]. n=8, R type-7 interp:
    // P2.5 (idx 7*0.025=0.175)=1+0.175=1.175.
    // P25 (idx 1.75)=2+0.75=2.75.
    // P75 (idx 5.25)=6+0.25=6.25.
    // P97.5 (idx 6.825)=7+0.825=7.825.
    // cs = (7.825-1.175)/(6.25-2.75) = 6.65/3.5 = 1.9.
    expect(band.partner_p025_cells).toBe(1.175);
    expect(band.partner_p25_cells).toBe(2.75);
    expect(band.partner_p75_cells).toBe(6.25);
    expect(band.partner_p975_cells).toBe(7.825);
    expect(band.partner_crow_siddiqui).toBe(1.9);
  });

  it("bimodal 8-partner pool [10,10,10,10,1,1,1,1] → cs 1.0 (strong_light — mass at extremes, hinge span == tail span)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(44);
    // Sorted [1,1,1,1,10,10,10,10]. P2.5==P25==1, P75==P97.5==10.
    // cs = (10-1)/(10-1) = 1.
    expect(band.partner_p025_cells).toBe(1);
    expect(band.partner_p25_cells).toBe(1);
    expect(band.partner_p75_cells).toBe(10);
    expect(band.partner_p975_cells).toBe(10);
    expect(band.partner_crow_siddiqui).toBe(1);
    // 1 - 2.906 = -1.906 ≤ -0.7 → strong_light.
    expect(
      band.partner_crow_siddiqui! - out.crow_siddiqui_normal_reference,
    ).toBeLessThanOrEqual(-out.strong_crow_siddiqui_deviation_min);
  });

  it("heavy-tail 8-partner pool [100,100,1,1,1,1,1,1] → cs 4.0 (strong_heavy — far-tail extremes dominate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(206);
    // Sorted [1,1,1,1,1,1,100,100]. P2.5==P25==1, P75 = 1+0.25*(100-1) = 25.75,
    // P97.5 = 100+0.825*0 = 100. cs = (100-1)/(25.75-1) = 99/24.75 = 4.
    expect(band.partner_p75_cells).toBe(25.75);
    expect(band.partner_p975_cells).toBe(100);
    expect(band.partner_crow_siddiqui).toBe(4);
    // 4 - 2.906 = 1.094 ≥ 0.7 → strong_heavy.
    expect(
      band.partner_crow_siddiqui! - out.crow_siddiqui_normal_reference,
    ).toBeGreaterThanOrEqual(out.strong_crow_siddiqui_deviation_min);
  });

  it("bell-heavy 9-partner pool [1,2,4,8,16,8,4,2,1] → cs ~2.233 (platykurtic edge)", () => {
    // Sorted [1,1,2,2,4,4,8,8,16]. n=9, R type-7:
    // P2.5 (idx 8*0.025=0.2) = 1+0.2*(1-1) = 1.
    // P25 (idx 2) = sorted[2] = 2.
    // P75 (idx 6) = sorted[6] = 8.
    // P97.5 (idx 7.8) = 8+0.8*(16-8) = 14.4.
    // cs = (14.4-1)/(8-2) = 13.4/6 = 2.2333.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([1, 2, 4, 8, 16, 8, 4, 2, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(9);
    expect(band.partner_p025_cells).toBe(1);
    expect(band.partner_p25_cells).toBe(2);
    expect(band.partner_p75_cells).toBe(8);
    expect(band.partner_p975_cells).toBe(14.4);
    expect(band.partner_crow_siddiqui).toBe(2.2333);
    // 2.2333 - 2.906 = -0.6727 in (-0.7, -0.3] → platykurtic.
    const dev =
      band.partner_crow_siddiqui! - out.crow_siddiqui_normal_reference;
    expect(dev).toBeLessThanOrEqual(-out.mesokurtic_crow_siddiqui_deviation_max);
    expect(dev).toBeGreaterThan(-out.strong_crow_siddiqui_deviation_min);
  });

  it("bounded lower-bound invariant: cs always >= 0", () => {
    // Any non-degenerate pool: P97.5 >= P2.5 by sortedness, P75 > P25
    // (denominator) → cs >= 0.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_crow_siddiqui!).toBeGreaterThanOrEqual(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — metric-pool parity", () => {
  it("metric_crow_siddiqui computed identically from KPI-count map", () => {
    // 8 KPIs with counts matching partner pool [8,7,6,5,4,3,2,1] → cs 1.9.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(8);
    expect(band.metric_crow_siddiqui).toBe(1.9);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(rows),
      );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      ),
    ).toBe("");
  });

  it("renders CROW-SIDDIQUI KURTOSIS heading + cs + P2.5/P25/P75/P97.5 labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      );
    expect(html).toContain("CROW-SIDDIQUI KURTOSIS");
    expect(html).toContain("P2.5");
    expect(html).toContain("P25");
    expect(html).toContain("P75");
    expect(html).toContain("P97.5");
    expect(html).toContain("strong_heavy");
    expect(html).toContain("partner cs");
    expect(html).toContain("KPI cs");
  });

  it("renders small_pool label for pool_count in [1,3]", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([3, 2, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      );
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label when interior hinge is flat (P75 == P25)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope(partnerPool([1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      );
    expect(html).toContain("degenerate");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosis(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCrowSiddiquiKurtosisSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
