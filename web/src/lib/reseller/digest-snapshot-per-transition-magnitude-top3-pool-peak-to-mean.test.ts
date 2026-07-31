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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-mean";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("exposes ptmean band thresholds on envelope (2.0 / 5.0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([]),
    );
    expect(out.tight_ptmean_max).toBe(2.0);
    expect(out.wide_ptmean_min).toBe(5.0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + null ptmean in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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
        expect(band.partner_peak_to_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — solo (pool_count == 1)", () => {
  it("solo cell (1 partner) → ptmean null (no range/mean contrast)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_peak_to_mean).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — arithmetic (pool_count >= 2)", () => {
  it("flat 10-partner pool [1×10] → ptmean 0 (tight; range 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_mean).toBe(0);
  });

  it("flat 2-partner pool [3,3] → ptmean 0 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([3, 3])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_peak_to_mean).toBe(0);
  });

  it("uniform ramp [1..10] → mean 5.5, range 9, ptmean = 9/5.5 = 1.6364 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_mean).toBe(1.6364);
    // tight band (< 2.0)
    expect(band.partner_peak_to_mean!).toBeLessThan(out.tight_ptmean_max);
  });

  it("upper-outlier [1×9, 10] → mean 1.9, range 9, ptmean = 4.7368 (SPREAD — MILD SINGLE OUTLIER regime flagged spread where P11.240 PTM reads wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(19);
    expect(band.partner_peak_to_mean).toBe(4.7368);
    // spread band [2.0, 5.0) — documents contrast with P11.240 PTM
    // (which reads wide because the median stays anchored at 1)
    expect(band.partner_peak_to_mean!).toBeGreaterThanOrEqual(
      out.tight_ptmean_max,
    );
    expect(band.partner_peak_to_mean!).toBeLessThan(out.wide_ptmean_min);
  });

  it("two-shoulders [1×8, 5×2] → mean 1.8, range 4, ptmean = 2.2222 (spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 5, 5])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(18);
    expect(band.partner_peak_to_mean).toBe(2.2222);
    // spread band [2.0, 5.0)
    expect(band.partner_peak_to_mean!).toBeGreaterThanOrEqual(
      out.tight_ptmean_max,
    );
    expect(band.partner_peak_to_mean!).toBeLessThan(out.wide_ptmean_min);
  });

  it("50/50 split [1×5, 10×5] → mean 5.5, range 9, ptmean = 1.6364 (tight — mean equals median for symmetric split so PTMEAN == PTM)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 10, 10, 10, 10, 10])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(55);
    expect(band.partner_peak_to_mean).toBe(1.6364);
    expect(band.partner_peak_to_mean!).toBeLessThan(out.tight_ptmean_max);
  });

  it("extreme outlier [1×9, 100] → mean 10.9, range 99, ptmean = 9.0826 (wide — EXTREME OUTLIER)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_pool_cells).toBe(109);
    expect(band.partner_peak_to_mean).toBe(9.0826);
    expect(band.partner_peak_to_mean!).toBeGreaterThanOrEqual(
      out.wide_ptmean_min,
    );
  });

  it("two-partner pool [1, 9] → mean 5, range 8, ptmean = 1.6 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 9])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_peak_to_mean).toBe(1.6);
    expect(band.partner_peak_to_mean!).toBeLessThan(out.tight_ptmean_max);
  });

  it("two-partner pool [1, 100] → mean 50.5, range 99, ptmean = 1.9604 (tight)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 100])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(101);
    expect(band.partner_peak_to_mean).toBe(1.9604);
    expect(band.partner_peak_to_mean!).toBeLessThan(out.tight_ptmean_max);
  });

  it("rank-order invariance: same shares in any input order yield same ptmean", () => {
    const a = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const b = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([10, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    expect(a.transitions.improved.bands.medium.partner_peak_to_mean).toBe(
      b.transitions.improved.bands.medium.partner_peak_to_mean,
    );
  });

  it("codomain: ptmean >= 0 across pathological pools", () => {
    const pools: number[][] = [
      [1, 1, 1, 1, 1, 1, 1, 1, 1, 50],
      [50, 1, 1, 1, 1, 1, 1, 1, 1, 1],
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      [1, 1, 1, 1, 1, 10, 10, 10, 10, 10],
    ];
    for (const pool of pools) {
      const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
        envelope(partnerPool(pool)),
      );
      const band = out.transitions.improved.bands.medium;
      expect(band.partner_peak_to_mean).not.toBeNull();
      expect(band.partner_peak_to_mean!).toBeGreaterThanOrEqual(0);
    }
  });

  it("small pool [10, 1, 1] → mean 4, range 9, ptmean = 2.25 (spread)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([10, 1, 1])),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(12);
    expect(band.partner_peak_to_mean).toBe(2.25);
    expect(band.partner_peak_to_mean!).toBeGreaterThanOrEqual(
      out.tight_ptmean_max,
    );
    expect(band.partner_peak_to_mean!).toBeLessThan(out.wide_ptmean_min);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — metric-pool parity", () => {
  it("metric_peak_to_mean computed identically from KPI-count map (10-KPI uniform ramp → 1.6364)", () => {
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.metric_pool_count).toBe(10);
    expect(band.metric_pool_cells).toBe(55);
    expect(band.metric_peak_to_mean).toBe(1.6364);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean — band + transition bucketing", () => {
  it("hot_score respects small/medium/large split", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 1),
      cell("B", "attributed_mrr", "improved", MAGNITUDE_SMALL_MAX + 1),
      cell("C", "attributed_mrr", "improved", MAGNITUDE_MEDIUM_MAX + 1),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
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

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection", () => {
  it("returns empty string when window_size < 3 (P11.139 guard)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out),
    ).toBe("");
  });

  it("renders PEAK-TO-MEAN heading + PTMEAN labels for populated bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).toContain("PEAK-TO-MEAN");
    expect(html).toContain("PTMEAN ");
    expect(html).toContain("wide");
    expect(html).toContain("partner PTMEAN");
    expect(html).toContain("KPI PTMEAN");
  });

  it("renders solo label for pool_count == 1", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).toContain("solo");
  });

  it("renders tight label for flat pool (ptmean == 0)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).toContain("tight");
  });

  it("renders tight label for uniform ramp (ptmean = 1.6364)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).toContain("tight");
  });

  it("renders spread label for MILD SINGLE OUTLIER (ptmean = 4.7368; contrast with P11.240 PTM wide)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 10])),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).toContain("spread");
  });

  it("HTML escapes week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMean(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<script>",
        last_week: "'or'1'='1",
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToMeanSection(out);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
