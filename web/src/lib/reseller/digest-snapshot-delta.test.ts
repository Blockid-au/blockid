import { describe, expect, it } from "vitest";
import {
  DIGEST_SNAPSHOT_KPI_SECTIONS,
  buildDigestSnapshot,
  type DigestSnapshotEnvelope,
} from "./digest-snapshot";
import {
  computeDigestSnapshotDelta,
  formatDigestSnapshotDeltaSection,
} from "./digest-snapshot-delta";

const PREV_CAPTURED = new Date("2026-07-20T04:15:00.000Z");
const CURR_CAPTURED = new Date("2026-07-27T04:15:00.000Z");
const PREV_WEEK = "2026-W30";
const CURR_WEEK = "2026-W31";

function fullEnvelope(overrides: Partial<Record<string, unknown>> = {}): DigestSnapshotEnvelope {
  const base: Record<string, unknown> = {
    ok: true,
    week: CURR_WEEK,
    reseller_count: 2,
    emailed: true,
    budget_utilization: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
    tier_mix: { reseller_count: 2, rows: [{}, {}] },
    commission_cleared_mtd: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
    clawback_exposure: { reseller_count: 2, rows: [{}, {}] },
    attributed_mrr: { reseller_count: 2, rows: [{}, {}] },
    attributed_net_contribution: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
    attributed_churn_30d: { window_days: 30, reseller_count: 2, rows: [{}, {}] },
    ledger_drift_events: { window_days: 7, reseller_count: 2, rows: [{}, {}] },
    gst_reconciliation_delta: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
    cohort_velocity: { window_months: 3, cohort_months: [], reseller_count: 2, rows: [{}, {}] },
    ltv_cac_per_reseller: { reseller_count: 2, rows: [{}, {}] },
    sandbox_share_of_budget: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
    contribution_margin_pct: { month_key: "2026-07", reseller_count: 2, rows: [{}, {}] },
  };
  for (const [k, v] of Object.entries(overrides)) {
    base[k] = v;
  }
  return base as DigestSnapshotEnvelope;
}

function snap(envelope: DigestSnapshotEnvelope, isPrev = false) {
  return buildDigestSnapshot({
    capturedAt: isPrev ? PREV_CAPTURED : CURR_CAPTURED,
    week: isPrev ? PREV_WEEK : CURR_WEEK,
    envelope,
  });
}

