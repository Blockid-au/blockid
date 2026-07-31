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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-gini-mean-difference";

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
 * If a count > KPI_CATALOG.length the KPI index wraps modulo the catalog
 * length (same partner, repeat KPIs) — the partner-map still receives +1
 * per row so the pool arithmetic is correct.
 */
function partnerPool(counts: number[]): PerPairHotCellRow[] {
  const rows: PerPairHotCellRow[] = [];
  const codes = "ABCDEFGHIJKLMNOPQRST".split("");
  counts.forEach((c, idx) => {
    for (let i = 0; i < c; i++) {
      rows.push(
        cell(codes[idx], KPI_CATALOG[i % KPI_CATALOG.length], "improved", 4),
      );
    }
  });
  return rows;
}

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes gmd band thresholds on envelope (1.0 / 5.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([]),
      );
    expect(out.tight_gmd_max).toBe(1.0);
    expect(out.wide_gmd_min).toBe(5.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null gmd in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
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
        expect(band.partner_gmd).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_gmd).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → gmd null (no pair exists)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_gmd).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → gmd 0 (tight; every pair diff is zero)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_gmd).toBe(0);
  });

  it("flat 2-partner pool [3,3] → gmd 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([3, 3])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_gmd).toBe(0);
  });

  it("uniform ramp [1..10] → sum_{i<j} 165, gmd = 2·165/90 = 3.6667 (spread)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // sum_{i<j}|x_i-x_j| for x=[1..10]:
    //   d=1: 9 pairs, d=2: 8 pairs, ..., d=9: 1 pair
    //   sum d*(10-d) for d=1..9 = 9+16+21+24+25+24+21+16+9 = 165
    //   gmd = 2·165 / (10·9) = 330/90 = 3.6667
    expect(band.partner_gmd).toBe(3.6667);
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.tight_gmd_max);
    expect(band.partner_gmd!).toBeLessThan(out.wide_gmd_min);
  });

  it("upper-outlier [1×9,10] → 9 pairs of (1,10) → sum 81, gmd = 2·81/90 = 1.8 (spread)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_gmd).toBe(1.8);
    // spread band [1.0, 5.0)
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.tight_gmd_max);
    expect(band.partner_gmd!).toBeLessThan(out.wide_gmd_min);
  });

  it("two-shoulders [1×8, 5×2] → 16 pairs of (1,5) → sum 64, gmd = 2·64/90 = 1.4222 (spread)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_gmd).toBe(1.4222);
  });

  it("50/50 split [1×5, 10×5] → 25 pairs of (1,10) → sum 225, gmd = 2·225/90 = 5.0 exactly (wide floor)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_gmd).toBe(5);
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.wide_gmd_min);
  });

  it("extreme outlier [1×9, 100] → 9 pairs of (1,100) → sum 891, gmd = 2·891/90 = 19.8 (wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_gmd).toBe(19.8);
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.wide_gmd_min);
  });

  it("two-partner pool [1, 9] → 1 pair diff 8, gmd = 2·8/2 = 8.0 (wide)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_gmd).toBe(8);
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.wide_gmd_min);
  });

  it("rank-order invariance: same shares in any input order yield same gmd (pairwise fold is symmetric)", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(a.transitions.improved.bands.medium.partner_gmd).toBe(
      b.transitions.improved.bands.medium.partner_gmd,
    );
  });

  it("codomain: gmd >= 0 across pathological pools and bounded above by max_diff", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50], // upper-outlier
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1], // "lower-outlier" — position doesn't matter
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // uniform ramp
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10], // 50/50 split
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_gmd).not.toBeNull();
      expect(band.partner_gmd!).toBeGreaterThanOrEqual(0);
      // GMD cannot exceed (max - min) since it's a MEAN of pairwise
      // absolute differences and each such difference is <= (max - min).
      const maxDiff = Math.max(...pool) - Math.min(...pool);
      expect(band.partner_gmd!).toBeLessThanOrEqual(maxDiff + 1e-9);
    }
  });

  it("small pool [10,1,1] → 2 pairs of (10,1)=9 + 1 pair of (1,1)=0 → sum 18, gmd = 2·18/6 = 6.0 (wide)", () => {
    // GMD equals 2·mean·G_biased·n/(n-1) so on a single-outlier
    // 3-partner pool it lands ABOVE MAD (MAD 4 wide vs GMD 6 wide)
    // rather than below — pairwise differences aggregate outliers
    // MORE strongly than mean-anchored deviations because every
    // outlier participates in n-1 non-zero pairs while contributing
    // to just one mean-deviation. Documented so a future reader does
    // not expect GMD to under-count outliers.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([10, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_gmd).toBe(6);
    expect(band.partner_gmd!).toBeGreaterThanOrEqual(out.wide_gmd_min);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — metric-pool parity", () => {
  it("metric_gmd computed identically from KPI-count map (10-KPI uniform ramp → 3.6667)", () => {
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_gmd).toBe(3.6667);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
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
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
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

  it("degraded + rotated + undecidable each track independently", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "degraded", 4),
      cell("B", "attributed_mrr", "rotated", 4),
      cell("C", "attributed_mrr", "undecidable", 4),
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(rows),
      );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      ),
    ).toBe("");
  });

  it("renders GINI MEAN DIFFERENCE heading + GMD labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).toContain("GINI MEAN DIFFERENCE");
    expect(html).toContain("GMD ");
    expect(html).toContain("wide");
    expect(html).toContain("partner GMD");
    expect(html).toContain("KPI GMD");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (gmd == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).toContain("tight");
  });

  it("renders spread label for uniform ramp (gmd = 3.6667)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).toContain("spread");
  });

  it("renders wide label for two-partner pool [1,9] (gmd = 8.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope(partnerPool([1, 9])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).toContain("wide");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifference(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolGiniMeanDifferenceSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
