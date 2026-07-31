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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-hoover";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes hoover band thresholds on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([]),
    );
    expect(out.balanced_hoover_max).toBe(0.1);
    expect(out.concentrated_hoover_min).toBe(0.3);
    expect(out.highly_concentrated_hoover_min).toBe(0.5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null hoover in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
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
        expect(band.partner_hoover).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_hoover).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → hoover 0 (trivially egalitarian)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_hoover).toBe(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1,...,1] → hoover = 0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_hoover).toBe(0);
  });

  it("flat 2-partner pool [3, 3] → hoover = 0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_hoover).toBe(0);
  });

  it("uniform ramp 10-partner pool [10,9,...,1] → hoover ~ 0.2273 (moderate)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // 0.5 * sum |i/55 - 1/10| = 0.5 * 50/110 = 25/110 = 0.22727... → 0.2273
    expect(band.partner_hoover).toBe(0.2273);
  });

  it("upper-outlier 10-partner pool [1,1,1,1,1,1,1,1,1,10] → hoover = 0.4263 (concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    // Nine at 1/19, one at 10/19. Deviation from 1/10:
    // nine * |1/19 - 1/10| + |10/19 - 1/10| = 9*(9/190) + 81/190 = 162/190
    // hoover = 0.5 * 162/190 = 81/190 ≈ 0.4263
    expect(band.partner_hoover).toBe(0.4263);
    expect(band.partner_hoover!).toBeGreaterThanOrEqual(
      out.concentrated_hoover_min,
    );
    expect(band.partner_hoover!).toBeLessThan(
      out.highly_concentrated_hoover_min,
    );
  });

  it("two-shoulders 10-partner pool [1×8, 5×2] → hoover = 0.3556 (concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    // Eight at 1/18, two at 5/18. Deviation from 1/10:
    // 8 * |1/18 - 1/10| + 2 * |5/18 - 1/10|
    // = 8*(8/180) + 2*(32/180) = 64/180 + 64/180 = 128/180
    // hoover = 0.5 * 128/180 = 64/180 ≈ 0.3556
    expect(band.partner_hoover).toBe(0.3556);
  });

  it("extreme upper-outlier [1,1,1,1,1,1,1,1,1,100] → hoover = 0.8174 (highly_concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    // Nine at 1/109, one at 100/109. Deviation from 1/10:
    // 9 * |1/109 - 1/10| + |100/109 - 1/10|
    // = 9*(99/1090) + 891/1090 = 891/1090 + 891/1090 = 1782/1090
    // hoover = 0.5 * 1782/1090 = 891/1090 ≈ 0.8174
    expect(band.partner_hoover).toBe(0.8174);
    expect(band.partner_hoover!).toBeGreaterThanOrEqual(
      out.highly_concentrated_hoover_min,
    );
  });

  it("bounded codomain [0, 1-1/n] across pathological pools (upper-outlier, symmetric, lower-outlier)", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50], // upper-outlier
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1], // lower-outlier (position doesn't matter)
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // uniform ramp
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5], // flat non-unit
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10], // 50/50 split
    ];
    for (const pool of pools) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
        envelope(partnerPool(pool)),
      );
      const band = out.transitions.improved.bands.medium;
      const n = band.partner_pool_count;
      expect(band.partner_hoover).not.toBeNull();
      expect(band.partner_hoover!).toBeGreaterThanOrEqual(0);
      expect(band.partner_hoover!).toBeLessThanOrEqual(1 - 1 / n + 1e-9);
    }
  });

  it("two-partner pool [1, 9] → hoover = 0.4 (concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 9])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    // |1/10 - 1/2| = 0.4 and |9/10 - 1/2| = 0.4; sum = 0.8; hoover = 0.4
    expect(band.partner_hoover).toBe(0.4);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — metric-pool parity", () => {
  it("metric_hoover computed identically from KPI-count map (10-KPI uniform ramp → 0.2273)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_hoover).toBe(0.2273);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(out),
    ).toBe("");
  });

  it("renders HOOVER heading + hoover + pct labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).toContain("HOOVER INDEX");
    expect(html).toContain("hoover");
    expect(html).toContain("of pool mass");
    expect(html).toContain("highly_concentrated");
    expect(html).toContain("partner hoover");
    expect(html).toContain("KPI hoover");
  });

  it("renders solo label for pool_count == 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).toContain("solo");
  });

  it("renders balanced label for flat pool (hoover = 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).toContain("balanced");
  });

  it("renders moderate label for uniform ramp (hoover ~ 0.2273)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).toContain("moderate");
  });

  it("renders concentrated label for upper-outlier pool (hoover = 0.4263)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).toContain("concentrated");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolHoover(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolHooverSection(
      out,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
