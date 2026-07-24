import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import {
  computeDigestSnapshotPerResellerDelta,
  formatDigestSnapshotPerResellerDeltaSection,
} from "./digest-snapshot-per-reseller-delta";

const CAPTURED_A = new Date("2026-07-13T02:00:00.000Z");
const CAPTURED_B = new Date("2026-07-20T02:00:00.000Z");
const WEEK_A = "2026-W28";
const WEEK_B = "2026-W29";

function snapshot(
  week: string,
  capturedAt: Date,
  envelope: Record<string, unknown>,
) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

describe("computeDigestSnapshotPerResellerDelta — per-reseller totals", () => {
  it("returns empty rows when both snapshots hold no KPI sections", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    expect(delta.rows).toEqual([]);
    expect(delta.previous_week).toBe(WEEK_A);
    expect(delta.current_week).toBe(WEEK_B);
  });

  it("emits per-reseller row for cents metric with delta", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { reseller_code: "INFOVISION", mrr_cents: 9900 },
          { reseller_code: "PARTNER_B", mrr_cents: 4900 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [
          { reseller_code: "INFOVISION", mrr_cents: 19800 },
          { reseller_code: "PARTNER_B", mrr_cents: 4900 },
        ],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const mrrRows = delta.rows.filter((r) => r.key === "attributed_mrr");
    expect(mrrRows).toHaveLength(2);
    const infovision = mrrRows.find((r) => r.reseller_code === "INFOVISION");
    expect(infovision).toBeDefined();
    expect(infovision?.previous_total).toBe(9900);
    expect(infovision?.current_total).toBe(19800);
    expect(infovision?.total_delta).toBe(9900);
    const partnerB = mrrRows.find((r) => r.reseller_code === "PARTNER_B");
    expect(partnerB?.total_delta).toBe(0);
  });

  it("sorts per-metric rows by |delta| desc then reseller_code asc", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      commission_cleared_mtd: {
        rows: [
          { reseller_code: "AAA", cleared_cents: 100 },
          { reseller_code: "BBB", cleared_cents: 200 },
          { reseller_code: "CCC", cleared_cents: 500 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      commission_cleared_mtd: {
        rows: [
          { reseller_code: "AAA", cleared_cents: 1100 },
          { reseller_code: "BBB", cleared_cents: 100 },
          { reseller_code: "CCC", cleared_cents: 500 },
        ],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const rows = delta.rows.filter((r) => r.key === "commission_cleared_mtd");
    expect(rows.map((r) => r.reseller_code)).toEqual(["AAA", "BBB", "CCC"]);
    expect(rows[0].total_delta).toBe(1000);
    expect(rows[1].total_delta).toBe(-100);
    expect(rows[2].total_delta).toBe(0);
  });

  it("respects HEADLINE_METRICS canonical order across metrics", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
      budget_utilization: { rows: [{ reseller_code: "X", grant_used: 5 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 200 }] },
      budget_utilization: { rows: [{ reseller_code: "X", grant_used: 10 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const keys = delta.rows.map((r) => r.key);
    // budget_utilization appears before attributed_mrr in HEADLINE_METRICS
    expect(keys.indexOf("budget_utilization")).toBeLessThan(
      keys.indexOf("attributed_mrr"),
    );
  });

  it("null previous_total when reseller only appears in current snapshot", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "OLD", mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [
          { reseller_code: "OLD", mrr_cents: 100 },
          { reseller_code: "NEW", mrr_cents: 500 },
        ],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const newRow = delta.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "NEW",
    );
    expect(newRow?.previous_total).toBeNull();
    expect(newRow?.current_total).toBe(500);
    expect(newRow?.total_delta).toBeNull();
  });

  it("null current_total when reseller only appears in previous snapshot", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { reseller_code: "OLD", mrr_cents: 100 },
          { reseller_code: "GONE", mrr_cents: 300 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "OLD", mrr_cents: 100 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const goneRow = delta.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "GONE",
    );
    expect(goneRow?.previous_total).toBe(300);
    expect(goneRow?.current_total).toBeNull();
    expect(goneRow?.total_delta).toBeNull();
  });

  it("null both sides when section is skipped on both snapshots", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    // Skipped-both → union of codes is empty → no rows land under this metric
    const mrrRows = delta.rows.filter((r) => r.key === "attributed_mrr");
    expect(mrrRows).toEqual([]);
  });

  it("null previous_total when previous section skipped but current present", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { skipped_reason: "mrr_subs_query_failed" },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 500 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const row = delta.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "X",
    );
    expect(row?.previous_total).toBeNull();
    expect(row?.current_total).toBe(500);
    expect(row?.total_delta).toBeNull();
  });

  it("signed_cents preserves negative net_contribution delta", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: {
        rows: [{ reseller_code: "X", net_contribution_cents: 500 }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: {
        rows: [{ reseller_code: "X", net_contribution_cents: -200 }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const row = delta.rows.find(
      (r) => r.key === "attributed_net_contribution" && r.reseller_code === "X",
    );
    expect(row?.previous_total).toBe(500);
    expect(row?.current_total).toBe(-200);
    expect(row?.total_delta).toBe(-700);
  });

  it("count units floor negative row values to zero (garbled row poisoning)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_churn_30d: {
        rows: [
          { reseller_code: "X", churned_count: 5 },
          { reseller_code: "X", churned_count: -100 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_churn_30d: {
        rows: [{ reseller_code: "X", churned_count: 5 }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const row = delta.rows.find((r) => r.key === "attributed_churn_30d");
    expect(row?.previous_total).toBe(5);
    expect(row?.current_total).toBe(5);
    expect(row?.total_delta).toBe(0);
  });

  it("cohort_velocity unrolls per-reseller nested cohorts[]", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      cohort_velocity: {
        rows: [
          {
            reseller_code: "X",
            cohorts: [
              { activated_count: 3 },
              { activated_count: 2 },
            ],
          },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      cohort_velocity: {
        rows: [
          {
            reseller_code: "X",
            cohorts: [
              { activated_count: 4 },
              { activated_count: 4 },
            ],
          },
        ],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const row = delta.rows.find((r) => r.key === "cohort_velocity");
    expect(row?.previous_total).toBe(5);
    expect(row?.current_total).toBe(8);
    expect(row?.total_delta).toBe(3);
  });

  it("skips rows with missing reseller_code (defensive parse)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { mrr_cents: 100 },
          { reseller_code: "", mrr_cents: 500 },
          { reseller_code: "X", mrr_cents: 700 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 900 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const rows = delta.rows.filter((r) => r.key === "attributed_mrr");
    expect(rows).toHaveLength(1);
    expect(rows[0].reseller_code).toBe("X");
  });

  it("nested-path fallback resolves in-memory shape for attributed_mrr", () => {
    // Persisted body carries flat mrr_cents; in-memory current side may carry
    // nested {mrr: {mrr_cents}} — the paths[] fallback should read both.
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [{ reseller_code: "X", mrr: { mrr_cents: 500 } }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const row = delta.rows.find(
      (r) => r.key === "attributed_mrr" && r.reseller_code === "X",
    );
    expect(row?.previous_total).toBe(100);
    expect(row?.current_total).toBe(500);
    expect(row?.total_delta).toBe(400);
  });

  it("carries captured_at + week from both snapshots", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    expect(delta.previous_captured_at).toBe(CAPTURED_A.toISOString());
    expect(delta.current_captured_at).toBe(CAPTURED_B.toISOString());
    expect(delta.previous_week).toBe(WEEK_A);
    expect(delta.current_week).toBe(WEEK_B);
  });
});

describe("formatDigestSnapshotPerResellerDeltaSection — HTML", () => {
  it("returns empty string when every delta is zero", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    expect(formatDigestSnapshotPerResellerDeltaSection(delta)).toBe("");
  });

  it("renders <table> when any delta is non-zero", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 500 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("<table");
    expect(html).toContain("attributed_mrr");
    expect(html).toContain("mrr_cents");
    expect(html).toContain("X");
    expect(html).toContain("A$5.00");
    expect(html).toContain("+A$4.00");
  });

  it("highlights non-zero-delta rows with amber background", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 100 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "X", mrr_cents: 500 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("background:#fff8e1");
  });

  it("renders null-delta started-partner row with mdash", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ reseller_code: "NEW", mrr_cents: 500 }] },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("NEW");
    expect(html).toContain("&mdash;");
    expect(html).toContain("A$5.00");
  });

  it("escapes reseller_code + week HTML", () => {
    const prev = snapshot("<W&A>", CAPTURED_A, {
      attributed_mrr: {
        rows: [{ reseller_code: "<code>", mrr_cents: 100 }],
      },
    });
    const curr = snapshot("<W&B>", CAPTURED_B, {
      attributed_mrr: {
        rows: [{ reseller_code: "<code>", mrr_cents: 200 }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("&lt;W&amp;A&gt;");
    expect(html).toContain("&lt;W&amp;B&gt;");
    expect(html).toContain("&lt;code&gt;");
    expect(html).not.toContain("<code>");
  });

  it("filters out zero-delta rows but keeps non-zero mixed with them", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: {
        rows: [
          { reseller_code: "A", mrr_cents: 100 },
          { reseller_code: "B", mrr_cents: 200 },
        ],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: {
        rows: [
          { reseller_code: "A", mrr_cents: 500 },
          { reseller_code: "B", mrr_cents: 200 },
        ],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain(">A<");
    // B is zero-delta so should not appear as a body cell
    // (rough check via body pattern — data cell begins with <td>B</td>)
    expect(html).not.toMatch(/<td>B<\/td>/);
  });

  it("renders signed_cents negative delta with leading minus", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: {
        rows: [{ reseller_code: "X", net_contribution_cents: 500 }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: {
        rows: [{ reseller_code: "X", net_contribution_cents: -200 }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("-A$7.00");
  });

  it("count delta with plus sign for positive", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_churn_30d: {
        rows: [{ reseller_code: "X", churned_count: 2 }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_churn_30d: {
        rows: [{ reseller_code: "X", churned_count: 10 }],
      },
    });
    const delta = computeDigestSnapshotPerResellerDelta(prev, curr);
    const html = formatDigestSnapshotPerResellerDeltaSection(delta);
    expect(html).toContain("+8");
  });
});
