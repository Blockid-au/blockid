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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-excess-kurtosis";

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

function roundToTest(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("mesokurtic_excess_kurtosis_abs_max exposed on envelope as 0.5", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([]),
    );
    expect(out.mesokurtic_excess_kurtosis_abs_max).toBe(0.5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null mean/excess_kurtosis in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
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
        expect(band.partner_mean_cells).toBeNull();
        expect(band.partner_excess_kurtosis).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_excess_kurtosis).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → excess_kurtosis 0 by definition (pool_count <= 1)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_excess_kurtosis).toBe(0);
    expect(band.metric_excess_kurtosis).toBe(0);
  });

  it("two-point pool [3, 1] → mean 2 / excess_kurtosis -2 (platykurtic floor — every symmetric 2-point pool is bimodal)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_mean_cells).toBe(2);
    // Pool [3,1]: m2 = 1, m4 = 1, g2 = 1/1 - 3 = -2 (exact floor).
    expect(band.partner_excess_kurtosis).toBe(-2);
    expect(band.partner_excess_kurtosis!).toBeLessThanOrEqual(
      -out.mesokurtic_excess_kurtosis_abs_max,
    );
  });

  it("perfectly flat 3-partner pool [1,1,1] → mean 1 / excess_kurtosis 0 (variance zero → pinned)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_excess_kurtosis).toBe(0);
  });

  it("symmetric non-flat pool [4,3,2] → mean 3 / excess_kurtosis -1.5 (platykurtic — 3-point pools with deviations ±1,0)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_mean_cells).toBe(3);
    // Pool [4,3,2]: m2 = 2/3, m4 = 2/3, g2 = (2/3)/(4/9) - 3 = 3/2 - 3 = -1.5.
    expect(band.partner_excess_kurtosis).toBe(-1.5);
    expect(band.partner_excess_kurtosis!).toBeLessThanOrEqual(
      -out.mesokurtic_excess_kurtosis_abs_max,
    );
  });

  it("right-skewed pool [3,1,1] → mean 5/3 / excess_kurtosis -1.5 (platykurtic — small pools have limited kurtosis range even under asymmetry)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_mean_cells).toBe(roundToTest(5 / 3, 4));
    // Pool [3,1,1]: m2 = 8/9, m4 = 32/27
    // g2 = (32/27) / (8/9)^2 - 3 = (32/27) / (64/81) - 3 = 32*81 / (27*64) - 3 = 1.5 - 3 = -1.5.
    expect(band.partner_excess_kurtosis).toBe(-1.5);
  });

  it("stark leader pool [10,1,1] → mean 4 / excess_kurtosis -1.5 (platykurtic — 3-point single-outlier pools cluster at the -1.5 point mass)", () => {
    const rows: PerPairHotCellRow[] = [];
    const kpis: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "sandbox_share_of_budget",
      "attributed_churn_30d",
      "ledger_drift_events",
      "cohort_velocity",
    ];
    for (const k of kpis) rows.push(cell("ACME", k, "improved", 4));
    rows.push(cell("B", "attributed_mrr", "improved", 4));
    rows.push(cell("C", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_mean_cells).toBe(4);
    // Pool [10,1,1]: m2 = 18, m4 = 486, g2 = 486/324 - 3 = 1.5 - 3 = -1.5.
    expect(band.partner_excess_kurtosis).toBe(-1.5);
  });

  it("LEFT-skewed pool [10,10,1] → mean 7 / excess_kurtosis -1.5 (platykurtic — mirror of stark-leader shape has identical fourth moment)", () => {
    const rows: PerPairHotCellRow[] = [];
    const aKeys: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "sandbox_share_of_budget",
      "attributed_churn_30d",
      "ledger_drift_events",
      "cohort_velocity",
    ];
    for (const k of aKeys) rows.push(cell("A", k, "improved", 4));
    for (const k of aKeys) rows.push(cell("B", k, "improved", 4));
    rows.push(cell("C", "attributed_mrr", "improved", 4));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_mean_cells).toBe(7);
    // Pool [10,10,1]: m2 = 18, m4 = 486, g2 = -1.5 (kurtosis is even-powered so sign of asymmetry doesn't matter).
    expect(band.partner_excess_kurtosis).toBe(-1.5);
  });

  it("LEPTOKURTIC 6-partner pool [5,1,1,1,1,1] → excess_kurtosis +1.2 (heavy tail; single-outlier pools with pool_count >= 5 exhibit positive g2)", () => {
    const rows: PerPairHotCellRow[] = [];
    // Partner A: 5 cells (5 distinct KPIs, none attributed_mrr so metric-pool
    // becomes [5,1,1,1,1,1] shape too — B/C/D/E/F drive the attributed_mrr count).
    const aKpis: KnownKpiSection[] = [
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
    ];
    for (const k of aKpis) rows.push(cell("A", k, "improved", 4));
    for (const code of ["B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_mean_cells).toBe(roundToTest(10 / 6, 4));
    // Pool [5,1,1,1,1,1]: mean=10/6=5/3, deviations (10/3, -2/3 x5).
    // m2 = ((10/3)^2 + 5*(2/3)^2)/6 = (100/9 + 20/9)/6 = 20/9.
    // m4 = ((10/3)^4 + 5*(2/3)^4)/6 = (10000/81 + 80/81)/6 = 1680/81.
    // g2 = (1680/81) / (20/9)^2 - 3 = (1680/81) / (400/81) - 3 = 4.2 - 3 = 1.2.
    expect(band.partner_excess_kurtosis).toBe(1.2);
    expect(band.partner_excess_kurtosis!).toBeGreaterThanOrEqual(
      out.mesokurtic_excess_kurtosis_abs_max,
    );
    // metric-pool has same shape [5,1,1,1,1,1] (attributed_mrr from B/C/D/E/F + 5 A KPIs each at count 1).
    expect(band.metric_pool_count).toBe(6);
    expect(band.metric_pool_cells).toBe(10);
    expect(band.metric_excess_kurtosis).toBe(1.2);
  });

  it("mildly-asymmetric pool [3,2,1] → mean 2 / excess_kurtosis -1.5 (platykurtic — deviations 1,0,-1 give identical m2/m4 shape to [4,3,2])", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_excess_kurtosis).toBe(-1.5);
    expect(band.partner_excess_kurtosis!).toBeLessThan(
      -out.mesokurtic_excess_kurtosis_abs_max,
    );
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(out),
    ).toBe("");
  });

  it("renders EXCESS KURTOSIS heading + g2 cells for populated bands", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(out);
    expect(html).toContain("EXCESS KURTOSIS");
    expect(html).toContain("g2");
    expect(html).toContain("platykurtic");
    expect(html).toContain("partner excess kurtosis");
    expect(html).toContain("KPI excess kurtosis");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosis(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolExcessKurtosisSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
