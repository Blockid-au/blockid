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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-palma";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes palma band thresholds + min_pool_count on envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([]),
    );
    expect(out.egalitarian_palma_max).toBe(0.5);
    expect(out.concentrated_palma_min).toBe(1.5);
    expect(out.highly_concentrated_palma_min).toBe(3.0);
    expect(out.min_pool_count_for_palma).toBe(10);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null tails/palma in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
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
        expect(band.partner_top10_count).toBeNull();
        expect(band.partner_top10_cells).toBeNull();
        expect(band.partner_bottom40_count).toBeNull();
        expect(band.partner_bottom40_cells).toBeNull();
        expect(band.partner_palma).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_palma).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — small_pool structural null (pool_count < 10)", () => {
  it("solo cell (1 partner) → palma null (small_pool)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top10_count).toBeNull();
    expect(band.partner_bottom40_count).toBeNull();
    expect(band.partner_palma).toBeNull();
  });

  it("9-partner pool → palma null (small_pool — top10+bottom40+middle slices collapse for n<10)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(9);
    expect(band.partner_palma).toBeNull();
  });

  it("boundary just below floor: 9-partner null; 10-partner computes", () => {
    const nine = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(nine.transitions.improved.bands.medium.partner_palma).toBeNull();
    const ten = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    expect(ten.transitions.improved.bands.medium.partner_palma).not.toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — arithmetic (pool_count >= 10)", () => {
  it("flat 10-partner pool [1,...,1] → palma = 0.25 (egalitarian — bottom 40% has 4x more partners than top 10%)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_top10_count).toBe(1);
    expect(band.partner_top10_cells).toBe(1);
    expect(band.partner_bottom40_count).toBe(4);
    expect(band.partner_bottom40_cells).toBe(4);
    expect(band.partner_palma).toBe(0.25);
  });

  it("uniform ramp 10-partner pool [10,9,...,1] → palma = 1.0 (balanced)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // sorted ascending: [1,2,3,4,5,6,7,8,9,10]
    // top10_count = max(1, round(10*0.1)) = 1
    // bottom40_count = max(1, round(10*0.4)) = 4
    // top10_cells = 10; bottom40_cells = 1+2+3+4 = 10; palma = 1.0
    expect(band.partner_top10_count).toBe(1);
    expect(band.partner_top10_cells).toBe(10);
    expect(band.partner_bottom40_count).toBe(4);
    expect(band.partner_bottom40_cells).toBe(10);
    expect(band.partner_palma).toBe(1);
  });

  it("upper-outlier 10-partner pool [1,1,1,1,1,1,1,1,1,10] → palma = 2.5 (concentrated)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    // sorted ascending: [1,1,1,1,1,1,1,1,1,10]
    // top10 = 10; bottom40 = 1+1+1+1 = 4; palma = 10/4 = 2.5
    expect(band.partner_top10_count).toBe(1);
    expect(band.partner_top10_cells).toBe(10);
    expect(band.partner_bottom40_count).toBe(4);
    expect(band.partner_bottom40_cells).toBe(4);
    expect(band.partner_palma).toBe(2.5);
  });

  it("highly-skewed 20-partner pool [15 on top, 1 each on 19 others] → palma = 3.75 (highly_concentrated)", () => {
    // 20 partners: 19 emit 1 cell each, 1 emits 15 cells. Total = 34.
    // sorted ascending: [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,15]
    // top10_count = max(1, round(20*0.1)) = 2
    // bottom40_count = max(1, round(20*0.4)) = 8
    // top10_cells = 15 + 1 = 16; bottom40_cells = 8; palma = 16/8 = 2.0
    // Hmm that's still concentrated not highly_concentrated. Let me use n=10
    // with a bigger tip.
    // For a n=10 pool [1,1,1,1,1,1,1,1,1,12]:
    // top10 = 12; bottom40 = 4; palma = 12/4 = 3.0 → highly_concentrated
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 12])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(21);
    expect(band.partner_top10_count).toBe(1);
    expect(band.partner_top10_cells).toBe(12);
    expect(band.partner_bottom40_count).toBe(4);
    expect(band.partner_bottom40_cells).toBe(4);
    expect(band.partner_palma).toBe(3);
    expect(band.partner_palma!).toBeGreaterThanOrEqual(
      out.highly_concentrated_palma_min,
    );
  });

  it("larger pool n=20 [15,1×19] → palma = 2.0 (top10=2 partners captures 16 cells, bottom40=8 captures 8)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(
        partnerPool([15, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      ),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(20);
    // sorted ascending: 19 ones then 15 → [1,1,...,1,15]
    // top10_count = max(1, round(20*0.1)) = 2 (top 2 partners: 15 + 1 = 16)
    // bottom40_count = max(1, round(20*0.4)) = 8 (bottom 8 partners: all 1s = 8)
    // palma = 16/8 = 2.0
    expect(band.partner_top10_count).toBe(2);
    expect(band.partner_top10_cells).toBe(16);
    expect(band.partner_bottom40_count).toBe(8);
    expect(band.partner_bottom40_cells).toBe(8);
    expect(band.partner_palma).toBe(2);
  });

  it("codomain lower bound: flat pool with pool_cells > 0 → palma exactly 0.25 (bottom 40% is 4x top 10%)", () => {
    // 10 identical partners each emit k cells → sum_top10 = k,
    // sum_bottom40 = 4k, palma = 0.25 for every k > 0.
    for (const k of [1, 3, 7]) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
        envelope(partnerPool(new Array(10).fill(k) as number[])),
      );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_palma).toBe(0.25);
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — metric-pool parity", () => {
  it("metric_palma computed identically from KPI-count map (10-KPI uniform ramp → palma 1.0)", () => {
    // 10 KPIs with counts matching partner pool [10,9,...,1] → palma = 1.0.
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_top10_cells).toBe(10);
    expect(band.metric_bottom40_cells).toBe(10);
    expect(band.metric_palma).toBe(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(out),
    ).toBe("");
  });

  it("renders PALMA heading + palma + top/bot labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 12])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).toContain("PALMA RATIO");
    expect(html).toContain("palma");
    expect(html).toContain("top1");
    expect(html).toContain("bot4");
    expect(html).toContain("highly_concentrated");
    expect(html).toContain("partner palma");
    expect(html).toContain("KPI palma");
  });

  it("renders small_pool label for pool_count in [1,9]", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([4, 3])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).toContain("small_pool");
  });

  it("renders egalitarian label for flat 10-partner pool (palma = 0.25)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).toContain("egalitarian");
  });

  it("renders balanced label for uniform ramp (palma = 1.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([10, 9, 8, 7, 6, 5, 4, 3, 2, 1])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).toContain("balanced");
  });

  it("renders concentrated label for upper-outlier pool (palma = 2.5)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).toContain("concentrated");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPalma(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolPalmaSection(
      out,
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
