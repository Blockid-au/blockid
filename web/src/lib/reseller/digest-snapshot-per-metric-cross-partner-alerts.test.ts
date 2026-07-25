import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  PerResellerMetricPersistenceScorecardVerdictTransitionRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";
import type { KnownKpiSection } from "./digest-snapshot";
import {
  computeDigestSnapshotPerMetricCrossPartnerAlerts,
  formatDigestSnapshotPerMetricCrossPartnerAlertsSection,
} from "./digest-snapshot-per-metric-cross-partner-alerts";

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

describe("computeDigestSnapshotPerMetricCrossPartnerAlerts — envelope passthrough", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold verbatim", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
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
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(envelope([]));
    expect(out.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricCrossPartnerAlerts — per-metric grouping", () => {
  it("groups rows by key so each KPI appears exactly once", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("ZEBRA", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("ACME", "clawback_exposure", "stable"),
      ]),
    );
    expect(out.rows).toHaveLength(2);
    const keys = out.rows.map((r) => r.key).sort();
    expect(keys).toEqual(["attributed_mrr", "clawback_exposure"]);
  });

  it("aggregates one metric's partner rows into a single row with bucket counts", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("CHARM", "attributed_mrr", "rotated"),
        row("DELTA", "attributed_mrr", "stable"),
        row("ECHO", "attributed_mrr", "first_classification"),
      ]),
    );
    expect(out.rows).toHaveLength(1);
    const r = out.rows[0];
    expect(r.key).toBe("attributed_mrr");
    expect(r.total).toBe(5);
    expect(r.improved_by_2).toBe(1);
    expect(r.degraded_by_1).toBe(1);
    expect(r.rotated).toBe(1);
    expect(r.stable).toBe(1);
    expect(r.first_classification).toBe(1);
    expect(r.alert_worthy).toBe(3);
    expect(r.net_delta_rank).toBe(2 + -1);
  });

  it("splits improved rows by |delta_rank| per metric", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("BRAVO", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.improved_by_1).toBe(1);
    expect(r.improved_by_2).toBe(1);
    expect(r.improved_by_other).toBe(0);
  });

  it("splits degraded rows by |delta_rank| per metric", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -2 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.degraded_by_1).toBe(1);
    expect(r.degraded_by_2).toBe(1);
    expect(r.degraded_by_other).toBe(0);
  });

  it("classifies out-of-range delta_rank into *_by_other buckets defensively per metric", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 3 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -3 }),
      ]),
    );
    const r = out.rows[0];
    expect(r.improved_by_other).toBe(1);
    expect(r.degraded_by_other).toBe(1);
    expect(r.alert_worthy).toBe(2);
    expect(r.net_delta_rank).toBe(3 + -3);
  });

  it("undecidable and first_classification never contribute to net_delta_rank per metric", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "undecidable"),
        row("BRAVO", "attributed_mrr", "first_classification"),
        row("CHARM", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    expect(out.rows[0].net_delta_rank).toBe(2);
  });

  it("alert_worthy per row = undecidable + rotated + improved_* + degraded_*", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("CHARM", "attributed_mrr", "rotated"),
        row("DELTA", "attributed_mrr", "undecidable"),
        row("ECHO", "attributed_mrr", "stable"),
        row("FOXTROT", "attributed_mrr", "first_classification"),
      ]),
    );
    expect(out.rows[0].alert_worthy).toBe(4);
  });

  it("carries metric_name + unit from first-seen input row", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", {
          delta_rank: 1,
          metric_name: "Attributed MRR",
          unit: "cents",
        }),
        row("BRAVO", "attributed_mrr", "degraded", {
          delta_rank: -1,
          metric_name: "Attributed MRR",
          unit: "cents",
        }),
      ]),
    );
    expect(out.rows[0].metric_name).toBe("Attributed MRR");
    expect(out.rows[0].unit).toBe("cents");
  });
});

describe("computeDigestSnapshotPerMetricCrossPartnerAlerts — row ordering", () => {
  it("sorts by alert_worthy DESC (loudest KPIs first)", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "budget_utilization", "improved", { delta_rank: 1 }),
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("CHARM", "attributed_mrr", "rotated"),
      ]),
    );
    expect(out.rows.map((r) => r.key)).toEqual([
      "attributed_mrr",
      "budget_utilization",
    ]);
  });

  it("breaks alert_worthy ties by net_delta_rank ASC (most-negative wins)", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("BRAVO", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ACME", "clawback_exposure", "degraded", { delta_rank: -2 }),
        row("BRAVO", "clawback_exposure", "degraded", { delta_rank: -1 }),
      ]),
    );
    expect(out.rows.map((r) => r.key)).toEqual([
      "clawback_exposure",
      "attributed_mrr",
    ]);
  });

  it("breaks remaining ties by key ASC for stability", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "clawback_exposure", "improved", { delta_rank: 1 }),
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("ACME", "budget_utilization", "improved", { delta_rank: 1 }),
      ]),
    );
    expect(out.rows.map((r) => r.key)).toEqual([
      "attributed_mrr",
      "budget_utilization",
      "clawback_exposure",
    ]);
  });

  it("re-running compute on the same input produces identical row ordering", () => {
    const input = envelope([
      row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
      row("ACME", "clawback_exposure", "improved", { delta_rank: 2 }),
      row("ACME", "tier_mix", "degraded", { delta_rank: -1 }),
    ]);
    const first = computeDigestSnapshotPerMetricCrossPartnerAlerts(input);
    const second = computeDigestSnapshotPerMetricCrossPartnerAlerts(input);
    expect(first.rows.map((r) => r.key)).toEqual(second.rows.map((r) => r.key));
  });
});