describe("computeDigestSnapshotDelta — top-level fields", () => {
  it("carries captured_at and week from both inputs", () => {
    const d = computeDigestSnapshotDelta(snap(fullEnvelope(), true), snap(fullEnvelope()));
    expect(d.previous_captured_at).toBe("2026-07-20T04:15:00.000Z");
    expect(d.current_captured_at).toBe("2026-07-27T04:15:00.000Z");
    expect(d.previous_week).toBe(PREV_WEEK);
    expect(d.current_week).toBe(CURR_WEEK);
  });

  it("computes reseller_count_delta as current minus previous", () => {
    const prev = snap(fullEnvelope({ reseller_count: 4 }), true);
    const curr = snap(fullEnvelope({ reseller_count: 7 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    expect(d.previous_reseller_count).toBe(4);
    expect(d.current_reseller_count).toBe(7);
    expect(d.reseller_count_delta).toBe(3);
  });

  it("emits a negative delta when reseller count shrinks", () => {
    const prev = snap(fullEnvelope({ reseller_count: 7 }), true);
    const curr = snap(fullEnvelope({ reseller_count: 4 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    expect(d.reseller_count_delta).toBe(-3);
  });

  it("coerces missing or non-numeric reseller_count to 0", () => {
    const prev = snap(fullEnvelope({ reseller_count: undefined as unknown as number }), true);
    const curr = snap(fullEnvelope({ reseller_count: 2 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    expect(d.previous_reseller_count).toBe(0);
    expect(d.reseller_count_delta).toBe(2);
  });
});

describe("computeDigestSnapshotDelta — section transitions", () => {
  it("marks every section unchanged when both envelopes are identical", () => {
    const d = computeDigestSnapshotDelta(snap(fullEnvelope(), true), snap(fullEnvelope()));
    for (const s of d.sections) {
      expect(s.transition).toBe("unchanged");
      expect(s.row_count_delta).toBe(0);
    }
  });

  it("returns exactly one row per known KPI section, in declared order", () => {
    const d = computeDigestSnapshotDelta(snap(fullEnvelope(), true), snap(fullEnvelope()));
    expect(d.sections.map((s) => s.key)).toEqual([...DIGEST_SNAPSHOT_KPI_SECTIONS]);
  });

  it("classifies a skipped→present transition as recovered", () => {
    const prev = snap(fullEnvelope({
      budget_utilization: { skipped_reason: "budget_query_failed" },
    }), true);
    const curr = snap(fullEnvelope());
    const d = computeDigestSnapshotDelta(prev, curr);
    const budget = d.sections.find((s) => s.key === "budget_utilization");
    expect(budget?.previous_state).toBe("skipped");
    expect(budget?.current_state).toBe("present");
    expect(budget?.transition).toBe("recovered");
    expect(budget?.previous_skipped_reason).toBe("budget_query_failed");
    expect(budget?.current_skipped_reason).toBeNull();
  });

  it("classifies a present→skipped transition as regressed", () => {
    const prev = snap(fullEnvelope(), true);
    const curr = snap(fullEnvelope({
      tier_mix: { skipped_reason: "tier_attribs_query_failed" },
    }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const tier = d.sections.find((s) => s.key === "tier_mix");
    expect(tier?.previous_state).toBe("present");
    expect(tier?.current_state).toBe("skipped");
    expect(tier?.transition).toBe("regressed");
    expect(tier?.current_skipped_reason).toBe("tier_attribs_query_failed");
  });

  it("classifies an absent→present transition as started (older snapshot missed the section)", () => {
    const prevEnv = fullEnvelope();
    delete (prevEnv as Record<string, unknown>).sandbox_share_of_budget;
    const prev = snap(prevEnv, true);
    const curr = snap(fullEnvelope());
    const d = computeDigestSnapshotDelta(prev, curr);
    const sandbox = d.sections.find((s) => s.key === "sandbox_share_of_budget");
    expect(sandbox?.previous_state).toBe("absent");
    expect(sandbox?.current_state).toBe("present");
    expect(sandbox?.transition).toBe("started");
  });

  it("classifies a present→absent transition as stopped (section retired)", () => {
    const prev = snap(fullEnvelope(), true);
    const currEnv = fullEnvelope();
    delete (currEnv as Record<string, unknown>).ltv_cac_per_reseller;
    const curr = snap(currEnv);
    const d = computeDigestSnapshotDelta(prev, curr);
    const ltv = d.sections.find((s) => s.key === "ltv_cac_per_reseller");
    expect(ltv?.previous_state).toBe("present");
    expect(ltv?.current_state).toBe("absent");
    expect(ltv?.transition).toBe("stopped");
  });

  it("treats skipped↔absent shifts as unchanged (both are not-usable on the same side of the fence)", () => {
    const prev = snap(fullEnvelope({
      clawback_exposure: { skipped_reason: "clawback_query_failed" },
    }), true);
    const currEnv = fullEnvelope();
    delete (currEnv as Record<string, unknown>).clawback_exposure;
    const curr = snap(currEnv);
    const d = computeDigestSnapshotDelta(prev, curr);
    const claw = d.sections.find((s) => s.key === "clawback_exposure");
    expect(claw?.previous_state).toBe("skipped");
    expect(claw?.current_state).toBe("absent");
    expect(claw?.transition).toBe("unchanged");
  });

  it("computes positive row_count_delta when a section grew", () => {
    const prev = snap(fullEnvelope({
      attributed_mrr: { reseller_count: 1, rows: [{}] },
    }), true);
    const curr = snap(fullEnvelope({
      attributed_mrr: { reseller_count: 3, rows: [{}, {}, {}] },
    }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const mrr = d.sections.find((s) => s.key === "attributed_mrr");
    expect(mrr?.previous_row_count).toBe(1);
    expect(mrr?.current_row_count).toBe(3);
    expect(mrr?.row_count_delta).toBe(2);
    expect(mrr?.transition).toBe("unchanged");
  });

  it("computes negative row_count_delta when a section shrank", () => {
    const prev = snap(fullEnvelope({
      attributed_churn_30d: { window_days: 30, reseller_count: 5, rows: [{}, {}, {}, {}, {}] },
    }), true);
    const curr = snap(fullEnvelope({
      attributed_churn_30d: { window_days: 30, reseller_count: 2, rows: [{}, {}] },
    }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const churn = d.sections.find((s) => s.key === "attributed_churn_30d");
    expect(churn?.row_count_delta).toBe(-3);
  });

  it("row_count is 0 when rows[] is missing on a present section", () => {
    const prev = snap(fullEnvelope({
      cohort_velocity: { window_months: 3 },
    }), true);
    const curr = snap(fullEnvelope({
      cohort_velocity: { window_months: 3, cohort_months: [], reseller_count: 2, rows: [{}] },
    }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const cohort = d.sections.find((s) => s.key === "cohort_velocity");
    expect(cohort?.previous_row_count).toBe(0);
    expect(cohort?.current_row_count).toBe(1);
    expect(cohort?.row_count_delta).toBe(1);
  });

  it("row_count is 0 when rows is not an array", () => {
    const prev = snap(fullEnvelope({
      gst_reconciliation_delta: { rows: "not-an-array" },
    }), true);
    const curr = snap(fullEnvelope());
    const d = computeDigestSnapshotDelta(prev, curr);
    const gst = d.sections.find((s) => s.key === "gst_reconciliation_delta");
    expect(gst?.previous_row_count).toBe(0);
  });
});

describe("formatDigestSnapshotDeltaSection", () => {
  it("returns empty string when snapshots are structurally identical AND reseller counts match", () => {
    const d = computeDigestSnapshotDelta(snap(fullEnvelope(), true), snap(fullEnvelope()));
    expect(formatDigestSnapshotDeltaSection(d)).toBe("");
  });

  it("renders the table when reseller count changed even if every section unchanged", () => {
    const prev = snap(fullEnvelope({ reseller_count: 2 }), true);
    const curr = snap(fullEnvelope({ reseller_count: 3 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    expect(html).toContain("Weekly digest snapshot delta");
    expect(html).toContain("2026-W30");
    expect(html).toContain("2026-W31");
    expect(html).toContain("+1");
  });

  it("renders the table when at least one section transitioned", () => {
    const prev = snap(fullEnvelope({
      budget_utilization: { skipped_reason: "budget_query_failed" },
    }), true);
    const curr = snap(fullEnvelope());
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    expect(html).toContain("budget_utilization");
    expect(html).toContain("recovered");
    expect(html).toContain("budget_query_failed");
  });

  it("highlights changed rows via a background style, leaves unchanged rows plain", () => {
    const prev = snap(fullEnvelope(), true);
    const curr = snap(fullEnvelope({
      tier_mix: { skipped_reason: "tier_attribs_query_failed" },
    }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    // Highlighted row (tier_mix) carries the highlight style.
    const tierRowMatch = html.match(/<tr[^>]*>\s*<td>tier_mix<\/td>[\s\S]*?<\/tr>/);
    expect(tierRowMatch).not.toBeNull();
    expect(tierRowMatch![0]).toContain("background:#fff8e1");
    // Non-highlighted row (attributed_mrr) has plain <tr>.
    const mrrRowMatch = html.match(/<tr>\s*<td>attributed_mrr<\/td>[\s\S]*?<\/tr>/);
    expect(mrrRowMatch).not.toBeNull();
  });

  it("emits signed reseller-count delta in the header", () => {
    const prev = snap(fullEnvelope({ reseller_count: 5 }), true);
    const curr = snap(fullEnvelope({ reseller_count: 3 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    expect(html).toContain("(-2)");
  });

  it("HTML-escapes the week label", () => {
    const prev = buildDigestSnapshot({
      capturedAt: PREV_CAPTURED,
      week: "2026-W30<script>",
      envelope: fullEnvelope(),
    });
    const curr = buildDigestSnapshot({
      capturedAt: CURR_CAPTURED,
      week: CURR_WEEK,
      envelope: fullEnvelope({ reseller_count: 3 }),
    });
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    expect(html).toContain("2026-W30&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("emits exactly one row per KPI section under <tbody>", () => {
    const prev = snap(fullEnvelope({ reseller_count: 1 }), true);
    const curr = snap(fullEnvelope({ reseller_count: 2 }));
    const d = computeDigestSnapshotDelta(prev, curr);
    const html = formatDigestSnapshotDeltaSection(d);
    const bodyMatch = html.match(/<tbody>([\s\S]*?)<\/tbody>/);
    expect(bodyMatch).not.toBeNull();
    const rowCount = (bodyMatch![1].match(/<tr[^>]*>/g) ?? []).length;
    expect(rowCount).toBe(DIGEST_SNAPSHOT_KPI_SECTIONS.length);
  });
});
