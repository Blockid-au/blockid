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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-mid-mass-share";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes top_k=1 and bottom_k=1 (single-slot extremes on each end)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([]),
      );
    expect(out.top_k).toBe(1);
    expect(out.bottom_k).toBe(1);
  });

  it("mid-mass cutoffs are plain-language 20% / 40% bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([]),
      );
    expect(out.thin_mid_max).toBe(0.2);
    expect(out.fat_mid_min).toBe(0.4);
    expect(out.fat_mid_min).toBeGreaterThan(out.thin_mid_max);
    expect(out.thin_mid_max).toBeGreaterThan(0);
    expect(out.fat_mid_min).toBeLessThanOrEqual(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + mid_mass_share null in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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
        expect(band.partner_mid_mass_cells).toBe(0);
        expect(band.partner_mid_mass_share).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_mid_mass_share).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → mid_mass 0 (single slot IS both extremes)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top1_share).toBe(1);
    expect(band.partner_bottom1_share).toBe(1);
    expect(band.partner_mid_mass_cells).toBe(0);
    expect(band.partner_mid_mass_share).toBe(0);
  });

  it("two-partner pool [3, 1] → mid_mass 0 (top+bottom exhaust the pool)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_share).toBe(0.75);
    expect(band.partner_bottom1_share).toBe(0.25);
    expect(band.partner_mid_mass_cells).toBe(0);
    expect(band.partner_mid_mass_share).toBe(0);
  });

  it("flat 3-partner pool [1, 1, 1] → mid_mass 1/3 = 0.3333 (moderate)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_top1_share).toBe(0.3333);
    expect(band.partner_bottom1_share).toBe(0.3333);
    expect(band.partner_mid_mass_cells).toBe(1);
    expect(band.partner_mid_mass_share).toBe(0.3333);
  });

  it("flat 4-partner pool [1, 1, 1, 1] → mid_mass 2/4 = 0.5 (fat)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top1_share).toBe(0.25);
    expect(band.partner_bottom1_share).toBe(0.25);
    expect(band.partner_mid_mass_cells).toBe(2);
    expect(band.partner_mid_mass_share).toBe(0.5);
    expect(band.partner_mid_mass_share!).toBeGreaterThanOrEqual(
      out.fat_mid_min,
    );
  });

  it("leader-heavy pool [6, 1, 1] → mid_mass 1/8 = 0.125 (thin)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_top1_share).toBe(0.75);
    expect(band.partner_bottom1_share).toBe(0.125);
    expect(band.partner_mid_mass_cells).toBe(1);
    expect(band.partner_mid_mass_share).toBe(0.125);
    expect(band.partner_mid_mass_share!).toBeLessThan(out.thin_mid_max);
  });

  it("moderately unequal pool [4, 3, 2] → mid_mass 3/9 = 0.3333 (moderate)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_mid_mass_cells).toBe(3);
    expect(band.partner_mid_mass_share).toBe(0.3333);
    expect(band.partner_mid_mass_share!).toBeGreaterThanOrEqual(
      out.thin_mid_max,
    );
    expect(band.partner_mid_mass_share!).toBeLessThan(out.fat_mid_min);
  });

  it("dominant middle pool [3, 3, 3, 1] → mid_mass 6/10 = 0.6 (fat)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_net_contribution", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_top1_share).toBe(0.3);
    expect(band.partner_bottom1_share).toBe(0.1);
    expect(band.partner_mid_mass_cells).toBe(6);
    expect(band.partner_mid_mass_share).toBe(0.6);
    expect(band.partner_mid_mass_share!).toBeGreaterThanOrEqual(
      out.fat_mid_min,
    );
  });

  it("load-bearing pool [10, 5, 5] → mid_mass 5/20 = 0.25 (moderate)", () => {
    const rows: PerPairHotCellRow[] = [];
    // A owns 10, B owns 5, C owns 5.
    for (const k of [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
      "budget_utilization",
      "attributed_churn_30d",
      "cohort_velocity",
      "gst_reconciliation_delta",
      "sandbox_share_of_budget",
    ] as const) {
      rows.push(cell("A", k, "improved", 4));
    }
    for (const k of [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
    ] as const) {
      rows.push(cell("B", k, "improved", 4));
    }
    for (const k of [
      "attributed_mrr",
      "commission_cleared_mtd",
      "attributed_net_contribution",
      "contribution_margin_pct",
      "clawback_exposure",
    ] as const) {
      rows.push(cell("C", k, "improved", 4));
    }
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(20);
    expect(band.partner_top1_share).toBe(0.5);
    expect(band.partner_bottom1_share).toBe(0.25);
    expect(band.partner_mid_mass_cells).toBe(5);
    expect(band.partner_mid_mass_share).toBe(0.25);
  });

  it("mid_mass_share never exceeds 1 and stays non-negative for every non-empty cell", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_mid_mass_share!).toBeGreaterThanOrEqual(0);
    expect(band.partner_mid_mass_share!).toBeLessThanOrEqual(1);
    expect(band.metric_mid_mass_share!).toBeGreaterThanOrEqual(0);
    expect(band.metric_mid_mass_share!).toBeLessThanOrEqual(1);
  });

  it("identity: top1_share + mid_mass_share + bottom1_share = 1 for pool_count >= 2", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    // pool [4,3,2]/9 → top1=0.4444 bottom1=0.2222 mid=0.3333. Sum 1.
    const sum =
      band.partner_top1_share! +
      band.partner_mid_mass_share! +
      band.partner_bottom1_share!;
    // Both rounded to 4dp; drift bound = three-way ulp at 4dp = 3e-4.
    expect(Math.abs(sum - 1)).toBeLessThanOrEqual(3e-4);
  });

  it("mid_mass_cells is exactly pool_cells minus top1_cells minus bottom1_cells for pool_count >= 3", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("A", "clawback_exposure", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    // pool [5, 2, 1]; top1=5, bottom1=1, mid=2. pool_cells=8.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_mid_mass_cells).toBe(2);
    expect(band.partner_mid_mass_share).toBe(0.25);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(
      out.transitions.improved.bands.medium.partner_mid_mass_share,
    ).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs each with 2 cells → mid_mass 0 (2 slots exhaust pool)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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
    expect(band.metric_mid_mass_cells).toBe(0);
    expect(band.metric_mid_mass_share).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output mid_mass values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("tied leader + tied trailer [3, 3, 1, 1] → mid_mass 4/8 = 0.5 (fat)", () => {
    // A=3, B=3, C=1, D=1. top1=3, bottom1=1, mid=(8-3-1)=4. pool_cells=8.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_top1_share).toBe(0.375);
    expect(band.partner_bottom1_share).toBe(0.125);
    expect(band.partner_mid_mass_cells).toBe(4);
    expect(band.partner_mid_mass_share).toBe(0.5);
  });

  it("mid_mass_share <= (pool_cells - 2) / pool_cells upper-bound sanity for pool_count >= 3", () => {
    // pool [4,1,1] → top1=4, bottom1=1, mid=1. pool_cells=6.
    // Upper bound: (6-2)/6 = 0.6667. mid_mass = 1/6 = 0.1667 <= 0.6667 ✓.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    const upper = (band.partner_pool_cells - 2) / band.partner_pool_cells;
    expect(band.partner_mid_mass_share!).toBeLessThanOrEqual(upper + 1e-9);
  });

  it("edge pool [1, 1, 1, 1, 1] (5 flat partners) → mid_mass = 3/5 = 0.6 (fat)", () => {
    // All 5 partners hold 1 cell each. top1=1, bottom1=1, mid=(5-1-1)=3.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
      cell("E", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_mid_mass_cells).toBe(3);
    expect(band.partner_mid_mass_share).toBe(0.6);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain(
      "Per-transition magnitude TOP-3 pool MID-MASS SHARE",
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for single-partner pool (mid_mass = 0 by definition)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders thin label when middle mass < 20% (extremes dominate)", () => {
    // pool [6,1,1] → mid = 1/8 = 0.125 (thin)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("thin");
  });

  it("renders moderate label when middle mass is between 20% and 40%", () => {
    // pool [4,3,2] → mid = 3/9 = 0.3333 (moderate)
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("moderate");
  });

  it("renders fat label when middle mass >= 40% (middle dominates)", () => {
    // pool [1,1,1,1] → mid = 2/4 = 0.5 (fat)
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("fat");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.165 TOP-1 + P11.179 BOTTOM-1 pair + P11.181 RANGE + P11.185 RATIO companions + 20%/40% cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("P11.165");
    expect(html).toContain("P11.179");
    expect(html).toContain("P11.181");
    expect(html).toContain("P11.185");
    expect(html).toContain("20%");
    expect(html).toContain("40%");
  });

  it("caption mentions the top1 + mid + bottom1 = 1 identity for pool_count >= 2", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShare(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolMidMassShareSection(
        out,
      );
    expect(html).toContain("top1_share + mid_mass_share + bottom1_share = 1");
  });
});
