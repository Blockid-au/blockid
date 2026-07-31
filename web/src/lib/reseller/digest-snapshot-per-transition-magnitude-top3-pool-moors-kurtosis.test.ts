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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-moors-kurtosis";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes moors_normal_reference=1.233 + mesokurtic_moors_deviation_max=0.2 + strong_moors_deviation_min=0.5 + min_pool_count_for_moors=8 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([]),
    );
    expect(out.moors_normal_reference).toBe(1.233);
    expect(out.mesokurtic_moors_deviation_max).toBe(0.2);
    expect(out.strong_moors_deviation_min).toBe(0.5);
    expect(out.min_pool_count_for_moors).toBe(8);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null octiles/moors in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
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
        expect(band.partner_e1_cells).toBeNull();
        expect(band.partner_e2_cells).toBeNull();
        expect(band.partner_e3_cells).toBeNull();
        expect(band.partner_e5_cells).toBeNull();
        expect(band.partner_e6_cells).toBeNull();
        expect(band.partner_e7_cells).toBeNull();
        expect(band.partner_moors).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_moors).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — small_pool structural null (pool_count < 8)", () => {
  it("solo cell (1 partner) → moors null (small_pool — octiles undefined for n<8)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_e1_cells).toBeNull();
    expect(band.partner_e7_cells).toBeNull();
    expect(band.partner_moors).toBeNull();
  });

  it("four-partner pool → moors null (small_pool — same floor that P11.215 Bowley clears)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_moors).toBeNull();
  });

  it("seven-partner pool → moors null (small_pool — needs one cell per octile)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(7);
    expect(band.partner_moors).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — degenerate interior (E6 == E2)", () => {
  it("flat 8-partner pool [1,1,1,1,1,1,1,1] → E2==E6==1, moors null (degenerate)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_e2_cells).toBe(1);
    expect(band.partner_e6_cells).toBe(1);
    expect(band.partner_moors).toBeNull();
  });

  it("single-outlier n=8 pool [10,1,1,1,1,1,1,1] → E2==E6==1, moors null (degenerate — outlier tucked into upper-tail E7)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(17);
    // Sorted [1,1,1,1,1,1,1,10]. All interior octiles collapse to 1;
    // only E7 pulls up (7.125 = 1 + 0.125*(10-1) = 1 + 1.125). E2==E6 → degenerate.
    expect(band.partner_e2_cells).toBe(1);
    expect(band.partner_e6_cells).toBe(1);
    expect(band.partner_moors).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — arithmetic (pool_count >= 8)", () => {
  it("linear ramp 8-partner pool [8,7,6,5,4,3,2,1] → moors 1.0 (platykurtic — uniform-like light tails)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(36);
    // Sorted [1,2,3,4,5,6,7,8]. n=8, R type-7 interp:
    // E1 (idx 0.875)=1.875, E2 (1.75)=2.75, E3 (2.625)=3.625,
    // E5 (4.375)=5.375, E6 (5.25)=6.25, E7 (6.125)=7.125.
    // m = ((7.125-5.375)+(3.625-1.875))/(6.25-2.75) = (1.75+1.75)/3.5 = 1.
    expect(band.partner_e1_cells).toBe(1.875);
    expect(band.partner_e2_cells).toBe(2.75);
    expect(band.partner_e3_cells).toBe(3.625);
    expect(band.partner_e5_cells).toBe(5.375);
    expect(band.partner_e6_cells).toBe(6.25);
    expect(band.partner_e7_cells).toBe(7.125);
    expect(band.partner_moors).toBe(1);
    // 1.0 - 1.233 = -0.233 → in [-0.5, -0.2] → platykurtic.
    expect(band.partner_moors! - out.moors_normal_reference).toBeLessThanOrEqual(
      -out.mesokurtic_moors_deviation_max,
    );
    expect(band.partner_moors! - out.moors_normal_reference).toBeGreaterThan(
      -out.strong_moors_deviation_min,
    );
  });

  it("bimodal 8-partner pool [10,10,10,10,1,1,1,1] → moors 0 (strong_light — mass at extremes, no shoulders)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(44);
    // Sorted [1,1,1,1,10,10,10,10]. E1..E3 all = 1, E5..E7 all = 10.
    // m = ((10-10)+(1-1))/(10-1) = 0/9 = 0.
    expect(band.partner_e1_cells).toBe(1);
    expect(band.partner_e2_cells).toBe(1);
    expect(band.partner_e3_cells).toBe(1);
    expect(band.partner_e5_cells).toBe(10);
    expect(band.partner_e6_cells).toBe(10);
    expect(band.partner_e7_cells).toBe(10);
    expect(band.partner_moors).toBe(0);
    // 0 - 1.233 = -1.233 ≤ -0.5 → strong_light.
    expect(band.partner_moors! - out.moors_normal_reference).toBeLessThanOrEqual(
      -out.strong_moors_deviation_min,
    );
  });

  it("heavy-tail 8-partner pool [100,100,1,1,1,1,1,1] → strong_heavy (m > 1.733)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(8);
    expect(band.partner_pool_cells).toBe(206);
    // Sorted [1,1,1,1,1,1,100,100]. E1..E5 all = 1, E6 = 1 + 0.25*(100-1) = 25.75,
    // E7 = 100. m = ((100-1)+(1-1))/(25.75-1) = 99/24.75 = 4.
    expect(band.partner_e6_cells).toBe(25.75);
    expect(band.partner_e7_cells).toBe(100);
    expect(band.partner_moors).toBe(4);
    // 4 - 1.233 = 2.767 ≥ 0.5 → strong_heavy.
    expect(band.partner_moors! - out.moors_normal_reference).toBeGreaterThanOrEqual(
      out.strong_moors_deviation_min,
    );
  });

  it("normal-ish 9-partner pool [1,3,5,7,9,7,5,3,1] → moors near mesokurtic band edge", () => {
    // Pool counts symmetric bell around centre.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([1, 3, 5, 7, 9, 7, 5, 3, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(9);
    // Sorted [1,1,3,3,5,5,7,7,9]. n=9, R type-7 interp:
    // E1 (idx 8*0.125=1): sorted[1] = 1.
    // E2 (idx 2): sorted[2] = 3.
    // E3 (idx 3): sorted[3] = 3.
    // E5 (idx 5): sorted[5] = 5.
    // E6 (idx 6): sorted[6] = 7.
    // E7 (idx 7): sorted[7] = 7.
    // m = ((7-5)+(3-1))/(7-3) = 4/4 = 1.
    expect(band.partner_moors).toBe(1);
  });

  it("bounded lower-bound invariant: moors always >= 0", () => {
    // Any non-degenerate pool: (E7-E5) >= 0 and (E3-E1) >= 0 by
    // sortedness, denominator (E6-E2) > 0 → moors >= 0.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([10, 10, 10, 10, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_moors!).toBeGreaterThanOrEqual(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — metric-pool parity", () => {
  it("metric_moors computed identically from KPI-count map", () => {
    // 8 KPIs each with 1 cell → sorted [1,1,1,1,1,1,1,1] → degenerate.
    // Use 8 KPIs with the same linear-ramp counts as partner test.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(8);
    // Same math as partner pool [8,7,6,5,4,3,2,1] → moors 1.0.
    expect(band.metric_moors).toBe(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out),
    ).toBe("");
  });

  it("renders MOORS KURTOSIS heading + m + E1..E7 octile labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([100, 100, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out);
    expect(html).toContain("MOORS KURTOSIS");
    expect(html).toContain("E1");
    expect(html).toContain("E2");
    expect(html).toContain("E3");
    expect(html).toContain("E5");
    expect(html).toContain("E6");
    expect(html).toContain("E7");
    expect(html).toContain("strong_heavy");
    expect(html).toContain("partner moors");
    expect(html).toContain("KPI moors");
  });

  it("renders small_pool label for pool_count in [1,7]", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([4, 3, 2, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out);
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label when interior is flat (E6 == E2)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out);
    expect(html).toContain("degenerate");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosis(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMoorsKurtosisSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
