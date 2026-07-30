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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-mean-absolute-deviation";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("mad cutoffs are 0.5 (tight max) / 2.0 (wide min)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([]),
      );
    expect(out.tight_mad_max).toBe(0.5);
    expect(out.wide_mad_min).toBe(2.0);
    expect(out.wide_mad_min).toBeGreaterThan(out.tight_mad_max);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null mean/mad in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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
        expect(band.partner_mad).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_mad).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → mad 0 by definition (pool_count <= 1)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_mad).toBe(0);
    expect(band.metric_mad).toBe(0);
  });

  it("two-partner pool [3, 1] → mean 2 / mad 1 (spread — 2-slot MAD is a genuine dispersion read, unlike P11.197 gap which collapses to 0 at pool_count 2)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_mean_cells).toBe(2);
    expect(band.partner_mad).toBe(1);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.tight_mad_max);
    expect(band.partner_mad!).toBeLessThan(out.wide_mad_min);
  });

  it("perfectly flat 3-partner pool [1,1,1] → mean 1 / mad 0 (tight on flat pool by construction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_mean_cells).toBe(1);
    expect(band.partner_mad).toBe(0);
    expect(band.partner_mad!).toBeLessThan(out.tight_mad_max);
  });

  it("pool [2,1,1] → mean 4/3 / mad = (2/3 + 1/3 + 1/3)/3 = 4/9 ≈ 0.4444 (tight edge; mean under half a cell of dispersion)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_mean_cells).toBe(1.3333);
    const expectedMad = roundToTest(
      (Math.abs(2 - 4 / 3) + Math.abs(1 - 4 / 3) + Math.abs(1 - 4 / 3)) / 3,
      4,
    );
    expect(band.partner_mad).toBe(expectedMad);
    expect(band.partner_mad!).toBeLessThan(out.tight_mad_max);
  });

  it("symmetric non-flat pool [4,3,2] → mean 3 / mad 2/3 ≈ 0.667 (spread — disagrees with P11.197 which reads gap 0 on this pool because mean coincides with median but MAD folds every cell)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_mean_cells).toBe(3);
    expect(band.partner_mad).toBe(roundToTest(2 / 3, 4));
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.tight_mad_max);
    expect(band.partner_mad!).toBeLessThan(out.wide_mad_min);
  });

  it("pool [3,1,1] → mean 5/3 / mad = (4/3 + 2/3 + 2/3)/3 = 8/9 ≈ 0.889 (spread)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_mean_cells).toBe(roundToTest(5 / 3, 4));
    const expectedMad = roundToTest(
      (Math.abs(3 - 5 / 3) + Math.abs(1 - 5 / 3) + Math.abs(1 - 5 / 3)) / 3,
      4,
    );
    expect(band.partner_mad).toBe(expectedMad);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.tight_mad_max);
    expect(band.partner_mad!).toBeLessThan(out.wide_mad_min);
  });

  it("stark leader pool [10,1,1] → mean 4 / mad = (6+3+3)/3 = 4 (wide; extreme dispersion)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_mean_cells).toBe(4);
    expect(band.partner_mad).toBe(4);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.wide_mad_min);
  });

  it("LEFT-SKEWED pool [10,10,1] → mean 7 / mad = (3+3+6)/3 = 4 (wide; same magnitude as right-skewed [10,1,1] because MAD is symmetric under mean-reflection)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_mean_cells).toBe(7);
    expect(band.partner_mad).toBe(4);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.wide_mad_min);
  });

  it("even-n pool [4,3,2,1] → mean 2.5 / mad = (1.5+0.5+0.5+1.5)/4 = 1 (spread)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_mean_cells).toBe(2.5);
    expect(band.partner_mad).toBe(1);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.tight_mad_max);
    expect(band.partner_mad!).toBeLessThan(out.wide_mad_min);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_mad).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs with 2 cells each → pool [2,2] → mean 2 / mad 0 (tight; flat pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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
    expect(band.metric_mean_cells).toBe(2);
    expect(band.metric_mad).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output mad values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("odd-n pool [5,3,2] → mean 10/3 / mad = (5/3 + 1/3 + 4/3)/3 = 10/9 ≈ 1.111 (spread)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_mean_cells).toBe(roundToTest(10 / 3, 4));
    const expectedMad = roundToTest(
      (Math.abs(5 - 10 / 3) +
        Math.abs(3 - 10 / 3) +
        Math.abs(2 - 10 / 3)) /
        3,
      4,
    );
    expect(band.partner_mad).toBe(expectedMad);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.tight_mad_max);
    expect(band.partner_mad!).toBeLessThan(out.wide_mad_min);
  });

  it("identity check within rounding tolerance — mad = mean(|x - mean|)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    // pool [4,1,1] → mean 2, deviations 2/1/1 → mad = 4/3 ≈ 1.3333.
    expect(band.partner_mean_cells).toBe(2);
    const expectedMad = roundToTest(
      (Math.abs(4 - 2) + Math.abs(1 - 2) + Math.abs(1 - 2)) / 3,
      4,
    );
    expect(band.partner_mad).toBe(expectedMad);
    expect(band.partner_mad).toBe(roundToTest(4 / 3, 4));
  });

  it("pool [10,5,5] → mean 20/3 / mad = (10/3 + 5/3 + 5/3)/3 = 20/9 ≈ 2.222 (wide; whole-pool fold reads dispersion driven by the single leader cell)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(20);
    expect(band.partner_mean_cells).toBe(roundToTest(20 / 3, 4));
    const expectedMad = roundToTest(
      (Math.abs(10 - 20 / 3) +
        Math.abs(5 - 20 / 3) +
        Math.abs(5 - 20 / 3)) /
        3,
      4,
    );
    expect(band.partner_mad).toBe(expectedMad);
    expect(band.partner_mad!).toBeGreaterThanOrEqual(out.wide_mad_min);
  });

  it("mad is direction-agnostic — pool [10,1,1] (right-skew) and pool [10,10,1] (left-skew) both read magnitude 4 (MAD folds signed deviations under absolute value)", () => {
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
    // RIGHT: pool [10,1,1] → mean 4, mad 4
    const rightRows: PerPairHotCellRow[] = [];
    for (const k of kpis) rightRows.push(cell("ACME", k, "improved", 4));
    rightRows.push(cell("B", "attributed_mrr", "improved", 4));
    rightRows.push(cell("C", "attributed_mrr", "improved", 4));
    const rightOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rightRows),
      );
    // LEFT: pool [10,10,1] → mean 7, mad 4
    const leftRows: PerPairHotCellRow[] = [];
    for (const k of kpis) leftRows.push(cell("A", k, "degraded", 4));
    for (const k of kpis) leftRows.push(cell("B", k, "degraded", 4));
    leftRows.push(cell("C", "attributed_mrr", "degraded", 4));
    const leftOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(leftRows),
      );
    expect(rightOut.transitions.improved.bands.medium.partner_mad).toBe(4);
    expect(leftOut.transitions.degraded.bands.medium.partner_mad).toBe(4);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool MEAN ABSOLUTE DEVIATION");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for pool_count 1 (single-cell pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders wide label when mad >= 2.0", () => {
    // pool [10,1,1] → mad 4 (wide)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("renders tight label when mad < 0.5 (flat pool [1,1,1] → 0)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label when mad is between 0.5 and 2.0 (pool [4,3,2] → 0.667)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.175 CV and P11.181 range dispersion siblings and the 0.5 / 2.0 cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("P11.175");
    expect(html).toContain("P11.181");
    expect(html).toContain("0.5");
    expect(html).toContain("2");
  });

  it("caption references solo / tight / spread / wide label vocabulary", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMeanAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("solo");
    expect(html).toContain("tight");
    expect(html).toContain("spread");
    expect(html).toContain("wide");
  });
});

function roundToTest(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}
