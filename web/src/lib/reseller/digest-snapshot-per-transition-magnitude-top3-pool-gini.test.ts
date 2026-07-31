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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-gini";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("Gini cutoffs anchor to plain-language 0.20 / 0.40 fractions with unequal > mixed > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([]),
    );
    expect(out.unequal_gini_min).toBe(0.4);
    expect(out.mixed_gini_min).toBe(0.2);
    expect(out.unequal_gini_min).toBeGreaterThan(out.mixed_gini_min);
    expect(out.mixed_gini_min).toBeGreaterThan(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + gini null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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
        expect(band.partner_gini).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_gini).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini — Gini arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → Gini 0 (by definition)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_gini).toBe(0);
    expect(band.metric_gini).toBe(0);
  });

  it("perfectly flat pool (N partners, 1 cell each) → Gini 0", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_gini).toBe(0);
  });

  it("two-partner unequal split [3, 1] → Gini 0.25 (mixed cutoff)", () => {
    // values=[3,1] sorted=[1,3], n=2, total=4. weighted=1*1+2*3=7.
    // G = 2*7/(2*4) - 3/2 = 14/8 - 1.5 = 0.25 → mixed
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_gini).toBeCloseTo(0.25, 4);
    expect(band.partner_gini!).toBeGreaterThanOrEqual(out.mixed_gini_min);
    expect(band.partner_gini!).toBeLessThan(out.unequal_gini_min);
  });

  it("single dominant partner in a wide pool → Gini crosses unequal cutoff", () => {
    // ACME: 6 cells across 6 KPIs; B, C: 1 each. Partner values=[6,1,1]
    // sorted=[1,1,6], n=3, total=8. weighted=1+2+18=21.
    // G = 2*21/(3*8) - 4/3 = 42/24 - 1.3333 = 1.75 - 1.3333 = 0.4167
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_gini).toBeCloseTo(0.4167, 4);
    expect(band.partner_gini!).toBeGreaterThanOrEqual(out.unequal_gini_min);
  });

  it("Gini is rounded to 4 decimals for weekly-digest stability", () => {
    // 3 partners: 4, 3, 2 cells → sorted=[2,3,4], n=3, total=9.
    // weighted = 1*2 + 2*3 + 3*4 = 20. G = 40/27 - 4/3 = 0.148148...
    // Rounded to 4 decimals: 0.1481.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_gini).toBe(0.1481);
  });

  it("Gini in [0, 1 − 1/n] and never negative", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    // n=2 upper bound: 1 - 1/2 = 0.5
    expect(band.partner_gini!).toBeGreaterThanOrEqual(0);
    expect(band.partner_gini!).toBeLessThanOrEqual(0.5);
    expect(band.metric_gini!).toBeGreaterThanOrEqual(0);
    expect(band.metric_gini!).toBeLessThanOrEqual(0.5);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_gini).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs (2 each) → metric Gini 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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
    expect(band.metric_gini).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output Gini values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const reversed = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([...rows].reverse()),
    );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("two-partner max-inequality [4, 0]-equivalent shape approaches n=2 upper bound", () => {
    // In practice a 0-cell partner is not present in the map, so max
    // inequality for pool_count=2 comes from a large-vs-small split.
    // values=[9,1] sorted=[1,9], n=2, total=10. weighted=1+18=19.
    // G = 38/20 - 1.5 = 1.9 - 1.5 = 0.4 → exactly at unequal cutoff
    const partnerRows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("A", "contribution_margin_pct", "improved", 2),
      cell("A", "clawback_exposure", "improved", 2),
      cell("A", "budget_utilization", "improved", 2),
      cell("A", "tier_mix", "improved", 2),
      cell("A", "attributed_churn_30d", "improved", 2),
      cell("A", "ledger_drift_events", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(partnerRows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_gini).toBeCloseTo(0.4, 4);
    expect(band.partner_gini!).toBeGreaterThanOrEqual(out.unequal_gini_min);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool Gini");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label when pool has exactly 1 partner", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("solo");
  });

  it("renders unequal label when Gini crosses the unequal cutoff", () => {
    // Wide pool with one big partner — Gini crosses 0.40.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("unequal");
  });

  it("renders uniform label when Gini stays below the mixed cutoff", () => {
    // 5 partners each with 1 cell — Gini = 0, uniform.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("uniform");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption mentions Gini coefficient and P11.163 HHI companion", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolGini(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniSection(out);
    expect(html).toContain("Gini coefficient");
    expect(html).toContain("P11.163 HHI");
  });
});
