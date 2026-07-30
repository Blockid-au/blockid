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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-skewness";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("symmetric_skewness_abs_max exposed on envelope as 0.5", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([]),
    );
    expect(out.symmetric_skewness_abs_max).toBe(0.5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null mean/skewness in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
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
        expect(band.partner_skewness).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_skewness).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → skewness 0 by definition (pool_count <= 1)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_skewness).toBe(0);
    expect(band.metric_skewness).toBe(0);
  });

  it("two-cell pool [3, 1] → mean 2 / skewness 0 (symmetric — 2-point pools are always symmetric around their mean)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_skewness).toBe(0);
  });

  it("perfectly flat 3-partner pool [1,1,1] → mean 1 / skewness 0 (variance zero → pinned)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_skewness).toBe(0);
  });

  it("symmetric non-flat pool [4,3,2] → mean 3 / skewness 0 (m3 cancels because deviations are ±1,0)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_mean_cells).toBe(3);
    expect(band.partner_skewness).toBe(0);
  });

  it("right-skewed pool [3,1,1] → mean 5/3 / skewness > +0.5 (positive skew — leader on the right pulls the mean above the median)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_mean_cells).toBe(roundToTest(5 / 3, 4));
    // Pool [3,1,1]: mean=5/3, deviations (4/3, -2/3, -2/3)
    // m2 = ((4/3)^2 + 2*(2/3)^2) / 3 = (16/9 + 8/9)/3 = 24/27 = 8/9
    // m3 = ((4/3)^3 + 2*(-2/3)^3) / 3 = (64/27 - 16/27)/3 = 48/81 = 16/27
    // g1 = m3 / m2^1.5 = (16/27) / (8/9)^1.5
    // (8/9)^1.5 = 8/9 * sqrt(8/9) = 8/9 * (2*sqrt(2))/3 = 16*sqrt(2)/27
    // g1 = (16/27) / (16*sqrt(2)/27) = 1/sqrt(2) ≈ 0.7071
    expect(band.partner_skewness).toBe(roundToTest(1 / Math.sqrt(2), 4));
    expect(band.partner_skewness!).toBeGreaterThanOrEqual(
      out.symmetric_skewness_abs_max,
    );
  });

  it("stark leader pool [10,1,1] → mean 4 / skewness ≈ +0.707 (right_leaning; leader on right pulls mean above median)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_mean_cells).toBe(4);
    // Pool [10,1,1]: mean=4, deviations (6,-3,-3)
    // m2 = (36 + 9 + 9)/3 = 54/3 = 18
    // m3 = (216 - 27 - 27)/3 = 162/3 = 54
    // g1 = 54 / 18^1.5 = 54 / (18*sqrt(18)) = 54 / (18*3*sqrt(2)) = 1/sqrt(2) ≈ 0.7071
    expect(band.partner_skewness).toBe(roundToTest(1 / Math.sqrt(2), 4));
    expect(band.partner_skewness!).toBeGreaterThanOrEqual(
      out.symmetric_skewness_abs_max,
    );
  });

  it("LEFT-SKEWED pool [10,10,1] → mean 7 / skewness ≈ -0.707 (left_leaning; laggard on left pulls mean below median)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_mean_cells).toBe(7);
    // Pool [10,10,1]: mean=7, deviations (3,3,-6)
    // m2 = (9+9+36)/3 = 18; m3 = (27+27-216)/3 = -54
    // g1 = -54 / 18^1.5 = -1/sqrt(2) ≈ -0.7071
    expect(band.partner_skewness).toBe(roundToTest(-1 / Math.sqrt(2), 4));
    expect(band.partner_skewness!).toBeLessThanOrEqual(
      -out.symmetric_skewness_abs_max,
    );
  });

  it("mildly-asymmetric pool [3,2,1] → mean 2 / skewness 0 (deviations 1,0,-1 make m3 = 0 → symmetric)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_skewness).toBe(0);
    expect(Math.abs(band.partner_skewness!)).toBeLessThan(
      out.symmetric_skewness_abs_max,
    );
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(out)).toBe(
      "",
    );
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([]),
    );
    expect(formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(out)).toBe(
      "",
    );
  });

  it("renders SKEWNESS heading + g1 cells for populated bands", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope(rows),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(out);
    expect(html).toContain("SKEWNESS");
    expect(html).toContain("g1");
    expect(html).toContain("right_leaning");
    expect(html).toContain("partner skewness");
    expect(html).toContain("KPI skewness");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolSkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSkewnessSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
