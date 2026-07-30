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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-cv";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("CV cutoffs anchor to regional-inequality 0.2 / 0.5 with high > moderate > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([]),
    );
    expect(out.high_cv_min).toBe(0.5);
    expect(out.moderate_cv_min).toBe(0.2);
    expect(out.high_cv_min).toBeGreaterThan(out.moderate_cv_min);
    expect(out.moderate_cv_min).toBeGreaterThan(0);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + cv null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
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
        expect(band.partner_cv).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_cv).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv — CV arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → CV 0 (by definition)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_cv).toBe(0);
    expect(band.metric_cv).toBe(0);
  });

  it("perfectly flat pool (N partners, 1 cell each) → CV 0", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_cv).toBe(0);
  });

  it("two-partner [3, 1] split → CV 0.5 (high band)", () => {
    // counts=[3, 1], n=2. mean=2. variance=(1+1)/2=1. std=1. CV=1/2=0.5.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_cv).toBe(0.5);
    expect(band.partner_cv!).toBeGreaterThanOrEqual(out.high_cv_min);
  });

  it("dominant partner in a small pool [6,1,1] → CV crosses high cutoff", () => {
    // counts=[6, 1, 1], n=3. mean=8/3=2.6667.
    // variance=(1/3)((6-2.6667)²+2·(1-2.6667)²)
    //   =(1/3)(11.1111 + 2·2.7778) = (1/3)(16.6667) = 5.5556.
    // std=2.3570. CV=2.3570/2.6667=0.8839.
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("ACME", "contribution_margin_pct", "improved", 4),
      cell("ACME", "clawback_exposure", "improved", 4),
      cell("ACME", "budget_utilization", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(8);
    expect(band.partner_cv).toBeCloseTo(0.8839, 3);
    expect(band.partner_cv!).toBeGreaterThanOrEqual(out.high_cv_min);
  });

  it("CV is rounded to 4 decimals for weekly-digest stability", () => {
    // 3 partners: 4, 3, 2 cells. n=3. mean=3.
    // variance=(1²+0+1²)/3=2/3=0.6667. std=0.8165. CV=0.8165/3=0.2722.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_cv).toBe(0.2722);
  });

  it("CV in [0, √(n-1)] and never negative", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    // n=2 upper bound: √(2-1) = 1.
    expect(band.partner_cv!).toBeGreaterThanOrEqual(0);
    expect(band.partner_cv!).toBeLessThanOrEqual(1);
    expect(band.metric_cv!).toBeGreaterThanOrEqual(0);
    expect(band.metric_cv!).toBeLessThanOrEqual(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.improved.bands.medium.partner_cv).toBeNull();
  });

  it("metric fold parity — 4 rows across 2 KPIs (2 each) → metric CV 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 2),
        cell("BETA", "attributed_mrr", "improved", 2),
        cell("ACME", "commission_cleared_mtd", "improved", 2),
        cell("GAMMA", "commission_cleared_mtd", "improved", 2),
      ]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.metric_pool_count).toBe(2);
    expect(band.metric_pool_cells).toBe(4);
    expect(band.metric_cv).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "improved", 3),
        cell("C", "attributed_mrr", "improved", 6),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.large.partner_pool_count).toBe(1);
  });

  it("total_hot_cells equals row count across transition-keyed rows", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(4);
  });

  it("skips non-transition-keyed rows (stable / first_classification)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output CV values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const reversed = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([...rows].reverse()),
    );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("[9,1]-shape two-partner pool → CV 0.8 (high band)", () => {
    // counts=[9, 1], n=2. mean=5. variance=((9-5)²+(1-5)²)/2=(16+16)/2=16.
    // std=4. CV=4/5=0.8.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("A", "attributed_net_contribution", "improved", 2),
      cell("A", "contribution_margin_pct", "improved", 2),
      cell("A", "clawback_exposure", "improved", 2),
      cell("A", "budget_utilization", "improved", 2),
      cell("A", "tier_mix", "improved", 2),
      cell("A", "attributed_churn_30d", "improved", 2),
      cell("A", "ledger_drift_events", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(10);
    expect(band.partner_cv).toBe(0.8);
    expect(band.partner_cv!).toBeGreaterThanOrEqual(out.high_cv_min);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).not.toBe("");
    expect(html).toContain(
      "Per-transition magnitude TOP-3 pool coefficient of variation",
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders solo label when pool has exactly 1 partner", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("solo");
  });

  it("renders high label when CV crosses the high cutoff", () => {
    // [6,1,1] shape crosses CV >= 0.5 (0.8839)
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 4),
      cell("ACME", "commission_cleared_mtd", "improved", 4),
      cell("ACME", "attributed_net_contribution", "improved", 4),
      cell("ACME", "contribution_margin_pct", "improved", 4),
      cell("ACME", "clawback_exposure", "improved", 4),
      cell("ACME", "budget_utilization", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("high");
  });

  it("renders balanced label when CV stays below the moderate cutoff", () => {
    // 5 partners each with 1 cell — CV = 0, balanced.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope(rows),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("balanced");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption mentions CV and the HHI + Gini + Theil + Atkinson QUARTET companions", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolCv(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolCvSection(
      out,
    );
    expect(html).toContain("coefficient of variation");
    expect(html).toContain("P11.163 HHI");
    expect(html).toContain("P11.169 Gini");
    expect(html).toContain("P11.171 Theil");
    expect(html).toContain("P11.173 Atkinson");
  });
});
