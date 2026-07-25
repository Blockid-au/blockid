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
  computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard,
  formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection,
  TOP_N,
} from "./digest-snapshot-per-transition-magnitude-top3-leaderboard";

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

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
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

  it("keeps null first_week / last_week when the source envelope carries null", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });

  it("emits band_thresholds pinned to MAGNITUDE_SMALL_MAX and MAGNITUDE_MEDIUM_MAX constants (shared with P11.145 / P11.147)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([]),
    );
    expect(out.band_thresholds.small_max).toBe(MAGNITUDE_SMALL_MAX);
    expect(out.band_thresholds.medium_max).toBe(MAGNITUDE_MEDIUM_MAX);
  });

  it("emits top_n scalar equal to the TOP_N export constant (3)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([]),
    );
    expect(out.top_n).toBe(TOP_N);
    expect(out.top_n).toBe(3);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard — envelope shape stability", () => {
  it("empty rows → all four transitions present with empty arrays across all three bands", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([]),
    );
    expect(out.total_hot_cells).toBe(0);
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      for (const b of ["small", "medium", "large"] as const) {
        expect(out.transitions[t].bands[b].top_partners).toEqual([]);
        expect(out.transitions[t].bands[b].top_metrics).toEqual([]);
      }
    }
  });

  it("transitions object always ships all four transition keys", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    expect(Object.keys(out.transitions).sort()).toEqual([
      "degraded",
      "improved",
      "rotated",
      "undecidable",
    ]);
  });

  it("bands object always ships all three band keys within every transition", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    for (const t of ["improved", "degraded", "rotated", "undecidable"] as const) {
      expect(Object.keys(out.transitions[t].bands).sort()).toEqual([
        "large",
        "medium",
        "small",
      ]);
    }
  });

  it("rotated + undecidable ship empty arrays in medium + large bands (hot_score=1 by P11.139 design)", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "rotated", 1),
        cell("B", "attributed_net_contribution", "undecidable", 1),
      ]),
    );
    expect(out.transitions.rotated.bands.small.top_partners[0]?.reseller_code).toBe(
      "A",
    );
    expect(out.transitions.rotated.bands.medium.top_partners).toEqual([]);
    expect(out.transitions.rotated.bands.large.top_partners).toEqual([]);
    expect(
      out.transitions.undecidable.bands.small.top_partners[0]?.reseller_code,
    ).toBe("B");
    expect(out.transitions.undecidable.bands.medium.top_metrics).toEqual([]);
    expect(out.transitions.undecidable.bands.large.top_metrics).toEqual([]);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard — total_hot_cells scalar parity", () => {
  it("total_hot_cells counts every alert-worthy row in the source envelope", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "degraded", 6),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
        cell("E", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.total_hot_cells).toBe(5);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard — top_partners TOP-N behaviour", () => {
  it("caps top_partners to TOP_N entries even when more partners qualify", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "improved", 4),
        cell("B", "attributed_mrr", "improved", 4),
        cell("C", "attributed_mrr", "improved", 4),
        cell("D", "attributed_mrr", "improved", 4),
        cell("E", "attributed_mrr", "improved", 4),
      ]),
    );
    expect(out.transitions.improved.bands.medium.top_partners).toHaveLength(3);
    expect(
      out.transitions.improved.bands.medium.top_partners.map(
        (p) => p.reseller_code,
      ),
    ).toEqual(["A", "B", "C"]);
  });

  it("emits fewer than TOP_N entries when fewer partners qualify — no null padding", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("SOLO", "attributed_mrr", "improved", 4),
      ]),
    );
    expect(out.transitions.improved.bands.medium.top_partners).toHaveLength(1);
    expect(
      out.transitions.improved.bands.medium.top_partners[0]?.reseller_code,
    ).toBe("SOLO");
  });

  it("orders top_partners by cells DESC → sum_hot_score DESC → reseller_code ASC", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        // BIG: 3 cells sum 9
        cell("BIG", "attributed_mrr", "improved", 3),
        cell("BIG", "attributed_net_contribution", "improved", 3),
        cell("BIG", "commission_cleared_mtd", "improved", 3),
        // MID: 2 cells sum 10
        cell("MID", "attributed_mrr", "improved", 5),
        cell("MID", "attributed_net_contribution", "improved", 5),
        // LOW: 2 cells sum 6
        cell("LOW", "attributed_mrr", "improved", 3),
        cell("LOW", "attributed_net_contribution", "improved", 3),
        // ZULU: 2 cells sum 6 — tie with LOW on both cells + sum → ZULU loses ASC
        cell("ZULU", "attributed_mrr", "improved", 3),
        cell("ZULU", "attributed_net_contribution", "improved", 3),
      ]),
    );
    const ranks =
      out.transitions.improved.bands.medium.top_partners.map(
        (p) => p.reseller_code,
      );
    // BIG (3 cells) > MID (2 cells, sum 10) > LOW (2 cells, sum 6, code ASC)
    expect(ranks).toEqual(["BIG", "MID", "LOW"]);
  });

  it("entries scoped per (transition, band) — an improved-large ranking is disjoint from degraded-large", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "improved", 10),
        cell("B", "attributed_mrr", "degraded", 6),
      ]),
    );
    expect(
      out.transitions.improved.bands.large.top_partners[0]?.reseller_code,
    ).toBe("A");
    expect(
      out.transitions.degraded.bands.large.top_partners[0]?.reseller_code,
    ).toBe("B");
    expect(out.transitions.improved.bands.small.top_partners).toEqual([]);
    expect(out.transitions.degraded.bands.medium.top_partners).toEqual([]);
  });

  it("top_partners entry carries max_hot_score reflecting the loudest single cell for that partner", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "degraded", 6),
        cell("A", "attributed_net_contribution", "degraded", 8),
      ]),
    );
    const winner = out.transitions.degraded.bands.large.top_partners[0];
    expect(winner?.reseller_code).toBe("A");
    expect(winner?.cells).toBe(2);
    expect(winner?.sum_hot_score).toBe(14);
    expect(winner?.max_hot_score).toBe(8);
  });
});

