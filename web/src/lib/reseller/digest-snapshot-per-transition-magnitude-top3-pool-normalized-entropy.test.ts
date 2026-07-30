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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-normalized-entropy";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("evenness cutoffs anchor to Pielou 0.7 / 0.9 with high > moderate > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([]),
      );
    expect(out.high_evenness_min).toBe(0.9);
    expect(out.moderate_evenness_min).toBe(0.7);
    expect(out.high_evenness_min).toBeGreaterThan(out.moderate_evenness_min);
    expect(out.moderate_evenness_min).toBeGreaterThan(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + normalized_entropy null in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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
        expect(band.partner_normalized_entropy).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_normalized_entropy).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy — normalized-entropy arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → H_norm 1 (solo convention)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_normalized_entropy).toBe(1);
    expect(band.metric_normalized_entropy).toBe(1);
  });

  it("perfectly flat pool (N partners, 1 cell each) → H_norm 1", () => {
    // uniform 4-share distribution: H = ln(4); H_norm = ln(4)/ln(4) = 1.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_normalized_entropy).toBe(1);
  });

  it("two-partner [3, 1] split → H_norm ≈ 0.8113 (mixed band)", () => {
    // shares 0.75, 0.25. H = -0.75 ln 0.75 - 0.25 ln 0.25
    //   = 0.75 × 0.2877 + 0.25 × 1.3863 = 0.2158 + 0.3466 = 0.5623.
    // H_norm = 0.5623 / ln(2) = 0.5623 / 0.6931 = 0.8113.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_normalized_entropy).toBeCloseTo(0.8113, 3);
    expect(band.partner_normalized_entropy!).toBeGreaterThanOrEqual(
      out.moderate_evenness_min,
    );
    expect(band.partner_normalized_entropy!).toBeLessThan(
      out.high_evenness_min,
    );
  });

  it("dominant partner in small pool [6,1,1] → H_norm crosses below moderate (unequal band)", () => {
    // shares 6/8, 1/8, 1/8 → s=[0.75, 0.125, 0.125].
    // H = -0.75×ln(0.75) - 2×(0.125×ln(0.125))
    //   = 0.75×0.2877 + 2×(0.125×2.0794)
    //   = 0.2158 + 0.5199 = 0.7356.
    // H_norm = 0.7356 / ln(3) = 0.7356 / 1.0986 = 0.6695. Below 0.7 → unequal.
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_normalized_entropy).toBeCloseTo(0.6695, 2);
    expect(band.partner_normalized_entropy!).toBeLessThan(
      out.moderate_evenness_min,
    );
  });

  it("H_norm rounded to 4 decimals for weekly-digest stability", () => {
    // 3 partners: 4, 3, 2 cells / 9 total.
    // shares 4/9, 3/9, 2/9 ≈ [0.4444, 0.3333, 0.2222].
    // H = -(0.4444 ln 0.4444 + 0.3333 ln 0.3333 + 0.2222 ln 0.2222)
    //   ≈ 0.3603 + 0.3662 + 0.3342 = 1.0607
    // H_norm = 1.0607 / ln(3) = 1.0607 / 1.0986 = 0.9656 (rounded).
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_normalized_entropy).toBe(0.9656);
  });

  it("H_norm in [0, 1] and never negative", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_normalized_entropy!).toBeGreaterThanOrEqual(0);
    expect(band.partner_normalized_entropy!).toBeLessThanOrEqual(1);
    expect(band.metric_normalized_entropy!).toBeGreaterThanOrEqual(0);
    expect(band.metric_normalized_entropy!).toBeLessThanOrEqual(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([
          cell("ACME", "attributed_mrr", "improved", 1),
          cell("BETA", "commission_cleared_mtd", "degraded", 1),
        ]),
      );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(
      out.transitions.improved.bands.medium.partner_normalized_entropy,
    ).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs (2 each) → metric H_norm 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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
    expect(band.metric_normalized_entropy).toBe(1);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([
          cell("A", "attributed_mrr", "stable", 1),
          cell("B", "attributed_mrr", "first_classification", 1),
          cell("C", "attributed_mrr", "improved", 1),
        ]),
      );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output H_norm values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("[9,1]-shape two-partner pool → H_norm ≈ 0.4690 (unequal)", () => {
    // shares 0.9, 0.1. H = -0.9 ln 0.9 - 0.1 ln 0.1
    //   = 0.9 × 0.10536 + 0.1 × 2.30259 = 0.09483 + 0.23026 = 0.32508.
    // H_norm = 0.32508 / ln(2) = 0.32508 / 0.6931 = 0.4690.
    const rows: PerPairHotCellRow[] = [
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_normalized_entropy).toBeCloseTo(0.469, 2);
    expect(band.partner_normalized_entropy!).toBeLessThan(
      out.moderate_evenness_min,
    );
  });

  it("[4,4,1,1,1] shoulder-heavy pool → H_norm ≈ 0.8618 (mixed band)", () => {
    // Ops case B from docblock. shares 4/11, 4/11, 1/11, 1/11, 1/11.
    // H = -2×(4/11 × ln(4/11)) - 3×(1/11 × ln(1/11))
    //   = -2×0.3636×(-1.0116) - 3×0.0909×(-2.3979)
    //   = 2×0.3679 + 3×0.2180
    //   = 0.7357 + 0.6539 = 1.3896.
    // H_norm = 1.3896 / ln(5) = 1.3896 / 1.6094 = 0.8634. Between 0.7 and 0.9 → mixed.
    const rows: PerPairHotCellRow[] = [
      // partner A gets 4 cells
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      // partner B gets 4 cells
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("B", "contribution_margin_pct", "improved", 4),
      // partners C, D, E get 1 cell each
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
      cell("E", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(5);
    expect(band.partner_pool_cells).toBe(11);
    expect(band.partner_normalized_entropy).toBeCloseTo(0.8634, 2);
    expect(band.partner_normalized_entropy!).toBeGreaterThanOrEqual(
      out.moderate_evenness_min,
    );
    expect(band.partner_normalized_entropy!).toBeLessThan(
      out.high_evenness_min,
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([], { window_size: 4 }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      ),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).not.toBe("");
    expect(html).toContain(
      "Per-transition magnitude TOP-3 pool normalized entropy",
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([
          cell("A", "attributed_mrr", "improved", 2),
          cell("B", "attributed_mrr", "degraded", 4),
          cell("C", "attributed_mrr", "rotated", 1),
          cell("D", "attributed_mrr", "undecidable", 1),
        ]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label when pool has exactly 1 partner", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders unequal label when H_norm falls below the moderate cutoff", () => {
    // [6,1,1] shape gives H_norm ≈ 0.67 < 0.7 → unequal
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("unequal");
  });

  it("renders uniform label when H_norm crosses the high cutoff", () => {
    // 5 partners with 1 cell each — H_norm = 1 → uniform.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("uniform");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<W25>",
          last_week: '"W31"',
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption mentions normalized entropy and the HHI + Gini + Theil + Atkinson + CV QUINTET companions", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropySection(
        out,
      );
    expect(html).toContain("Normalized Shannon entropy");
    expect(html).toContain("P11.163 HHI");
    expect(html).toContain("P11.169 Gini");
    expect(html).toContain("P11.171 Theil");
    expect(html).toContain("P11.173 Atkinson");
    expect(html).toContain("P11.175 CV");
  });

  it("Theil complement identity: H_norm ≈ 1 - T/ln(n) for the same [3,1] pool as P11.171 Theil test", () => {
    // shares 0.75, 0.25 → Theil T = 0.75×ln(0.75×2) + 0.25×ln(0.25×2)
    //   = 0.75×0.4055 + 0.25×(-0.6931) = 0.3041 - 0.1733 = 0.1308.
    // ln(n=2) = 0.6931. Complement identity: H_norm = 1 - T/ln(n)
    //   = 1 - 0.1308/0.6931 = 1 - 0.1887 = 0.8113 (matches direct
    // computation from the earlier arithmetic test).
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolNormalizedEntropy(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    // Direct entropy gave 0.8113; the Theil complement gives 0.8113 too.
    expect(band.partner_normalized_entropy).toBeCloseTo(0.8113, 3);
  });
});
