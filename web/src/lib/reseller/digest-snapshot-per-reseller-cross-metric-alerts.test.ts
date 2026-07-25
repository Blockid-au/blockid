import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";
import type { KnownKpiSection } from "./digest-snapshot";
import {
  computeDigestSnapshotPerResellerCrossMetricAlerts,
  formatDigestSnapshotPerResellerCrossMetricAlertsSection,
} from "./digest-snapshot-per-reseller-cross-metric-alerts";

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

describe("computeDigestSnapshotPerResellerCrossMetricAlerts — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
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
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(envelope([]));
    expect(out.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerResellerCrossMetricAlerts — per-partner grouping", () => {
  it("groups rows by reseller_code so each partner appears exactly once", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("ZEBRA", "attributed_mrr", "stable"),
      ]),
    );
    expect(out.rows).toHaveLength(2);
    const codes = out.rows.map((r) => r.reseller_code).sort();
    expect(codes).toEqual(["ACME", "ZEBRA"]);
  });

  it("aggregates one partner's KPIs into a single row with bucket counts", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("ACME", "attributed_churn_30d", "rotated"),
        row("ACME", "budget_utilization", "stable"),
        row("ACME", "attributed_net_contribution", "first_classification"),
      ]),
    );
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0];
    expect(r.reseller_code).toBe("ACME");
    expect(r.total).toBe(5);
    expect(r.improved_by_2).toBe(1);
    expect(r.degraded_by_1).toBe(1);
    expect(r.rotated).toBe(1);
    expect(r.stable).toBe(1);
    expect(r.first_classification).toBe(1);
    expect(r.alert_worthy).toBe(3);
    expect(r.net_delta_rank).toBe(2 + -1);
  });

  it("splits improved rows by |delta_rank| per partner", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ACME", "clawback_exposure", "improved", { delta_rank: 2 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.improved_by_1).toBe(1);
    expect(r.improved_by_2).toBe(1);
    expect(r.improved_by_other).toBe(0);
  });

  it("splits degraded rows by |delta_rank| per partner", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -2 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.degraded_by_1).toBe(1);
    expect(r.degraded_by_2).toBe(1);
    expect(r.degraded_by_other).toBe(0);
  });

  it("classifies out-of-range delta_rank into *_by_other buckets defensively per partner", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 3 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -3 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.improved_by_other).toBe(1);
    expect(r.degraded_by_other).toBe(1);
    expect(r.alert_worthy).toBe(2);
    expect(r.net_delta_rank).toBe(3 + -3);
  });

  it("undecidable and first_classification never contribute to net_delta_rank per partner", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "undecidable"),
        row("ACME", "clawback_exposure", "first_classification"),
        row("ACME", "attributed_churn_30d", "improved", { delta_rank: 2 }),
      ]),
    );
    expect(out.rows[0].net_delta_rank).toBe(2);
  });

  it("alert_worthy per row = undecidable + rotated + improved_* + degraded_*", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("ACME", "attributed_churn_30d", "rotated"),
        row("ACME", "budget_utilization", "undecidable"),
        row("ACME", "attributed_net_contribution", "stable"),
        row("ACME", "commission_cleared_mtd", "first_classification"),
      ]),
    );
    expect(out.rows[0].alert_worthy).toBe(4);
  });
});

describe("computeDigestSnapshotPerResellerCrossMetricAlerts — row ordering", () => {
  it("sorts by alert_worthy DESC (loudest partners first)", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("QUIET", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("LOUD", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("LOUD", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("LOUD", "attributed_churn_30d", "rotated"),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code)).toEqual(["LOUD", "QUIET"]);
  });

  it("breaks alert_worthy ties by net_delta_rank ASC (most-negative wins)", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("UP", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("UP", "clawback_exposure", "improved", { delta_rank: 1 }),
        row("DOWN", "attributed_mrr", "degraded", { delta_rank: -2 }),
        row("DOWN", "clawback_exposure", "degraded", { delta_rank: -1 }),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code)).toEqual(["DOWN", "UP"]);
  });

  it("breaks remaining ties by reseller_code ASC for stability", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("ZEBRA", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("MOMENT", "attributed_mrr", "improved", { delta_rank: 1 }),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code)).toEqual([
      "ACME",
      "MOMENT",
      "ZEBRA",
    ]);
  });

  it("re-running compute on the same input produces identical row ordering", () => {
    const input = envelope([
      row("A", "attributed_mrr", "improved", { delta_rank: 2 }),
      row("B", "attributed_mrr", "improved", { delta_rank: 2 }),
      row("C", "attributed_mrr", "degraded", { delta_rank: -1 }),
    ]);
    const first = computeDigestSnapshotPerResellerCrossMetricAlerts(input);
    const second = computeDigestSnapshotPerResellerCrossMetricAlerts(input);
    expect(first.rows.map((r) => r.reseller_code)).toEqual(
      second.rows.map((r) => r.reseller_code),
    );
  });
});

