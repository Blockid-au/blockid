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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-median-mean-ratio";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("skewness cutoffs are 0.5 (peaked) / 0.9 (symmetric)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([]),
      );
    expect(out.peaked_ratio_max).toBe(0.5);
    expect(out.symmetric_ratio_min).toBe(0.9);
    expect(out.symmetric_ratio_min).toBeGreaterThan(out.peaked_ratio_max);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null median/mean/ratio in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
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
        expect(band.partner_median_cells).toBeNull();
        expect(band.partner_mean_cells).toBeNull();
        expect(band.partner_ratio).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_ratio).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → ratio 1 by definition (pool_count <= 2)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
    expect(band.metric_ratio).toBe(1);
  });

  it("two-partner pool [3, 1] → median 2 / mean 2 → ratio 1 by definition (pool_count == 2 collapses skewness distinction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_median_cells).toBe(2);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_ratio).toBe(1);
  });

  it("perfectly flat 3-partner pool [1,1,1] → median 1 / mean 1 → ratio 1 (symmetric on flat pool by construction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.symmetric_ratio_min);
  });

  it("skewed edge pool [2,1,1] → median 1 / mean 4/3 → ratio 0.75 (skewed edge; mean 33% above median)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1.3333);
    expect(band.partner_ratio).toBe(0.75);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.peaked_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.symmetric_ratio_min);
  });

  it("symmetric non-flat pool [4,3,2] → median 3 / mean 3 → ratio 1 (SYMMETRIC — disagrees with P11.185 UNEQUAL because median coincides with mean)", () => {
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(3);
    expect(band.partner_ratio).toBe(1);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.symmetric_ratio_min);
  });

  it("dominant leader pool [6,1,1] → median 1 / mean 8/3 → ratio 0.375 (peaked; mean 2.67x median)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("ACME", "contribution_margin_pct", "improved", 4),
      cell("ACME", "clawback_exposure", "improved", 4),
      cell("ACME", "budget_utilization", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(2.6667);
    expect(band.partner_ratio).toBe(0.375);
    expect(band.partner_ratio!).toBeLessThan(out.peaked_ratio_max);
  });

  it("stark leader pool [10,1,1] → median 1 / mean 4 → ratio 0.25 (peaked; mean 4x median)", () => {
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(4);
    expect(band.partner_ratio).toBe(0.25);
    expect(band.partner_ratio!).toBeLessThan(out.peaked_ratio_max);
  });

  it("left-skewed pool [10,10,1] → median 10 / mean 7 → ratio > 1 (symmetric — value above 1 is a live possibility for fat-left-tail pools)", () => {
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_median_cells).toBe(10);
    expect(band.partner_mean_cells).toBe(7);
    expect(band.partner_ratio).toBe(roundToTest(10 / 7, 4));
    expect(band.partner_ratio!).toBeGreaterThan(1);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.symmetric_ratio_min);
  });

  it("even-n pool [4,3,2,1] → median = (2+3)/2 = 2.5 / mean 2.5 → ratio 1 (symmetric; even-n median averages middle two)", () => {
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
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(2.5);
    expect(band.partner_mean_cells).toBe(2.5);
    expect(band.partner_ratio).toBe(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_ratio).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs with 2 cells each → pool_count 2 → ratio 1 solo", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 2),
          cell("BETA", "attributed_mrr", "improved", 2),
          cell("ACME", "commission_cleared_mtd", "improved", 2),
          cell("GAMMA", "commission_cleared_mtd", "improved", 2),
        ]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.metric_pool_count).toBe(2);
    expect(band.metric_pool_cells).toBe(4);
    expect(band.metric_median_cells).toBe(2);
    expect(band.metric_mean_cells).toBe(2);
    expect(band.metric_ratio).toBe(1);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "improved", 3),
          cell("C", "attributed_mrr", "improved", 6),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.large.partner_pool_count).toBe(1);
  });

  it("total_hot_cells equals row count across transition-keyed rows", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("A", "attributed_mrr", "improved", 1),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(4);
  });

  it("skips non-transition-keyed rows (stable / first_classification)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output ratio values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("median arithmetic sanity — odd-n pool [5,3,2] → median 3, mean 10/3 → ratio 0.9 (symmetric edge)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("A", "clawback_exposure", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(roundToTest(10 / 3, 4));
    expect(band.partner_ratio).toBe(0.9);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.symmetric_ratio_min);
  });

  it("ratio never exceeds median/mean upper bound on any pool (identity check within rounding tolerance)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    // pool [4,1,1] → sorted asc [1,1,4] → median 1, mean 6/3 = 2 → ratio 0.5.
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_ratio).toBe(0.5);
    const rebuilt = band.partner_median_cells! / band.partner_mean_cells!;
    expect(Math.abs(band.partner_ratio! - rebuilt)).toBeLessThanOrEqual(1e-4);
  });

  it("median picks the middle-order statistic (not min, not max)", () => {
    // pool [10,5,5] → sorted asc [5,5,10] → median 5, mean 20/3 ≈ 6.67 → ratio 0.75.
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
    for (const k of aKeys) rows.push(cell("A", k, "improved", 2));
    const bKeys: KnownKpiSection[] = aKeys.slice(0, 5);
    for (const k of bKeys) rows.push(cell("B", k, "improved", 2));
    const cKeys: KnownKpiSection[] = aKeys.slice(0, 5);
    for (const k of cKeys) rows.push(cell("C", k, "improved", 2));
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(20);
    expect(band.partner_median_cells).toBe(5);
    expect(band.partner_mean_cells).toBe(roundToTest(20 / 3, 4));
    expect(band.partner_ratio).toBe(0.75);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool MEDIAN / MEAN RATIO");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for pool_count <= 2 (single or pair pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders peaked label when median/mean ratio < 0.5", () => {
    // pool [10,1,1] → ratio 0.25 (peaked)
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("peaked");
  });

  it("renders symmetric label when ratio >= 0.9 (flat pool [1,1,1] → 1.0)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("symmetric");
  });

  it("renders skewed label when ratio is between 0.5 and 0.9 (pool [2,1,1] → 0.75)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("skewed");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.181 additive-spread + P11.189 mid-mass companions and the 0.5 / 0.9 cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianMeanRatioSection(
        out,
      );
    expect(html).toContain("P11.181");
    expect(html).toContain("P11.189");
    expect(html).toContain("0.5");
    expect(html).toContain("0.9");
  });
});

function roundToTest(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
