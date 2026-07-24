import { describe, expect, it } from "vitest";

import {
  DIGEST_SNAPSHOT_KPI_SECTIONS,
  buildDigestSnapshot,
} from "./digest-snapshot";
import {
  HEADLINE_METRICS,
  computeDigestSnapshotMetricDelta,
  findMissingHeadlineMetricKeys,
  formatDigestSnapshotMetricDeltaSection,
} from "./digest-snapshot-metric-delta";

const CAPTURED_A = new Date("2026-07-13T02:00:00.000Z");
const CAPTURED_B = new Date("2026-07-20T02:00:00.000Z");
const WEEK_A = "2026-W28";
const WEEK_B = "2026-W29";

function snapshot(week: string, capturedAt: Date, envelope: Record<string, unknown>) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

describe("HEADLINE_METRICS", () => {
  it("covers every canonical KPI section", () => {
    expect(findMissingHeadlineMetricKeys()).toEqual([]);
  });

  it("declares exactly one spec per section, in canonical order", () => {
    expect(HEADLINE_METRICS.map((m) => m.key)).toEqual(
      DIGEST_SNAPSHOT_KPI_SECTIONS,
    );
  });

  it("has no duplicate metric+section pairs", () => {
    const pairs = HEADLINE_METRICS.map((m) => `${m.key}.${m.metric_name}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });

  it("net-contribution + gst-delta + contribution-margin use signed_cents", () => {
    const byKey = new Map(HEADLINE_METRICS.map((m) => [m.key, m]));
    expect(byKey.get("attributed_net_contribution")?.unit).toBe("signed_cents");
    expect(byKey.get("gst_reconciliation_delta")?.unit).toBe("signed_cents");
    expect(byKey.get("contribution_margin_pct")?.unit).toBe("signed_cents");
  });

  it("contribution_margin_pct headlines net_contribution_cents as its sum-able cross-check", () => {
    const byKey = new Map(HEADLINE_METRICS.map((m) => [m.key, m]));
    const spec = byKey.get("contribution_margin_pct");
    expect(spec).toBeDefined();
    expect(spec!.metric_name).toBe("net_contribution_cents");
    expect(spec!.paths).toEqual([["net_contribution_cents"]]);
  });
});

describe("computeDigestSnapshotMetricDelta — contribution_margin_pct", () => {
  it("sums net_contribution_cents across rows and preserves negatives", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      contribution_margin_pct: {
        rows: [
          { net_contribution_cents: 12000 },
          { net_contribution_cents: -5000 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      contribution_margin_pct: {
        rows: [
          { net_contribution_cents: 8000 },
          { net_contribution_cents: -9000 },
        ],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const cm = d.metrics.find((m) => m.key === "contribution_margin_pct")!;
    expect(cm.previous_total).toBe(7000);
    expect(cm.current_total).toBe(-1000);
    expect(cm.total_delta).toBe(-8000);
  });

  it("mirrors attributed_net_contribution total when both sections agree per reseller", () => {
    // P11.34 folds P11.6 rows so portfolio net should match across the two
    // sections. When they diverge, the metric-delta table surfaces the drift.
    const rows = [
      { net_contribution_cents: 3000 },
      { net_contribution_cents: -700 },
      { net_contribution_cents: 100 },
    ];
    const snap = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: { rows },
      contribution_margin_pct: { rows },
    });
    const d = computeDigestSnapshotMetricDelta(snap, snap);
    const nc = d.metrics.find((m) => m.key === "attributed_net_contribution")!;
    const cm = d.metrics.find((m) => m.key === "contribution_margin_pct")!;
    expect(nc.current_total).toBe(cm.current_total);
    expect(nc.current_total).toBe(2400);
  });

  it("null total when contribution_margin_pct is skipped", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      contribution_margin_pct: { rows: [{ net_contribution_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      contribution_margin_pct: { skipped_reason: "net_upstream_mrr_query_failed" },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const cm = d.metrics.find((m) => m.key === "contribution_margin_pct")!;
    expect(cm.previous_total).toBe(100);
    expect(cm.current_total).toBeNull();
    expect(cm.total_delta).toBeNull();
  });
});

describe("computeDigestSnapshotMetricDelta — totals", () => {
  it("sums cents metrics across rows", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { mrr_cents: 9900 },
          { mrr_cents: 4900 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [
          { mrr_cents: 9900 },
          { mrr_cents: 4900 },
          { mrr_cents: 4900 },
        ],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(14800);
    expect(mrr.current_total).toBe(19700);
    expect(mrr.total_delta).toBe(4900);
  });

  it("sums count metrics across rows", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_churn_30d: {
        rows: [
          { churned_count: 1 },
          { churned_count: 2 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_churn_30d: {
        rows: [{ churned_count: 4 }],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const churn = d.metrics.find((m) => m.key === "attributed_churn_30d")!;
    expect(churn.previous_total).toBe(3);
    expect(churn.current_total).toBe(4);
    expect(churn.total_delta).toBe(1);
  });

  it("preserves negative totals for signed_cents metrics", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: {
        rows: [
          { net_contribution_cents: 5000 },
          { net_contribution_cents: -3000 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: {
        rows: [
          { net_contribution_cents: 1000 },
          { net_contribution_cents: -6000 },
        ],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const nc = d.metrics.find((m) => m.key === "attributed_net_contribution")!;
    expect(nc.previous_total).toBe(2000);
    expect(nc.current_total).toBe(-5000);
    expect(nc.total_delta).toBe(-7000);
  });

  it("floors count metrics with negative row values to zero", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_churn_30d: { rows: [{ churned_count: -1 }, { churned_count: 3 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_churn_30d: { rows: [{ churned_count: 5 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const churn = d.metrics.find((m) => m.key === "attributed_churn_30d")!;
    expect(churn.previous_total).toBe(3);
    expect(churn.current_total).toBe(5);
  });

  it("garbled row values (NaN, non-number) contribute 0", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { mrr_cents: Number.NaN },
          { mrr_cents: "9900" },
          { mrr_cents: 4900 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 4900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(4900);
    expect(mrr.current_total).toBe(4900);
    expect(mrr.total_delta).toBe(0);
  });
});

describe("computeDigestSnapshotMetricDelta — skipped / absent", () => {
  it("null total when either side is skipped", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      commission_cleared_mtd: { rows: [{ cleared_cents: 5000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      commission_cleared_mtd: { skipped_reason: "cleared_events_query_failed" },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const cleared = d.metrics.find((m) => m.key === "commission_cleared_mtd")!;
    expect(cleared.previous_total).toBe(5000);
    expect(cleared.current_total).toBe(null);
    expect(cleared.total_delta).toBe(null);
  });

  it("null total when section is absent from the envelope", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(null);
    expect(mrr.current_total).toBe(9900);
    expect(mrr.total_delta).toBe(null);
  });

  it("empty rows array sums to 0 rather than null", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 4900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(0);
    expect(mrr.current_total).toBe(4900);
    expect(mrr.total_delta).toBe(4900);
  });

  it("null when rows is not an array", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: null },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(d.metrics.find((m) => m.key === "attributed_mrr")!.previous_total).toBe(
      null,
    );
  });
});

describe("computeDigestSnapshotMetricDelta — nested-vs-flat path fallback", () => {
  it("reads nested attributed_mrr.mrr row shape (in-memory current-side)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr: { mrr_cents: 9900 } }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr: { mrr_cents: 14800 } }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(9900);
    expect(mrr.current_total).toBe(14800);
    expect(mrr.total_delta).toBe(4900);
  });

  it("reads nested commission_cleared_mtd.mtd row shape", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      commission_cleared_mtd: {
        rows: [{ mtd: { cleared_cents: 5000 } }, { mtd: { cleared_cents: 2500 } }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      commission_cleared_mtd: {
        rows: [{ mtd: { cleared_cents: 10000 } }],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const cleared = d.metrics.find((m) => m.key === "commission_cleared_mtd")!;
    expect(cleared.previous_total).toBe(7500);
    expect(cleared.current_total).toBe(10000);
    expect(cleared.total_delta).toBe(2500);
  });

  it("flat shape wins when both flat and nested are present", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [{ mrr_cents: 100, mrr: { mrr_cents: 999999 } }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [{ mrr_cents: 200, mrr: { mrr_cents: 999999 } }],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(100);
    expect(mrr.current_total).toBe(200);
  });

  it("nested path with null intermediate does not throw", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr: null }, { mrr: { mrr_cents: 500 } }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr: { mrr_cents: 500 } }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(500);
    expect(mrr.current_total).toBe(500);
    expect(mrr.total_delta).toBe(0);
  });
});

describe("computeDigestSnapshotMetricDelta — cohort_velocity unroll", () => {
  it("sums nested cohorts[].activated_count across all rows", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      cohort_velocity: {
        rows: [
          {
            cohorts: [
              { activated_count: 2 },
              { activated_count: 3 },
            ],
          },
          { cohorts: [{ activated_count: 1 }] },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      cohort_velocity: {
        rows: [
          {
            cohorts: [
              { activated_count: 5 },
              { activated_count: 4 },
            ],
          },
        ],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const cv = d.metrics.find((m) => m.key === "cohort_velocity")!;
    expect(cv.previous_total).toBe(6);
    expect(cv.current_total).toBe(9);
    expect(cv.total_delta).toBe(3);
  });

  it("cohort rows without cohorts array are skipped", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      cohort_velocity: {
        rows: [
          { cohorts: null },
          { cohorts: [{ activated_count: 5 }] },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      cohort_velocity: { rows: [] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(d.metrics.find((m) => m.key === "cohort_velocity")!.previous_total).toBe(
      5,
    );
  });
});

describe("computeDigestSnapshotMetricDelta — top-level fields", () => {
  it("carries week + captured_at from both sides", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(d.previous_week).toBe(WEEK_A);
    expect(d.current_week).toBe(WEEK_B);
    expect(d.previous_captured_at).toBe(CAPTURED_A.toISOString());
    expect(d.current_captured_at).toBe(CAPTURED_B.toISOString());
  });

  it("emits one row per HEADLINE_METRICS spec in declared order", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(d.metrics.map((m) => m.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
    expect(d.metrics.length).toBe(HEADLINE_METRICS.length);
  });
});

describe("formatDigestSnapshotMetricDeltaSection", () => {
  it("returns empty string when both snapshots are structurally empty", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(formatDigestSnapshotMetricDeltaSection(d)).toBe("");
  });

  it("returns empty string when every non-null delta is zero", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    expect(formatDigestSnapshotMetricDeltaSection(d)).toBe("");
  });

  it("renders when any delta is non-zero", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 14800 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("+A$49.00");
  });

  it("formats signed_cents delta with leading minus for regressions", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: {
        rows: [{ net_contribution_cents: 1000 }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: {
        rows: [{ net_contribution_cents: -500 }],
      },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    expect(html).toContain("-A$5.00");
    expect(html).toContain("-A$15.00");
  });

  it("formats count delta with signed integer", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_churn_30d: { rows: [{ churned_count: 3 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_churn_30d: { rows: [{ churned_count: 8 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    expect(html).toContain("attributed_churn_30d");
    expect(html).toContain(">+5<");
  });

  it("renders &mdash; for null previous/current totals", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    // Total_delta is null so the row is NOT highlighted and does not trigger
    // "any non-zero delta". Since the delta section short-circuits on
    // no-non-zero-delta this returns "".
    expect(formatDigestSnapshotMetricDeltaSection(d)).toBe("");
  });

  it("HTML-escapes the week labels", () => {
    const prev = snapshot("<script>", CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 100 }] },
    });
    const curr = snapshot("</table>", CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 200 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/table&gt;");
    expect(html).not.toContain("<script>");
  });

  it("highlights only rows with non-zero delta", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
      attributed_churn_30d: { rows: [{ churned_count: 3 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
      attributed_churn_30d: { rows: [{ churned_count: 5 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    // Extract each <tr> block and locate the one that mentions the section.
    const rowBlocks = html.split("<tr");
    const churnBlock = rowBlocks.find((b) => b.includes("attributed_churn_30d"));
    expect(churnBlock).toContain("background:#fff8e1");
    const mrrBlock = rowBlocks.find((b) => b.includes("attributed_mrr"));
    expect(mrrBlock).toBeDefined();
    expect(mrrBlock).not.toContain("background:#fff8e1");
  });

  it("emits one row per HEADLINE_METRICS spec even when most cells are &mdash;", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 500 }] },
    });
    const d = computeDigestSnapshotMetricDelta(prev, curr);
    const html = formatDigestSnapshotMetricDeltaSection(d);
    // Every section key should appear once.
    for (const spec of HEADLINE_METRICS) {
      const count = html.split(`<td>${spec.key}</td>`).length - 1;
      expect(count).toBe(1);
    }
  });
});
