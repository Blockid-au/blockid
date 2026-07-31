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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-iqr-ratio";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes level_ratio_max=2 + stark_ratio_min=5 + min_pool_count_for_iqr_ratio=4 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([]),
    );
    expect(out.level_ratio_max).toBe(2);
    expect(out.stark_ratio_min).toBe(5);
    expect(out.min_pool_count_for_iqr_ratio).toBe(4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null q1/q3/iqr_ratio in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
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
        expect(band.partner_q3_cells).toBeNull();
        expect(band.partner_iqr_ratio).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_iqr_ratio).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio — small_pool structural null (pool_count < 4)", () => {
  it("solo cell (1 partner) → iqr_ratio null (small_pool — quartiles undefined for n<4)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_q1_cells).toBeNull();
    expect(band.partner_q3_cells).toBeNull();
    expect(band.partner_iqr_ratio).toBeNull();
  });

  it("two-cell pool [3,1] → iqr_ratio null (small_pool — would collapse to P11.185 top1/bot1 ratio)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_q1_cells).toBeNull();
    expect(band.partner_q3_cells).toBeNull();
    expect(band.partner_iqr_ratio).toBeNull();
  });

  it("three-cell pool [3,2,1] → iqr_ratio null (small_pool — n=3 Tukey excludes middle → endpoint ratio clone)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_q1_cells).toBeNull();
    expect(band.partner_q3_cells).toBeNull();
    expect(band.partner_iqr_ratio).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio — arithmetic (pool_count >= 4)", () => {
  it("flat 4-partner pool [1,1,1,1] → q1 1 / q3 1 / iqr_ratio 1 (level)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(1);
    expect(band.partner_iqr_ratio).toBe(1);
    expect(band.partner_iqr_ratio!).toBeLessThan(out.level_ratio_max);
  });

  it("even 4-partner pool [4,3,2,1] → q1 1.5 / q3 3.5 / iqr_ratio 2.3333 (unequal)", () => {
    const rows: PerPairHotCellRow[] = [];
    // A: 4 KPIs, B: 3 KPIs, C: 2 KPIs, D: 1 KPI (partner-count pool [4,3,2,1]).
    const kpiCatalog: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
    ];
    for (const k of kpiCatalog) rows.push(cell("A", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 3)) rows.push(cell("B", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 2)) rows.push(cell("C", k, "improved", 4));
    rows.push(cell("D", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    // Sorted [1,2,3,4]. Lower half [1,2] → Q1 = 1.5. Upper half [3,4] → Q3 = 3.5. ratio = 3.5/1.5 ≈ 2.3333.
    expect(band.partner_q1_cells).toBe(1.5);
    expect(band.partner_q3_cells).toBe(3.5);
    expect(band.partner_iqr_ratio).toBe(2.3333);
    expect(band.partner_iqr_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_iqr_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("odd 5-partner pool [5,4,3,2,1] → Tukey exclude middle 3 → q1 1.5 / q3 4.5 / iqr_ratio 3 (unequal)", () => {
    const rows: PerPairHotCellRow[] = [];
    const kpiCatalog: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
    ];
    for (const k of kpiCatalog) rows.push(cell("A", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 4)) rows.push(cell("B", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 3)) rows.push(cell("C", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 2)) rows.push(cell("D", k, "improved", 4));
    rows.push(cell("E", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(15);
    // Sorted [1,2,3,4,5]. Exclude middle 3. Lower [1,2] → Q1 = 1.5. Upper [4,5] → Q3 = 4.5. ratio = 4.5/1.5 = 3.
    expect(band.partner_q1_cells).toBe(1.5);
    expect(band.partner_q3_cells).toBe(4.5);
    expect(band.partner_iqr_ratio).toBe(3);
  });

  it("6-partner pool [6,5,4,3,2,1] → q1 2 / q3 5 / iqr_ratio 2.5 (unequal)", () => {
    const rows: PerPairHotCellRow[] = [];
    const kpiCatalog: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
    ];
    for (const k of kpiCatalog) rows.push(cell("A", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 5)) rows.push(cell("B", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 4)) rows.push(cell("C", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 3)) rows.push(cell("D", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 2)) rows.push(cell("E", k, "improved", 4));
    rows.push(cell("F", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(21);
    // Sorted [1,2,3,4,5,6]. Lower half [1,2,3] → Q1 = 2. Upper half [4,5,6] → Q3 = 5. ratio = 5/2 = 2.5.
    expect(band.partner_q1_cells).toBe(2);
    expect(band.partner_q3_cells).toBe(5);
    expect(band.partner_iqr_ratio).toBe(2.5);
  });

  it("single-outlier robust: pool [10,1,1,1,1,1] (n=6) → q1 1 / q3 1 / iqr_ratio 1 (level — outlier tucked into upper half's max, IQR RATIO ignores it)", () => {
    const rows: PerPairHotCellRow[] = [];
    // A: 10 KPIs. B..F: 1 KPI each (partner-count pool [10,1,1,1,1,1]).
    const aKpis: KnownKpiSection[] = [
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "sandbox_share_of_budget",
      "attributed_churn_30d",
      "tier_mix",
      "ledger_drift_events",
      "cohort_velocity",
    ];
    for (const k of aKpis) rows.push(cell("A", k, "improved", 4));
    for (const code of ["B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(15);
    // Sorted [1,1,1,1,1,10]. Lower half [1,1,1] → Q1 = 1. Upper half [1,1,10] → Q3 = 1. ratio = 1/1 = 1.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(1);
    expect(band.partner_iqr_ratio).toBe(1);
    expect(band.partner_iqr_ratio!).toBeLessThan(out.level_ratio_max);
  });

  it("two-outlier crossover: pool [10,10,1,1,1,1] (n=6) → q1 1 / q3 10 / iqr_ratio 10 (stark — two outliers cross the hinge boundary)", () => {
    const rows: PerPairHotCellRow[] = [];
    // A + B: 10 KPIs each. C..F: 1 KPI each.
    const aKpis: KnownKpiSection[] = [
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "sandbox_share_of_budget",
      "attributed_churn_30d",
      "tier_mix",
      "ledger_drift_events",
      "cohort_velocity",
    ];
    for (const k of aKpis) rows.push(cell("A", k, "improved", 4));
    for (const k of aKpis) rows.push(cell("B", k, "improved", 4));
    for (const code of ["C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(24);
    // Sorted [1,1,1,1,10,10]. Lower half [1,1,1] → Q1 = 1. Upper half [1,10,10] → Q3 = 10. ratio = 10/1 = 10.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(10);
    expect(band.partner_iqr_ratio).toBe(10);
    expect(band.partner_iqr_ratio!).toBeGreaterThanOrEqual(out.stark_ratio_min);
  });

  it("even 4-partner pool [10,1,1,1] → q1 1 / q3 5.5 / iqr_ratio 5.5 (stark — outlier pulled into upper-half hinge on n=4)", () => {
    const rows: PerPairHotCellRow[] = [];
    const aKpis: KnownKpiSection[] = [
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "sandbox_share_of_budget",
      "attributed_churn_30d",
      "tier_mix",
      "ledger_drift_events",
      "cohort_velocity",
    ];
    for (const k of aKpis) rows.push(cell("A", k, "improved", 4));
    for (const code of ["B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(13);
    // Sorted [1,1,1,10]. Lower half [1,1] → Q1 = 1. Upper half [1,10] → Q3 = 5.5. ratio = 5.5/1 = 5.5.
    expect(band.partner_q1_cells).toBe(1);
    expect(band.partner_q3_cells).toBe(5.5);
    expect(band.partner_iqr_ratio).toBe(5.5);
    expect(band.partner_iqr_ratio!).toBeGreaterThanOrEqual(out.stark_ratio_min);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(out),
    ).toBe("");
  });

  it("renders INTERQUARTILE RATIO heading + iqr_ratio cells + Q1/Q3 labels for populated bands", () => {
    const rows: PerPairHotCellRow[] = [];
    const kpiCatalog: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
    ];
    for (const k of kpiCatalog) rows.push(cell("A", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 3)) rows.push(cell("B", k, "improved", 4));
    for (const k of kpiCatalog.slice(0, 2)) rows.push(cell("C", k, "improved", 4));
    rows.push(cell("D", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(out);
    expect(html).toContain("INTERQUARTILE RATIO");
    expect(html).toContain("iqr_ratio");
    expect(html).toContain("Q1");
    expect(html).toContain("Q3");
    expect(html).toContain("unequal");
    expect(html).toContain("partner iqr_ratio");
    expect(html).toContain("KPI iqr_ratio");
  });

  it("renders small_pool label for pool_count in [1,3]", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(out);
    expect(html).toContain("small_pool");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatio(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolIqrRatioSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
