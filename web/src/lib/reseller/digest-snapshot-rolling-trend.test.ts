import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import {
  computeDigestSnapshotRollingTrend,
  formatDigestSnapshotRollingTrendSection,
} from "./digest-snapshot-rolling-trend";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (isoWeek: string, dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotRollingTrend — shape", () => {
  it("returns empty metrics on empty input", () => {
    const t = computeDigestSnapshotRollingTrend([]);
    expect(t.window_size).toBe(0);
    expect(t.first_week).toBeNull();
    expect(t.last_week).toBeNull();
    // metrics list still walks HEADLINE_METRICS so a caller can still iterate
    expect(t.metrics.length).toBeGreaterThan(0);
    for (const m of t.metrics) {
      expect(m.points).toEqual([]);
      expect(m.first_total).toBeNull();
      expect(m.last_total).toBeNull();
      expect(m.delta).toBeNull();
      expect(m.min_total).toBeNull();
      expect(m.max_total).toBeNull();
    }
  });

  it("coerces non-array input to empty", () => {
    const t = computeDigestSnapshotRollingTrend(
      undefined as unknown as never,
    );
    expect(t.window_size).toBe(0);
  });

  it("single-snapshot input walks every metric but delta stays null", () => {
    const one = snap("2026-W28", T("W28", 0), {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const t = computeDigestSnapshotRollingTrend([one]);
    expect(t.window_size).toBe(1);
    expect(t.first_week).toBe("2026-W28");
    expect(t.last_week).toBe("2026-W28");
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points).toHaveLength(1);
    expect(mrr.points[0].total).toBe(9900);
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(9900);
    expect(mrr.delta).toBeNull();
    expect(mrr.min_total).toBe(9900);
    expect(mrr.max_total).toBe(9900);
  });
});

describe("computeDigestSnapshotRollingTrend — trend math", () => {
  it("folds a 4-week attributed_mrr curve into a series + delta", () => {
    const snaps = [9900, 14800, 14800, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(`W${28 + i}`, i * 7), {
        attributed_mrr: { rows: [{ mrr_cents: cents }] },
      }),
    );
    const t = computeDigestSnapshotRollingTrend(snaps);
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points.map((p) => p.total)).toEqual([9900, 14800, 14800, 19700]);
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(19700);
    expect(mrr.delta).toBe(9800);
    expect(mrr.min_total).toBe(9900);
    expect(mrr.max_total).toBe(19700);
  });

  it("null points from skipped sections do not anchor first/last", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
      }),
      snap("2026-W30", T("W30", 14), {
        attributed_mrr: { rows: [{ mrr_cents: 19700 }] },
      }),
      snap("2026-W31", T("W31", 21), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points.map((p) => p.total)).toEqual([null, 9900, 19700, null]);
    // first/last skip nulls so a leading/trailing skip does not flatten the delta
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(19700);
    expect(mrr.delta).toBe(9800);
    expect(mrr.min_total).toBe(9900);
    expect(mrr.max_total).toBe(19700);
  });

  it("all-skipped section yields all-null across the window", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points.every((p) => p.total === null)).toBe(true);
    expect(mrr.first_total).toBeNull();
    expect(mrr.last_total).toBeNull();
    expect(mrr.delta).toBeNull();
    expect(mrr.min_total).toBeNull();
    expect(mrr.max_total).toBeNull();
  });

  it("signed_cents metrics preserve negative values in the series + delta", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_net_contribution: {
          rows: [{ net_contribution_cents: -1200 }],
        },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_net_contribution: {
          rows: [{ net_contribution_cents: 800 }],
        },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const net = t.metrics.find(
      (m) => m.key === "attributed_net_contribution",
    )!;
    expect(net.unit).toBe("signed_cents");
    expect(net.points.map((p) => p.total)).toEqual([-1200, 800]);
    expect(net.delta).toBe(2000);
    expect(net.min_total).toBe(-1200);
    expect(net.max_total).toBe(800);
  });

  it("count metrics floor garbled rows to 0 rather than NaN-poisoning", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_churn_30d: {
          rows: [{ churned_count: 3 }, { churned_count: -1 }],
        },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_churn_30d: {
          rows: [
            { churned_count: 1 },
            { churned_count: Number.POSITIVE_INFINITY },
          ],
        },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const churn = t.metrics.find((m) => m.key === "attributed_churn_30d")!;
    expect(churn.points.map((p) => p.total)).toEqual([3, 1]);
    expect(churn.delta).toBe(-2);
  });

  it("cohort_velocity unrolls nested cohorts across the window", () => {
    const mkRow = (activated: number) => ({
      cohorts: [{ activated_count: activated }, { activated_count: 1 }],
    });
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        cohort_velocity: { rows: [mkRow(2)] },
      }),
      snap("2026-W29", T("W29", 7), {
        cohort_velocity: { rows: [mkRow(5)] },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const c = t.metrics.find((m) => m.key === "cohort_velocity")!;
    expect(c.points.map((p) => p.total)).toEqual([3, 6]);
    expect(c.delta).toBe(3);
  });

  it("nested-vs-flat path fallback keeps the delta symmetric across shapes", () => {
    const prev = snap("2026-W28", T("W28", 0), {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] }, // flat / from disk
    });
    const curr = snap("2026-W29", T("W29", 7), {
      attributed_mrr: { rows: [{ mrr: { mrr_cents: 14800 } }] }, // nested / in-memory
    });
    const t = computeDigestSnapshotRollingTrend([prev, curr]);
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points.map((p) => p.total)).toEqual([9900, 14800]);
    expect(mrr.delta).toBe(4900);
  });

  it("carries week + captured_at onto each point in input order", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_mrr: { rows: [{ mrr_cents: 100 }] },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_mrr: { rows: [{ mrr_cents: 200 }] },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const mrr = t.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.points.map((p) => p.week)).toEqual(["2026-W28", "2026-W29"]);
    expect(mrr.points[0].captured_at).toContain("2026-07-06");
    expect(mrr.points[1].captured_at).toContain("2026-07-13");
  });
});

