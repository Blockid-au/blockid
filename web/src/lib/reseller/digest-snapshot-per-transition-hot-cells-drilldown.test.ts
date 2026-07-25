import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  computeDigestSnapshotPerTransitionHotCellsDrilldown,
  formatDigestSnapshotPerTransitionHotCellsDrilldownSection,
} from "./digest-snapshot-per-transition-hot-cells-drilldown";

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

describe("computeDigestSnapshotPerTransitionHotCellsDrilldown — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
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
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionHotCellsDrilldown — bucket shape stability", () => {
  it("empty rows → all four buckets present with zero scalars + null winners", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(envelope([]));
    expect(out.total_hot_cells).toBe(0);
    for (const key of ["improved", "degraded", "rotated", "undecidable"] as const) {
      expect(out.buckets[key].cells).toBe(0);
      expect(out.buckets[key].sum_hot_score).toBe(0);
      expect(out.buckets[key].max_hot_score).toBe(0);
      expect(out.buckets[key].top_partner).toBeNull();
      expect(out.buckets[key].top_metric).toBeNull();
    }
  });

  it("buckets object always ships all four keys even when only one transition fires", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    expect(Object.keys(out.buckets).sort()).toEqual([
      "degraded",
      "improved",
      "rotated",
      "undecidable",
    ]);
  });

  it("bucket scalars stay zero + winners null for transitions with no rows", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 3)]),
    );
    expect(out.buckets.improved.cells).toBe(1);
    expect(out.buckets.degraded.cells).toBe(0);
    expect(out.buckets.degraded.top_partner).toBeNull();
    expect(out.buckets.degraded.top_metric).toBeNull();
  });
});

describe("computeDigestSnapshotPerTransitionHotCellsDrilldown — bucket scalar aggregation", () => {
  it("partitions rows by transition and totals per-bucket cells / sum / max", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 5),
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 4),
        cell("C", "attributed_mrr", "rotated", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(4);
    expect(out.buckets.improved.cells).toBe(2);
    expect(out.buckets.improved.sum_hot_score).toBe(8);
    expect(out.buckets.improved.max_hot_score).toBe(5);
    expect(out.buckets.degraded.cells).toBe(1);
    expect(out.buckets.degraded.sum_hot_score).toBe(4);
    expect(out.buckets.rotated.max_hot_score).toBe(1);
    expect(out.buckets.undecidable.cells).toBe(0);
  });

  it("total_hot_cells equals the sum of per-bucket cells (drilldown / summary parity)", () => {
    const rows = [
      cell("A", "attributed_mrr", "improved", 2),
      cell("B", "attributed_mrr", "degraded", 3),
      cell("C", "attributed_mrr", "undecidable", 1),
      cell("D", "attributed_mrr", "rotated", 1),
      cell("A", "attributed_net_contribution", "improved", 1),
    ];
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(envelope(rows));
    const sum =
      out.buckets.improved.cells +
      out.buckets.degraded.cells +
      out.buckets.rotated.cells +
      out.buckets.undecidable.cells;
    expect(out.total_hot_cells).toBe(sum);
    expect(sum).toBe(rows.length);
  });
});

describe("computeDigestSnapshotPerTransitionHotCellsDrilldown — top_partner tie-break", () => {
  it("per-bucket top_partner picks partner with the most cells in that bucket", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("ACME", "attributed_net_contribution", "improved", 1),
        cell("ACME", "commission_cleared_mtd", "improved", 1),
        cell("BETA", "attributed_mrr", "improved", 5),
        // ACME dominates degraded bucket:
        cell("ACME", "attributed_mrr", "degraded", 2),
      ]),
    );
    expect(out.buckets.improved.top_partner?.reseller_code).toBe("ACME");
    expect(out.buckets.improved.top_partner?.cells).toBe(3);
    expect(out.buckets.degraded.top_partner?.reseller_code).toBe("ACME");
    expect(out.buckets.degraded.top_partner?.cells).toBe(1);
  });

  it("ties on cells break by sum_hot_score DESC", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("ACME", "attributed_net_contribution", "improved", 1),
        cell("BETA", "attributed_mrr", "improved", 5),
        cell("BETA", "attributed_net_contribution", "improved", 1),
      ]),
    );
    expect(out.buckets.improved.top_partner?.reseller_code).toBe("BETA");
    expect(out.buckets.improved.top_partner?.sum_hot_score).toBe(6);
  });

  it("ties on cells AND sum break by reseller_code ASC", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("BETA", "attributed_mrr", "improved", 2),
        cell("ACME", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.buckets.improved.top_partner?.reseller_code).toBe("ACME");
  });

  it("bucket top_partner max_hot_score reflects the loudest single cell in that bucket for that partner", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("ACME", "attributed_mrr", "degraded", 7),
        cell("ACME", "attributed_net_contribution", "degraded", 2),
      ]),
    );
    expect(out.buckets.degraded.top_partner?.max_hot_score).toBe(7);
  });

  it("winners are scoped per bucket — a partner dominant in one bucket does not carry into another", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 5),
        cell("ACME", "attributed_net_contribution", "improved", 3),
        cell("BETA", "attributed_mrr", "degraded", 1),
      ]),
    );
    expect(out.buckets.improved.top_partner?.reseller_code).toBe("ACME");
    expect(out.buckets.degraded.top_partner?.reseller_code).toBe("BETA");
  });
});

