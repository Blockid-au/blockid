import { describe, expect, it } from "vitest";

import { buildDigestSnapshot } from "./digest-snapshot";
import { HEADLINE_METRICS } from "./digest-snapshot-metric-delta";
import {
  PCT_CHANGE_MATERIAL_THRESHOLD,
  computeDigestSnapshotMetricPctChange,
  formatDigestSnapshotMetricPctChangeSection,
} from "./digest-snapshot-metric-pct-change";

const CAPTURED_A = new Date("2026-07-13T02:00:00.000Z");
const CAPTURED_B = new Date("2026-07-20T02:00:00.000Z");
const WEEK_A = "2026-W28";
const WEEK_B = "2026-W29";

function snapshot(week: string, capturedAt: Date, envelope: Record<string, unknown>) {
  return buildDigestSnapshot({ capturedAt, week, envelope });
}

describe("computeDigestSnapshotMetricPctChange — basic math", () => {
  it("emits one row per HEADLINE_METRICS spec in declared order", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    expect(d.metrics.length).toBe(HEADLINE_METRICS.length);
    expect(d.metrics.map((m) => m.key)).toEqual(
      HEADLINE_METRICS.map((s) => s.key),
    );
  });

  it("computes signed percent change rounded to one decimal", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 12345 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(10000);
    expect(mrr.current_total).toBe(12345);
    expect(mrr.pct_change).toBe(23.5);
  });

  it("returns null pct_change when previous is exactly zero (launch week)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 0 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 5000 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(0);
    expect(mrr.current_total).toBe(5000);
    expect(mrr.pct_change).toBeNull();
  });

  it("returns null pct_change when the section is absent on either side", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBe(10000);
    expect(mrr.current_total).toBeNull();
    expect(mrr.pct_change).toBeNull();
  });

  it("returns null pct_change when the section is skipped on either side", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { skipped_reason: "query_failed" },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 5000 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.previous_total).toBeNull();
    expect(mrr.pct_change).toBeNull();
  });

  it("handles signed_cents metric flipping sign — magnitude relative to |previous|", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: {
        rows: [{ net_contribution_cents: -500 }],
      },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: {
        rows: [{ net_contribution_cents: 500 }],
      },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const nc = d.metrics.find(
      (m) => m.key === "attributed_net_contribution",
    )!;
    expect(nc.previous_total).toBe(-500);
    expect(nc.current_total).toBe(500);
    // delta = +1000, |previous| = 500, sign follows delta → +200%
    expect(nc.pct_change).toBe(200);
  });

  it("negative pct_change for a regression", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 20000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 15000 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const mrr = d.metrics.find((m) => m.key === "attributed_mrr")!;
    expect(mrr.pct_change).toBe(-25);
  });

  it("carries week + captured_at from both sides", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    expect(d.previous_week).toBe(WEEK_A);
    expect(d.current_week).toBe(WEEK_B);
    expect(d.previous_captured_at).toBe(CAPTURED_A.toISOString());
    expect(d.current_captured_at).toBe(CAPTURED_B.toISOString());
  });

  it("cross-checks attributed_net_contribution vs contribution_margin_pct percent match", () => {
    // Both sections consume the same underlying P11.6 net rows; the two
    // headlines therefore agree on portfolio net → their pct_change should
    // be identical when both are present.
    const rows = [{ net_contribution_cents: 4000 }, { net_contribution_cents: -1000 }];
    const rowsB = [{ net_contribution_cents: 6000 }, { net_contribution_cents: -1000 }];
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_net_contribution: { rows },
      contribution_margin_pct: { rows },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_net_contribution: { rows: rowsB },
      contribution_margin_pct: { rows: rowsB },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const nc = d.metrics.find((m) => m.key === "attributed_net_contribution")!;
    const cm = d.metrics.find((m) => m.key === "contribution_margin_pct")!;
    expect(nc.pct_change).toBe(cm.pct_change);
    // previous = 3000, current = 5000 → +2000/3000 = 66.7%
    expect(nc.pct_change).toBe(66.7);
  });
});

describe("formatDigestSnapshotMetricPctChangeSection", () => {
  it("returns empty string when every metric row's pct_change is null", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {});
    const curr = snapshot(WEEK_B, CAPTURED_B, {});
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    expect(formatDigestSnapshotMetricPctChangeSection(d)).toBe("");
  });

  it("returns empty string when only null-pct rows exist (previous=0 launch)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 0 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 5000 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    expect(formatDigestSnapshotMetricPctChangeSection(d)).toBe("");
  });

  it("renders rows sorted by |pct_change| desc", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
      attributed_churn_30d: { rows: [{ churned_count: 10 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 11000 }] }, // +10%
      attributed_churn_30d: { rows: [{ churned_count: 20 }] }, // +100%
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    const churnIdx = html.indexOf("attributed_churn_30d");
    const mrrIdx = html.indexOf("attributed_mrr");
    expect(churnIdx).toBeGreaterThan(-1);
    expect(mrrIdx).toBeGreaterThan(-1);
    expect(churnIdx).toBeLessThan(mrrIdx);
  });

  it("highlights only rows whose |pct_change| >= material threshold", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
      attributed_churn_30d: { rows: [{ churned_count: 10 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 10500 }] }, // +5% below threshold
      attributed_churn_30d: { rows: [{ churned_count: 15 }] }, // +50% above
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    const rowBlocks = html.split("<tr");
    const churn = rowBlocks.find((b) => b.includes("attributed_churn_30d"));
    const mrr = rowBlocks.find((b) => b.includes("attributed_mrr"));
    expect(churn).toContain("background:#fff8e1");
    expect(mrr).not.toContain("background:#fff8e1");
  });

  it("formats positive pct with leading + and one decimal", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 12500 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    expect(html).toContain("+25.0%");
  });

  it("formats negative pct with leading minus and one decimal", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 7500 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    expect(html).toContain("-25.0%");
  });

  it("HTML-escapes the week labels", () => {
    const prev = snapshot("<script>", CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 100 }] },
    });
    const curr = snapshot("</table>", CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 200 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/table&gt;");
    expect(html).not.toContain("<script>");
  });

  it("threshold constant equals 25 (matches ops convention for material change)", () => {
    expect(PCT_CHANGE_MATERIAL_THRESHOLD).toBe(25);
  });

  it("only ranks metrics with non-null pct_change (drops absent/skipped)", () => {
    const prev = snapshot(WEEK_A, CAPTURED_A, {
      attributed_mrr: { rows: [{ mrr_cents: 10000 }] },
    });
    const curr = snapshot(WEEK_B, CAPTURED_B, {
      attributed_mrr: { rows: [{ mrr_cents: 12000 }] },
    });
    const d = computeDigestSnapshotMetricPctChange(prev, curr);
    const html = formatDigestSnapshotMetricPctChangeSection(d);
    // Only the ranked row should appear in the body — every other section is
    // absent on both sides and therefore null-pct.
    expect(html).toContain("attributed_mrr");
    expect(html).not.toContain("attributed_churn_30d");
    expect(html).not.toContain("ledger_drift_events");
  });
});
