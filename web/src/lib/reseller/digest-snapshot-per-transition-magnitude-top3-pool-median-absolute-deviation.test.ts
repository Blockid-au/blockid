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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-median-absolute-deviation";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("madm cutoffs are 0.5 (tight max) / 2.0 (wide min) — parity with P11.199 MAD", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([]),
      );
    expect(out.tight_madm_max).toBe(0.5);
    expect(out.wide_madm_min).toBe(2.0);
    expect(out.wide_madm_min).toBeGreaterThan(out.tight_madm_max);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null median/madm in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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
        expect(band.partner_madm).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_madm).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → madm 0 by definition (pool_count <= 1)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(0);
    expect(band.metric_madm).toBe(0);
  });

  it("two-partner pool [3, 1] → median 2 / madm 1 (spread — 2-slot MADm is a genuine dispersion read)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_median_cells).toBe(2);
    expect(band.partner_madm).toBe(1);
    expect(band.partner_madm!).toBeGreaterThanOrEqual(out.tight_madm_max);
    expect(band.partner_madm!).toBeLessThan(out.wide_madm_min);
  });

  it("perfectly flat 3-partner pool [1,1,1] → median 1 / madm 0 (tight on flat pool)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(0);
    expect(band.partner_madm!).toBeLessThan(out.tight_madm_max);
  });

  it("symmetric non-flat pool [4,3,2] → median 3 / madm 2/3 ≈ 0.667 (spread — mean and median coincide, so MADm and MAD agree here)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_madm).toBe(roundToTest(2 / 3, 4));
  });

  it("right-skewed pool [3,1,1] → median 1 / madm = (2+0+0)/3 = 2/3 ≈ 0.667 (spread — MEDIAN tracks the cluster; disagrees with MAD which reads 8/9 anchored on mean 5/3)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(roundToTest(2 / 3, 4));
    expect(band.partner_madm!).toBeGreaterThanOrEqual(out.tight_madm_max);
    expect(band.partner_madm!).toBeLessThan(out.wide_madm_min);
  });

  it("stark leader pool [10,1,1] → median 1 / madm = (9+0+0)/3 = 3 (wide; robust anchor cushions the reading vs MAD which reads 4)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(3);
    expect(band.partner_madm!).toBeGreaterThanOrEqual(out.wide_madm_min);
  });

  it("LEFT-SKEWED pool [10,10,1] → median 10 / madm = (0+0+9)/3 = 3 (wide; MADm is symmetric across reflection through the median so same magnitude as right-skewed [10,1,1])", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_median_cells).toBe(10);
    expect(band.partner_madm).toBe(3);
    expect(band.partner_madm!).toBeGreaterThanOrEqual(out.wide_madm_min);
  });

  it("even-n pool [4,3,2,1] → median 2.5 / madm = (1.5+0.5+0.5+1.5)/4 = 1 (spread — even-n median is midpoint of two central order statistics)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(2.5);
    expect(band.partner_madm).toBe(1);
  });

  it("odd-n pool [5,3,2] → median 3 / madm = (2+0+1)/3 = 1 (spread)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_median_cells).toBe(3);
    expect(band.partner_madm).toBe(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_madm).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs with 2 cells each → pool [2,2] → median 2 / madm 0 (tight; flat pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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
    expect(band.metric_madm).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output madm values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("cluster + single outlier pool [5,4,1,1,1] → median 1 / madm = (4+3+0+0+0)/5 = 1.4 (spread; MADm tracks the cluster near median rather than being pulled toward the outlier like MAD)", () => {
    const rows: PerPairHotCellRow[] = [];
    const aKeys: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
    ];
    for (const k of aKeys) rows.push(cell("A", k, "improved", 4));
    const bKeys: KnownKpiSection[] = [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
    ];
    for (const k of bKeys) rows.push(cell("B", k, "improved", 4));
    rows.push(cell("C", "attributed_mrr", "improved", 4));
    rows.push(cell("D", "attributed_mrr", "improved", 4));
    rows.push(cell("E", "attributed_mrr", "improved", 4));
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(1.4);
    expect(band.partner_madm!).toBeGreaterThanOrEqual(out.tight_madm_max);
    expect(band.partner_madm!).toBeLessThan(out.wide_madm_min);
  });

  it("identity check within rounding tolerance — madm = mean(|x - median|) on pool [4,1,1] → median 1 / madm = (3+0+0)/3 = 1", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_median_cells).toBe(1);
    expect(band.partner_madm).toBe(1);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain(
      "Per-transition magnitude TOP-3 pool MEDIAN ABSOLUTE DEVIATION",
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for pool_count 1 (single-cell pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders wide label when madm >= 2.0 (pool [10,1,1] → 3)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("renders tight label when madm < 0.5 (flat pool [1,1,1] → 0)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label when madm is between 0.5 and 2.0 (pool [3,1,1] → 0.667)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.199 MAD twin and the P11.175 CV / P11.181 range siblings", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("P11.199");
    expect(html).toContain("P11.175");
    expect(html).toContain("P11.181");
  });

  it("caption references solo / tight / spread / wide label vocabulary", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviation(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMedianAbsoluteDeviationSection(
        out,
      );
    expect(html).toContain("solo");
    expect(html).toContain("tight");
    expect(html).toContain("spread");
    expect(html).toContain("wide");
  });
});