describe("computeDigestSnapshotPerTransitionHotCellsDrilldown — top_metric tie-break", () => {
  it("per-bucket top_metric picks the KPI with the most cells and carries metric_name through", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "improved", 1),
        cell("C", "attributed_mrr", "improved", 1),
        cell("D", "attributed_net_contribution", "improved", 5),
      ]),
    );
    expect(out.buckets.improved.top_metric?.key).toBe("attributed_mrr");
    expect(out.buckets.improved.top_metric?.cells).toBe(3);
    expect(out.buckets.improved.top_metric?.metric_name).toBe(
      "attributed_mrr name",
    );
  });

  it("ties on cells break by sum_hot_score DESC", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "improved", 1),
        cell("C", "attributed_net_contribution", "improved", 4),
        cell("D", "attributed_net_contribution", "improved", 2),
      ]),
    );
    expect(out.buckets.improved.top_metric?.key).toBe(
      "attributed_net_contribution",
    );
    expect(out.buckets.improved.top_metric?.sum_hot_score).toBe(6);
  });

  it("ties on cells AND sum break by key ASC", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("A", "attributed_net_contribution", "improved", 2),
        cell("B", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.buckets.improved.top_metric?.key).toBe("attributed_mrr");
  });

  it("re-runs on the same input produce identical winner selection", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 2),
      cell("BETA", "attributed_net_contribution", "degraded", 2),
      cell("ACME", "attributed_net_contribution", "improved", 1),
    ];
    const first = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope(rows),
    );
    const second = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([...rows]),
    );
    expect(first.buckets).toEqual(second.buckets);
  });
});

describe("formatDigestSnapshotPerTransitionHotCellsDrilldownSection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out)).toBe(
      "",
    );
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(envelope([]));
    expect(formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out)).toBe(
      "",
    );
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Per-transition hot-cells drill-down");
    expect(html).toContain("ACME");
  });
});

describe("formatDigestSnapshotPerTransitionHotCellsDrilldownSection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 1)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
  });

  it("omits empty buckets from the visual table but keeps them on the envelope", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([cell("A", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).toContain("improved");
    expect(html).not.toContain("degraded");
    expect(html).not.toContain("rotated");
    expect(html).not.toContain("undecidable");
    // envelope still ships all four keys:
    expect(out.buckets.degraded.cells).toBe(0);
    expect(out.buckets.rotated.cells).toBe(0);
    expect(out.buckets.undecidable.cells).toBe(0);
  });

  it("renders per-bucket cells / sum / max scalars alongside winners", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 3),
        cell("ACME", "attributed_net_contribution", "improved", 2),
        cell("BETA", "attributed_mrr", "degraded", 4),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).toContain("improved");
    expect(html).toContain("degraded");
    expect(html).toContain("ACME</strong> (2 cells, sum 5, max 3)");
    expect(html).toContain("BETA</strong> (1 cells, sum 4, max 4)");
  });

  it("HTML-escapes reseller_code + metric_name + week labels", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope(
        [
          cell("<x>", "attributed_mrr", "improved", 2, {
            metric_name: "MRR <hack>",
          }),
        ],
        { first_week: "2026-<W>", last_week: "2026-W31" },
      ),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain("MRR &lt;hack&gt;");
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("<x>");
    expect(html).not.toContain("<hack>");
  });

  it("renders transition arrow labels for each bucket that fires", () => {
    const out = computeDigestSnapshotPerTransitionHotCellsDrilldown(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "degraded", 1),
        cell("C", "attributed_mrr", "rotated", 1),
        cell("D", "attributed_mrr", "undecidable", 1),
      ]),
    );
    const html = formatDigestSnapshotPerTransitionHotCellsDrilldownSection(out);
    expect(html).toContain("&uarr;");
    expect(html).toContain("&darr;");
    expect(html).toContain("&harr;");
    expect(html).toContain("undecidable ?");
  });
});
