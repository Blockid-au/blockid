import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "./digest-snapshot";
import type {
  DigestSnapshotPerPairHotCells,
  PerPairHotCellRow,
} from "./digest-snapshot-per-pair-hot-cells";
import {
  computeDigestSnapshotPerPairHotCellsSummary,
  formatDigestSnapshotPerPairHotCellsSummarySection,
} from "./digest-snapshot-per-pair-hot-cells-summary";

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
        case "undecidable":
        case "stable":
        case "first_classification":
          return transition === "undecidable" || transition === "first_classification"
            ? null
            : 0;
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

describe("computeDigestSnapshotPerPairHotCellsSummary — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)], {
        window_size: 6,
        first_week: "2026-W26",
        last_week: "2026-W31",
        sustained_p90_threshold: 4,
        threshold: 0.3,
      }),
    );
    expect(out.window_size).toBe(6);
    expect(out.first_week).toBe("2026-W26");
    expect(out.last_week).toBe("2026-W31");
    expect(out.sustained_p90_threshold).toBe(4);
    expect(out.threshold).toBe(0.3);
  });

  it("keeps null first_week / last_week when the source envelope carries null", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([], { first_week: null, last_week: null }),
    );
    expect(out.first_week).toBeNull();
    expect(out.last_week).toBeNull();
  });
});

describe("computeDigestSnapshotPerPairHotCellsSummary — scalar aggregation", () => {
  it("empty rows → zero totals, null winners, all-zero transitions, mean 0", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(envelope([]));
    expect(out.total_hot_cells).toBe(0);
    expect(out.sum_hot_score).toBe(0);
    expect(out.max_hot_score).toBe(0);
    expect(out.mean_hot_score).toBe(0);
    expect(out.by_transition).toEqual({
      improved: 0,
      degraded: 0,
      rotated: 0,
      undecidable: 0,
    });
    expect(out.top_partner).toBeNull();
    expect(out.top_metric).toBeNull();
  });

  it("sums hot_score across all rows and tracks max independently", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 5),
        cell("BETA", "attributed_mrr", "degraded", 3),
        cell("GAMA", "attributed_mrr", "rotated", 1),
      ]),
    );
    expect(out.total_hot_cells).toBe(3);
    expect(out.sum_hot_score).toBe(9);
    expect(out.max_hot_score).toBe(5);
    expect(out.mean_hot_score).toBeCloseTo(3);
  });

  it("mean_hot_score preserves precision for non-integer means", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("BETA", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.mean_hot_score).toBe(1.5);
  });

  it("by_transition buckets improved / degraded / rotated / undecidable", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("A", "attributed_mrr", "improved", 2),
        cell("B", "attributed_mrr", "improved", 3),
        cell("C", "attributed_mrr", "degraded", 4),
        cell("D", "attributed_mrr", "rotated", 1),
        cell("E", "attributed_mrr", "undecidable", 1),
        cell("F", "attributed_mrr", "undecidable", 1),
      ]),
    );
    expect(out.by_transition).toEqual({
      improved: 2,
      degraded: 1,
      rotated: 1,
      undecidable: 2,
    });
  });

  it("by_transition always ships all four keys even when a transition is absent", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([cell("A", "attributed_mrr", "improved", 1)]),
    );
    expect(Object.keys(out.by_transition).sort()).toEqual([
      "degraded",
      "improved",
      "rotated",
      "undecidable",
    ]);
  });
});

describe("computeDigestSnapshotPerPairHotCellsSummary — top_partner tie-break", () => {
  it("picks partner with the most cells", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("BETA", "attributed_mrr", "improved", 2),
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("ACME", "attributed_net_contribution", "improved", 1),
        cell("ACME", "commission_cleared_mtd", "improved", 1),
      ]),
    );
    expect(out.top_partner?.reseller_code).toBe("ACME");
    expect(out.top_partner?.cells).toBe(3);
    expect(out.top_partner?.sum_hot_score).toBe(3);
    expect(out.top_partner?.max_hot_score).toBe(1);
  });

  it("ties on cells break by sum_hot_score DESC", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("ACME", "attributed_mrr", "improved", 1),
        cell("ACME", "attributed_net_contribution", "improved", 1),
        cell("BETA", "attributed_mrr", "improved", 5),
        cell("BETA", "attributed_net_contribution", "improved", 1),
      ]),
    );
    expect(out.top_partner?.reseller_code).toBe("BETA");
    expect(out.top_partner?.sum_hot_score).toBe(6);
  });

  it("ties on cells AND sum break by reseller_code ASC", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("BETA", "attributed_mrr", "improved", 2),
        cell("ACME", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.top_partner?.reseller_code).toBe("ACME");
  });

  it("top_partner max_hot_score reflects the loudest single cell for that partner", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("ACME", "attributed_mrr", "degraded", 7),
        cell("ACME", "attributed_net_contribution", "improved", 2),
      ]),
    );
    expect(out.top_partner?.max_hot_score).toBe(7);
  });
});

