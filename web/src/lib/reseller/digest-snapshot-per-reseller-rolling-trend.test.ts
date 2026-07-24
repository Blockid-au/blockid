import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import {
  computeDigestSnapshotPerResellerRollingTrend,
  formatDigestSnapshotPerResellerRollingTrendSection,
} from "./digest-snapshot-per-reseller-rolling-trend";

function snap(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

const T = (dayOffset: number) =>
  new Date(`2026-07-${String(6 + dayOffset).padStart(2, "0")}T02:00:00.000Z`);

describe("computeDigestSnapshotPerResellerRollingTrend — shape", () => {
  it("returns empty rows on empty input", () => {
    const t = computeDigestSnapshotPerResellerRollingTrend([]);
    expect(t.window_size).toBe(0);
    expect(t.first_week).toBeNull();
    expect(t.last_week).toBeNull();
    expect(t.rows).toEqual([]);
  });

  it("coerces non-array input to empty", () => {
    const t = computeDigestSnapshotPerResellerRollingTrend(
      undefined as unknown as never,
    );
    expect(t.window_size).toBe(0);
    expect(t.rows).toEqual([]);
  });

  it("single-snapshot input still emits rows but delta stays null", () => {
    const one = snap("2026-W28", T(0), {
      attributed_mrr: {
        rows: [{ reseller_code: "INFOVISION", mrr_cents: 9900 }],
      },
    });
    const t = computeDigestSnapshotPerResellerRollingTrend([one]);
    expect(t.window_size).toBe(1);
    expect(t.first_week).toBe("2026-W28");
    expect(t.last_week).toBe("2026-W28");
    const mrr = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    )!;
    expect(mrr.points).toHaveLength(1);
    expect(mrr.points[0].total).toBe(9900);
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(9900);
    expect(mrr.delta).toBeNull();
    expect(mrr.min_total).toBe(9900);
    expect(mrr.max_total).toBe(9900);
  });
});

