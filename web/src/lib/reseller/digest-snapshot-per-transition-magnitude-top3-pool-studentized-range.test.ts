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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-studentized-range";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([], { first_week: null, last_week: null }),
      );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([]),
      );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes sr band thresholds on envelope (1.5 / 2.5 / 3.0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([]),
      );
    expect(out.balanced_sr_max).toBe(1.5);
    expect(out.concentrated_sr_min).toBe(2.5);
    expect(out.highly_concentrated_sr_min).toBe(3.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null sr in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
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
        expect(band.partner_studentized_range).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_studentized_range).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → sr null (sigma = range = 0, 0/0 undefined)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_studentized_range).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — uniform pool (sigma == 0)", () => {
  it("flat 10-partner pool [1,...,1] → sr null uniform (sigma=0, range=0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_studentized_range).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — arithmetic (pool_count >= 2)", () => {
  it("uniform ramp [1..10] → mean 5.5, sigma sqrt(8.25) ~ 2.8723, range 9, sr ~ 3.1334", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // mean=5.5; ssq = 2*(4.5²+3.5²+2.5²+1.5²+0.5²) = 82.5; var=8.25;
    // sigma = sqrt(8.25) = 2.87228...; range = 10-1 = 9;
    // sr = 9 / 2.8722813... = 3.13339780... → 3.1334
    expect(band.partner_studentized_range).toBe(3.1334);
    // Highly-concentrated band (sr >= 3.0) — even a uniform ramp saturates
    // near sqrt(n) for n=10, so it lands in the top regime.
    expect(band.partner_studentized_range!).toBeGreaterThanOrEqual(
      out.highly_concentrated_sr_min,
    );
  });

  it("upper-outlier [1×9, 10] → mean 1.9, sigma 2.7, range 9, sr = 3.3333 (highly_concentrated)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    // mean=1.9; ssq = 9*(0.9)² + (8.1)² = 7.29 + 65.61 = 72.9;
    // var = 7.29; sigma = 2.7; range = 9; sr = 9/2.7 = 3.3333...
    expect(band.partner_studentized_range).toBe(3.3333);
    expect(band.partner_studentized_range!).toBeGreaterThanOrEqual(
      out.highly_concentrated_sr_min,
    );
  });

  it("extreme outlier [1×9, 100] → sr ~ 3.3333 (SR saturates near sqrt(n))", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    // mean=10.9; ssq = 9*(9.9)² + (89.1)² = 882.09 + 7938.81 = 8820.9;
    // var = 882.09; sigma = 29.7; range = 99; sr = 99/29.7 = 3.3333...
    expect(band.partner_studentized_range).toBe(3.3333);
    expect(band.partner_studentized_range!).toBeGreaterThanOrEqual(
      out.highly_concentrated_sr_min,
    );
  });

  it("two-partner pool [1, 9] → mean 5, sigma 4, range 8, sr = 2.0 (moderate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    // mean=5; ssq = 16+16 = 32; var=16; sigma=4; range=8; sr=2.0
    expect(band.partner_studentized_range).toBe(2);
    // Moderate band (sr in [1.5, 2.5))
    expect(band.partner_studentized_range!).toBeGreaterThanOrEqual(
      out.balanced_sr_max,
    );
    expect(band.partner_studentized_range!).toBeLessThan(
      out.concentrated_sr_min,
    );
  });

  it("two-partner pool [1, 100] → sr = 2.0 exactly (theoretical n=2 ceiling)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    // mean=50.5; ssq = (49.5)²*2 = 4900.5; var=2450.25; sigma=49.5;
    // range=99; sr = 99/49.5 = 2.0
    expect(band.partner_studentized_range).toBe(2);
  });

  it("bounded codomain: sr in [0, +Inf) but saturates near sqrt(n) across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50], // upper-outlier
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1], // "lower-outlier" — position doesn't matter
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], // uniform ramp
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10], // 50/50 split
    ];
    for (const pool of pools) {
      const out =
        computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
          envelope(partnerPool(pool)),
        );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_studentized_range).not.toBeNull();
      expect(band.partner_studentized_range!).toBeGreaterThanOrEqual(0);
      // Practical upper bound near sqrt(n*(n-1)) ~ sqrt(90) ~ 9.49 for
      // n=10 — the loose theoretical bound. Real single-outlier
      // saturation is near sqrt(n) ~ 3.16.
      expect(band.partner_studentized_range!).toBeLessThan(
        Math.sqrt(band.partner_pool_count * (band.partner_pool_count - 1)) +
          1e-9,
      );
    }
  });

  it("rank-order invariance: same shares in any input order yield same sr (formula is symmetric)", () => {
    const a =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
      );
    const b =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    expect(a.transitions.improved.bands.medium.partner_studentized_range).toBe(
      b.transitions.improved.bands.medium.partner_studentized_range,
    );
  });

  it("50/50 split [1×5, 10×5] → mean=5.5, sigma=4.5, range=9, sr=2.0 exactly (moderate)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    // mean=5.5; ssq = 5*(4.5)² + 5*(4.5)² = 202.5; var = 20.25;
    // sigma = 4.5; range = 9; sr = 9/4.5 = 2.0
    expect(band.partner_studentized_range).toBe(2);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — metric-pool parity", () => {
  it("metric_studentized_range computed identically from KPI-count map (10-KPI uniform ramp → 3.1334)", () => {
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(rows),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_studentized_range).toBe(3.1334);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1), // small
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1), // medium
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1), // large
    ];
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(rows),
      );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      ),
    ).toBe("");
  });

  it("renders STUDENTIZED RANGE heading + SR labels for populated bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).toContain("STUDENTIZED RANGE");
    expect(html).toContain("SR ");
    expect(html).toContain("highly_concentrated");
    expect(html).toContain("partner SR");
    expect(html).toContain("KPI SR");
  });

  it("renders solo label for pool_count == 1", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([cell("A", "attributed_mrr", "improved", 2)]),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).toContain("solo");
  });

  it("renders uniform label for flat pool (sigma == 0)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).toContain("uniform");
  });

  it("renders highly_concentrated label for extreme outlier pool", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).toContain("highly_concentrated");
  });

  it("renders moderate label for two-partner pool sr = 2.0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope(partnerPool([1, 9])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).toContain("moderate");
  });

  it("HTML escapes week labels", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRange(
        envelope([cell("A", "attributed_mrr", "improved", 2)], {
          first_week: "<script>",
          last_week: "'or'1'='1",
        }),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolStudentizedRangeSection(
        out,
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
