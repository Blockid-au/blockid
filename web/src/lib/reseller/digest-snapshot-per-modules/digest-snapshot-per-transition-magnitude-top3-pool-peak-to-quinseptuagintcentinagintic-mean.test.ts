import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "../digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  MAGNITUDE_MEDIUM_MAX,
  MAGNITUDE_SMALL_MAX,
} from "./digest-snapshot-per-transition-magnitude-drilldown";
import {
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-quinseptuagintcentinagintic-mean";

type TransitionToken = PerPairHotCellRow["transition"];

function cell(
  code: string,
  key: KnownKpiSection,
  transition: TransitionToken,
  hot_score: number,
): PerPairHotCellRow {
  return {
    reseller_code: code,
    key,
    metric_name: `${key} name`,
    unit: "cents",
    transition,
    from_verdict: transition === "first_classification" ? null : "flat",
    to_verdict: "sustained_both_axes",
    delta_rank:
      transition === "improved"
        ? hot_score
        : transition === "degraded"
          ? -hot_score
          : transition === "rotated" || transition === "stable"
            ? 0
            : null,
    summary: `stub ${code} × ${key} ${transition}`,
    hot_score,
  };
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

describe("computeDigestSnapshot...PeakToQuinseptuagintcentinaginticMean — envelope shape", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
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

  it("pins band_thresholds + top_n + cutoffs", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
    expect(out.tight_ptqispcnm_max).toBe(1.005);
    expect(out.wide_ptqispcnm_min).toBe(1.09);
  });

  it("empty envelope emits pool_count 0 + null ptqispcnm in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
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
        expect(band.partner_peak_to_quinseptuagintcentinagintic_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_quinseptuagintcentinagintic_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
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

describe("computeDigestSnapshot...PeakToQuinseptuagintcentinaginticMean — solo + degenerate", () => {
  it("solo cell (1 partner) → ptqispcnm null", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_peak_to_quinseptuagintcentinagintic_mean).toBeNull();
  });

  it("extreme outlier [1×9, 100] → overflow degenerate (null)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_peak_to_quinseptuagintcentinagintic_mean).toBeNull();
  });

  it("two-partner [1, 100] → overflow degenerate (null)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_peak_to_quinseptuagintcentinagintic_mean).toBeNull();
  });
});

describe("computeDigestSnapshot...PeakToQuinseptuagintcentinaginticMean — arithmetic", () => {
  it("flat 10-partner pool [1×10] → ptqispcnm 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_peak_to_quinseptuagintcentinagintic_mean).toBe(0);
  });

  it("uniform ramp [1..10] → tight (<1.005) and non-null", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    const v = band.partner_peak_to_quinseptuagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
    expect(v!).toBeLessThan(out.tight_ptqispcnm_max);
    // M_175 asymptote for max-dominated pool sits within 2dp of ~0.912
    expect(v!).toBeCloseTo(0.912, 2);
  });

  it("two-partner [1, 9] → tight and non-null (~0.8928)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    const v = band.partner_peak_to_quinseptuagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(0.8928, 3);
    expect(v!).toBeLessThan(out.tight_ptqispcnm_max);
  });

  it("Power Mean ordering: PTQISPCNM (M_175) <= PTQSPCNM approximation (M_174 tight-bucket lock)", () => {
    // Ramp [1..10]: at M_174 ~ 0.912 (per PTQSPCNM tests). M_175 must be <=.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const v =
      out.transitions.improved.bands.medium.partner_peak_to_quinseptuagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeLessThanOrEqual(0.9126);
  });
});

describe("formatDigestSnapshot...PeakToQuinseptuagintcentinaginticMeanSection", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope([cell("A", "attributed_mrr", "improved", 4)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells == 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PTQISPCNM label + table header when rows present", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToQuinseptuagintcentinaginticMeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-QUINSEPTUAGINTCENTINAGINTIC-MEAN");
    expect(html).toContain("partner PTQISPCNM");
    expect(html).toContain("KPI PTQISPCNM");
    expect(html).toContain("SIXTH DOZEN");
  });
});