describe("computeDigestSnapshotPerResellerCrossMetricAlerts — quiet-partner retention", () => {
  it("retains rows where alert_worthy===0 on the JSONL envelope", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("QUIET", "attributed_mrr", "stable"),
        row("QUIET", "clawback_exposure", "first_classification"),
        row("LOUD", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    expect(out.rows.map((r) => r.reseller_code).sort()).toEqual([
      "LOUD",
      "QUIET",
    ]);
    const quiet = out.rows.find((r) => r.reseller_code === "QUIET")!;
    expect(quiet.alert_worthy).toBe(0);
    expect(quiet.stable).toBe(1);
    expect(quiet.first_classification).toBe(1);
    expect(quiet.total).toBe(2);
  });

  it("every row carries every bucket key even when zero", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("ONLY", "attributed_mrr", "improved", { delta_rank: 1 })]),
    );
    const r = out.rows[0];
    expect(r).toHaveProperty("first_classification", 0);
    expect(r).toHaveProperty("undecidable", 0);
    expect(r).toHaveProperty("stable", 0);
    expect(r).toHaveProperty("rotated", 0);
    expect(r).toHaveProperty("improved_by_2", 0);
    expect(r).toHaveProperty("improved_by_other", 0);
    expect(r).toHaveProperty("degraded_by_1", 0);
    expect(r).toHaveProperty("degraded_by_2", 0);
    expect(r).toHaveProperty("degraded_by_other", 0);
  });
});

describe("formatDigestSnapshotPerResellerCrossMetricAlertsSection", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        window_size: 2,
      }),
    );
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(out)).toBe("");
  });

  it("returns '' when the envelope has zero rows", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(envelope([]));
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(out)).toBe("");
  });

  it("returns '' when every partner is quiet (all-stable/first_classification)", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("A", "attributed_mrr", "stable"),
        row("B", "attributed_mrr", "first_classification"),
      ]),
    );
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(out)).toBe("");
  });

  it("renders the caption with window_size / weeks / threshold / sustained bar", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        threshold: 0.3,
        sustained_p90_threshold: 5,
      }),
    );
    const html = formatDigestSnapshotPerResellerCrossMetricAlertsSection(out);
    expect(html).toContain("Per-partner cross-metric alerts ranking");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
    expect(html).toContain("30.0%");
    expect(html).toContain("sustained bar p90 &ge; 5");
  });

  it("renders one table row per alerting partner ordered loudest first", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("QUIET", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("LOUD", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("LOUD", "clawback_exposure", "degraded", { delta_rank: -1 }),
        row("LOUD", "attributed_churn_30d", "rotated"),
      ]),
    );
    const html = formatDigestSnapshotPerResellerCrossMetricAlertsSection(out);
    const iLoud = html.indexOf(">LOUD<");
    const iQuiet = html.indexOf(">QUIET<");
    expect(iLoud).toBeGreaterThan(-1);
    expect(iQuiet).toBeGreaterThan(iLoud);
  });

  it("omits quiet partners (alert_worthy===0) from the visual table", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("QUIET", "attributed_mrr", "stable"),
        row("QUIET", "clawback_exposure", "first_classification"),
        row("LOUD", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    const html = formatDigestSnapshotPerResellerCrossMetricAlertsSection(out);
    expect(html).toContain(">LOUD<");
    expect(html).not.toContain(">QUIET<");
  });

  it("escapes HTML meta-characters in reseller_code and week labels", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope(
        [row("<script>", "attributed_mrr", "improved", { delta_rank: 1 })],
        {
          first_week: "<script>alert(1)</script>",
          last_week: "2026-W31\" onclick=\"alert(1)",
        },
      ),
    );
    const html = formatDigestSnapshotPerResellerCrossMetricAlertsSection(out);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("shows up-arrow when net_delta_rank > 0 and down-arrow when < 0", () => {
    const up = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("UP", "attributed_mrr", "improved", { delta_rank: 2 })]),
    );
    const down = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("DOWN", "clawback_exposure", "degraded", { delta_rank: -2 })]),
    );
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(up)).toContain(
      "&uarr;",
    );
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(down)).toContain(
      "&darr;",
    );
  });

  it("shows sideways arrow when net_delta_rank == 0 with mixed non-zero buckets", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([
        row("BAL", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("BAL", "clawback_exposure", "degraded", { delta_rank: -1 }),
      ]),
    );
    expect(formatDigestSnapshotPerResellerCrossMetricAlertsSection(out)).toContain(
      "&harr;",
    );
  });

  it("table header contains all bucket columns", () => {
    const out = computeDigestSnapshotPerResellerCrossMetricAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })]),
    );
    const html = formatDigestSnapshotPerResellerCrossMetricAlertsSection(out);
    expect(html).toContain("alert_worthy");
    expect(html).toContain("net &Delta;rank");
    expect(html).toContain("imp +2/+1");
    expect(html).toContain("deg &minus;1/&minus;2");
    expect(html).toContain("rotated");
    expect(html).toContain("undecidable");
    expect(html).toContain("stable");
  });
});
