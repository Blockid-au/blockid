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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-top2-bottom1-ratio";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("ratio cutoffs are plain-language 3x / 8x bands (inflated vs P11.185's 2x/5x because numerator sums two slots)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([]),
      );
    expect(out.level_ratio_max).toBe(3);
    expect(out.stark_ratio_min).toBe(8);
    expect(out.stark_ratio_min).toBeGreaterThan(out.level_ratio_max);
    expect(out.level_ratio_max).toBeGreaterThan(1);
  });

  it("top_k=2 and bottom_k=1 (mirror-asymmetric slice completing the 2x2 grid)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([]),
      );
    expect(out.top_k).toBe(2);
    expect(out.bottom_k).toBe(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + ratio null in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
        expect(band.partner_top2_cells).toBe(0);
        expect(band.partner_bottom1_cells).toBe(0);
        expect(band.partner_ratio).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_ratio).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → ratio 1 by definition (pool_count <= TOP_K)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top2_cells).toBe(1);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
    expect(band.metric_ratio).toBe(1);
  });

  it("two-partner pool [3, 1] → ratio 1 by definition (pool_count == TOP_K collapses mirror-asymmetric slice)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top2_cells).toBe(4);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
  });

  it("perfectly flat 3-partner pool [1, 1, 1] → ratio (1+1)/1 = 2 (level; dominant-pair TWICE the floor slot by construction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_top2_cells).toBe(2);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(2);
    expect(band.partner_ratio!).toBeLessThan(out.level_ratio_max);
  });

  it("unequal edge pool [2, 1, 1] → ratio (2+1)/1 = 3 (unequal edge; dominant-pair = 3x floor slot)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top2_cells).toBe(3);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(3);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("moderately unequal pool [4, 3, 2] → ratio (4+3)/2 = 3.5 (unequal; disagrees with P11.187 which reads 7/5 = 1.4 LEVEL under symmetric pair-vs-pair lens)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_top2_cells).toBe(7);
    expect(band.partner_bottom1_cells).toBe(2);
    expect(band.partner_ratio).toBe(3.5);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("clearly-dominant pair [6, 1, 1] → ratio (6+1)/1 = 7 (unequal; inflated vs P11.185's 6.0)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_top2_cells).toBe(7);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(7);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("stark pair [10, 1, 1] → ratio (10+1)/1 = 11 (stark; dominant-pair 11x floor slot)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_top2_cells).toBe(11);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(11);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.stark_ratio_min);
  });

  it("ratio never dips below 1 for any pool (numerator SUMS the two largest slots, always >= 2 * min slot for pool_count >= 3)", () => {
    // Flat 4-partner pool [1,1,1,1] → top2=2, bottom1=1, ratio=2.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 2));
    }
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_top2_cells).toBe(2);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(2);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
    expect(band.metric_top2_cells).toBe(4);
    expect(band.metric_bottom1_cells).toBe(2);
    expect(band.metric_ratio).toBe(1);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("tied leader + tied trailer [3,3,1,1] → ratio (3+3)/1 = 6 (unequal; picks largest 2 slots and single smallest)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_top2_cells).toBe(6);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(6);
  });

  it("ratio matches top2_cells / bottom1_cells arithmetic within rounding tolerance", () => {
    // pool [5,3,2] → top2=5+3=8, bottom1=2, ratio=8/2=4.0.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_cells).toBe(8);
    expect(band.partner_bottom1_cells).toBe(2);
    expect(band.partner_ratio).toBe(4);
    const rebuilt = band.partner_top2_cells / band.partner_bottom1_cells;
    expect(Math.abs(band.partner_ratio! - rebuilt)).toBeLessThanOrEqual(1e-4);
  });

  it("top2 upper bound sanity: ratio <= pool_cells - 1 (achieved when top-2 slots sum to pool_cells - 1 and bottom-1 == 1)", () => {
    // pool [4,1,1] → top2=4+1=5, bottom1=1, ratio=5. Upper bound = 6-1 = 5.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    const upper = band.partner_pool_cells - 1;
    expect(band.partner_ratio!).toBeLessThanOrEqual(upper);
    expect(band.partner_ratio).toBe(5);
  });

  it("top2 picks the two LARGEST slots (not the two smallest)", () => {
    // pool [10,5,5] → top2=10+5=15, bottom1=5, ratio=15/5=3.0.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(20);
    expect(band.partner_top2_cells).toBe(15);
    expect(band.partner_bottom1_cells).toBe(5);
    expect(band.partner_ratio).toBe(3);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool TOP-2 / BOTTOM-1 RATIO");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for pool_count <= TOP_K (single or pair pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders stark label when top2/bottom1 ratio >= 8x", () => {
    // pool [10,1,1] → ratio 11 (stark)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("stark");
  });

  it("renders level label when top2/bottom1 ratio < 3x (flat pool [1,1,1] → 2)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("level");
  });

  it("renders unequal label when top2/bottom1 ratio is between 3x and 8x", () => {
    // pool [2,1,1] → ratio 3 (unequal edge)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("unequal");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.167 TOP-2 + P11.179 BOTTOM-1 source pair and the 3x/8x cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("P11.167");
    expect(html).toContain("P11.179");
    expect(html).toContain("3x");
    expect(html).toContain("8x");
  });

  it("caption references the P11.191 asymmetric companion (completing the 2x2 ratio grid)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Bottom1RatioSection(
        out,
      );
    expect(html).toContain("P11.191");
  });
});
