import { describe, expect, it } from "vitest";

import type { KnownKpiSection } from "./digest-snapshot";
import type { HeadlineMetricUnit } from "./digest-snapshot-metric-delta";
import type {
  DigestSnapshotPerResellerMetricPersistenceScorecardVerdict,
  PerResellerMetricPersistenceScorecardVerdictRow,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict";
import type { PersistenceScorecardVerdictToken } from "./digest-snapshot-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection,
} from "./digest-snapshot-per-reseller-metric-persistence-scorecard-verdict-transition";

function row(
  code: string,
  key: KnownKpiSection,
  metricName: string,
  unit: HeadlineMetricUnit,
  token: PersistenceScorecardVerdictToken,
): PerResellerMetricPersistenceScorecardVerdictRow {
  return {
    reseller_code: code,
    key,
    metric_name: metricName,
    unit,
    verdict: token,
    direction_sustained:
      token === "sustained_both_axes" || token === "sustained_direction_only",
    magnitude_sustained:
      token === "sustained_both_axes" || token === "sustained_magnitude_only",
    summary: `stub ${code} × ${metricName} ${token}`,
  };
}

function mrr(
  code: string,
  token: PersistenceScorecardVerdictToken,
): PerResellerMetricPersistenceScorecardVerdictRow {
  return row(code, "attributed_mrr", "Attributed MRR", "cents", token);
}

function churn(
  code: string,
  token: PersistenceScorecardVerdictToken,
): PerResellerMetricPersistenceScorecardVerdictRow {
  return row(
    code,
    "attributed_churn_30d",
    "Attributed churn 30d",
    "count",
    token,
  );
}

function envelope(
  rows: PerResellerMetricPersistenceScorecardVerdictRow[],
  overrides: Partial<
    Omit<DigestSnapshotPerResellerMetricPersistenceScorecardVerdict, "rows">
  > = {},
): DigestSnapshotPerResellerMetricPersistenceScorecardVerdict {
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

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition — envelope", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold through", () => {
    const current = envelope([mrr("ACME", "sustained_both_axes")], {
      window_size: 5,
      first_week: "2026-W27",
      last_week: "2026-W31",
      sustained_p90_threshold: 4,
      threshold: 0.3,
    });
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    expect(t.window_size).toBe(5);
    expect(t.first_week).toBe("2026-W27");
    expect(t.last_week).toBe("2026-W31");
    expect(t.sustained_p90_threshold).toBe(4);
    expect(t.threshold).toBe(0.3);
  });

  it("preserves current row order verbatim (no re-sort)", () => {
    const current = envelope([
      mrr("ACME", "sustained_both_axes"),
      churn("INFOVISION", "volatile"),
      mrr("ZEBRA", "flat"),
    ]);
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    expect(t.rows.map((r) => `${r.reseller_code}:${r.key}`)).toEqual([
      "ACME:attributed_mrr",
      "INFOVISION:attributed_churn_30d",
      "ZEBRA:attributed_mrr",
    ]);
  });

  it("drops pairs only present in previous (tracks current row set, not the union)", () => {
    const current = envelope([mrr("ACME", "sustained_both_axes")]);
    const previous = envelope([
      mrr("ACME", "flat"),
      mrr("ZEBRA", "sustained_both_axes"),
      churn("ACME", "volatile"),
    ]);
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].reseller_code).toBe("ACME");
    expect(t.rows[0].key).toBe("attributed_mrr");
  });

  it("emits empty rows[] when current envelope has zero rows", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([]),
        envelope([mrr("ACME", "sustained_both_axes")]),
      );
    expect(t.rows).toEqual([]);
  });

  it("joins on the composite (reseller_code, key) pair — same code, different KPI must not collide", () => {
    const current = envelope([
      mrr("ACME", "sustained_both_axes"),
      churn("ACME", "sustained_both_axes"),
    ]);
    const previous = envelope([
      mrr("ACME", "sustained_both_axes"),
      churn("ACME", "volatile"),
    ]);
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    const mrrRow = t.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    );
    const churnRow = t.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_churn_30d",
    );
    expect(mrrRow?.transition).toBe("stable");
    expect(churnRow?.transition).toBe("improved");
  });
});

