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
  computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap,
  formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-middle-gap";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
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

  it("keeps null first_week / last_week when the source envelope carries null", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("emits band_thresholds pinned to MAGNITUDE_SMALL_MAX and MAGNITUDE_MEDIUM_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("top_n scalar equals the exported TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("outlier_gap_min scalar is a positive integer >= 2", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([]),
    );
    expect(Number.isInteger(out.outlier_gap_min)).toBe(true);
    expect(out.outlier_gap_min).toBeGreaterThanOrEqual(2);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap — envelope shape stability", () => {
  it("empty rows → all four transitions present with null gaps across all three bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([]),
    );
    expect(out.total_hot_cells).toBe(0);
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        const band = out.transitions[t].bands[b];
        expect(band.partner_top2_cells).toBeNull();
        expect(band.partner_top_last_cells).toBeNull();
        expect(band.partner_middle_gap).toBeNull();
        expect(band.metric_top2_cells).toBeNull();
        expect(band.metric_top_last_cells).toBeNull();
        expect(band.metric_middle_gap).toBeNull();
        expect(band.partner_count).toBe(0);
        expect(band.metric_count).toBe(0);
      }
    }
  });

  it("transitions object always ships all four transition keys", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    expect(Object.keys(out.transitions).sort()).toEqual([
      "degraded",
      "improved",
      "rotated",
      "undecidable",
    ]);
  });

  it("bands object always ships all three band keys within every transition", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      expect(Object.keys(out.transitions[t].bands).sort()).toEqual([
        "large",
        "medium",
        "small",
      ]);
    }
  });

  it("rotated + undecidable ship null gaps in medium + large (hot_score=1 by P11.139 design)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("A", "attributed_mrr", "rotated", 1),
        cell("B", "attributed_net_contribution", "undecidable", 1),
      ]),
    );
    expect(out.transitions.rotated.bands.medium.partner_middle_gap).toBeNull();
    expect(out.transitions.rotated.bands.large.partner_middle_gap).toBeNull();
    expect(out.transitions.undecidable.bands.medium.metric_middle_gap).toBeNull();
    expect(out.transitions.undecidable.bands.large.metric_middle_gap).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap — middle arithmetic", () => {
  it("solo entry (1 partner, count < TOP_N) → gap null, top2 null, top_last null, count 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("SOLO", "attributed_mrr", "improved", 4)]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_cells).toBeNull();
    expect(band.partner_top_last_cells).toBeNull();
    expect(band.partner_middle_gap).toBeNull();
    expect(band.partner_count).toBe(1);
  });

  it("2 entries (count < TOP_N) → top2 exists but gap null, top_last null (runner-up-gap surface owns this shape)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_count).toBe(2);
    expect(band.partner_top2_cells).toBe(1);
    expect(band.partner_top_last_cells).toBeNull();
    expect(band.partner_middle_gap).toBeNull();
  });

  it("3-entry pack-collapses shape (4/3/1) → middle_gap === 2 with top2=3, top_last=1", () => {
    // Runner-up gap would be 4-3=1, tail gap would be 4-1=3, middle gap is 3-1=2.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("BIG", "commission_cleared_mtd", "improved", 4),
        cell("BIG", "budget_utilization", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
        cell("MID", "attributed_net_contribution", "improved", 4),
        cell("MID", "commission_cleared_mtd", "improved", 4),
        cell("LOW", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_count).toBe(3);
    expect(band.partner_top2_cells).toBe(3);
    expect(band.partner_top_last_cells).toBe(1);
    expect(band.partner_middle_gap).toBe(2);
  });

  it("3-entry leader-outlier shape (4/1/1) → middle_gap === 0 with top2=1, top_last=1", () => {
    // Same tail_gap = 3 as the pack-collapses shape but the middle sits flat.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("BIG", "commission_cleared_mtd", "improved", 4),
        cell("BIG", "budget_utilization", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
        cell("LOW", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_count).toBe(3);
    expect(band.partner_top2_cells).toBe(1);
    expect(band.partner_top_last_cells).toBe(1);
    expect(band.partner_middle_gap).toBe(0);
  });

  it("3-way flat (3/3/3) → middle_gap 0 with top2=3, top_last=3", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["ALPHA", "BETA", "GAMMA"] as const) {
      for (const k of [
        "attributed_mrr",
        "attributed_net_contribution",
        "commission_cleared_mtd",
      ] as const) {
        rows.push(cell(code, k, "improved", 4));
      }
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_count).toBe(3);
    expect(band.partner_top2_cells).toBe(3);
    expect(band.partner_top_last_cells).toBe(3);
    expect(band.partner_middle_gap).toBe(0);
  });

  it("3-entry tight middle (3/2/1) → middle_gap 1 with top2=2, top_last=1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("BIG", "commission_cleared_mtd", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
        cell("MID", "attributed_net_contribution", "improved", 4),
        cell("LOW", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_count).toBe(3);
    expect(band.partner_top2_cells).toBe(2);
    expect(band.partner_top_last_cells).toBe(1);
    expect(band.partner_middle_gap).toBe(1);
  });

  it("metric middle-gap arithmetic mirrors partner formula", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        // attributed_mrr: 3 cells
        cell("A", "attributed_mrr", "degraded", 6),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "degraded", 6),
        // attributed_net_contribution: 2 cells
        cell("D", "attributed_net_contribution", "degraded", 6),
        cell("E", "attributed_net_contribution", "degraded", 6),
        // commission_cleared_mtd: 1 cell
        cell("F", "commission_cleared_mtd", "degraded", 6),
      ]),
    );
    const band = out.transitions.degraded.bands.large;
    expect(band.metric_count).toBe(3);
    expect(band.metric_top2_cells).toBe(2);
    expect(band.metric_top_last_cells).toBe(1);
    expect(band.metric_middle_gap).toBe(1);
  });

  it("empty cell → gap null, top2/top_last null, count 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const emptyBand = out.transitions.degraded.bands.small;
    expect(emptyBand.partner_top2_cells).toBeNull();
    expect(emptyBand.partner_top_last_cells).toBeNull();
    expect(emptyBand.partner_middle_gap).toBeNull();
    expect(emptyBand.metric_top2_cells).toBeNull();
    expect(emptyBand.metric_top_last_cells).toBeNull();
    expect(emptyBand.metric_middle_gap).toBeNull();
  });

  it("middle gaps are scoped per (transition, band) — improved and degraded stay independent", () => {
    const rows: PerPairHotCellRow[] = [];
    // improved.large: 3 partners at (3, 2, 1) cells → middle_gap = 1
    for (const k of [
      "attributed_mrr",
      "attributed_net_contribution",
      "commission_cleared_mtd",
    ] as const) {
      rows.push(cell("A", k, "improved", 10));
    }
    for (const k of ["attributed_mrr", "attributed_net_contribution"] as const) {
      rows.push(cell("B", k, "improved", 10));
    }
    rows.push(cell("C", "attributed_mrr", "improved", 10));
    // degraded.large: 3 partners at (1, 1, 1) → middle_gap = 0
    for (const c of ["X", "Y", "Z"] as const) {
      rows.push(cell(c, "attributed_mrr", "degraded", 10));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(rows),
    );
    expect(out.transitions.improved.bands.large.partner_middle_gap).toBe(1);
    expect(out.transitions.degraded.bands.large.partner_middle_gap).toBe(0);
    expect(out.transitions.improved.bands.small.partner_middle_gap).toBeNull();
  });

  it("middle_gap is always non-negative (top2 >= top_last by P11.149 sort)", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const c of ["A", "B", "C"] as const) {
      for (const k of ["attributed_mrr", "attributed_net_contribution"] as const) {
        rows.push(cell(c, k, "improved", 4));
      }
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(rows),
    );
    const gap = out.transitions.improved.bands.medium.partner_middle_gap;
    expect(gap).not.toBeNull();
    expect(gap!).toBeGreaterThanOrEqual(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap — total_hot_cells parity", () => {
  it("total_hot_cells counts every alert-worthy row in the source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap — determinism", () => {
  it("re-runs on reversed input produce identical transitions map", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 3),
      cell("B", "attributed_net_contribution", "degraded", 7),
      cell("C", "attributed_mrr", "improved", 1),
      cell("A", "attributed_net_contribution", "improved", 3),
      cell("B", "attributed_mrr", "improved", 3),
    ];
    const first = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(rows),
    );
    const second = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([...rows].reverse()),
    );
    expect(first.transitions).toEqual(second.transitions);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out),
    ).toBe("");
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out),
    ).toBe("");
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 middle gap");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar / TOP-N", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 3)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
    expect(html).toContain("TOP-3");
  });

  it("caption names band cutoffs from the envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).toContain("small (1..2)");
    expect(html).toContain("medium (3..5)");
    expect(html).toContain("large (6+)");
  });

  it("omits empty (transition, band) cells from the visual table but keeps them on the envelope with gap null", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    // Solo entry in improved.medium — label "partial"
    expect(html).toContain("partial");
    expect(out.transitions.degraded.bands.small.partner_middle_gap).toBeNull();
    expect(out.transitions.rotated.bands.large.metric_middle_gap).toBeNull();
  });

  it("labels a solo/2-entry cell partial, a 3/2/1 tight, a 4/3/1 outlier, a 3/3/3 flat", () => {
    // Partial — one entry (count < TOP_N).
    const partialOut = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([cell("ONE", "attributed_mrr", "improved", 4)]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(partialOut),
    ).toContain("partial");

    // Tight — 3-entry cell with middle_gap 1.
    const tightRows: PerPairHotCellRow[] = [
      cell("BIG", "attributed_mrr", "improved", 4),
      cell("BIG", "attributed_net_contribution", "improved", 4),
      cell("BIG", "commission_cleared_mtd", "improved", 4),
      cell("MID", "attributed_mrr", "improved", 4),
      cell("MID", "attributed_net_contribution", "improved", 4),
      cell("LOW", "attributed_mrr", "improved", 4),
    ];
    const tightOut = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(tightRows),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(tightOut),
    ).toContain("tight");

    // Outlier — 3-entry pack-collapses cell with middle_gap 2.
    const outlierRows: PerPairHotCellRow[] = [
      cell("BIG", "attributed_mrr", "improved", 4),
      cell("BIG", "attributed_net_contribution", "improved", 4),
      cell("BIG", "commission_cleared_mtd", "improved", 4),
      cell("BIG", "budget_utilization", "improved", 4),
      cell("MID", "attributed_mrr", "improved", 4),
      cell("MID", "attributed_net_contribution", "improved", 4),
      cell("MID", "commission_cleared_mtd", "improved", 4),
      cell("LOW", "attributed_mrr", "improved", 4),
    ];
    const outlierOut = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(outlierRows),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(outlierOut),
    ).toContain("outlier");

    // Flat — 3 partners with equal cell counts (3/3/3).
    const flatRows: PerPairHotCellRow[] = [];
    for (const code of ["ALPHA", "BETA", "GAMMA"] as const) {
      for (const k of [
        "attributed_mrr",
        "attributed_net_contribution",
        "commission_cleared_mtd",
      ] as const) {
        flatRows.push(cell(code, k, "improved", 4));
      }
    }
    const flatOut = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(flatRows),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(flatOut),
    ).toContain("flat");
  });

  it("HTML-escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope(
        [cell("ACME", "attributed_mrr", "improved", 4)],
        { first_week: "2026-<W>", last_week: "2026-W31" },
      ),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("2026-<W>");
  });

  it("renders transition arrow labels for each transition that fires", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
    expect(html).toContain("&harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders `top2 / topN = +gap` cell for a full 3-entry (transition, band)", () => {
    // BIG=3 cells, MID=2 cells, LOW=1 cell → top2=2, top_last=1, middle_gap=1 → "2 / 1 = +1"
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3MiddleGap(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("BIG", "commission_cleared_mtd", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
        cell("MID", "attributed_net_contribution", "improved", 4),
        cell("LOW", "attributed_mrr", "improved", 4),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3MiddleGapSection(out);
    expect(html).toContain("2 / 1 = +1");
  });
});
