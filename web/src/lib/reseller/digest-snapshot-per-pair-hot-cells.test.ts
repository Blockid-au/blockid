import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";
import type { KnownKpiSection } from "./digest-snapshot";
import {
  computeDigestSnapshotPerPairHotCells,
  formatDigestSnapshotPerPairHotCellsSection,
} from "./digest-snapshot-per-pair-hot-cells";

type TransitionToken =
  PerResellerMetricPersistenceScorecardVerdictTransitionRow["transition"];

function row(
  code: string,
  key: KnownKpiSection,
  transition: TransitionToken,
  overrides: Partial<PerResellerMetricPersistenceScorecardVerdictTransitionRow> = {},
): PerResellerMetricPersistenceScorecardVerdictTransitionRow {
  const base: PerResellerMetricPersistenceScorecardVerdictTransitionRow = {
    reseller_code: code,
    key,
    metric_name: `${key} name`,
    unit: "cents",
    transition,
    from_verdict: transition === "first_classification" ? null : "flat",
    to_verdict: "sustained_both_axes",
    from_rank: transition === "first_classification" ? null : 0,
    to_rank: 2,
    delta_rank: (() => {
      switch (transition) {
        case "first_classification":
          return null;
        case "undecidable":
          return null;
        case "stable":
          return 0;
        case "rotated":
          return 0;
        case "improved":
          return 1;
        case "degraded":
          return -1;
      }
    })(),
    summary: `stub ${code} × ${key} ${transition}`,
  };
  return { ...base, ...overrides };
}

function envelope(
  rows: PerResellerMetricPersistenceScorecardVerdictTransitionRow[],
  overrides: Partial<
    Omit<DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition, "rows">
  > = {},
): DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition {
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

describe("computeDigestSnapshotPerPairHotCells — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
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

  it("returns rows=[] on empty envelope", () => {
    const out = computeDigestSnapshotPerPairHotCells(envelope([]));
    expect(out.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerPairHotCells — alert-worthy filtering", () => {
  it("keeps improved / degraded / rotated / undecidable rows", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("BRAVO", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("CHARM", "tier_mix", "rotated"),
        row("DELTA", "budget_utilization", "undecidable"),
      ]),
    );
    expect(out.rows).toHaveLength(4);
  });

  it("drops stable rows", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ACME", "attributed_mrr", "stable"),
        row("BRAVO", "attributed_mrr", "improved", { delta_rank: 1 }),
      ]),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].reseller_code).toBe("BRAVO");
  });

  it("drops first_classification rows", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ACME", "attributed_mrr", "first_classification"),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
      ]),
    );
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0].reseller_code).toBe("BRAVO");
  });

  it("returns rows=[] when every row is stable + first_classification", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ACME", "attributed_mrr", "stable"),
        row("BRAVO", "tier_mix", "first_classification"),
      ]),
    );
    expect(out.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerPairHotCells — hot_score derivation", () => {
  it("scores improved rows by |delta_rank|", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("A", "attributed_mrr", "improved", { delta_rank: 3 }),
        row("B", "clawback_exposure", "improved", { delta_rank: 1 }),
      ]),
    );
    const byCode = Object.fromEntries(out.rows.map((r) => [r.reseller_code, r]));
    expect(byCode.A.hot_score).toBe(3);
    expect(byCode.B.hot_score).toBe(1);
  });

  it("scores degraded rows by |delta_rank|", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("A", "attributed_mrr", "degraded", { delta_rank: -2 }),
        row("B", "clawback_exposure", "degraded", { delta_rank: -1 }),
      ]),
    );
    const byCode = Object.fromEntries(out.rows.map((r) => [r.reseller_code, r]));
    expect(byCode.A.hot_score).toBe(2);
    expect(byCode.B.hot_score).toBe(1);
  });

  it("floors improved/degraded at 1 when delta_rank is 0", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("A", "attributed_mrr", "improved", { delta_rank: 0 }),
        row("B", "clawback_exposure", "degraded", { delta_rank: 0 }),
      ]),
    );
    expect(out.rows.every((r) => r.hot_score === 1)).toBe(true);
  });

  it("scores rotated + undecidable rows at baseline 1", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("A", "attributed_mrr", "rotated"),
        row("B", "clawback_exposure", "undecidable"),
      ]),
    );
    expect(out.rows.every((r) => r.hot_score === 1)).toBe(true);
  });
});

describe("computeDigestSnapshotPerPairHotCells — row ordering", () => {
  it("sorts by hot_score DESC (loudest cells first)", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("LOW", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("HIGH", "clawback_exposure", "improved", { delta_rank: 3 }),
        row("MID", "tier_mix", "improved", { delta_rank: 2 }),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code)).toEqual(["HIGH", "MID", "LOW"]);
  });

  it("breaks hot_score ties by delta_rank ASC (most-negative first)", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("PLUS", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("MINUS", "attributed_mrr", "degraded", { delta_rank: -2 }),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code)).toEqual(["MINUS", "PLUS"]);
  });

  it("breaks remaining ties by reseller_code ASC then key ASC", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ZEBRA", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ALPHA", "clawback_exposure", "improved", { delta_rank: 1 }),
        row("ALPHA", "attributed_mrr", "improved", { delta_rank: 1 }),
      ]),
    );
    expect(out.rows.map((r) => [r.reseller_code, r.key])).toEqual([
      ["ALPHA", "attributed_mrr"],
      ["ALPHA", "clawback_exposure"],
      ["ZEBRA", "attributed_mrr"],
    ]);
  });

  it("undecidable (null delta_rank) sorts as delta_rank=0 for tie-break", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("A", "attributed_mrr", "undecidable"),
        row("B", "attributed_mrr", "rotated"),
      ]),
    );
    // Both hot_score=1, both delta_rank normalized to 0 → sort by reseller_code
    expect(out.rows.map((r) => r.reseller_code)).toEqual(["A", "B"]);
  });

  it("re-running compute on the same input produces identical ordering", () => {
    const input = envelope([
      row("A", "attributed_mrr", "improved", { delta_rank: 2 }),
      row("B", "clawback_exposure", "degraded", { delta_rank: -1 }),
      row("C", "tier_mix", "rotated"),
    ]);
    const first = computeDigestSnapshotPerPairHotCells(input);
    const second = computeDigestSnapshotPerPairHotCells(input);
    expect(first.rows.map((r) => r.reseller_code)).toEqual(
      second.rows.map((r) => r.reseller_code),
    );
  });
});