describe("computeDigestSnapshotPerResellerRollingTrend — trend math", () => {
  it("folds a 4-week per-reseller attributed_mrr curve into a series + delta", () => {
    const snaps = [9900, 14800, 14800, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const mrr = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    )!;
    expect(mrr.points.map((p) => p.total)).toEqual([9900, 14800, 14800, 19700]);
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(19700);
    expect(mrr.delta).toBe(9800);
    expect(mrr.min_total).toBe(9900);
    expect(mrr.max_total).toBe(19700);
  });

  it("emits null points for weeks where the reseller was absent", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "INFOVISION", mrr_cents: 200 },
            { reseller_code: "NEWCO", mrr_cents: 500 },
          ],
        },
      }),
      snap("2026-W30", T(14), {
        attributed_mrr: {
          rows: [
            { reseller_code: "INFOVISION", mrr_cents: 300 },
            { reseller_code: "NEWCO", mrr_cents: 700 },
          ],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const newco = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "NEWCO",
    )!;
    expect(newco.points.map((p) => p.total)).toEqual([null, 500, 700]);
    // first/last skip nulls so a mid-window join still gets a delta from first
    // observed → last observed value
    expect(newco.first_total).toBe(500);
    expect(newco.last_total).toBe(700);
    expect(newco.delta).toBe(200);
  });

  it("null points from skipped sections do not anchor first/last", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 9900 }],
        },
      }),
      snap("2026-W30", T(14), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 19700 }],
        },
      }),
      snap("2026-W31", T(21), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const mrr = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    )!;
    expect(mrr.points.map((p) => p.total)).toEqual([null, 9900, 19700, null]);
    expect(mrr.first_total).toBe(9900);
    expect(mrr.last_total).toBe(19700);
    expect(mrr.delta).toBe(9800);
  });

  it("emits a null-delta row for a reseller present in only one snapshot", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "ONEHIT", mrr_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "OTHER", mrr_cents: 200 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const onehit = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "ONEHIT",
    )!;
    expect(onehit.points.map((p) => p.total)).toEqual([100, null]);
    expect(onehit.first_total).toBe(100);
    expect(onehit.last_total).toBe(100);
    // Only one non-null point → delta is null (need two)
    expect(onehit.delta).toBeNull();
  });

  it("all-skipped section yields no rows for that metric", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    // Nothing to sum from either snapshot → union of codes is empty for the
    // attributed_mrr metric → no rows for that key
    const mrrRows = t.rows.filter((r) => r.key === "attributed_mrr");
    expect(mrrRows).toEqual([]);
  });

  it("signed_cents metrics preserve negative values in the series + delta", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_net_contribution: {
          rows: [{ reseller_code: "INFOVISION", net_contribution_cents: -1200 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_net_contribution: {
          rows: [{ reseller_code: "INFOVISION", net_contribution_cents: 800 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const net = t.rows.find(
      (r) =>
        r.key === "attributed_net_contribution" &&
        r.reseller_code === "INFOVISION",
    )!;
    expect(net.unit).toBe("signed_cents");
    expect(net.points.map((p) => p.total)).toEqual([-1200, 800]);
    expect(net.delta).toBe(2000);
    expect(net.min_total).toBe(-1200);
    expect(net.max_total).toBe(800);
  });

  it("count metrics floor negative row values to 0", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_churn_30d: {
          rows: [
            { reseller_code: "INFOVISION", churned_count: 3 },
            { reseller_code: "INFOVISION", churned_count: -1 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_churn_30d: {
          rows: [
            { reseller_code: "INFOVISION", churned_count: 1 },
            {
              reseller_code: "INFOVISION",
              churned_count: Number.POSITIVE_INFINITY,
            },
          ],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const churn = t.rows.find(
      (r) =>
        r.key === "attributed_churn_30d" && r.reseller_code === "INFOVISION",
    )!;
    expect(churn.points.map((p) => p.total)).toEqual([3, 1]);
    expect(churn.delta).toBe(-2);
  });

  it("cohort_velocity unrolls nested cohorts per reseller across the window", () => {
    const mkRow = (code: string, activated: number) => ({
      reseller_code: code,
      cohorts: [{ activated_count: activated }, { activated_count: 1 }],
    });
    const snaps = [
      snap("2026-W28", T(0), {
        cohort_velocity: { rows: [mkRow("INFOVISION", 2)] },
      }),
      snap("2026-W29", T(7), {
        cohort_velocity: { rows: [mkRow("INFOVISION", 5)] },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const c = t.rows.find(
      (r) =>
        r.key === "cohort_velocity" && r.reseller_code === "INFOVISION",
    )!;
    expect(c.points.map((p) => p.total)).toEqual([3, 6]);
    expect(c.delta).toBe(3);
  });

  it("nested-vs-flat path fallback keeps the delta symmetric across shapes", () => {
    const prev = snap("2026-W28", T(0), {
      attributed_mrr: {
        rows: [{ reseller_code: "INFOVISION", mrr_cents: 9900 }],
      },
    });
    const curr = snap("2026-W29", T(7), {
      attributed_mrr: {
        rows: [
          { reseller_code: "INFOVISION", mrr: { mrr_cents: 14800 } },
        ],
      },
    });
    const t = computeDigestSnapshotPerResellerRollingTrend([prev, curr]);
    const mrr = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    )!;
    expect(mrr.points.map((p) => p.total)).toEqual([9900, 14800]);
    expect(mrr.delta).toBe(4900);
  });

  it("skips rows without a reseller_code", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: { rows: [{ mrr_cents: 100 }] },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [{ mrr_cents: 200 }] },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    // No reseller_code on any row → union is empty → no rows emitted
    expect(t.rows.filter((r) => r.key === "attributed_mrr")).toEqual([]);
  });

  it("sorts per-metric rows by |delta| desc then reseller_code asc", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: 100 },
            { reseller_code: "BBB", mrr_cents: 100 },
            { reseller_code: "CCC", mrr_cents: 100 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "AAA", mrr_cents: 500 }, // delta +400
            { reseller_code: "BBB", mrr_cents: 100 }, // delta 0 (filtered by formatter but still in rows)
            { reseller_code: "CCC", mrr_cents: 900 }, // delta +800
          ],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const mrrRows = t.rows.filter((r) => r.key === "attributed_mrr");
    // CCC (|800|) > AAA (|400|) > BBB (|0|)
    expect(mrrRows.map((r) => r.reseller_code)).toEqual(["CCC", "AAA", "BBB"]);
  });

  it("carries week + captured_at onto each point in input order", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 200 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const mrr = t.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "INFOVISION",
    )!;
    expect(mrr.points.map((p) => p.week)).toEqual(["2026-W28", "2026-W29"]);
    expect(mrr.points[0].captured_at).toContain("2026-07-06");
    expect(mrr.points[1].captured_at).toContain("2026-07-13");
  });
});

describe("formatDigestSnapshotPerResellerRollingTrendSection", () => {
  it("returns '' when the window is a single snapshot", () => {
    const one = snap("2026-W28", T(0), {
      attributed_mrr: {
        rows: [{ reseller_code: "INFOVISION", mrr_cents: 9900 }],
      },
    });
    const t = computeDigestSnapshotPerResellerRollingTrend([one]);
    expect(formatDigestSnapshotPerResellerRollingTrendSection(t)).toBe("");
  });

  it("returns '' when every row has a zero delta (flat window)", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 100 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 100 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    expect(formatDigestSnapshotPerResellerRollingTrendSection(t)).toBe("");
  });

  it("renders a table with one column per week + delta column", () => {
    const snaps = [9900, 14800, 19700].map((cents, i) =>
      snap(`2026-W${28 + i}`, T(i * 7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: cents }],
        },
      }),
    );
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const html = formatDigestSnapshotPerResellerRollingTrendSection(t);
    expect(html).toContain("per-reseller rolling 3-week trend");
    expect(html).toContain("2026-W28");
    expect(html).toContain("2026-W29");
    expect(html).toContain("2026-W30");
    expect(html).toContain("INFOVISION");
    expect(html).toContain("A$99.00");
    expect(html).toContain("A$148.00");
    expect(html).toContain("A$197.00");
    expect(html).toContain("+A$98.00");
  });

  it("highlights rows with non-zero delta and renders &mdash; for skipped cells", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 500 }],
        },
      }),
      snap("2026-W30", T(14), {
        attributed_mrr: {
          rows: [{ reseller_code: "INFOVISION", mrr_cents: 900 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const html = formatDigestSnapshotPerResellerRollingTrendSection(t);
    expect(html).toContain("&mdash;"); // W28 cell is skipped
    expect(html).toContain("background:#fff8e1"); // INFOVISION moved 500→900
    expect(html).toContain("A$5.00");
    expect(html).toContain("A$9.00");
    expect(html).toContain("+A$4.00");
  });

  it("emits a null-delta row for a started/stopped partner", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "STARTED", mrr_cents: 700 }],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: { rows: [] },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const html = formatDigestSnapshotPerResellerRollingTrendSection(t);
    expect(html).toContain("STARTED");
    // Only one non-null point → delta null → &mdash; in the delta column
    expect(html).toMatch(/STARTED[\s\S]*&mdash;/);
  });

  it("HTML-escapes week labels and reseller codes", () => {
    const snaps = [
      snap("<W28>", T(0), {
        attributed_mrr: {
          rows: [{ reseller_code: "<X&Y>", mrr_cents: 100 }],
        },
      }),
      snap("<W29>", T(7), {
        attributed_mrr: {
          rows: [{ reseller_code: "<X&Y>", mrr_cents: 200 }],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const html = formatDigestSnapshotPerResellerRollingTrendSection(t);
    expect(html).not.toContain("<W28>");
    expect(html).not.toContain("<X&Y>");
    expect(html).toContain("&lt;W28&gt;");
    expect(html).toContain("&lt;W29&gt;");
    expect(html).toContain("&lt;X&amp;Y&gt;");
  });

  it("filters zero-delta rows even when other rows have non-zero deltas", () => {
    const snaps = [
      snap("2026-W28", T(0), {
        attributed_mrr: {
          rows: [
            { reseller_code: "MOVER", mrr_cents: 100 },
            { reseller_code: "FLAT", mrr_cents: 500 },
          ],
        },
      }),
      snap("2026-W29", T(7), {
        attributed_mrr: {
          rows: [
            { reseller_code: "MOVER", mrr_cents: 900 },
            { reseller_code: "FLAT", mrr_cents: 500 },
          ],
        },
      }),
    ];
    const t = computeDigestSnapshotPerResellerRollingTrend(snaps);
    const html = formatDigestSnapshotPerResellerRollingTrendSection(t);
    expect(html).toContain("MOVER");
    // FLAT is 500→500 (delta 0) — filtered
    expect(html).not.toContain("FLAT");
  });
});
