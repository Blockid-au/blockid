import { describe, expect, it } from "vitest";

import type {
  DigestSnapshotPerMetricPersistenceScorecardVerdict,
  PerMetricPersistenceScorecardVerdictRow,
} from "./digest-snapshot-per-metric-persistence-scorecard-verdict";
import type { PersistenceScorecardVerdictToken } from "./digest-snapshot-persistence-scorecard-verdict";
import {
  computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition,
  formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection,
} from "./digest-snapshot-per-metric-persistence-scorecard-verdict-transition";

function row(
  key: PerMetricPersistenceScorecardVerdictRow["key"],
  metricName: string,
  token: PersistenceScorecardVerdictToken,
): PerMetricPersistenceScorecardVerdictRow {
  return {
    key,
    metric_name: metricName,
    unit: "cents",
    verdict: token,
    direction_sustained:
      token === "sustained_both_axes" || token === "sustained_direction_only",
    magnitude_sustained:
      token === "sustained_both_axes" || token === "sustained_magnitude_only",
    summary: `stub ${metricName} ${token}`,
  };
}

function envelope(
  rows: PerMetricPersistenceScorecardVerdictRow[],
  overrides: Partial<
    Omit<DigestSnapshotPerMetricPersistenceScorecardVerdict, "rows">
  > = {},
): DigestSnapshotPerMetricPersistenceScorecardVerdict {
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

describe("computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition — envelope", () => {
  it("carries window_size / first_week / last_week / sustained_p90_threshold / threshold through", () => {
    const current = envelope(
      [row("attributed_mrr", "Attributed MRR", "sustained_both_axes")],
      {
        window_size: 5,
        first_week: "2026-W27",
        last_week: "2026-W31",
        sustained_p90_threshold: 4,
        threshold: 0.3,
      },
    );
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
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
      row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
      row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
      row("clawback_exposure", "Clawback Exposure", "flat"),
    ]);
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        current,
        null,
      );
    expect(t.rows.map((r) => r.key)).toEqual([
      "attributed_mrr",
      "attributed_churn_30d",
      "clawback_exposure",
    ]);
  });

  it("drops KPIs only present in previous (tracks current row set, not the union)", () => {
    const current = envelope([
      row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
    ]);
    const previous = envelope([
      row("attributed_mrr", "Attributed MRR", "flat"),
      row("attributed_churn_30d", "Attributed Churn (30d)", "sustained_both_axes"),
    ]);
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    expect(t.rows.length).toBe(1);
    expect(t.rows[0].key).toBe("attributed_mrr");
  });

  it("emits empty rows[] when current envelope has zero rows", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([]),
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_both_axes")]),
      );
    expect(t.rows).toEqual([]);
  });
});