describe("formatDigestSnapshotRollingTrendSection", () => {
  it("returns '' when the window is a single snapshot", () => {
    const one = snap("2026-W28", T("W28", 0), {
      attributed_mrr: { rows: [{ mrr_cents: 9900 }] },
    });
    const t = computeDigestSnapshotRollingTrend([one]);
    expect(formatDigestSnapshotRollingTrendSection(t)).toBe("");
  });

  it("returns '' when every metric has null delta (window fully skipped)", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {}),
      snap("2026-W29", T("W29", 7), {}),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    expect(formatDigestSnapshotRollingTrendSection(t)).toBe("");
  });

  it("renders a table with one column per week + delta column", () => {
    const snaps = [9900, 14800, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(`W${28 + i}`, i * 7), {
        attributed_mrr: { rows: [{ mrr_cents: cents }] },
      }),
    );
    const t = computeDigestSnapshotRollingTrend(snaps);
    const html = formatDigestSnapshotRollingTrendSection(t);
    expect(html).toContain("rolling 3-week trend");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W29");
    expect(html).toContain("2026-W30");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("A$197.00");
    // delta column: +A$98.00
    expect(html).toContain("+A$98.00");
  });

  it("sorts metric rows by |delta| desc", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_mrr: { rows: [{ mrr_cents: 100 }] },
        attributed_churn_30d: { rows: [{ churned_count: 10 }] },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_mrr: { rows: [{ mrr_cents: 200 }] },
        attributed_churn_30d: { rows: [{ churned_count: 100 }] },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const html = formatDigestSnapshotRollingTrendSection(t);
    const mrrPos = html.indexOf("attributed_mrr");
    const churnPos = html.indexOf("attributed_churn_30d");
    // churn delta is 90 (count units), mrr delta is 100 cents (=1 aud) — churn has larger |90| > |100|? No, 100 > 90 → mrr sorts first
    // Wait: mrr.delta = 100 (cents number), churn.delta = 90 (count number)
    // |100| > |90| so mrr should render first.
    expect(mrrPos).toBeGreaterThan(-1);
    expect(churnPos).toBeGreaterThan(-1);
    expect(mrrPos).toBeLessThan(churnPos);
  });

  it("highlights rows with non-zero delta and renders &mdash; for skipped cells", () => {
    const snaps = [
      snap("2026-W28", T("W28", 0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
        attributed_churn_30d: { rows: [{ churned_count: 5 }] },
      }),
      snap("2026-W29", T("W29", 7), {
        attributed_mrr: { rows: [{ mrr_cents: 500 }] },
        attributed_churn_30d: { rows: [{ churned_count: 5 }] },
      }),
      snap("2026-W30", T("W30", 14), {
        attributed_mrr: { rows: [{ mrr_cents: 900 }] },
        attributed_churn_30d: { rows: [{ churned_count: 5 }] },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const html = formatDigestSnapshotRollingTrendSection(t);
    expect(html).toContain("&mdash;"); // W28 mrr cell skipped
    expect(html).toContain("background:#fff8e1"); // mrr moved 500→900 → highlighted
    // churn is flat at 5 → no highlight
    expect(html).toContain("A$5.00"); // W29 mrr cell
    expect(html).toContain("A$9.00"); // W30 mrr cell
    expect(html).toContain("+A$4.00"); // delta cell
  });

  it("HTML-escapes week labels", () => {
    const snaps = [
      snap("<W28>", T("W28", 0), {
        attributed_mrr: { rows: [{ mrr_cents: 100 }] },
      }),
      snap("<W29>", T("W29", 7), {
        attributed_mrr: { rows: [{ mrr_cents: 200 }] },
      }),
    ];
    const t = computeDigestSnapshotRollingTrend(snaps);
    const html = formatDigestSnapshotRollingTrendSection(t);
    expect(html).not.toContain("<W28>");
    expect(html).toContain("&lt;W28&gt;");
    expect(html).toContain("&lt;W29&gt;");
  });
});
