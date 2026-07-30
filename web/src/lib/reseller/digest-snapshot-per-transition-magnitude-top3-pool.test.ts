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
  computeDigestSnapshotPerTransitionMagnitudeTop3Pool,
  formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-pool";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Pool — envelope passthrough", () => {
  it("carries scalars verbatim from source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("pins band_thresholds to shared MAGNITUDE_*_MAX constants", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("re-exports the shared TOP_N constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });

  it("wide_tail_share_min sits in the (0, 1) interval as a fraction", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([]),
    );
    expect(out.wide_tail_share_min).toBeGreaterThan(0);
    expect(out.wide_tail_share_min).toBeLessThan(1);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Pool — envelope shape stability", () => {
  it("empty envelope emits pool_count 0 + pool_cells 0 + tail_share null in every cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([]),
    );
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        const band = out.transitions[t].bands[b];
        expect(band.partner_pool_count).toBe(0);
        expect(band.partner_pool_cells).toBe(0);
        expect(band.partner_tail_beyond_top3).toBe(0);
        expect(band.partner_tail_cells).toBe(0);
        expect(band.partner_tail_share).toBeNull();
        expect(band.metric_pool_count).toBe(0);
        expect(band.metric_tail_share).toBeNull();
      }
    }
    expect(out.total_hot_cells).toBe(0);
  });

  it("envelope always ships all 4 transitions × 3 bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    expect(Object.keys(out.transitions).sort()).toEqual(
      ["degraded", "improved", "rotated", "undecidable"].sort(),
    );
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      expect(Object.keys(out.transitions[t].bands).sort()).toEqual(
        ["large", "medium", "small"].sort(),
      );
    }
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Pool — pool arithmetic", () => {
  it("single-row cell → pool_count 1, pool_cells 1, tail 0, tail_share 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(1);
    expect(band.partner_pool_cells).toBe(1);
    expect(band.partner_tail_beyond_top3).toBe(0);
    expect(band.partner_tail_cells).toBe(0);
    expect(band.partner_tail_share).toBe(0);
    expect(band.metric_pool_count).toBe(1);
    expect(band.metric_tail_share).toBe(0);
  });

  it("exactly TOP_N partners → tail_beyond_top3 0 + tail_cells 0 + tail_share 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 4),
        cell("ACME", "commission_cleared_mtd", "improved", 4),
        cell("BETA", "attributed_mrr", "improved", 4),
        cell("GAMMA", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.partner_tail_beyond_top3).toBe(0);
    expect(band.partner_tail_cells).toBe(0);
    expect(band.partner_tail_share).toBe(0);
  });

  it("TOP_N + 1 partners with tail cell → tail_beyond_top3 1 + tail_cells 1 + tail_share 1/5", () => {
    // Partners: ACME(2 cells), BETA(1), GAMMA(1), DELTA(1) — pool_count 4, pool_cells 5.
    // top3 by cells DESC = [ACME=2, BETA=1, GAMMA=1] sum = 4. tail = 5 - 4 = 1.
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 4),
        cell("ACME", "commission_cleared_mtd", "improved", 4),
        cell("BETA", "attributed_mrr", "improved", 4),
        cell("GAMMA", "attributed_mrr", "improved", 4),
        cell("DELTA", "attributed_mrr", "improved", 4),
      ]),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(4);
    expect(band.partner_pool_cells).toBe(5);
    expect(band.partner_tail_beyond_top3).toBe(1);
    expect(band.partner_tail_cells).toBe(1);
    expect(band.partner_tail_share).toBeCloseTo(1 / 5, 10);
  });

  it("large tail → tail_share crosses the wide_tail_share_min cutoff", () => {
    // 6 partners each with 1 cell → pool_count 6, pool_cells 6. top3 = 3.
    // tail_cells = 3, tail_share = 0.5 → >= 0.25 wide cutoff.
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope(rows),
    );
    const band = out.transitions.improved.bands.medium;
    expect(band.partner_pool_count).toBe(6);
    expect(band.partner_pool_cells).toBe(6);
    expect(band.partner_tail_beyond_top3).toBe(3);
    expect(band.partner_tail_cells).toBe(3);
    expect(band.partner_tail_share).toBeCloseTo(0.5, 10);
    expect(band.partner_tail_share!).toBeGreaterThanOrEqual(
      out.wide_tail_share_min,
    );
  });

  it("partitions cells by (transition, band) — cells in improved/small don't leak into degraded/small", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "commission_cleared_mtd", "degraded", 1),
      ]),
    );
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.partner_pool_count).toBe(1);
    expect(out.transitions.improved.bands.small.metric_pool_count).toBe(1);
    expect(out.transitions.degraded.bands.small.metric_pool_count).toBe(1);
    expect(out.transitions.improved.bands.medium.partner_pool_count).toBe(0);
    expect(out.transitions.degraded.bands.medium.partner_pool_count).toBe(0);
  });

  it("metric fold parity — 4 rows sharing 2 KPIs yield metric_pool_count 2 + metric_pool_cells 4", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 2),
        cell("BETA", "attributed_mrr", "improved", 2),
        cell("ACME", "commission_cleared_mtd", "improved", 2),
        cell("GAMMA", "commission_cleared_mtd", "improved", 2),
      ]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_pool_count).toBe(3);
    expect(band.partner_pool_cells).toBe(4);
    expect(band.metric_pool_count).toBe(2);
    expect(band.metric_pool_cells).toBe(4);
    expect(band.metric_tail_beyond_top3).toBe(0);
    expect(band.metric_tail_cells).toBe(0);
    expect(band.metric_tail_share).toBe(0);
  });

  it("bandForScore edge cases — hot_score 2 → small, 3 → medium, 6 → large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
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
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(4);
  });

  it("skips non-transition-keyed rows (stable / first_classification) — they don't inflate any pool", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("A", "attributed_mrr", "stable", 1),
        cell("B", "attributed_mrr", "first_classification", 1),
        cell("C", "attributed_mrr", "improved", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(1);
    expect(out.transitions.improved.bands.small.partner_pool_count).toBe(1);
  });

  it("input row order does not affect the output pool counts (determinism)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "improved", 2),
      cell("A", "commission_cleared_mtd", "improved", 2),
    ];
    const forward = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope(rows),
    );
    const reversed = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([...rows].reverse()),
    );
    expect(JSON.stringify(forward.transitions)).toBe(
      JSON.stringify(reversed.transitions),
    );
  });

  it("tail_cells is never negative regardless of pool shape", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "improved", 2),
      ]),
    );
    const band = out.transitions.improved.bands.small;
    expect(band.partner_tail_cells).toBeGreaterThanOrEqual(0);
    expect(band.metric_tail_cells).toBeGreaterThanOrEqual(0);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection — suppression", () => {
  it("returns empty string when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        window_size: 2,
      }),
    );
    expect(formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out)).toBe(
      "",
    );
  });

  it("returns empty string when total_hot_cells is 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([], { window_size: 4 }),
    );
    expect(formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out)).toBe(
      "",
    );
  });

  it("renders HTML when window_size >= 3 and total_hot_cells > 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 pool size");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection — content", () => {
  it("carries the transition arrow labels quartet", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).toContain("improved &uarr;");
    expect(html).toContain("degraded &darr;");
    expect(html).toContain("rotated &harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders compact label when pool fits inside top-3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).toContain("compact");
  });

  it("renders wide_tail label when tail share exceeds the cutoff", () => {
    const rows: PerPairHotCellRow[] = [];
    for (const code of ["A", "B", "C", "D", "E", "F"]) {
      rows.push(cell(code, "attributed_mrr", "improved", 4));
    }
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope(rows),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).toContain("wide_tail");
  });

  it("escapes HTML-special characters in the week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("A", "attributed_mrr", "improved", 2)], {
        first_week: "<W25>",
        last_week: '"W31"',
      }),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).toContain("&lt;W25&gt;");
    expect(html).toContain("&quot;W31&quot;");
    expect(html).not.toContain("<W25>");
  });

  it("caption mentions the pool / cells / tail readout hint", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Pool(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionMagnitudeTop3PoolSection(out);
    expect(html).toContain("Population size");
    expect(html).toContain("OUTSIDE the top-3");
  });
});