describe("computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition — ladder per row", () => {
  it("emits `first_classification` for every KPI when previous is null", () => {
    const current = envelope([
      row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
      row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
    ]);
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
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

  it("emits `first_classification` for a KPI only in current (not in previous)", () => {
    const current = envelope([
      row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
      row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
    ]);
    const previous = envelope([
      row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
    ]);
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        current,
        previous,
      );
    const churn = t.rows.find((r) => r.key === "attributed_churn_30d");
    expect(churn?.transition).toBe("first_classification");
    const mrr = t.rows.find((r) => r.key === "attributed_mrr");
    expect(mrr?.transition).toBe("stable");
  });

  it("emits `undecidable` when previous or current side is insufficient_window", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "insufficient_window"),
        ]),
        envelope([
          row("attributed_mrr", "Attributed MRR", "insufficient_window"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "sustained_both_axes"),
        ]),
      );
    const mrr = t.rows.find((r) => r.key === "attributed_mrr");
    const churn = t.rows.find((r) => r.key === "attributed_churn_30d");
    expect(mrr?.transition).toBe("undecidable");
    expect(mrr?.delta_rank).toBeNull();
    expect(churn?.transition).toBe("undecidable");
    expect(churn?.delta_rank).toBeNull();
  });

  it("emits `stable` when the KPI verdict token is identical week-over-week", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_both_axes")]),
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("stable");
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("stable verdict");
  });

  it("emits `improved` when the KPI moves UP the ladder", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_both_axes")]),
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("improved");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(2);
    expect(t.rows[0].delta_rank).toBe(1);
    expect(t.rows[0].summary).toContain("improved");
  });

  it("emits `degraded` when the KPI moves DOWN the ladder", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([row("attributed_mrr", "Attributed MRR", "volatile")]),
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_both_axes")]),
      );
    expect(t.rows[0].transition).toBe("degraded");
    expect(t.rows[0].from_rank).toBe(2);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(-2);
    expect(t.rows[0].summary).toContain("degraded");
  });

  it("emits `rotated` when axis-count is unchanged but the specific axis flips (direction ↔ magnitude)", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_magnitude_only")]),
        envelope([row("attributed_mrr", "Attributed MRR", "sustained_direction_only")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(1);
    expect(t.rows[0].to_rank).toBe(1);
    expect(t.rows[0].delta_rank).toBe(0);
    expect(t.rows[0].summary).toContain("rotated");
  });

  it("emits `rotated` when the zero-rank bucket flips flat ↔ volatile", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([row("attributed_mrr", "Attributed MRR", "volatile")]),
        envelope([row("attributed_mrr", "Attributed MRR", "flat")]),
      );
    expect(t.rows[0].transition).toBe("rotated");
    expect(t.rows[0].from_rank).toBe(0);
    expect(t.rows[0].to_rank).toBe(0);
    expect(t.rows[0].delta_rank).toBe(0);
  });
});

describe("formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection", () => {
  it("returns '' when window_size < 3", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope(
          [row("attributed_mrr", "Attributed MRR", "sustained_both_axes")],
          { window_size: 2 },
        ),
        envelope(
          [row("attributed_mrr", "Attributed MRR", "volatile")],
          { window_size: 2 },
        ),
      );
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when zero rows carry an alert-worthy transition (all first_classification/stable)", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
        ]),
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
        ]),
      );
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("returns '' when previous is null (every KPI is first_classification)", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
        ]),
        null,
      );
    expect(
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      ),
    ).toBe("");
  });

  it("suppresses `first_classification` and `stable` rows so only actionable KPIs render", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "volatile"),
          row("clawback_exposure", "Clawback Exposure", "sustained_direction_only"),
        ]),
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
          row("attributed_churn_30d", "Attributed Churn (30d)", "sustained_both_axes"),
        ]),
      );
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).not.toContain("attributed_mrr");
    expect(html).toContain("attributed_churn_30d");
    expect(html).toContain("degraded");
    // clawback_exposure resolves to first_classification (absent from previous)
    // and first_classification is a suppressed transition per the formatter
    // contract — matches P11.113 posture on first_classification suppression.
    expect(html).not.toContain("clawback_exposure");
  });

  it("renders sustained bar + magnitude threshold in the caption", () => {
    const t =
      computeDigestSnapshotPerMetricPersistenceScorecardVerdictTransition(
        envelope([
          row("attributed_mrr", "Attributed MRR", "sustained_both_axes"),
        ]),
        envelope([
          row("attributed_mrr", "Attributed MRR", "volatile"),
        ]),
      );
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        t,
      );
    expect(html).toContain("Per-metric persistence verdict transition");
    expect(html).toContain("sustained bar p90 &ge; 3");
    expect(html).toContain("25.0%");
  });

  it("escapes HTML meta-characters in the summary and token", () => {
    const html =
      formatDigestSnapshotPerMetricPersistenceScorecardVerdictTransitionSection(
        {
          window_size: 4,
          first_week: "2026-W28",
          last_week: "2026-W31",
          sustained_p90_threshold: 3,
          threshold: 0.25,
          rows: [
            {
              key: "attributed_mrr",
              metric_name: "Attributed MRR",
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
    expect(html).toContain("&amp;");
  });
});
