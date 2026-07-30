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
  computeDigestSnapshotPerTransitionMagnitudeTop3Concentration,
  formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection,
  OUTLIER_THRESHOLD,
  PACK_THRESHOLD,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-concentration";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Concentration — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("emits band_thresholds pinned to MAGNITUDE_SMALL_MAX and MAGNITUDE_MEDIUM_MAX constants (shared across all four magnitude surfaces)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("emits top_n / outlier_threshold / pack_threshold scalars equal to the exported constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
    expect(out.outlier_threshold).toBe(OUTLIER_THRESHOLD);
    expect(out.pack_threshold).toBe(PACK_THRESHOLD);
    expect(out.outlier_threshold).toBeGreaterThan(out.pack_threshold);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Concentration — envelope shape stability", () => {
  it("empty rows → all four transitions present with null indices across all three bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([]),
    );
    expect(out.total_hot_cells).toBe(0);
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        const band = out.transitions[t].bands[b];
        expect(band.partner_concentration_index).toBeNull();
        expect(band.metric_concentration_index).toBeNull();
        expect(band.partner_leader_delta_cells).toBeNull();
        expect(band.metric_leader_delta_cells).toBeNull();
        expect(band.partner_count).toBe(0);
        expect(band.metric_count).toBe(0);
      }
    }
  });

  it("transitions object always ships all four transition keys", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
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

  it("rotated + undecidable ship null indices in medium + large bands (hot_score=1 by P11.139 design)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("A", "attributed_mrr", "rotated", 1),
        cell("B", "attributed_net_contribution", "undecidable", 1),
      ]),
    );
    // small band has entries — non-null concentration
    expect(
      out.transitions.rotated.bands.small.partner_concentration_index,
    ).not.toBeNull();
    // medium + large stay null
    expect(
      out.transitions.rotated.bands.medium.partner_concentration_index,
    ).toBeNull();
    expect(
      out.transitions.rotated.bands.large.partner_concentration_index,
    ).toBeNull();
    expect(
      out.transitions.undecidable.bands.medium.metric_concentration_index,
    ).toBeNull();
    expect(
      out.transitions.undecidable.bands.large.metric_concentration_index,
    ).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Concentration — total_hot_cells scalar parity", () => {
  it("total_hot_cells counts every alert-worthy row in the source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
        cell("E", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.total_hot_cells).toBe(5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Concentration — concentration index math", () => {
  it("outlier: single partner in the top-3 → index === 1.0 and partner_count === 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("SOLO", "attributed_mrr", "improved", 4)]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_concentration_index).toBe(1);
    expect(band.partner_count).toBe(1);
    // leader delta is null when there is no runner-up
    expect(band.partner_leader_delta_cells).toBeNull();
  });

  it("outlier: 4/1/1 partner split → partner_concentration_index === 0.6667, partner_leader_delta_cells === 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
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
    expect(band.partner_concentration_index).toBe(0.6667);
    expect(band.partner_leader_delta_cells).toBe(3);
    expect(band.partner_count).toBe(3);
  });

  it("pack: 3/3/3 partner split → partner_concentration_index === 0.3333, partner_leader_delta_cells === 0", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_concentration_index).toBe(0.3333);
    expect(band.partner_leader_delta_cells).toBe(0);
    expect(band.partner_count).toBe(3);
  });

  it("metric concentration mirrors partner formula and rounds to 4 decimals", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        // attributed_mrr: 4 cells (owns the metric top slot)
        cell("A", "attributed_mrr", "degraded", 6),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "degraded", 6),
        cell("D", "attributed_mrr", "degraded", 6),
        // attributed_net_contribution: 2 cells
        cell("E", "attributed_net_contribution", "degraded", 6),
        cell("F", "attributed_net_contribution", "degraded", 6),
        // commission_cleared_mtd: 1 cell
        cell("G", "commission_cleared_mtd", "degraded", 6),
      ]),
    );
    const band = out.transitions.degraded.bands.large;
    // top-3 cells 4/2/1, sum 7, index 4/7 ≈ 0.5714
    expect(band.metric_concentration_index).toBe(0.5714);
    expect(band.metric_leader_delta_cells).toBe(2);
    expect(band.metric_count).toBe(3);
  });

  it("partner_leader_delta_cells === null when only one partner qualifies; > 1 partner produces a signed integer delta", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("SOLO", "attributed_mrr", "improved", 4),
        cell("SOLO", "attributed_net_contribution", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    // still only one partner (SOLO with 2 cells)
    expect(band.partner_count).toBe(1);
    expect(band.partner_leader_delta_cells).toBeNull();
    // whereas the metric side has 2 entries with 1 cell each → delta 0
    expect(band.metric_count).toBe(2);
    expect(band.metric_leader_delta_cells).toBe(0);
  });

  it("indices are scoped per (transition, band) — improved-large concentration is independent of degraded-large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("A", "attributed_mrr", "improved", 10),
        cell("A", "attributed_net_contribution", "improved", 10),
        cell("B", "attributed_mrr", "degraded", 10),
      ]),
    );
    expect(out.transitions.improved.bands.large.partner_concentration_index).toBe(
      1,
    );
    expect(out.transitions.degraded.bands.large.partner_concentration_index).toBe(
      1,
    );
    // improved-small has no entries
    expect(
      out.transitions.improved.bands.small.partner_concentration_index,
    ).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Concentration — determinism", () => {
  it("re-runs on reversed input produce identical transitions map (deterministic fold)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 3),
      cell("B", "attributed_net_contribution", "degraded", 7),
      cell("C", "attributed_mrr", "improved", 1),
      cell("A", "attributed_net_contribution", "improved", 3),
      cell("B", "attributed_mrr", "improved", 3),
    ];
    const first =
      computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
        envelope(rows),
      );
    const second =
      computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
        envelope([...rows].reverse()),
      );
    expect(first.transitions).toEqual(second.transitions);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out),
    ).toBe("");
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out),
    ).toBe("");
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 concentration");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar / TOP_N", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("A", "attributed_mrr", "improved", 3)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
    expect(html).toContain("TOP-3");
  });

  it("caption names band cutoffs and concentration thresholds from the envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).toContain("small (1..2)");
    expect(html).toContain("medium (3..5)");
    expect(html).toContain("large (6+)");
    expect(html).toContain("60%");
    expect(html).toContain("40%");
  });

  it("omits empty (transition, band) cells from the visual table but keeps them on the envelope with null indices", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).toContain("1.0000");
    expect(
      out.transitions.degraded.bands.small.partner_concentration_index,
    ).toBeNull();
    expect(
      out.transitions.rotated.bands.large.metric_concentration_index,
    ).toBeNull();
  });

  it("labels a 4/1/1 top-3 as outlier and a 3/3/3 top-3 as pack", () => {
    const outlierOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
        envelope([
          cell("BIG", "attributed_mrr", "improved", 4),
          cell("BIG", "attributed_net_contribution", "improved", 4),
          cell("BIG", "commission_cleared_mtd", "improved", 4),
          cell("BIG", "budget_utilization", "improved", 4),
          cell("MID", "attributed_mrr", "improved", 4),
          cell("LOW", "attributed_mrr", "improved", 4),
        ]),
      );
    const outlierHtml =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(
        outlierOut,
      );
    expect(outlierHtml).toContain("outlier");

    const packRows: PerPairHotCellRow[] = [];
    for (const code of ["ALPHA", "BETA", "GAMMA"] as const) {
      for (const k of [
        "attributed_mrr",
        "attributed_net_contribution",
        "commission_cleared_mtd",
      ] as const) {
        packRows.push(cell(code, k, "improved", 4));
      }
    }
    const packOut =
      computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
        envelope(packRows),
      );
    const packHtml =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(
        packOut,
      );
    expect(packHtml).toContain("pack");
  });

  it("HTML-escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope(
        [cell("ACME", "attributed_mrr", "improved", 4)],
        { first_week: "2026-<W>", last_week: "2026-W31" },
      ),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("2026-<W>");
  });

  it("renders transition arrow labels for each transition that fires", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
    expect(html).toContain("&harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders concentration index and leader delta scalars for a non-empty cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Concentration(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 4),
        cell("BIG", "attributed_net_contribution", "improved", 4),
        cell("MID", "attributed_mrr", "improved", 4),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3ConcentrationSection(out);
    // BIG has 2 cells, MID has 1 → top-3 cells 2/1, sum 3, index 0.6667
    expect(html).toContain("0.6667");
    // partner leader delta = 2 - 1 = +1
    expect(html).toContain("+1");
  });
});
