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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-rosenbluth";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes normalized ri band thresholds on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([]),
    );
    expect(out.balanced_ri_normalized_max).toBe(0.1);
    expect(out.concentrated_ri_normalized_min).toBe(0.3);
    expect(out.highly_concentrated_ri_normalized_min).toBe(0.6);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ri in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
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
        expect(band.partner_rosenbluth).toBeNull();
        expect(band.partner_rosenbluth_normalized).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_rosenbluth).toBeNull();
        expect(band.metric_rosenbluth_normalized).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ri 1 (monopoly by definition), normalized null", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_rosenbluth).toBe(1);
    // Normalized is undefined for n=1 (0/0) so downstream label "solo"
    // fires from pool_count == 1 rather than the band cutoffs.
    expect(band.partner_rosenbluth_normalized).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1,...,1] → ri = 0.1 (= 1/n), normalized = 0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_rosenbluth).toBe(0.1);
    expect(band.partner_rosenbluth_normalized).toBe(0);
  });

  it("flat 2-partner pool [3, 3] → ri = 0.5 (= 1/n), normalized = 0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_rosenbluth).toBe(0.5);
    expect(band.partner_rosenbluth_normalized).toBe(0);
  });

  it("uniform ramp 10-partner pool [10,9,...,1] → ri ~ 0.1429 (= 1/7), normalized ~ 0.0476", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // sum(i*(11-i)/55) for i=1..10 = 220/55 = 4; ri = 1/(2*4-1) = 1/7 = 0.142857
    expect(band.partner_rosenbluth).toBe(0.1429);
    // (0.142857 - 0.1) / 0.9 = 0.047619 → 0.0476
    expect(band.partner_rosenbluth_normalized).toBe(0.0476);
  });

  it("upper-outlier 10-partner pool [1,...,1,10] → ri ~ 0.1743, normalized ~ 0.0826 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    // Shares DESC: 10/19, 1/19×9. sum = 1*(10/19) + (2+...+10)*(1/19) = 64/19
    // ri = 1/(128/19 - 1) = 19/109 = 0.174312
    expect(band.partner_rosenbluth).toBe(0.1743);
    // (0.174312 - 0.1) / 0.9 = 0.082569 → 0.0826
    expect(band.partner_rosenbluth_normalized).toBe(0.0826);
    // Balanced band (normalized < 0.10) — rank-weighting keeps single
    // outlier well within balanced even at 10x pull.
    expect(band.partner_rosenbluth_normalized!).toBeLessThan(
      out.balanced_ri_normalized_max,
    );
  });

  it("two-shoulders 10-partner pool [1×8, 5, 5] → ri ~ 0.1552, normalized ~ 0.0613 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    // Shares DESC: 5/18, 5/18, 1/18×8. sum = 1*(5/18) + 2*(5/18) + (3+...+10)*(1/18) = 67/18
    // ri = 1/(134/18 - 1) = 18/116 = 0.155172
    expect(band.partner_rosenbluth).toBe(0.1552);
    // (0.155172 - 0.1) / 0.9 = 0.061302 → 0.0613
    expect(band.partner_rosenbluth_normalized).toBe(0.0613);
  });

  it("extreme upper-outlier [1×9, 100] → ri ~ 0.5477, normalized ~ 0.4975 (concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    // Shares DESC: 100/109, 1/109×9. sum = 100/109 + 54/109 = 154/109
    // ri = 1/(308/109 - 1) = 109/199 = 0.547738
    expect(band.partner_rosenbluth).toBe(0.5477);
    // (0.547738 - 0.1) / 0.9 = 0.497486 → 0.4975
    expect(band.partner_rosenbluth_normalized).toBe(0.4975);
    // Concentrated band (normalized in [0.30, 0.60)).
    expect(band.partner_rosenbluth_normalized!).toBeGreaterThanOrEqual(
      out.concentrated_ri_normalized_min,
    );
    expect(band.partner_rosenbluth_normalized!).toBeLessThan(
      out.highly_concentrated_ri_normalized_min,
    );
  });

  it("near-monopoly [1×9, 1000] → ri ~ 0.9181, normalized ~ 0.9090 (highly_concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1000])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(1009);
    // Shares DESC: 1000/1009, 1/1009×9. sum = 1000/1009 + 54/1009 = 1054/1009
    // ri = 1/(2108/1009 - 1) = 1009/1099 = 0.918107
    expect(band.partner_rosenbluth).toBe(0.9181);
    // (0.918107 - 0.1) / 0.9 = 0.909008 → 0.9090
    expect(band.partner_rosenbluth_normalized).toBe(0.909);
    expect(band.partner_rosenbluth_normalized!).toBeGreaterThanOrEqual(
      out.highly_concentrated_ri_normalized_min,
    );
  });

  it("two-partner pool [1, 9] → ri = 0.8333, normalized ~ 0.6667 (highly_concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 9])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    // Shares DESC: 9/10, 1/10. sum = 0.9 + 0.2 = 1.1. ri = 1/1.2 = 0.833333
    expect(band.partner_rosenbluth).toBe(0.8333);
    // Floor for n=2 = 0.5. (0.833333 - 0.5) / 0.5 = 0.666667 → 0.6667
    expect(band.partner_rosenbluth_normalized).toBe(0.6667);
    expect(band.partner_rosenbluth_normalized!).toBeGreaterThanOrEqual(
      out.highly_concentrated_ri_normalized_min,
    );
  });

  it("bounded codomain: ri in [1/n, 1] and normalized in [0, 1] across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50], // upper-outlier
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1], // "lower-outlier" — position doesn't matter
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // uniform ramp
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], // flat non-unit
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10], // 50/50 split
    ];
    for (const pool of pools) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
        envelope(partnerPool(pool)),
      );
      const band = out.transitions.improved.bands.medium;
      const n = band.partner_pool_count;
      expect(band.partner_rosenbluth).not.toBeNull();
      expect(band.partner_rosenbluth!).toBeGreaterThanOrEqual(1 / n - 1e-9);
      expect(band.partner_rosenbluth!).toBeLessThanOrEqual(1 + 1e-9);
      expect(band.partner_rosenbluth_normalized).not.toBeNull();
      expect(band.partner_rosenbluth_normalized!).toBeGreaterThanOrEqual(0);
      expect(band.partner_rosenbluth_normalized!).toBeLessThanOrEqual(1);
    }
  });

  it("rank-order invariance: same shares in any input order yield same ri (formula sorts DESC internally)", () => {
    const a = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const b = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(a.transitions.improved.bands.medium.partner_rosenbluth).toBe(
      b.transitions.improved.bands.medium.partner_rosenbluth,
    );
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — metric-pool parity", () => {
  it("metric_rosenbluth computed identically from KPI-count map (10-KPI uniform ramp → 0.1429)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_rosenbluth).toBe(0.1429);
    expect(band.metric_rosenbluth_normalized).toBe(0.0476);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out),
    ).toBe("");
  });

  it("renders ROSENBLUTH heading + ri + norm + numbers-equivalent labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out);
    expect(html).toContain("ROSENBLUTH INDEX");
    expect(html).toContain("ri ");
    expect(html).toContain("norm ");
    expect(html).toContain("1/ri");
    expect(html).toContain("effective partners");
    expect(html).toContain("concentrated");
    expect(html).toContain("partner ri");
    expect(html).toContain("KPI ri");
  });

  it("renders solo label for pool_count == 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out);
    expect(html).toContain("solo");
  });

  it("renders balanced label for flat pool (normalized = 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out);
    expect(html).toContain("balanced");
  });

  it("renders highly_concentrated label for near-monopoly pool (normalized ~ 0.909)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1000])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out);
    expect(html).toContain("highly_concentrated");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluth(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolRosenbluthSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