describe("computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard — top_metrics TOP-N behaviour", () => {
  it("caps top_metrics to TOP_N entries and orders by cells DESC → sum DESC → key ASC", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        // attributed_mrr: 3 cells
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "improved", 3),
        cell("C", "attributed_mrr", "improved", 3),
        // attributed_net_contribution: 2 cells sum 10
        cell("D", "attributed_net_contribution", "improved", 5),
        cell("E", "attributed_net_contribution", "improved", 5),
        // commission_cleared_mtd: 2 cells sum 6
        cell("F", "commission_cleared_mtd", "improved", 3),
        cell("G", "commission_cleared_mtd", "improved", 3),
        // budget_utilization: 2 cells sum 6 — ties with commission_cleared_mtd on cells + sum,
        // key ASC breaks: budget_utilization < commission_cleared_mtd, but both lose to top-2 above;
        // this ensures the top-3 slice captures the deterministic ASC winner over ties.
        cell("H", "budget_utilization", "improved", 3),
        cell("I", "budget_utilization", "improved", 3),
      ]),
    );
    const keys =
      out.transitions.improved.bands.medium.top_metrics.map((m) => m.key);
    // Tie-break: cells DESC (attributed_mrr=3 wins slot 1), then sum DESC among 2-cell
    // metrics (attributed_net_contribution sum=10 wins slot 2), then key ASC among the
    // two 2-cell-sum-6 metrics (budget_utilization < commission_cleared_mtd wins slot 3).
    expect(keys).toEqual([
      "attributed_mrr",
      "attributed_net_contribution",
      "budget_utilization",
    ]);
  });

  it("top_metrics carries metric_name from the first-seen row for that key", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "improved", 3, {
          metric_name: "Attributed MRR",
        }),
        cell("B", "attributed_mrr", "improved", 3, {
          metric_name: "Attributed MRR (ignored second-seen)",
        }),
      ]),
    );
    const top = out.transitions.improved.bands.medium.top_metrics[0];
    expect(top?.key).toBe("attributed_mrr");
    expect(top?.metric_name).toBe("Attributed MRR");
    expect(top?.cells).toBe(2);
  });

  it("re-runs on reversed input produce identical top_partners + top_metrics arrays (deterministic tie-break)", () => {
    const rows: PerPairHotCellRow[] = [
      cell("A", "attributed_mrr", "improved", 3),
      cell("B", "attributed_net_contribution", "degraded", 7),
      cell("C", "attributed_mrr", "improved", 1),
      cell("A", "attributed_net_contribution", "improved", 3),
      cell("B", "attributed_mrr", "improved", 3),
    ];
    const first = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope(rows),
    );
    const second = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([...rows].reverse()),
    );
    expect(first.transitions).toEqual(second.transitions);
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out),
    ).toBe("");
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([]),
    );
    expect(
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out),
    ).toBe("");
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition magnitude TOP-3 leaderboard");
  });
});

