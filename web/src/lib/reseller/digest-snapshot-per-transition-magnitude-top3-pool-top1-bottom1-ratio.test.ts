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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-top1-bottom1-ratio";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("ratio cutoffs are plain-language 2x / 5x bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([]),
      );
    expect(out.level_ratio_max).toBe(2);
    expect(out.stark_ratio_min).toBe(5);
    expect(out.stark_ratio_min).toBeGreaterThan(out.level_ratio_max);
    expect(out.level_ratio_max).toBeGreaterThan(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + ratio null in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
        expect(band.partner_top1_cells).toBe(0);
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → ratio 1 (top1 = bottom1 = 1 by definition)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top1_cells).toBe(1);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
    expect(band.metric_ratio).toBe(1);
  });

  it("perfectly flat pool (N partners, 1 cell each) → ratio 1 (top1 = bottom1)", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_cells).toBe(1);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(1);
  });

  it("two-partner leader-heavy pool [3, 1] → ratio 3/1 = 3 (unequal)", () => {
    // ACME 3 KPI cells + B 1 cell → pool_count 2, top1=3, bottom1=1.
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_cells).toBe(3);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(3);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("moderately unequal pool [4, 3, 2] → ratio 4/2 = 2 (unequal edge)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_top1_cells).toBe(4);
    expect(band.partner_bottom1_cells).toBe(2);
    expect(band.partner_ratio).toBe(2);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.level_ratio_max);
    expect(band.partner_ratio!).toBeLessThan(out.stark_ratio_min);
  });

  it("clearly-dominant leader [6, 1, 1] → ratio 6/1 = 6 (stark)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_top1_cells).toBe(6);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(6);
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(out.stark_ratio_min);
  });

  it("compressed pool [4, 3] → ratio 4/3 = 1.3333 (level, below 2x)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(7);
    expect(band.partner_ratio).toBe(1.3333);
    expect(band.partner_ratio!).toBeLessThan(out.level_ratio_max);
  });

  it("ratio is always >= 1 for every non-empty pool (top1 >= bottom1 by construction)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_ratio!).toBeGreaterThanOrEqual(1);
    expect(band.metric_ratio!).toBeGreaterThanOrEqual(1);
  });

  it("ratio is scale-invariant: pool [6,3,3] and pool [10,5,5] yield the same ratio 2", () => {
    // Both pools have head/floor cell ratio 2; range would differ but
    // ratio must match. Build [6,3,3] on 'improved' small band and
    // [10,5,5] on 'degraded' small band and compare.
    const rowsA: PerPairHotCellRow[] = [];
    for (let i = 0; i < 6; i++) {
      rowsA.push(
        cell("A", ("attributed_mrr" as KnownKpiSection) + i as KnownKpiSection, "improved", 2, {
          key: ["attributed_mrr", "commission_cleared_mtd", "attributed_net_contribution", "contribution_margin_pct", "clawback_exposure", "budget_utilization"][i] as KnownKpiSection,
        }),
      );
    }
    for (let i = 0; i < 3; i++) {
      rowsA.push(
        cell("B", ["attributed_mrr", "commission_cleared_mtd", "attributed_net_contribution"][i] as KnownKpiSection, "improved", 2),
      );
    }
    for (let i = 0; i < 3; i++) {
      rowsA.push(
        cell("C", ["attributed_mrr", "commission_cleared_mtd", "attributed_net_contribution"][i] as KnownKpiSection, "improved", 2),
      );
    }
    const outA =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rowsA),
      );
    const bandA = outA.transitions.improved.bands.small;
    expect(bandA.partner_pool_count).toBe(3);
    expect(bandA.partner_top1_cells).toBe(6);
    expect(bandA.partner_bottom1_cells).toBe(3);
    expect(bandA.partner_ratio).toBe(2);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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

  it("metric fold parity — 4 rows across 2 KPIs each with 2 cells → ratio 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
    expect(band.metric_top1_cells).toBe(2);
    expect(band.metric_bottom1_cells).toBe(2);
    expect(band.metric_ratio).toBe(1);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
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
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("tied leader + tied trailer [3,3,1,1] → ratio names the leader-vs-trailer gap 3/1 = 3", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top1_cells).toBe(3);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_ratio).toBe(3);
  });

  it("ratio matches top1_cells / bottom1_cells arithmetic within rounding tolerance", () => {
    // pool [5,3,2] → top1=5, bottom1=2, ratio=5/2=2.5.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top1_cells).toBe(5);
    expect(band.partner_bottom1_cells).toBe(2);
    expect(band.partner_ratio).toBe(2.5);
    const rebuilt = band.partner_top1_cells / band.partner_bottom1_cells;
    expect(Math.abs(band.partner_ratio! - rebuilt)).toBeLessThanOrEqual(1e-4);
  });

  it("ratio upper bound sanity: ratio <= pool_cells - (pool_count - 1) when floor is a single cell", () => {
    // pool [4,1,1] → top1=4, bottom1=1, ratio=4. Upper bound = 6 - 2 = 4.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    const upper = band.partner_pool_cells - (band.partner_pool_count - 1);
    expect(band.partner_ratio!).toBeLessThanOrEqual(upper);
    expect(band.partner_ratio).toBe(4);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool TOP-1 / BOTTOM-1 RATIO");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for single-partner pool (ratio = 1)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders stark label when leader-to-floor ratio >= 5x", () => {
    // pool [6,1,1] → ratio 6 (stark)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("stark");
  });

  it("renders level label when leader-to-floor ratio < 2x", () => {
    // pool [4,3] → ratio 1.3333 (level)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("level");
  });

  it("renders unequal label when leader-to-floor ratio is between 2x and 5x", () => {
    // pool [3,1] → ratio 3 (unequal)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("unequal");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.165 TOP-1 + P11.179 BOTTOM-1 pair and the 2x/5x cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("P11.165");
    expect(html).toContain("P11.179");
    expect(html).toContain("2x");
    expect(html).toContain("5x");
  });

  it("caption references the P11.181 RANGE surface (additive spread complement)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1Ratio(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop1Bottom1RatioSection(
        out,
      );
    expect(html).toContain("P11.181");
  });
});
