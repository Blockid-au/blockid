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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-atkinson";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("Atkinson epsilon anchor is 0.5 (income-literature standard reduction rate)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([]),
    );
    expect(out.epsilon).toBe(0.5);
  });

  it("Atkinson cutoffs anchor to income-literature 0.05 / 0.15 fractions with high > moderate > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([]),
    );
    expect(out.high_atkinson_min).toBe(0.15);
    expect(out.moderate_atkinson_min).toBe(0.05);
    expect(out.high_atkinson_min).toBeGreaterThan(out.moderate_atkinson_min);
    expect(out.moderate_atkinson_min).toBeGreaterThan(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + atkinson null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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
        expect(band.partner_atkinson).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_atkinson).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson — Atkinson arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → Atkinson 0 (by definition)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_atkinson).toBe(0);
    expect(band.metric_atkinson).toBe(0);
  });

  it("perfectly flat pool (N partners, 1 cell each) → Atkinson 0", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_atkinson).toBe(0);
  });

  it("two-partner [3, 1] split → Atkinson 0.0670 (moderate band)", () => {
    // shares=[0.75, 0.25], n=2. (√0.75 + √0.25)² = (0.8660 + 0.5)²
    //   = 1.3660² = 1.8660. A = 1 - 1.8660/2 = 0.0670.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_atkinson).toBeCloseTo(0.067, 4);
    expect(band.partner_atkinson!).toBeGreaterThanOrEqual(
      out.moderate_atkinson_min,
    );
    expect(band.partner_atkinson!).toBeLessThan(out.high_atkinson_min);
  });

  it("dominant partner in a small pool [6,1,1] → Atkinson 0.1751 crosses high cutoff", () => {
    // shares=[0.75, 0.125, 0.125], n=3. (√0.75 + 2·√0.125)²
    //   = (0.86603 + 2·0.35355)² = 1.57313² = 2.4747.
    //   A = 1 - 2.4747/3 = 0.17510 → 0.1751 at 4dp.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_atkinson).toBe(0.1751);
    expect(band.partner_atkinson!).toBeGreaterThanOrEqual(
      out.high_atkinson_min,
    );
  });

  it("Atkinson is rounded to 4 decimals for weekly-digest stability", () => {
    // 3 partners: 4, 3, 2 cells. shares=[4/9, 3/9, 2/9], n=3.
    // √s = [0.6667, 0.5774, 0.4714]; Σ = 1.7154; Σ² = 2.9427.
    // A = 1 - 2.9427/3 = 0.0191.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_atkinson).toBe(0.0191);
  });

  it("Atkinson in [0, 1 - 1/n] and never negative", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    // n=2 upper bound: 1 - 1/2 = 0.5.
    expect(band.partner_atkinson!).toBeGreaterThanOrEqual(0);
    expect(band.partner_atkinson!).toBeLessThanOrEqual(0.5);
    expect(band.metric_atkinson!).toBeGreaterThanOrEqual(0);
    expect(band.metric_atkinson!).toBeLessThanOrEqual(0.5);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_atkinson).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs (2 each) → metric Atkinson 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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
    expect(band.metric_atkinson).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output Atkinson values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("[9,1]-shape two-partner pool → Atkinson 0.2000 (high band)", () => {
    // shares=[0.9, 0.1], n=2. (√0.9 + √0.1)² = (0.94868 + 0.31623)²
    //   = 1.26491² = 1.60000. A = 1 - 1.60000/2 = 0.20000.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_atkinson).toBe(0.2);
    expect(band.partner_atkinson!).toBeGreaterThanOrEqual(
      out.high_atkinson_min,
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool Atkinson");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label when pool has exactly 1 partner", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("solo");
  });

  it("renders high label when Atkinson crosses the high cutoff", () => {
    // [6,1,1] shape crosses Atkinson >= 0.15 (0.1750)
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("high");
  });

  it("renders balanced label when Atkinson stays below the moderate cutoff", () => {
    // 5 partners each with 1 cell — Atkinson = 0, balanced.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("balanced");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption mentions Atkinson and the HHI + Gini + Theil companions", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    expect(html).toContain("Atkinson");
    expect(html).toContain("P11.163 HHI");
    expect(html).toContain("P11.169 Gini");
    expect(html).toContain("P11.171 Theil");
  });

  it("caption surfaces the epsilon parameter for JSONL parity", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinson(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolAtkinsonSection(out);
    // Renders as &epsilon;=0.5 via toFixed(1) on the numeric epsilon.
    expect(html).toContain("&epsilon;=0.5");
  });
});
