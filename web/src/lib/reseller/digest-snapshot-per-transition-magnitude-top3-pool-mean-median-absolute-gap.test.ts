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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-mean-median-absolute-gap";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("gap cutoffs are 0.5 (balanced max) / 2.0 (lopsided min)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([]),
      );
    expect(out.balanced_gap_max).toBe(0.5);
    expect(out.lopsided_gap_min).toBe(2.0);
    expect(out.lopsided_gap_min).toBeGreaterThan(out.balanced_gap_max);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null median/mean/gap in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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
        expect(band.partner_gap).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_gap).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → gap 0 by definition (pool_count <= 2)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_gap).toBe(0);
    expect(band.metric_gap).toBe(0);
  });

  it("two-partner pool [3, 1] → median 2 / mean 2 → gap 0 by definition (pool_count == 2 collapses skewness distinction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_median_cells).toBe(2);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_gap).toBe(0);
  });

  it("perfectly flat 3-partner pool [1,1,1] → median 1 / mean 1 → gap 0 (balanced on flat pool by construction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_gap).toBe(0);
    expect(band.partner_gap!).toBeLessThan(out.balanced_gap_max);
  });

  it("balanced edge pool [2,1,1] → median 1 / mean 4/3 → gap ~0.333 (balanced; mean under half a cell above median)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1.3333);
    expect(band.partner_gap).toBe(roundToTest(Math.abs(4 / 3 - 1), 4));
    expect(band.partner_gap!).toBeLessThan(out.balanced_gap_max);
  });

  it("symmetric non-flat pool [4,3,2] → median 3 / mean 3 → gap 0 (balanced — median coincides with mean; disagrees with P11.185 UNEQUAL on same pool)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(3);
    expect(band.partner_gap).toBe(0);
    expect(band.partner_gap!).toBeLessThan(out.balanced_gap_max);
  });

  it("leaning pool [3,1,1] → median 1 / mean 5/3 → gap ~0.667 (leaning; mean under one whole cell above median but noticeable)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(roundToTest(5 / 3, 4));
    expect(band.partner_gap).toBe(roundToTest(Math.abs(5 / 3 - 1), 4));
    expect(band.partner_gap!).toBeGreaterThanOrEqual(out.balanced_gap_max);
    expect(band.partner_gap!).toBeLessThan(out.lopsided_gap_min);
  });

  it("stark leader pool [10,1,1] → median 1 / mean 4 → gap 3 (lopsided; mean 3 cells above median)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(4);
    expect(band.partner_gap).toBe(3);
    expect(band.partner_gap!).toBeGreaterThanOrEqual(out.lopsided_gap_min);
  });

  it("LEFT-SKEWED pool [10,10,1] → median 10 / mean 7 → gap 3 (lopsided; ABSOLUTE VALUE reads mean 3 cells BELOW median — direction-agnostic magnitude reading)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_median_cells).toBe(10);
    expect(band.partner_mean_cells).toBe(7);
    expect(band.partner_gap).toBe(3);
    expect(band.partner_gap!).toBeGreaterThanOrEqual(out.lopsided_gap_min);
    // LOAD-BEARING: direction-agnostic — same magnitude (3) as the
    // right-skewed [10,1,1] pool above, even though direction is opposite.
    // This is where P11.197 disagrees with P11.195 — P11.195 reads
    // [10,10,1] as SYMMETRIC (ratio 1.43 >= 0.9) while P11.197 reads it
    // as LOPSIDED (gap 3 >= 2). Both perspectives are valid; the digest
    // reader gets to see both by rendering both surfaces side-by-side.
  });

  it("even-n pool [4,3,2,1] → median (2+3)/2 = 2.5 / mean 2.5 → gap 0 (balanced; even-n median averages middle two)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(2.5);
    expect(band.partner_mean_cells).toBe(2.5);
    expect(band.partner_gap).toBe(0);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_gap).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs with 2 cells each → pool_count 2 → gap 0 solo", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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
    expect(band.metric_gap).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output gap values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("odd-n pool [5,3,2] → median 3, mean 10/3 → gap ~0.333 (balanced edge — matches P11.195 SYMMETRIC edge at ratio 0.9)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(roundToTest(10 / 3, 4));
    expect(band.partner_gap).toBe(roundToTest(Math.abs(10 / 3 - 3), 4));
    expect(band.partner_gap!).toBeLessThan(out.balanced_gap_max);
  });

  it("identity check within rounding tolerance — gap = |mean - median|", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    // pool [4,1,1] → sorted asc [1,1,4] → median 1, mean 6/3 = 2 → gap 1.
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_gap).toBe(1);
    const rebuilt = Math.abs(band.partner_mean_cells! - band.partner_median_cells!);
    expect(Math.abs(band.partner_gap! - rebuilt)).toBeLessThanOrEqual(1e-4);
  });

  it("median picks the middle-order statistic (not min, not max) — pool [10,5,5] reads median 5, mean 20/3, gap ~1.667 leaning", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(20);
    expect(band.partner_median_cells).toBe(5);
    expect(band.partner_mean_cells).toBe(roundToTest(20 / 3, 4));
    expect(band.partner_gap).toBe(roundToTest(Math.abs(20 / 3 - 5), 4));
    expect(band.partner_gap!).toBeGreaterThanOrEqual(out.balanced_gap_max);
    expect(band.partner_gap!).toBeLessThan(out.lopsided_gap_min);
  });

  it("gap is direction-agnostic — pool [10,1,1] (right-skew) and pool [10,10,1] (left-skew) both read magnitude 3", () => {
    // RIGHT: pool [10,1,1] → mean 4, median 1, gap 3
    const rightRows: PerPairHotCellRow[] = [];
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
    for (const k of kpis) rightRows.push(cell("ACME", k, "improved", 4));
    rightRows.push(cell("B", "attributed_mrr", "improved", 4));
    rightRows.push(cell("C", "attributed_mrr", "improved", 4));
    const rightOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rightRows),
      );
    // LEFT: pool [10,10,1] → mean 7, median 10, gap 3
    const leftRows: PerPairHotCellRow[] = [];
    for (const k of kpis) leftRows.push(cell("A", k, "degraded", 4));
    for (const k of kpis) leftRows.push(cell("B", k, "degraded", 4));
    leftRows.push(cell("C", "attributed_mrr", "degraded", 4));
    const leftOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(leftRows),
      );
    expect(rightOut.transitions.improved.bands.medium.partner_gap).toBe(3);
    expect(leftOut.transitions.degraded.bands.medium.partner_gap).toBe(3);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool MEAN-MEDIAN ABSOLUTE GAP");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for pool_count <= 2 (single or pair pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders lopsided label when gap >= 2.0", () => {
    // pool [10,1,1] → gap 3 (lopsided)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("lopsided");
  });

  it("renders balanced label when gap < 0.5 (flat pool [1,1,1] → 0)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("balanced");
  });

  it("renders leaning label when gap is between 0.5 and 2.0 (pool [3,1,1] → ~0.667)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("leaning");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.195 multiplicative companion and the 0.5 / 2.0 cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("P11.195");
    expect(html).toContain("0.5");
    expect(html).toContain("2");
  });

  it("caption cross-references the P11.181/P11.185 (max-vs-min pair) additive+multiplicative parity that this surface mirrors on the (mean-vs-median pair)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("P11.181");
    expect(html).toContain("P11.185");
  });

  it("caption references solo / balanced / leaning / lopsided label vocabulary", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGap(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanMedianAbsoluteGapSection(
        out,
      );
    expect(html).toContain("solo");
    expect(html).toContain("balanced");
    expect(html).toContain("leaning");
    expect(html).toContain("lopsided");
  });
});

function roundToTest(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
