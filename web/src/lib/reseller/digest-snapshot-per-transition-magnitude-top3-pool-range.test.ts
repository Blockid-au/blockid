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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-range";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("range cutoffs are plain-language 20% / 50% bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([]),
    );
    expect(out.compressed_range_max).toBe(0.2);
    expect(out.wide_range_min).toBe(0.5);
    expect(out.wide_range_min).toBeGreaterThan(out.compressed_range_max);
    expect(out.compressed_range_max).toBeGreaterThan(0);
    expect(out.wide_range_min).toBeLessThanOrEqual(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + range null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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
        expect(band.partner_top1_share).toBeNull();
        expect(band.partner_bottom1_share).toBeNull();
        expect(band.partner_range).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_range).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → range 0 (top1 = bottom1 = 1 by definition)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top1_share).toBe(1);
    expect(band.partner_bottom1_share).toBe(1);
    expect(band.partner_range).toBe(0);
    expect(band.metric_range).toBe(0);
  });

  it("perfectly flat pool (N partners, 1 cell each) → range 0 (top1 = bottom1)", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_share).toBe(0.25);
    expect(band.partner_bottom1_share).toBe(0.25);
    expect(band.partner_range).toBe(0);
  });

  it("two-partner leader-heavy pool [3, 1] → range = 3/4 − 1/4 = 0.5 (wide)", () => {
    // ACME 3 KPI cells + B 1 cell → pool_count 2, pool_cells 4, top1=3,
    // bottom1=1. Range = 0.5 → wide.
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_share).toBe(0.75);
    expect(band.partner_bottom1_share).toBe(0.25);
    expect(band.partner_range).toBe(0.5);
    expect(band.partner_range!).toBeGreaterThanOrEqual(out.wide_range_min);
  });

  it("moderately unequal pool [4, 3, 2] → range = 4/9 − 2/9 = 0.2222 (moderate)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    // (4-2)/9 = 0.2222...
    expect(band.partner_range).toBe(0.2222);
    expect(band.partner_range!).toBeGreaterThanOrEqual(out.compressed_range_max);
    expect(band.partner_range!).toBeLessThan(out.wide_range_min);
  });

  it("clearly-dominant leader [6, 1, 1] → range = 6/8 − 1/8 = 0.625 (wide)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_top1_share).toBe(0.75);
    expect(band.partner_bottom1_share).toBe(0.125);
    expect(band.partner_range).toBe(0.625);
    expect(band.partner_range!).toBeGreaterThanOrEqual(out.wide_range_min);
  });

  it("compressed pool [4, 3] → range = 4/7 − 3/7 = 0.1429 (compressed, below 20%)", () => {
    // pool [4,3]: cell A owns 4 KPI cells, cell B owns 3 KPI cells.
    // top1=4/7=0.5714, bottom1=3/7=0.4286, range=1/7=0.1429.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(7);
    expect(band.partner_range).toBe(0.1429);
    expect(band.partner_range!).toBeLessThan(out.compressed_range_max);
  });

  it("range never exceeds 1 and stays non-negative for every non-empty cell", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_range!).toBeGreaterThanOrEqual(0);
    expect(band.partner_range!).toBeLessThanOrEqual(1);
    expect(band.metric_range!).toBeGreaterThanOrEqual(0);
    expect(band.metric_range!).toBeLessThanOrEqual(1);
  });

  it("range matches top1_share − bottom1_share within rounding tolerance", () => {
    // pool [4,3,2] → top1=4/9, bottom1=2/9, range=2/9.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    const rebuilt = band.partner_top1_share! - band.partner_bottom1_share!;
    // Both rounded to 4dp; drift bound = one ulp at 4dp = 1e-4.
    expect(Math.abs(band.partner_range! - rebuilt)).toBeLessThanOrEqual(1e-4);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_range).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs each with 2 cells → range 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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
    expect(band.metric_top1_share).toBe(0.5);
    expect(band.metric_bottom1_share).toBe(0.5);
    expect(band.metric_range).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output range values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const reversed = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([...rows].reverse()),
    );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("tied leader + tied trailer → range still names the leader-vs-trailer gap", () => {
    // A=3, B=3, C=1, D=1. top1=3, bottom1=1, pool_cells=8. range = 2/8 = 0.25.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top1_share).toBe(0.375);
    expect(band.partner_bottom1_share).toBe(0.125);
    expect(band.partner_range).toBe(0.25);
  });

  it("range ≤ (pool_count − 1)/pool_count sanity for any pool", () => {
    // pool [4,1,1] → top1=4/6, bottom1=1/6, range=3/6=0.5.
    // Upper bound: (3-1)/3 = 0.6667 → 0.5 ≤ 0.6667 ✓.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    const upper = (band.partner_pool_count - 1) / band.partner_pool_count;
    expect(band.partner_range!).toBeLessThanOrEqual(upper + 1e-9);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool RANGE");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for single-partner pool (range = 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("solo");
  });

  it("renders wide label when leader-to-floor gap ≥ 50%", () => {
    // pool [3,1] → range 0.5 (wide)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("wide");
  });

  it("renders compressed label when leader-to-floor gap < 20%", () => {
    // pool [4,3] → range 0.1429 (compressed)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("compressed");
  });

  it("renders moderate label when leader-to-floor gap is between 20% and 50%", () => {
    // pool [4,3,2] → range 0.2222 (moderate)
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("moderate");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.165 TOP-1 + P11.179 BOTTOM-1 pair and the 20%/50% cutoffs", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRange(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRangeSection(out);
    expect(html).toContain("P11.165");
    expect(html).toContain("P11.179");
    expect(html).toContain("20%");
    expect(html).toContain("50%");
  });
});
