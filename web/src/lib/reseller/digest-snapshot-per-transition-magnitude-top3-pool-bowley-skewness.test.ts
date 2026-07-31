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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-bowley-skewness";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes symmetric_bowley_abs_max=0.1 + strong_bowley_abs_min=0.3 + min_pool_count_for_bowley=4 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([]),
    );
    expect(out.symmetric_bowley_abs_max).toBe(0.1);
    expect(out.strong_bowley_abs_min).toBe(0.3);
    expect(out.min_pool_count_for_bowley).toBe(4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null hinges/bowley in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
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
        expect(band.partner_q1_cells).toBeNull();
        expect(band.partner_q2_cells).toBeNull();
        expect(band.partner_q3_cells).toBeNull();
        expect(band.partner_bowley).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_bowley).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — small_pool structural null (pool_count < 4)", () => {
  it("solo cell (1 partner) → bowley null (small_pool — hinges undefined for n<4)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_q1_cells).toBeNull();
    expect(band.partner_q2_cells).toBeNull();
    expect(band.partner_q3_cells).toBeNull();
    expect(band.partner_bowley).toBeNull();
  });

  it("two-partner pool → bowley null (small_pool)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_bowley).toBeNull();
  });

  it("three-partner pool → bowley null (small_pool — Tukey excludes middle → range clone)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_bowley).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — degenerate interior (Q3 == Q1)", () => {
  it("flat 4-partner pool [1,1,1,1] → Q1==Q3==1, bowley null (degenerate)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q2_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(1);
    expect(band.partner_bowley).toBeNull();
  });

  it("single-outlier n=6 pool [10,1,1,1,1,1] → Q1==Q3==1, bowley null (degenerate — outlier tucked into upper-half max)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(15);
    // Sorted [1,1,1,1,1,10]. Lower [1,1,1] → Q1=1. Upper [1,1,10] → Q3=1. Degenerate.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(1);
    expect(band.partner_bowley).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — arithmetic (pool_count >= 4)", () => {
  it("even 4-partner pool [4,3,2,1] → Q1=1.5 Q2=2.5 Q3=3.5, bowley 0 (symmetric — box symmetric around median)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    // Sorted [1,2,3,4]. Q2 = (2+3)/2 = 2.5. Lower [1,2] → Q1=1.5. Upper [3,4] → Q3=3.5. bs = (3.5+1.5-5)/(3.5-1.5) = 0/2 = 0.
    expect(band.partner_q1_cells).toBe(1.5);
    expect(band.partner_q2_cells).toBe(2.5);
    expect(band.partner_q3_cells).toBe(3.5);
    expect(band.partner_bowley).toBe(0);
  });

  it("right-tail-heavy 4-partner pool [10,1,1,1] → Q1=1 Q2=1 Q3=5.5, bowley 1 (strong_right — Q2 at lower hinge)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(13);
    // Sorted [1,1,1,10]. Q2 = (1+1)/2 = 1. Lower [1,1] → Q1=1. Upper [1,10] → Q3=5.5. bs = (5.5+1-2)/(5.5-1) = 4.5/4.5 = 1.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q2_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(5.5);
    expect(band.partner_bowley).toBe(1);
    expect(band.partner_bowley!).toBeGreaterThanOrEqual(out.strong_bowley_abs_min);
  });

  it("left-tail-heavy 4-partner pool [10,10,10,1] → Q1=5.5 Q2=10 Q3=10, bowley -1 (strong_left — Q2 at upper hinge)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 10, 10, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(31);
    // Sorted [1,10,10,10]. Q2 = (10+10)/2 = 10. Lower [1,10] → Q1=5.5. Upper [10,10] → Q3=10. bs = (10+5.5-20)/(10-5.5) = -4.5/4.5 = -1.
    expect(band.partner_q1_cells).toBe(5.5);
    expect(band.partner_q2_cells).toBe(10);
    expect(band.partner_q3_cells).toBe(10);
    expect(band.partner_bowley).toBe(-1);
    expect(band.partner_bowley!).toBeLessThanOrEqual(-out.strong_bowley_abs_min);
  });

  it("moderately right-skew 4-partner pool [10,3,2,1] → Q1=1.5 Q2=2.5 Q3=6.5, bowley 0.6 (strong_right)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(16);
    // Sorted [1,2,3,10]. Q2 = (2+3)/2 = 2.5. Lower [1,2] → Q1=1.5. Upper [3,10] → Q3=6.5. bs = (6.5+1.5-5)/(6.5-1.5) = 3/5 = 0.6.
    expect(band.partner_q1_cells).toBe(1.5);
    expect(band.partner_q2_cells).toBe(2.5);
    expect(band.partner_q3_cells).toBe(6.5);
    expect(band.partner_bowley).toBe(0.6);
    expect(band.partner_bowley!).toBeGreaterThanOrEqual(out.strong_bowley_abs_min);
  });

  it("orthogonality vs P11.203 g1: 5-partner pool [1,1,1,1,10] → bowley 1 (strong_right; Q2 at lower hinge) — interior read captures the outlier via Q3 pull", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    // Sorted [1,1,1,1,10]. n=5, exclude middle. Q2 = 1 (middle). Lower [1,1] → Q1=1. Upper [1,10] → Q3=5.5. bs = (5.5+1-2)/(5.5-1) = 4.5/4.5 = 1.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q2_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(5.5);
    expect(band.partner_bowley).toBe(1);
  });

  it("bounded upper-bound invariant: bowley always in [-1, +1]", () => {
    // Extreme pool with huge asymmetry — bowley must still be capped at 1.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_bowley!).toBeLessThanOrEqual(1);
    expect(band.partner_bowley!).toBeGreaterThanOrEqual(-1);
  });

  it("odd-n symmetric 5-partner pool [5,4,3,2,1] → Q1=1.5 Q2=3 Q3=4.5, bowley 0 (symmetric)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    // Sorted [1,2,3,4,5]. Exclude middle (3). Q2 = 3. Lower [1,2] → Q1=1.5. Upper [4,5] → Q3=4.5. bs = (4.5+1.5-6)/(4.5-1.5) = 0/3 = 0.
    expect(band.partner_q1_cells).toBe(1.5);
    expect(band.partner_q2_cells).toBe(3);
    expect(band.partner_q3_cells).toBe(4.5);
    expect(band.partner_bowley).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — metric-pool parity", () => {
  it("metric_bowley computed identically from KPI-count map", () => {
    // 4 KPIs, each appearing counts times: [10, 3, 2, 1].
    const rows: PerPairHotCellRow[] = [];
    const kpiCounts: [KnownKpiSection, number][] = [
      ["attributed_mrr", 10],
      ["commission_cleared_mtd", 3],
      ["attributed_net_contribution", 2],
      ["contribution_margin_pct", 1],
    ];
    const codes = "ABCDEFGHIJKL".split("");
    kpiCounts.forEach(([kpi, count]) => {
      for (let i = 0; i < count; i++) {
        rows.push(cell(codes[i], kpi, "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(4);
    // Same math as the partner pool [10,3,2,1] → sorted [1,2,3,10] → bowley 0.6.
    expect(band.metric_bowley).toBe(0.6);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out),
    ).toBe("");
  });

  it("renders BOWLEY SKEWNESS heading + bs + Q1/Q2/Q3 for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([10, 3, 2, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out);
    expect(html).toContain("BOWLEY SKEWNESS");
    expect(html).toContain("bs");
    expect(html).toContain("Q1");
    expect(html).toContain("Q2");
    expect(html).toContain("Q3");
    expect(html).toContain("strong_right");
    expect(html).toContain("partner bowley");
    expect(html).toContain("KPI bowley");
  });

  it("renders small_pool label for pool_count in [1,3]", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([2, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out);
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label when interior is flat (Q3 == Q1)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope(partnerPool([1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out);
    expect(html).toContain("degenerate");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBowleySkewnessSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
