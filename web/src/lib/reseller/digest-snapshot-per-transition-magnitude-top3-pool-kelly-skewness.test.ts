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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-kelly-skewness";

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

const KPI_CATALOG: KnownKpiSection[] = [
  "attributed_mrr",
  "commission_cleared_mtd",
  "attributed_net_contribution",
  "contribution_margin_pct",
  "clawback_exposure",
  "budget_utilization",
  "sandbox_share_of_budget",
  "attributed_churn_30d",
  "tier_mix",
  "ledger_drift_events",
];

/**
 * Emit partner-count pool [counts[0], counts[1], ...] in the medium band
 * (hot_score 4). Each partner code gets its own row-per-KPI count.
 */
function partnerPool(counts: number[]): PerPairHotCellRow[] {
  const rows: PerPairHotCellRow[] = [];
  const codes = "ABCDEFGHIJKLMNOP".split("");
  counts.forEach((c, idx) => {
    for (let i = 0; i < c; i++) {
      rows.push(cell(codes[idx], KPI_CATALOG[i], "improved", 4));
    }
  });
  return rows;
}

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes symmetric_kelly_abs_max=0.1 + strong_kelly_abs_min=0.3 + min_pool_count=10 on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([]),
    );
    expect(out.symmetric_kelly_abs_max).toBe(0.1);
    expect(out.strong_kelly_abs_min).toBe(0.3);
    expect(out.min_pool_count_for_kelly).toBe(10);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null deciles/kelly in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
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
        expect(band.partner_p10_cells).toBeNull();
        expect(band.partner_p50_cells).toBeNull();
        expect(band.partner_p90_cells).toBeNull();
        expect(band.partner_kelly).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_kelly).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — small_pool structural null (pool_count < 10)", () => {
  it("solo cell (1 partner) → kelly null (small_pool — deciles undefined for n<10)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_p10_cells).toBeNull();
    expect(band.partner_p50_cells).toBeNull();
    expect(band.partner_p90_cells).toBeNull();
    expect(band.partner_kelly).toBeNull();
  });

  it("9-partner pool → kelly null (small_pool — needs at least 10 cells to avoid decile-endpoint leakage)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(9);
    expect(band.partner_kelly).toBeNull();
  });

  it("boundary just below floor: 9-partner pool null; 10-partner pool computes", () => {
    const nine = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(nine.transitions.improved.bands.medium.partner_kelly).toBeNull();
    const ten = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    // flat check with distinct values succeeds → not null
    expect(ten.transitions.improved.bands.medium.partner_kelly).not.toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — degenerate (P90 == P10)", () => {
  it("flat 10-partner pool [k,...,k] → deciles collapse, kelly null (degenerate — structural indeterminacy)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_p10_cells).toBe(1);
    expect(band.partner_p50_cells).toBe(1);
    expect(band.partner_p90_cells).toBe(1);
    // P90 == P10 → denominator zero → kelly null (degenerate).
    expect(band.partner_kelly).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — arithmetic (pool_count >= 10)", () => {
  it("uniform ramp 10-partner pool [10,9,...,1] → sorted [1..10], kelly = 0 (symmetric)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // n=10, sorted [1..10]:
    // P10: h=0.9, lo=0, hi=1, w=0.9, q = 1 + 0.9*(2-1) = 1.9
    // P50: h=4.5, lo=4, hi=5, w=0.5, q = 5 + 0.5*(6-5) = 5.5
    // P90: h=8.1, lo=8, hi=9, w=0.1, q = 9 + 0.1*(10-9) = 9.1
    // Kelly = (9.1 + 1.9 - 11) / (9.1 - 1.9) = 0 / 7.2 = 0
    expect(band.partner_p10_cells).toBe(1.9);
    expect(band.partner_p50_cells).toBe(5.5);
    expect(band.partner_p90_cells).toBe(9.1);
    expect(band.partner_kelly).toBe(0);
  });

  it("upper-outlier 10-partner pool [10 partners then one @10] → sorted [1,1,1,1,1,1,1,1,1,10], kelly = 1 (saturated right)", () => {
    // Only partner J emits 10 cells (all 10 KPIs) so partner-map has 1
    // key at 10; A..I each emit 1 cell (attributed_mrr only) so partner
    // pool is [1,1,1,1,1,1,1,1,1,10] once sorted.
    const rows: PerPairHotCellRow[] = [];
    const codes = "ABCDEFGHIJ".split("");
    codes.forEach((code, idx) => {
      const emit = idx === 9 ? 10 : 1;
      for (let i = 0; i < emit; i++) {
        rows.push(cell(code, KPI_CATALOG[i], "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    // n=10, sorted [1,1,1,1,1,1,1,1,1,10]:
    // P10: h=0.9, lo=0, hi=1, w=0.9, q = 1 + 0.9*0 = 1
    // P50: h=4.5, lo=4, hi=5, w=0.5, q = 1 + 0.5*0 = 1
    // P90: h=8.1, lo=8, hi=9, w=0.1, q = 1 + 0.1*(10-1) = 1.9
    // Kelly = (1.9 + 1 - 2) / (1.9 - 1) = 0.9 / 0.9 = 1 (saturated bound)
    expect(band.partner_p10_cells).toBe(1);
    expect(band.partner_p50_cells).toBe(1);
    expect(band.partner_p90_cells).toBe(1.9);
    expect(band.partner_kelly).toBe(1);
    expect(band.partner_kelly!).toBeGreaterThanOrEqual(out.strong_kelly_abs_min);
  });

  it("lower-outlier 10-partner pool [one @1, nine @10] → sorted [1,10,10,...,10], kelly = -1 (saturated left)", () => {
    // Partner A emits 1 cell; B..J each emit 10 cells so sorted pool is
    // [1,10,10,10,10,10,10,10,10,10].
    const rows: PerPairHotCellRow[] = [];
    const codes = "ABCDEFGHIJ".split("");
    codes.forEach((code, idx) => {
      const emit = idx === 0 ? 1 : 10;
      for (let i = 0; i < emit; i++) {
        rows.push(cell(code, KPI_CATALOG[i], "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    // n=10, sorted [1,10,10,10,10,10,10,10,10,10]:
    // P10: h=0.9, lo=0, hi=1, w=0.9, q = 1 + 0.9*(10-1) = 9.1
    // P50: h=4.5, lo=4, hi=5, w=0.5, q = 10 + 0.5*0 = 10
    // P90: h=8.1, lo=8, hi=9, w=0.1, q = 10 + 0.1*0 = 10
    // Kelly = (10 + 9.1 - 20) / (10 - 9.1) = -0.9 / 0.9 = -1 (saturated bound)
    expect(band.partner_p10_cells).toBe(9.1);
    expect(band.partner_p50_cells).toBe(10);
    expect(band.partner_p90_cells).toBe(10);
    expect(band.partner_kelly).toBe(-1);
    expect(band.partner_kelly!).toBeLessThanOrEqual(-out.strong_kelly_abs_min);
  });

  it("uniform ramp 11-partner pool [11,10,...,1] → sorted [1..11], kelly = 0 (deciles land on exact ranks)", () => {
    // 11th partner emits 1 cell for the first KPI; needs an 11th code.
    // partnerPool codes A..P support up to 16 partners. But we need KPI
    // catalog length >= max count = 11; expand catalog inline.
    const extendedKpis: KnownKpiSection[] = [
      ...KPI_CATALOG,
      "attributed_mrr", // reuse — we're only counting cells per partner
    ];
    const rows: PerPairHotCellRow[] = [];
    const codes = "ABCDEFGHIJK".split("");
    codes.forEach((code, idx) => {
      const count = 11 - idx; // partner A emits 11, B emits 10, ..., K emits 1
      for (let i = 0; i < count; i++) {
        rows.push(cell(code, extendedKpis[i % extendedKpis.length], "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(11);
    // n=11, sorted [1..11]:
    // P10: h=1.0, lo=1, hi=1, q = sorted[1] = 2
    // P50: h=5.0, lo=5, hi=5, q = sorted[5] = 6
    // P90: h=9.0, lo=9, hi=9, q = sorted[9] = 10
    // Kelly = (10 + 2 - 12) / (10 - 2) = 0
    expect(band.partner_p10_cells).toBe(2);
    expect(band.partner_p50_cells).toBe(6);
    expect(band.partner_p90_cells).toBe(10);
    expect(band.partner_kelly).toBe(0);
  });

  it("bounded codomain invariant: -1 <= kelly <= +1 for every non-degenerate pool", () => {
    // Kelly's [-1, +1] bound follows from the identity ks = (P90-P50 -
    // (P50-P10)) / (P90-P10). The numerator absolute value is bounded by
    // the denominator (max of the two half-spans is <= P90-P10), so
    // |ks| <= 1. Verify over a suite of pathological pools.
    const pathological: number[][] = [
      // upper-heavy — 10 partners, last partner huge
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 1000],
      // lower-heavy mirror
      [1000, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      // symmetric bimodal
      [10, 10, 10, 10, 10, 1, 1, 1, 1, 1],
      // uniform ramp
      [10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
      // interior lean (mass shifted towards Q1)
      [1, 1, 1, 1, 1, 1, 3, 5, 8, 10],
      // interior lean (mass shifted towards Q3)
      [1, 3, 5, 8, 10, 10, 10, 10, 10, 10],
    ];
    for (const counts of pathological) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
        envelope(partnerPool(counts)),
      );
      const bands = ["small", "medium", "large"] as const;
      for (const b of bands) {
        const ks = out.transitions.improved.bands[b].partner_kelly;
        if (ks !== null) {
          expect(ks).toBeGreaterThanOrEqual(-1);
          expect(ks).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — metric-pool parity", () => {
  it("metric_kelly computed identically from KPI-count map", () => {
    // 10 KPIs with counts matching partner pool [10,9,...,1] → kelly = 0.
    const rows: PerPairHotCellRow[] = [];
    const kpiCounts: [KnownKpiSection, number][] = [
      ["attributed_mrr", 10],
      ["commission_cleared_mtd", 9],
      ["attributed_net_contribution", 8],
      ["contribution_margin_pct", 7],
      ["clawback_exposure", 6],
      ["budget_utilization", 5],
      ["sandbox_share_of_budget", 4],
      ["attributed_churn_30d", 3],
      ["tier_mix", 2],
      ["ledger_drift_events", 1],
    ];
    const codes = "ABCDEFGHIJKL".split("");
    kpiCounts.forEach(([kpi, count]) => {
      for (let i = 0; i < count; i++) {
        rows.push(cell(codes[i], kpi, "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_p10_cells).toBe(1.9);
    expect(band.metric_p50_cells).toBe(5.5);
    expect(band.metric_p90_cells).toBe(9.1);
    expect(band.metric_kelly).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.large.partner_pool_count).toBe(1);
  });

  it("ignores unknown transitions (stable, first_classification)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "stable", 2),
      cell("B", "attributed_mrr", "first_classification", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    expect(out.total_hot_cells).toBe(0);
    for (const t of [
      "improved",
      "degraded",
      "rotated",
      "undecidable",
    ] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        expect(out.transitions[t].bands[b].partner_pool_count).toBe(0);
      }
    }
  });

  it("degraded + rotated + undecidable transitions each track independently", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "degraded", 4),
      cell("B", "attributed_mrr", "rotated", 4),
      cell("C", "attributed_mrr", "undecidable", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      ),
    ).toBe("");
  });

  it("renders Kelly heading + ks + P10..P90 labels for populated bands", () => {
    // Trigger an upper-outlier saturated pool so the render exercises a
    // strong_right band populated with real ks/P-values.
    const rows: PerPairHotCellRow[] = [];
    const codes = "ABCDEFGHIJ".split("");
    codes.forEach((code, idx) => {
      const emit = idx === 9 ? 10 : 1;
      for (let i = 0; i < emit; i++) {
        rows.push(cell(code, KPI_CATALOG[i], "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).toContain("KELLY SKEWNESS");
    expect(html).toContain("ks");
    expect(html).toContain("P10");
    expect(html).toContain("P50");
    expect(html).toContain("P90");
    expect(html).toContain("strong_right");
    expect(html).toContain("partner kelly");
    expect(html).toContain("KPI kelly");
  });

  it("renders small_pool label for pool_count in [1,9]", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([4, 3])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).toContain("small_pool");
  });

  it("renders degenerate label for flat 10-partner pool (P90 == P10)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).toContain("degenerate");
  });

  it("renders symmetric label for uniform ramp (ks = 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).toContain("symmetric");
  });

  it("renders strong_left label for lower-outlier pool (ks = -1)", () => {
    // Same construction as the -1 arithmetic test.
    const rows: PerPairHotCellRow[] = [];
    const codes = "ABCDEFGHIJ".split("");
    codes.forEach((code, idx) => {
      const emit = idx === 0 ? 1 : 10;
      for (let i = 0; i < emit; i++) {
        rows.push(cell(code, KPI_CATALOG[i], "improved", 4));
      }
    });
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).toContain("strong_left");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewness(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolKellySkewnessSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
