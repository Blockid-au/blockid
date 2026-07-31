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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-q3";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes ptq3 band thresholds on envelope (2.0 / 5.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([]),
    );
    expect(out.tight_ptq3_max).toBe(2.0);
    expect(out.wide_ptq3_min).toBe(5.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ptq3 in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
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
        expect(band.partner_peak_to_q3).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_q3).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ptq3 null (no range/Q3 contrast)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_q3).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → ptq3 0 (tight; range 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_q3).toBe(0);
  });

  it("flat 2-partner pool [3,3] → ptq3 0 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_q3).toBe(0);
  });

  it("uniform ramp [1..10] → range 9, Q3 8, ptq3 = 9/8 = 1.125 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_q3).toBe(1.125);
    // tight band (< 2.0)
    expect(band.partner_peak_to_q3!).toBeLessThan(out.tight_ptq3_max);
  });

  it("upper-outlier [1×9, 10] → range 9, Q3 1, ptq3 9.0 (wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_q3).toBe(9);
    expect(band.partner_peak_to_q3!).toBeGreaterThanOrEqual(
      out.wide_ptq3_min,
    );
  });

  it("two-shoulders [1×8, 5×2] → range 4, Q3 1, ptq3 4.0 (spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_q3).toBe(4);
    // spread band [2.0, 5.0)
    expect(band.partner_peak_to_q3!).toBeGreaterThanOrEqual(
      out.tight_ptq3_max,
    );
    expect(band.partner_peak_to_q3!).toBeLessThan(out.wide_ptq3_min);
  });

  it("50/50 split [1×5, 10×5] → range 9, Q3 10, ptq3 0.9 (TIGHT — bimodal-symmetric split flagged tight; contrast with P11.242 peak-to-Q1 wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_q3).toBe(0.9);
    // Documents the intended contrast with P11.242 PTQ1 which reads
    // the same split at 9.0 (wide) because Q1 sits in the LOWER
    // cluster. PTQ3 uses Q3 = upper cluster typical partner = 10 so
    // the ratio reads 0.9 (tight).
    expect(band.partner_peak_to_q3!).toBeLessThan(out.tight_ptq3_max);
  });

  it("extreme outlier [1×9, 100] → range 99, Q3 1, ptq3 99.0 (wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_q3).toBe(99);
    expect(band.partner_peak_to_q3!).toBeGreaterThanOrEqual(
      out.wide_ptq3_min,
    );
  });

  it("two-partner pool [1, 9] → range 8, Q3 9, ptq3 0.8889 (tight — top-lean two-partner reads tight where PTQ1 reads wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 9])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_q3).toBe(0.8889);
    expect(band.partner_peak_to_q3!).toBeLessThan(out.tight_ptq3_max);
  });

  it("two-partner pool [1, 100] → range 99, Q3 100, ptq3 0.99 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_q3).toBe(0.99);
    expect(band.partner_peak_to_q3!).toBeLessThan(out.tight_ptq3_max);
  });

  it("rank-order invariance: same shares in any input order yield same ptq3 (fold sorts internally)", () => {
    const a = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const b = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(a.transitions.improved.bands.medium.partner_peak_to_q3).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_q3,
    );
  });

  it("codomain: ptq3 >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
        envelope(partnerPool(pool)),
      );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_q3).not.toBeNull();
      expect(band.partner_peak_to_q3!).toBeGreaterThanOrEqual(0);
    }
  });

  it("small pool [10, 1, 1] → range 9, Q3 10, ptq3 0.9 (tight — odd n excludes central; upper half = top cell only)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([10, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_q3).toBe(0.9);
    expect(band.partner_peak_to_q3!).toBeLessThan(out.tight_ptq3_max);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — metric-pool parity", () => {
  it("metric_peak_to_q3 computed identically from KPI-count map (10-KPI uniform ramp → 1.125)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_q3).toBe(1.125);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3 — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(rows),
    );
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.rotated.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.undecidable.bands.medium.partner_pool_count).toBe(
      1,
    );
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out),
    ).toBe("");
  });

  it("renders PEAK-TO-Q3 heading + PTQ3 labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("PEAK-TO-Q3");
    expect(html).toContain("PTQ3 ");
    expect(html).toContain("wide");
    expect(html).toContain("partner PTQ3");
    expect(html).toContain("KPI PTQ3");
  });

  it("renders solo label for pool_count == 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (ptq3 == 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (ptq3 = 1.125)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("tight");
  });

  it("renders spread label for two-shoulders (ptq3 = 4.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("spread");
  });

  it("renders tight label for bimodal-symmetric split (ptq3 = 0.9; contrast with P11.242 PTQ1 wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).toContain("tight");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQ3Section(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