describe("formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar / TOP_N", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("A", "attributed_mrr", "improved", 3)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
    expect(html).toContain("TOP-3");
  });

  it("caption names band cutoffs from band_thresholds", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("A", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("small (1..2)");
    expect(html).toContain("medium (3..5)");
    expect(html).toContain("large (6+)");
  });

  it("omits empty (transition, band) cells from the visual table but keeps them on the envelope with empty arrays", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([cell("ACME", "attributed_mrr", "improved", 4)]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("ACME");
    expect(out.transitions.degraded.bands.small.top_partners).toEqual([]);
    expect(out.transitions.rotated.bands.large.top_metrics).toEqual([]);
    expect(out.transitions.undecidable.bands.medium.top_partners).toEqual([]);
  });

  it("renders ranked list with 1./2./3. prefixes for a cell with multiple partners", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("BIG", "attributed_mrr", "improved", 3),
        cell("BIG", "attributed_net_contribution", "improved", 3),
        cell("MID", "attributed_mrr", "improved", 5),
        cell("LOW", "attributed_mrr", "improved", 3),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    // BIG (2 cells) ranks 1., MID (1 cell sum 5) ranks 2., LOW (1 cell sum 3) ranks 3.
    expect(html).toContain("1. BIG");
    expect(html).toContain("2. MID");
    expect(html).toContain("3. LOW");
  });

  it("HTML-escapes reseller_code, metric_name, and week labels", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope(
        [
          cell("<script>", "attributed_mrr", "improved", 4, {
            metric_name: "MRR & <friends>",
          }),
        ],
        { first_week: "2026-<W>", last_week: "2026-W31" },
      ),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("MRR &amp; &lt;friends&gt;");
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("2026-<W>");
  });

  it("renders transition arrow labels for each transition that fires", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
    expect(html).toContain("&harr;");
    expect(html).toContain("undecidable ?");
  });

  it("renders cells/sum/max scalars for each ranked entry", () => {
    const out = computeDigestSnapshotPerTransitionMagnitudeTop3Leaderboard(
      envelope([
        cell("PARTNER1", "attributed_mrr", "improved", 4, {
          metric_name: "Attributed MRR",
        }),
        cell("PARTNER1", "attributed_net_contribution", "improved", 5, {
          metric_name: "Attributed Net Contribution",
        }),
      ]),
    );
    const html =
      formatDigestSnapshotPerTransitionMagnitudeTop3LeaderboardSection(out);
    expect(html).toContain("PARTNER1");
    expect(html).toContain("cells 2");
    expect(html).toContain("sum 9");
    expect(html).toContain("max 5");
  });
});
