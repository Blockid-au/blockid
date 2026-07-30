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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-bottom1-share";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("floor cutoffs are plain-language 5% / 15% bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([]),
    );
    expect(out.flat_floor_min).toBe(0.15);
    expect(out.moderate_floor_min).toBe(0.05);
    expect(out.flat_floor_min).toBeGreaterThan(out.moderate_floor_min);
    expect(out.moderate_floor_min).toBeGreaterThan(0);
    expect(out.flat_floor_min).toBeLessThanOrEqual(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + bottom1_share null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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
        expect(band.partner_bottom1_cells).toBe(0);
        expect(band.partner_bottom1_share).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_bottom1_share).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → bottom1_share 1 (by definition)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_bottom1_share).toBe(1);
    expect(band.metric_bottom1_share).toBe(1);
  });

  it("perfectly flat pool (N partners, 1 cell each) → bottom1_share = 1/N", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_bottom1_cells).toBe(1);
    // 1/4 = 0.25 rounded to 4 decimals
    expect(band.partner_bottom1_share).toBeCloseTo(0.25, 4);
  });

  it("single dominant partner in a wide pool → bottom1_share is very small (thin_tail)", () => {
    // ACME: 6 cells across 6 KPIs. B, C: 1 each. pool=8, smallest=1, share=1/8=0.125.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_bottom1_share).toBeCloseTo(0.125, 4);
    // 0.125 is above moderate_floor_min (0.05) but below flat_floor_min (0.15)
    expect(band.partner_bottom1_share!).toBeGreaterThanOrEqual(
      out.moderate_floor_min,
    );
    expect(band.partner_bottom1_share!).toBeLessThan(out.flat_floor_min);
  });

  it("bottom1_share rounded to 4 decimals for weekly-digest stability", () => {
    // 3 partners: 4, 3, 2 cells → pool 9. Smallest C=2 → share 2/9 = 0.2222...
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_bottom1_cells).toBe(2);
    // 2/9 = 0.2222... → rounded 4 decimals = 0.2222
    expect(band.partner_bottom1_share).toBe(0.2222);
  });

  it("share sits in flat_floor band (>= 15%) when pool is broadly flat", () => {
    // 5 partners, 1 cell each → pool 5, floor 1/5 = 0.2 → flat_floor
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_bottom1_share).toBe(0.2);
    expect(band.partner_bottom1_share!).toBeGreaterThanOrEqual(
      out.flat_floor_min,
    );
  });

  it("share drops below moderate_floor (thin_tail) when pool has long thin tail", () => {
    // 21 partners: A owns 20 cells (across duplicate rows on the same KPI is
    // impossible since a code+KPI pair collapses in the map; use 21 distinct
    // codes with the leader "AA" carrying an extra cell on a second KPI).
    // Rows: 21 unique codes on "attributed_mrr" + 1 extra for AA on
    // "commission_cleared_mtd" → pool_cells 22, floor 1/22 ≈ 0.045.
    const codes = [
      "AA", "B", "C", "D", "E", "F", "G", "H", "I", "J",
      "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U",
    ];
    const rows: PerPairHotCellRow[] = [];
    for (const code of codes) {
      rows.push(cell(code, "attributed_mrr", "improved", 6));
    }
    rows.push(cell("AA", "commission_cleared_mtd", "improved", 6));
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.large;
    expect(band.partner_pool_count).toBe(21);
    expect(band.partner_pool_cells).toBe(22);
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_bottom1_share).toBe(0.0455);
    expect(band.partner_bottom1_share!).toBeLessThan(out.moderate_floor_min);
  });

  it("bottom1_share never exceeds 1 and stays strictly positive for non-empty cells", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_bottom1_share!).toBeGreaterThan(0);
    expect(band.partner_bottom1_share!).toBeLessThanOrEqual(1);
    expect(band.metric_bottom1_share!).toBeGreaterThan(0);
    expect(band.metric_bottom1_share!).toBeLessThanOrEqual(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(
      out.transitions.improved.bands.medium.partner_bottom1_share,
    ).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs → metric bottom1 = 2 / 4 = 0.5", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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
    expect(band.metric_bottom1_cells).toBe(2);
    expect(band.metric_bottom1_share).toBeCloseTo(0.5, 4);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output bottom1_share values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const reversed = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([...rows].reverse()),
    );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("bottom1_cells reads the MIN count across partners even with ties", () => {
    // A=3, B=3, C=1, D=1 (tied trailers). Floor cells = 1, share 1/8 = 0.125.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_bottom1_cells).toBe(1);
    expect(band.partner_bottom1_share).toBe(0.125);
  });

  it("bottom1_share <= top-share-mirror sanity: for any pool bottom1 <= 1/pool_count", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    // 3 partners → uniform share is 1/3 ≈ 0.3333. Bottom must be ≤ that.
    expect(band.partner_bottom1_share!).toBeLessThanOrEqual(1 / 3 + 1e-9);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool BOTTOM-1 share");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label for single-partner pool (share = 1)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("solo");
  });

  it("renders flat_floor label when smallest owns >= 15%", () => {
    // 5 partners, 1 cell each → floor 0.2 → flat_floor
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("flat_floor");
  });

  it("renders moderate_floor label when smallest is between 5% and 15%", () => {
    // 8 partners each with 1 cell → floor 0.125 → moderate_floor
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E", "F", "G", "H"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("moderate_floor");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.165 TOP-1 companion and the 5%/15% cutoffs", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolBottom1ShareSection(out);
    expect(html).toContain("P11.165");
    expect(html).toContain("15%");
    expect(html).toContain("5%");
  });
});