describe("computeDigestSnapshotPerMetricCrossPartnerAlerts — quiet-metric retention", () => {
  it("retains rows where alert_worthy===0 on the JSONL envelope", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "tier_mix", "stable"),
        row("BRAVO", "tier_mix", "first_classification"),
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    expect(out.rows.map((r) => r.key).sort()).toEqual([
      "attributed_mrr",
      "tier_mix",
    ]);
    const quiet = out.rows.find((r) => r.key === "tier_mix")!;
    expect(quiet.alert_worthy).toBe(0);
    expect(quiet.stable).toBe(1);
    expect(quiet.first_classification).toBe(1);
    expect(quiet.total).toBe(2);
  });

  it("every row carries every bucket key even when zero", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
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

describe("formatDigestSnapshotPerMetricCrossPartnerAlertsSection", () => {
  it("returns '' when window_size < 3", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        window_size: 2,
      }),
    );
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out)).toBe("");
  });

  it("returns '' when the envelope has zero rows", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(envelope([]));
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out)).toBe("");
  });

  it("returns '' when every KPI is quiet (all-stable/first_classification)", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "stable"),
        row("BRAVO", "tier_mix", "first_classification"),
      ]),
    );
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out)).toBe("");
  });

  it("renders the caption with window_size / weeks / threshold / sustained bar", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })], {
        threshold: 0.3,
        sustained_p90_threshold: 5,
      }),
    );
    const html = formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out);
    expect(html).toContain("Per-metric cross-partner alerts ranking");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
    expect(html).toContain("30.0%");
    expect(html).toContain("sustained bar p90 &ge; 5");
  });

  it("renders one table row per alerting KPI ordered loudest first", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "budget_utilization", "improved", { delta_rank: 1 }),
        row("ACME", "attributed_mrr", "improved", { delta_rank: 2 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
        row("CHARM", "attributed_mrr", "rotated"),
      ]),
    );
    const html = formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out);
    const iMrr = html.indexOf(">attributed_mrr name<");
    const iBudget = html.indexOf(">budget_utilization name<");
    expect(iMrr).toBeGreaterThan(-1);
    expect(iBudget).toBeGreaterThan(iMrr);
  });

  it("omits quiet KPIs (alert_worthy===0) from the visual table", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "tier_mix", "stable"),
        row("BRAVO", "tier_mix", "first_classification"),
        row("CHARM", "attributed_mrr", "improved", { delta_rank: 2 }),
      ]),
    );
    const html = formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out);
    expect(html).toContain(">attributed_mrr name<");
    expect(html).not.toContain(">tier_mix name<");
  });

  it("escapes HTML meta-characters in metric_name and week labels", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope(
        [
          row("ACME", "attributed_mrr", "improved", {
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
    const html = formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&quot;");
  });

  it("shows up-arrow when net_delta_rank > 0 and down-arrow when < 0", () => {
    const up = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })]),
    );
    const down = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([row("ACME", "clawback_exposure", "degraded", { delta_rank: -2 })]),
    );
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(up)).toContain(
      "&uarr;",
    );
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(down)).toContain(
      "&darr;",
    );
  });

  it("shows sideways arrow when net_delta_rank == 0 with mixed non-zero buckets", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([
        row("ACME", "attributed_mrr", "improved", { delta_rank: 1 }),
        row("BRAVO", "attributed_mrr", "degraded", { delta_rank: -1 }),
      ]),
    );
    expect(formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out)).toContain(
      "&harr;",
    );
  });

  it("table header contains all bucket columns", () => {
    const out = computeDigestSnapshotPerMetricCrossPartnerAlerts(
      envelope([row("ACME", "attributed_mrr", "improved", { delta_rank: 2 })]),
    );
    const html = formatDigestSnapshotPerMetricCrossPartnerAlertsSection(out);
    expect(html).toContain("alert_worthy");
    expect(html).toContain("net &Delta;rank");
    expect(html).toContain("imp +2/+1");
    expect(html).toContain("deg &minus;1/&minus;2");
    expect(html).toContain("rotated");
    expect(html).toContain("undecidable");
    expect(html).toContain("stable");
    expect(html).toContain("KPI");
  });
});
