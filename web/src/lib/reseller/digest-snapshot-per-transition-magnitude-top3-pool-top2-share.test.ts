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
  computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool-top2-share";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("names top_k = 2 independently of top_n leaderboard cap", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([]),
    );
    expect(out.top_k).toBe(2);
    expect(out.top_k).toBeLessThan(out.top_n);
  });

  it("share cutoffs are plain-language 50% / 75% bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([]),
    );
    expect(out.oligopoly_share_min).toBe(0.75);
    expect(out.leading_share_min).toBe(0.5);
    expect(out.oligopoly_share_min).toBeGreaterThan(out.leading_share_min);
    expect(out.leading_share_min).toBeGreaterThan(0);
    expect(out.oligopoly_share_min).toBeLessThanOrEqual(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + top2_share null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
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
        expect(band.partner_top2_cells).toBe(0);
        expect(band.partner_top2_share).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_top2_share).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share — arithmetic", () => {
  it("solo cell (1 partner, 1 cell) → top2_share 1 (top-K sum equals total pool)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_top2_cells).toBe(1);
    expect(band.partner_top2_share).toBe(1);
    expect(band.metric_top2_share).toBe(1);
  });

  it("two-partner pool → top2_share 1 (top-2 IS the whole pool)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("A", "commission_cleared_mtd", "improved", 4),
        cell("B", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(2);
    expect(band.partner_pool_cells).toBe(3);
    expect(band.partner_top2_cells).toBe(3);
    expect(band.partner_top2_share).toBe(1);
  });

  it("perfectly flat pool (4 partners, 1 cell each) → top2 = 2/4 = 0.5", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_top2_cells).toBe(2);
    expect(band.partner_top2_share).toBeCloseTo(0.5, 4);
  });

  it("dominant pair in a wide pool → top2_share crosses oligopoly (>=0.75)", () => {
    // A=6, B=3 (dominant pair), C=1, D=1, E=1. pool=11 partners=5. Top-2=9/11.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("A", "contribution_margin_pct", "improved", 4),
      cell("A", "clawback_exposure", "improved", 4),
      cell("A", "budget_utilization", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(11);
    expect(band.partner_top2_cells).toBe(9);
    // 9/11 = 0.8181... → 0.8182 (rounded 4 decimals)
    expect(band.partner_top2_share).toBe(0.8182);
    expect(band.partner_top2_share!).toBeGreaterThanOrEqual(
      out.oligopoly_share_min,
    );
  });

  it("top2_share rounded to 4 decimals for weekly-digest stability", () => {
    // A=4, B=3, C=2 → pool 9, top-2 = 7/9 = 0.7777...
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_cells).toBe(7);
    expect(band.partner_top2_share).toBe(0.7778);
  });

  it("share sits in leading band (>=0.5 but <0.75) when pair has majority", () => {
    // A=3, B=2, C=1, D=1, E=1 → pool 8. Top-2 = 5/8 = 0.625 → leading.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
      cell("E", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_share).toBe(0.625);
    expect(band.partner_top2_share!).toBeGreaterThanOrEqual(
      out.leading_share_min,
    );
    expect(band.partner_top2_share!).toBeLessThan(out.oligopoly_share_min);
  });

  it("contested when broad pool has no dominant pair (<0.5)", () => {
    // 6 partners, 1 cell each → top-2 = 2/6 = 0.3333 → contested.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_share).toBe(0.3333);
    expect(band.partner_top2_share!).toBeLessThan(out.leading_share_min);
  });

  it("top2_share never exceeds 1 and stays strictly positive for non-empty cells", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_top2_share!).toBeGreaterThan(0);
    expect(band.partner_top2_share!).toBeLessThanOrEqual(1);
    expect(band.metric_top2_share!).toBeGreaterThan(0);
    expect(band.metric_top2_share!).toBeLessThanOrEqual(1);
  });

  it("partitions cells by (transition, band) — improved/small doesn't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(
      out.transitions.improved.bands.medium.partner_top2_share,
    ).toBeNull();
  });

  it("metric fold parity — 6 rows across 3 KPIs (3,2,1) → metric top2 = 5/6 = 0.8333", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "improved", 2),
        cell("C", "attributed_mrr", "improved", 2),
        cell("A", "commission_cleared_mtd", "improved", 2),
        cell("B", "commission_cleared_mtd", "improved", 2),
        cell("A", "attributed_net_contribution", "improved", 2),
      ]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.metric_pool_count).toBe(3);
    expect(band.metric_pool_cells).toBe(6);
    expect(band.metric_top2_cells).toBe(5);
    expect(band.metric_top2_share).toBe(0.8333);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output top2_share values (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
      cell("C", "attributed_mrr", "improved", 2),
    ];
    const forward =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
        envelope(rows),
      );
    const reversed =
      computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
        envelope([...rows].reverse()),
      );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("top2_cells sums the TWO LARGEST counts (not merely the top-1 + first-seen runner-up)", () => {
    // A=1, B=4 (larger, added later), C=3, D=1 → top-2 must pick B+C = 7, not A+B = 5.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("B", "contribution_margin_pct", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_net_contribution", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(9);
    expect(band.partner_top2_cells).toBe(7);
    expect(band.partner_top2_share).toBe(0.7778);
  });

  it("tied leaders — top-2 sums the two highest counts even under a 3-way tie", () => {
    // A=B=C=3 (tied leaders), D=1. Top-2 combined = 3+3 = 6, pool=10, share=0.6.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("B", "attributed_net_contribution", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("C", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_net_contribution", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_top2_cells).toBe(6);
    expect(band.partner_top2_share).toBe(0.6);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out),
    ).toBe("");
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([], { window_size: 4 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out),
    ).toBe("");
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).not.toBe("");
    expect(html).toContain(
      "Per-transition magnitude TOP-3 pool TOP-2 combined share",
    );
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders oligopoly label when pair owns >= 75% of the pool", () => {
    // Solo pool of 1 → share 1.0 → oligopoly (also matches solo semantically).
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("oligopoly");
  });

  it("renders leading label when pair has clear majority (>=50% <75%)", () => {
    // A=3, B=2, C=1, D=1, E=1 → pool 8, top-2 = 5/8 = 0.625.
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 4),
      cell("A", "commission_cleared_mtd", "improved", 4),
      cell("A", "attributed_net_contribution", "improved", 4),
      cell("B", "attributed_mrr", "improved", 4),
      cell("B", "commission_cleared_mtd", "improved", 4),
      cell("C", "attributed_mrr", "improved", 4),
      cell("D", "attributed_mrr", "improved", 4),
      cell("E", "attributed_mrr", "improved", 4),
    ];
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("leading");
  });

  it("renders contested label when pool is broadly split (<50%)", () => {
    // 6 partners each with 1 cell → top-2 = 2/6 = 0.3333 → contested.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope(rows),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("contested");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption references the P11.165 top-1 companion and the 50%/75% cutoffs", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3PoolTop2Share(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3PoolTop2ShareSection(out);
    expect(html).toContain("P11.165");
    expect(html).toContain("75%");
    expect(html).toContain("50%");
  });
});