describe("computeDigestSnapshotPerPairHotCellsSummary — top_metric tie-break", () => {
  it("picks the KPI with the most cells and carries metric_name through", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "improved", 1),
        cell("C", "attributed_mrr", "improved", 1),
        cell("D", "attributed_net_contribution", "improved", 5),
      ]),
    );
    expect(out.top_metric?.key).toBe("attributed_mrr");
    expect(out.top_metric?.cells).toBe(3);
    expect(out.top_metric?.metric_name).toBe("attributed_mrr name");
  });

  it("ties on cells break by sum_hot_score DESC", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("A", "attributed_mrr", "improved", 1),
        cell("B", "attributed_mrr", "improved", 1),
        cell("C", "attributed_net_contribution", "improved", 4),
        cell("D", "attributed_net_contribution", "improved", 2),
      ]),
    );
    expect(out.top_metric?.key).toBe("attributed_net_contribution");
    expect(out.top_metric?.sum_hot_score).toBe(6);
  });

  it("ties on cells AND sum break by key ASC", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("A", "attributed_net_contribution", "improved", 2),
        cell("B", "attributed_mrr", "improved", 2),
      ]),
    );
    expect(out.top_metric?.key).toBe("attributed_mrr");
  });

  it("re-runs on the same input produce identical winner selection", () => {
    const rows: PerPairHotCellRow[] = [
      cell("ACME", "attributed_mrr", "improved", 2),
      cell("BETA", "attributed_net_contribution", "degraded", 2),
      cell("ACME", "attributed_net_contribution", "improved", 1),
    ];
    const first = computeDigestSnapshotPerPairHotCellsSummary(envelope(rows));
    const second = computeDigestSnapshotPerPairHotCellsSummary(envelope([...rows]));
    expect(first.top_partner).toEqual(second.top_partner);
    expect(first.top_metric).toEqual(second.top_metric);
  });
});

describe("formatDigestSnapshotPerPairHotCellsSummarySection — suppression", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([cell("A", "attributed_mrr", "improved", 2)], { window_size: 2 }),
    );
    expect(formatDigestSnapshotPerPairHotCellsSummarySection(out)).toBe("");
  });

  it("returns '' when total_hot_cells === 0", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(envelope([]));
    expect(formatDigestSnapshotPerPairHotCellsSummarySection(out)).toBe("");
  });

  it("renders non-empty HTML for window_size >= 3 and >= 1 hot cell", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([cell("ACME", "attributed_mrr", "improved", 2)]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSummarySection(out);
    expect(html).not.toBe("");
    expect(html).toContain("Total hot cells");
    expect(html).toContain("ACME");
  });
});

describe("formatDigestSnapshotPerPairHotCellsSummarySection — content", () => {
  it("caption carries window_size / first_week / last_week / threshold pct / sustained bar", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([cell("A", "attributed_mrr", "improved", 1)], {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        threshold: 0.25,
        sustained_p90_threshold: 3,
      }),
    );
    const html = formatDigestSnapshotPerPairHotCellsSummarySection(out);
    expect(html).toContain("5-week window");
    expect(html).toContain("2026-W27");
    expect(html).toContain("2026-W31");
    expect(html).toContain("25.0%");
    expect(html).toContain("p90 &ge; 3");
  });

  it("renders scalar totals and bucketed transition counts", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("A", "attributed_mrr", "improved", 3),
        cell("B", "attributed_mrr", "degraded", 2),
        cell("C", "attributed_mrr", "rotated", 1),
      ]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSummarySection(out);
    expect(html).toContain(">3</strong>");
    expect(html).toMatch(/sum hot_score.*>6</s);
    expect(html).toMatch(/max hot_score.*>3</s);
    expect(html).toMatch(/mean hot_score.*>2\.00</s);
    expect(html).toMatch(/improved.*>1</s);
    expect(html).toMatch(/degraded.*>1</s);
    expect(html).toMatch(/rotated.*>1</s);
  });

  it("HTML-escapes reseller_code + metric_name + week labels", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope(
        [
          cell("<x>", "attributed_mrr", "improved", 2, {
            metric_name: "MRR <hack>",
          }),
        ],
        { first_week: "2026-<W>", last_week: "2026-W31" },
      ),
    );
    const html = formatDigestSnapshotPerPairHotCellsSummarySection(out);
    expect(html).toContain("&lt;x&gt;");
    expect(html).toContain("MRR &lt;hack&gt;");
    expect(html).toContain("2026-&lt;W&gt;");
    expect(html).not.toContain("<x>");
    expect(html).not.toContain("<hack>");
  });

  it("loudest partner + KPI rows carry cells / sum / max scalars", () => {
    const out = computeDigestSnapshotPerPairHotCellsSummary(
      envelope([
        cell("ACME", "attributed_mrr", "degraded", 4),
        cell("ACME", "attributed_net_contribution", "improved", 2),
        cell("BETA", "attributed_mrr", "improved", 1),
      ]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSummarySection(out);
    expect(html).toContain("Loudest partner");
    expect(html).toContain("Loudest KPI");
    expect(html).toContain("ACME</strong> (2 cells, sum 6, max 4)");
    expect(html).toContain("attributed_mrr name</strong> (2 cells, sum 5, max 4)");
  });
});
