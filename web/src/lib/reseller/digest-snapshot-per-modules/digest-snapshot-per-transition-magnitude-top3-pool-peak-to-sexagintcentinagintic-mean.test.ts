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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMeanSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-peak-to-sexagintcentinagintic-mean";

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

describe("computeDigestSnapshot...PeakToSexagintcentinaginticMean — envelope shape", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
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
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope([]),
      );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
    expect(out.tight_ptsxcnm_max).toBe(1.005);
    expect(out.wide_ptsxcnm_min).toBe(1.09);
  });

  it("empty envelope emits pool_count 0 + null ptsxcnm in every cell", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
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
        expect(band.partner_peak_to_sexagintcentinagintic_mean).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_peak_to_sexagintcentinagintic_mean).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("ships all 4 transitions × 3 bands", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
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

describe("computeDigestSnapshot...PeakToSexagintcentinaginticMean — solo + degenerate", () => {
  it("solo cell (1 partner) → ptsxcnm null", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
      );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_peak_to_sexagintcentinagintic_mean).toBeNull();
  });

  it("extreme outlier [1×9, 100] → overflow degenerate (null)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_peak_to_sexagintcentinagintic_mean).toBeNull();
  });

  it("two-partner [1, 100] → overflow degenerate (null)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 100])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_peak_to_sexagintcentinagintic_mean).toBeNull();
  });
});

describe("computeDigestSnapshot...PeakToSexagintcentinaginticMean — arithmetic", () => {
  it("flat 10-partner pool [1×10] → ptsxcnm 0 (tight)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 1, 1, 1, 1, 1, 1, 1, 1, 1])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    expect(band.partner_peak_to_sexagintcentinagintic_mean).toBe(0);
  });

  it("uniform ramp [1..10] → tight (<1.005) and non-null", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(10);
    const v = band.partner_peak_to_sexagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeGreaterThan(0);
    expect(v!).toBeLessThan(out.tight_ptsxcnm_max);
    // M_160 asymptote for max-dominated pool sits within 4dp of M_159's 0.9131
    expect(v!).toBeCloseTo(0.9131, 3);
  });

  it("two-partner [1, 9] → tight and non-null (~0.8928)", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 9])),
      );
    const band = out.transitions.improved.bands.medium;
    const v = band.partner_peak_to_sexagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(0.8928, 3);
    expect(v!).toBeLessThan(out.tight_ptsxcnm_max);
  });

  it("Power Mean ordering: PTSXCNM (M_160) <= PTNQNCNM approximation (M_159 tight-bucket lock)", () => {
    // Ramp [1..10]: at M_159 = 0.9131 (per PTNQNCNM tests). M_160 must be <=.
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const v =
      out.transitions.improved.bands.medium.partner_peak_to_sexagintcentinagintic_mean;
    expect(v).not.toBeNull();
    expect(v!).toBeLessThanOrEqual(0.9131);
  });
});

describe("formatDigestSnapshot...PeakToSexagintcentinaginticMeanSection", () => {
  it("returns empty string when window_size < 3", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope([cell("A", "attributed_mrr", "improved", 4)], {
          window_size: 2,
        }),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells == 0", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope([]),
      );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMeanSection(
        out,
      ),
    ).toBe("");
  });

  it("renders PTSXCNM label + table header when rows present", () => {
    const out =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMean(
        envelope(partnerPool([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])),
      );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolPeakToSexagintcentinaginticMeanSection(
        out,
      );
    expect(html).toContain("PEAK-TO-SEXAGINTCENTINAGINTIC-MEAN");
    expect(html).toContain("partner PTSXCNM");
    expect(html).toContain("KPI PTSXCNM");
    expect(html).toContain("SIXTH DOZEN");
  });
});
