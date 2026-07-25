import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  computeDigestSnapshotPerTransitionMagnitudeDrilldown,
  formatDigestSnapshotPerTransitionMagnitudeDrilldownSection,
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
} from "./digest-snapshot-per-transition-magnitude-drilldown";

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

describe("computeDigestSnapshotPerTransitionMagnitudeDrilldown — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("emits band_thresholds pinned to MAGNITUDE_SMALL_MAX and MAGNITUDE_MEDIUM_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(envelope([]));
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
    expect(MAGNITUDE_SMALL_MAX).toBe(2);
    expect(MAGNITUDE_MEDIUM_MAX).toBe(5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeDrilldown — envelope shape stability", () => {
  it("empty rows → all four transitions present with zero total_cells + zero bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(envelope([]));
    expect(out.total_hot_cells).toBe(0);
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      expect(out.transitions[t].total_cells).toBe(0);
      for (const b of ["small", "medium", "large"] as const) {
        expect(out.transitions[t].bands[b].cells).toBe(0);
        expect(out.transitions[t].bands[b].sum_hot_score).toBe(0);
        expect(out.transitions[t].bands[b].max_hot_score).toBe(0);
      }
    }
  });

  it("transitions object always ships all four transition keys", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
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
});

describe("computeDigestSnapshotPerTransitionMagnitudeDrilldown — band assignment", () => {
  it("hot_score 1 lands in small band", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    expect(out.transitions.improved.bands.small.cells).toBe(1);
    expect(out.transitions.improved.bands.medium.cells).toBe(0);
    expect(out.transitions.improved.bands.large.cells).toBe(0);
  });

  it("hot_score 2 lands in small band (boundary top)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    expect(out.transitions.improved.bands.small.cells).toBe(1);
    expect(out.transitions.improved.bands.medium.cells).toBe(0);
  });

  it("hot_score 3 lands in medium band (boundary bottom)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 3)]),
    );
    expect(out.transitions.improved.bands.medium.cells).toBe(1);
    expect(out.transitions.improved.bands.small.cells).toBe(0);
    expect(out.transitions.improved.bands.large.cells).toBe(0);
  });

  it("hot_score 5 lands in medium band (boundary top)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 5)]),
    );
    expect(out.transitions.improved.bands.medium.cells).toBe(1);
    expect(out.transitions.improved.bands.large.cells).toBe(0);
  });

  it("hot_score 6 lands in large band (boundary bottom)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 6)]),
    );
    expect(out.transitions.improved.bands.large.cells).toBe(1);
    expect(out.transitions.improved.bands.medium.cells).toBe(0);
  });

  it("hot_score 42 lands in large band (no upper bound)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "degraded", 42)]),
    );
    expect(out.transitions.degraded.bands.large.cells).toBe(1);
    expect(out.transitions.degraded.bands.large.max_hot_score).toBe(42);
  });

  it("rotated + undecidable rows (hot_score=1 by P11.139 design) always land in small band", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "rotated", 1),
        cell("B", "attributed_mrr", "undecidable", 1),
      ]),
    );
    expect(out.transitions.rotated.bands.small.cells).toBe(1);
    expect(out.transitions.rotated.bands.medium.cells).toBe(0);
    expect(out.transitions.rotated.bands.large.cells).toBe(0);
    expect(out.transitions.undecidable.bands.small.cells).toBe(1);
    expect(out.transitions.undecidable.bands.medium.cells).toBe(0);
    expect(out.transitions.undecidable.bands.large.cells).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeDrilldown — band scalar aggregation", () => {
  it("per-band sum + max reflect the cells that landed in that band", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "improved", 5),
        cell("C", "attributed_mrr", "improved", 8),
        cell("D", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.cells).toBe(1);
    expect(out.transitions.improved.bands.small.sum_hot_score).toBe(1);
    expect(out.transitions.improved.bands.small.max_hot_score).toBe(1);
    expect(out.transitions.improved.bands.medium.cells).toBe(2);
    expect(out.transitions.improved.bands.medium.sum_hot_score).toBe(9);
    expect(out.transitions.improved.bands.medium.max_hot_score).toBe(5);
    expect(out.transitions.improved.bands.large.cells).toBe(1);
    expect(out.transitions.improved.bands.large.sum_hot_score).toBe(8);
    expect(out.transitions.improved.bands.large.max_hot_score).toBe(8);
  });

  it("per-transition total_cells equals the sum of the three per-band cells (partition invariant)", () => {
    const rows = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", 3),
      cell("C", "attributed_mrr", "improved", 7),
      cell("D", "attributed_mrr", "improved", 2),
      cell("E", "attributed_mrr", "improved", 5),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope(rows),
    );
    const entry = out.transitions.improved;
    const bandSum =
      entry.bands.small.cells + entry.bands.medium.cells + entry.bands.large.cells;
    expect(entry.total_cells).toBe(bandSum);
    expect(entry.total_cells).toBe(rows.length);
  });

  it("envelope total_hot_cells equals the sum of the four per-transition total_cells", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
        cell("E", "attributed_mrr", "improved", 2),
      ]),
    );
    const sum =
      out.transitions.improved.total_cells +
      out.transitions.degraded.total_cells +
      out.transitions.rotated.total_cells +
      out.transitions.undecidable.total_cells;
    expect(out.total_hot_cells).toBe(sum);
    expect(out.total_hot_cells).toBe(5);
  });

  it("bands scoped per transition — an improved-large cell does not carry into degraded-large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 10),
        cell("B", "attributed_mrr", "degraded", 2),
      ]),
    );
    expect(out.transitions.improved.bands.large.cells).toBe(1);
    expect(out.transitions.degraded.bands.large.cells).toBe(0);
    expect(out.transitions.degraded.bands.small.cells).toBe(1);
  });

  it("re-runs on the same input produce identical bands (deterministic partition)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 3),
      cell("B", "attributed_net_contribution", "degraded", 7),
      cell("C", "attributed_mrr", "improved", 1),
    ];
    const first = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope(rows),
    );
    const second = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([...rows]),
    );
    expect(first.transitions).toEqual(second.transitions);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeDrilldownSection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out)).toBe(
      "",
    );
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(envelope([]));
    expect(formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out)).toBe(
      "",
    );
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude drill-down");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeDrilldownSection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 3)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
  });

  it("caption names band cutoffs from band_thresholds so a reader does not have to hard-code them", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("small (1..2)");
    expect(html).toContain("medium (3..5)");
    expect(html).toContain("large (6+)");
  });

  it("omits empty (transition, band) cells from the visual table but keeps them on the envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("improved");
    expect(html).toContain("medium (3..5)");
    // envelope still ships all four transitions + three bands per:
    expect(out.transitions.degraded.total_cells).toBe(0);
    expect(out.transitions.rotated.bands.large.cells).toBe(0);
    expect(out.transitions.undecidable.bands.medium.cells).toBe(0);
  });

  it("renders per-(transition, band) cells / sum / max scalars for every non-empty combo", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "improved", 5),
        cell("C", "attributed_mrr", "degraded", 8),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("improved");
    expect(html).toContain("medium (3..5)");
    expect(html).toContain("degraded");
    expect(html).toContain("large (6+)");
  });

  it("HTML-escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 3)], {
        first_week: "2026-<W>",
        last_week: "2026-W31",
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("2026-<W>");
  });

  it("renders transition arrow labels for each transition that fires", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeDrilldownSection(out);
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
    expect(html).toContain("&harr;");
    expect(html).toContain("undecidable ?");
  });
});