describe("computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition — ladder per row", () => {
  it("emits `first_classification` for every pair when previous is null", () => {
    const current = envelope([
      mrr("ACME", "sustained_both_axes"),
      churn("INFOVISION", "volatile"),
    ]);
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    for (const r of t.rows) {
      expect(r.transition).toBe("first_classification");
      expect(r.from_verdict).toBeNull();
      expect(r.from_rank).toBeNull();
      expect(r.delta_rank).toBeNull();
      expect(r.summary).toContain("first verdict");
    }
  });

  it("emits `first_classification` for a pair only in current (not in previous)", () => {
    const current = envelope([
      mrr("ACME", "sustained_both_axes"),
      churn("INFOVISION", "volatile"),
    ]);
    const previous = envelope([mrr("ACME", "sustained_both_axes")]);
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    const infovision = t.rows.find(
      (r) =>
        r.reseller_code === "INFOVISION" &&
        r.key === "attributed_churn_30d",
    );
    expect(infovision?.transition).toBe("first_classification");
    const acme = t.rows.find(
      (r) => r.reseller_code === "ACME" && r.key === "attributed_mrr",
    );
    expect(acme?.transition).toBe("stable");
  });

  it("emits `undecidable` when previous or current side is insufficient_window", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([
          mrr("ACME", "sustained_both_axes"),
          mrr("INFOVISION", "insufficient_window"),
        ]),
        envelope([
          mrr("ACME", "insufficient_window"),
          mrr("INFOVISION", "sustained_both_axes"),
        ]),
      );
    const acme = t.rows.find((r) => r.reseller_code === "ACME");
    const infovision = t.rows.find((r) => r.reseller_code === "INFOVISION");
    expect(acme?.transition).toBe("undecidable");
    expect(acme?.delta_rank).toBeNull();
    expect(infovision?.transition).toBe("undecidable");
    expect(infovision?.delta_rank).toBeNull();
  });

  it("emits `stable` when the pair verdict token is identical week-over-week", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")]),
        envelope([mrr("ACME", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("stable");
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("stable verdict");
  });

  it("emits `improved` when the pair moves UP the ladder", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")]),
        envelope([mrr("ACME", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("improved");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(2);
    expect(t.rows[0].delta_rank).toBe(1);
    expect(t.rows[0].summary).toContain("improved");
  });

  it("emits `degraded` when the pair moves DOWN the ladder", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "volatile")]),
        envelope([mrr("ACME", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("degraded");
    expect(t.rows[0].from_rank).toBe(2);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(-2);
    expect(t.rows[0].summary).toContain("degraded");
  });

  it("emits `rotated` when axis-count is unchanged but the specific axis flips (direction ↔ magnitude)", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_magnitude_only")]),
        envelope([mrr("ACME", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(1);
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("rotated");
  });

  it("emits `rotated` when the zero-rank bucket flips flat ↔ volatile", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "volatile")]),
        envelope([mrr("ACME", "flat")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(0);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(0);
  });

  it("summary carries `reseller_code × metric_name` label", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")]),
        envelope([mrr("ACME", "volatile")]),
      );
    expect(t.rows[0].summary).toContain("ACME × Attributed MRR");
  });
});

describe("formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection", () => {
  it("returns '' when window_size < 3", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")], { window_size: 2 }),
        envelope([mrr("ACME", "volatile")], { window_size: 2 }),
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when zero rows carry an alert-worthy transition (all first_classification/stable)", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([
          mrr("ACME", "sustained_both_axes"),
          churn("INFOVISION", "volatile"),
        ]),
        envelope([
          mrr("ACME", "sustained_both_axes"),
          churn("INFOVISION", "volatile"),
        ]),
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when previous is null (every pair is first_classification)", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")]),
        null,
      );
    expect(
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("suppresses `first_classification` and `stable` rows so only actionable pairs render", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([
          mrr("ACME", "sustained_both_axes"),
          churn("INFOVISION", "volatile"),
          mrr("ZEBRA", "sustained_direction_only"),
        ]),
        envelope([
          mrr("ACME", "sustained_both_axes"),
          churn("INFOVISION", "sustained_both_axes"),
        ]),
      );
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      );
    // ACME × attributed_mrr stays stable — suppressed.
    expect(html).not.toContain("ACME");
    // INFOVISION × attributed_churn_30d degraded — renders.
    expect(html).toContain("INFOVISION");
    expect(html).toContain("degraded");
    // ZEBRA × attributed_mrr is first_classification (absent from previous)
    // and first_classification is a suppressed transition per the formatter
    // contract — matches P11.113 / P11.115 / P11.117 posture.
    expect(html).not.toContain("ZEBRA");
  });

  it("renders Partner + Metric + Transition + Summary columns for alert-worthy rows", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("INFOVISION", "volatile")]),
        envelope([mrr("INFOVISION", "sustained_both_axes")]),
      );
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).toContain("<th>Partner</th>");
    expect(html).toContain("<th>Metric</th>");
    expect(html).toContain("<th>Transition</th>");
    expect(html).toContain("<th>Summary</th>");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("Attributed MRR");
    expect(html).toContain("degraded");
  });

  it("renders sustained bar + magnitude threshold + window range in the caption", () => {
    const t =
      computeDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransition(
        envelope([mrr("ACME", "sustained_both_axes")]),
        envelope([mrr("ACME", "volatile")]),
      );
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).toContain(
      "Per-(partner &times; metric) persistence verdict transition",
    );
    expect(html).toContain("sustained bar length &ge; 3");
    expect(html).toContain("25.0%");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W31");
  });

  it("escapes HTML meta-characters in reseller_code, metric_name, summary and token", () => {
    const html =
      formatDigestSnapshotPerResellerMetricPersistenceScorecardVerdictTransitionSection(
        {
          window_size: 4,
          first_week: "2026-W28",
          last_week: "2026-W31",
          sustained_p90_threshold: 3,
          threshold: 0.25,
          rows: [
            {
              reseller_code: "<ACME>",
              key: "attributed_mrr",
              metric_name: "<Metric>",
              unit: "cents",
              transition: "degraded",
              from_verdict: "sustained_both_axes",
              to_verdict: "volatile",
              from_rank: 2,
              to_rank: 0,
              delta_rank: -2,
              summary: "<script>alert(1)</script> & 'quotes'",
            },
          ],
        },
      );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;ACME&gt;");
    expect(html).toContain("&lt;Metric&gt;");
    expect(html).toContain("&amp;");
  });
});