describe("computeDigestSnapshotPerPairHotCells — row shape parity", () => {
  it("carries reseller_code + key + metric_name + unit + transition + verdicts + delta_rank + summary through", () => {
    const src = row("ACME", "attributed_mrr", "improved", {
      delta_rank: 2,
      metric_name: "Attributed MRR",
      unit: "cents",
      from_verdict: "sustained_direction_only",
      to_verdict: "sustained_both_axes",
      summary: "ACME MRR up 2 ranks",
    });
    const out = computeDigestSnapshotPerPairHotCells(envelope([src]));
    const r = out.rows[0];
    expect(r.reseller_code).toBe("ACME");
    expect(r.key).toBe("attributed_mrr");
    expect(r.metric_name).toBe("Attributed MRR");
    expect(r.unit).toBe("cents");
    expect(r.transition).toBe("improved");
    expect(r.from_verdict).toBe("sustained_direction_only");
    expect(r.to_verdict).toBe("sustained_both_axes");
    expect(r.delta_rank).toBe(2);
    expect(r.summary).toBe("ACME MRR up 2 ranks");
    expect(r.hot_score).toBe(2);
  });
});

describe("formatDigestSnapshotPerPairHotCellsSection", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        window_size: 2,
      }),
    );
    expect(formatDigestSnapshotPerPairHotCellsSection(out)).toBe("");
  });

  it("returns '' when the envelope has zero alert-worthy rows", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("ACME", "attributed_mrr", "stable"),
        row("BRAVO", "tier_mix", "first_classification"),
      ]),
    );
    expect(formatDigestSnapshotPerPairHotCellsSection(out)).toBe("");
  });

  it("renders the caption with window_size / weeks / threshold / sustained bar", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        threshold: 0.3,
        sustained_p90_threshold: 5,
      }),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    expect(html).toContain("Per-pair hot cells");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
    expect(html).toContain("30.0%");
    expect(html).toContain("sustained bar p90 &ge; 5");
  });

  it("renders one table row per alert-worthy cell in loudest-first order", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([
        row("SOFT", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("LOUD", "attributed_mrr", "degraded", { delta_rank: -3 }),
      ]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    const iLoud = html.indexOf(">LOUD<");
    const iSoft = html.indexOf(">SOFT<");
    expect(iLoud).toBeGreaterThan(-1);
    expect(iSoft).toBeGreaterThan(iLoud);
  });

  it("escapes HTML meta-characters in reseller_code + metric_name + week labels", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope(
        [
          row("<b>EVIL</b>", "attributed_mrr", "improved", {
            delta_rank: 1,
            metric_name: "<script>alert(1)</script>",
          }),
        ],
        {
          first_week: "<b>W28</b>",
          last_week: "2026-W31\" onclick=\"alert(1)",
        },
      ),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).not.toContain(">EVIL<");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;EVIL&lt;/b&gt;");
    expect(html).toContain("&quot;");
  });

  it("renders up-arrow on improved, down-arrow on degraded, sideways on rotated, ? on undecidable", () => {
    const improved = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "improved", { delta_rank: 1 })]),
    );
    const degraded = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "degraded", { delta_rank: -1 })]),
    );
    const rotated = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "rotated")]),
    );
    const undecidable = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "undecidable")]),
    );
    expect(formatDigestSnapshotPerPairHotCellsSection(improved)).toContain("&uarr;");
    expect(formatDigestSnapshotPerPairHotCellsSection(degraded)).toContain("&darr;");
    expect(formatDigestSnapshotPerPairHotCellsSection(rotated)).toContain("&harr;");
    expect(formatDigestSnapshotPerPairHotCellsSection(undecidable)).toContain("?");
  });

  it("renders — (em-dash) for undecidable delta_rank in the delta column", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "undecidable")]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    expect(html).toContain("—");
  });

  it("renders signed delta_rank with + prefix for positive numbers", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "improved", { delta_rank: 2 })]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    expect(html).toContain("+2");
  });

  it("table header contains partner + KPI + transition + delta_rank + hot_score columns", () => {
    const out = computeDigestSnapshotPerPairHotCells(
      envelope([row("A", "attributed_mrr", "improved", { delta_rank: 1 })]),
    );
    const html = formatDigestSnapshotPerPairHotCellsSection(out);
    expect(html).toContain(">Partner<");
    expect(html).toContain(">KPI<");
    expect(html).toContain(">transition<");
    expect(html).toContain("&Delta;rank");
    expect(html).toContain("hot_score");
  });
});
