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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-coefficient-of-range";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes level_cor_max=0.2 + stark_cor_min=0.5 + min_pool_count_for_cor=2 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([]),
    );
    expect(out.level_cor_max).toBe(0.2);
    expect(out.stark_cor_min).toBe(0.5);
    expect(out.min_pool_count_for_cor).toBe(2);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null max/min/cor in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
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
        expect(band.partner_max_cells).toBeNull();
        expect(band.partner_min_cells).toBeNull();
        expect(band.partner_cor).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_cor).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — small_pool structural null (pool_count < 2)", () => {
  it("solo cell (1 partner) → cor null (small_pool — single-point pool has no dispersion)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_max_cells).toBeNull();
    expect(band.partner_min_cells).toBeNull();
    expect(band.partner_cor).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — arithmetic (pool_count >= 2)", () => {
  it("flat 2-partner pool [1,1] → max 1 / min 1 / cor 0 (level — flat pool)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(2);
    expect(band.partner_max_cells).toBe(1);
    expect(band.partner_min_cells).toBe(1);
    expect(band.partner_cor).toBe(0);
    expect(band.partner_cor!).toBeLessThan(out.level_cor_max);
  });

  it("2-partner pool [3,1] → max 3 / min 1 / cor 0.5 (stark boundary — top1/bot1 3x)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_max_cells).toBe(3);
    expect(band.partner_min_cells).toBe(1);
    // cor = (3-1)/(3+1) = 0.5.
    expect(band.partner_cor).toBe(0.5);
    expect(band.partner_cor!).toBeGreaterThanOrEqual(out.stark_cor_min);
  });

  it("4-partner pool [4,3,2,1] → max 4 / min 1 / cor 0.6 (stark — top1/bot1 4x)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    // Values [4,3,2,1] — max 4, min 1. cor = (4-1)/(4+1) = 3/5 = 0.6.
    expect(band.partner_max_cells).toBe(4);
    expect(band.partner_min_cells).toBe(1);
    expect(band.partner_cor).toBe(0.6);
    expect(band.partner_cor!).toBeGreaterThanOrEqual(out.stark_cor_min);
  });

  it("2-partner pool [2,1] → max 2 / min 1 / cor 0.3333 (unequal — top1/bot1 2x)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_max_cells).toBe(2);
    expect(band.partner_min_cells).toBe(1);
    // cor = (2-1)/(2+1) = 1/3 ≈ 0.3333.
    expect(band.partner_cor).toBe(0.3333);
    expect(band.partner_cor!).toBeGreaterThanOrEqual(out.level_cor_max);
    expect(band.partner_cor!).toBeLessThan(out.stark_cor_min);
  });

  it("endpoint-only sensitivity: pool [10,1,1,1,1] (n=5) → cor 0.8182 (stark — single outlier dominates)", () => {
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
    for (const code of ["B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(14);
    // Values [10,1,1,1,1] — max 10, min 1. cor = (10-1)/(10+1) = 9/11 ≈ 0.8182.
    expect(band.partner_max_cells).toBe(10);
    expect(band.partner_min_cells).toBe(1);
    expect(band.partner_cor).toBe(0.8182);
    expect(band.partner_cor!).toBeGreaterThanOrEqual(out.stark_cor_min);
  });

  it("endpoint-only vs interior-mass complement: pool [1,1,1,1,10] (n=5) has same cor as [10,1,1,1,1] (endpoints identical) but QCD would collapse", () => {
    // Rebuild the [1,1,1,1,10] partner-count pool by swapping which partner
    // holds 10 KPIs — endpoints (max, min) are unchanged so cor is unchanged.
    const rows: PerPairHotCellRow[] = [];
    const eKpis: KnownKpiSection[] = [
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
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    for (const k of eKpis) rows.push(cell("E", k, "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    // Same endpoints [10,1] → same cor as prior test.
    expect(band.partner_max_cells).toBe(10);
    expect(band.partner_min_cells).toBe(1);
    expect(band.partner_cor).toBe(0.8182);
  });

  it("bounded upper-bound: cor is always strictly less than 1 (approaches but never reaches)", () => {
    const rows: PerPairHotCellRow[] = [];
    const aKpis: KnownKpiSection[] = [
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
      "cohort_velocity",
      "ltv_cac_per_reseller",
    ];
    for (const k of aKpis) rows.push(cell("A", k, "improved", 4));
    for (const code of ["B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    // [12,1,1,1] → cor = 11/13 ≈ 0.8462. Strictly < 1.
    expect(band.partner_cor).toBeGreaterThan(0);
    expect(band.partner_cor).toBeLessThan(1);
  });

  it("cor 0 iff max === min (flat pool)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_max_cells).toBe(1);
    expect(band.partner_min_cells).toBe(1);
    expect(band.partner_cor).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
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
      cell("B", "attributed_mrr", "degraded", 4),
      cell("A", "attributed_mrr", "rotated", 4),
      cell("B", "attributed_mrr", "rotated", 4),
      cell("A", "attributed_mrr", "undecidable", 4),
      cell("B", "attributed_mrr", "undecidable", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(2);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(2);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(2);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange — metric-pool parity with partner-pool", () => {
  it("metric_cor computed identically from KPI-count map", () => {
    // A holds attributed_mrr x2, B holds commission_cleared_mtd x1 →
    // KPI pool [attributed_mrr:2, commission_cleared_mtd:1] → cor 1/3.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "attributed_mrr", "improved", 4, { key: "attributed_mrr" }),
      cell("B", "commission_cleared_mtd", "improved", 4),
    ];
    // De-dupe: the (partner=A, key=attributed_mrr) cell is set to 2 via
    // two ingest() calls hitting the same map key. So the KPI map ends
    // up as {attributed_mrr:2, commission_cleared_mtd:1}.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(2);
    expect(band.metric_max_cells).toBe(2);
    expect(band.metric_min_cells).toBe(1);
    expect(band.metric_cor).toBe(0.3333);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(out),
    ).toBe("");
  });

  it("renders COEFFICIENT OF RANGE heading + cor cells + max/min labels for populated bands", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(out);
    expect(html).toContain("COEFFICIENT OF RANGE");
    expect(html).toContain("cor");
    expect(html).toContain("max");
    expect(html).toContain("min");
    expect(html).toContain("stark");
    expect(html).toContain("partner cor");
    expect(html).toContain("KPI cor");
  });

  it("renders small_pool label for solo-partner pool", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(out);
    expect(html).toContain("small_pool");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCoefficientOfRangeSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
