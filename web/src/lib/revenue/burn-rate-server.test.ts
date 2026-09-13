// S29-hardening — `resolveBurnRate` loads only what the route did not pass
// (Xero snapshot via connector_snapshots keyed on the OWNER, bank CSV via
// bank_transactions) and applies the one precedence from `pickBurnRate`.

import { describe, expect, it, vi } from "vitest";
import { fakeSupabase } from "@/test/fake-supabase";

vi.mock("server-only", () => ({}));

import { resolveBurnRate } from "./burn-rate-server";

const XERO = {
  id: "x1", user_id: "owner-1", project_id: "proj-1", provider: "xero", taken_at: "2026-09-03T02:00:00.000Z", source: "resync",
  metrics: { totalIncomeAud: 27000, totalExpensesAud: 19500, netProfitAud: 7500, windowMonths: 3 },
};
const TX = {
  id: "t1", project_id: "proj-1", statement_ref: "CBA:x.csv:abc", occurred_on: "2026-08-10", description: "rent", amount_aud: -2500,
  counterparty: "x", category: "rent", category_source: "rule", confidence: 0.9, needs_review: false, gst_treatment: "gst", hash: "h".repeat(16),
  created_at: "2026-09-03T02:00:00.000Z",
};

describe("resolveBurnRate", () => {
  it("loads the owner's Xero snapshot and the bank CSV when not passed; Xero wins", async () => {
    const sb = fakeSupabase({ connector_snapshots: [XERO], bank_transactions: [TX] });
    const b = await resolveBurnRate(sb as never, { projectId: "proj-1", ownerUserId: "owner-1", metricBurn: 4000 });
    expect(b).toMatchObject({ burnRate: 6500, source: "xero", takenAt: "2026-09-03T02:00:00.000Z" });
    expect(b.sourceInfo.label).toBe("from Xero, 3 Sep");
    expect(sb.hasEq("connector_snapshots", "user_id", "owner-1")).toBe(true);
    expect(sb.hasEq("connector_snapshots", "project_id", "proj-1")).toBe(true);
  });

  it("no Xero → bank CSV beats the manual metric; no bank lines → the metric; nothing → none", async () => {
    const bank = await resolveBurnRate(fakeSupabase({ bank_transactions: [TX] }) as never, { projectId: "proj-1", ownerUserId: "owner-1", metricBurn: 4000 });
    expect(bank).toMatchObject({ burnRate: 2500, source: "bank_csv", takenAt: "2026-09-03T02:00:00.000Z" });
    const metric = await resolveBurnRate(fakeSupabase() as never, { projectId: "proj-1", ownerUserId: "owner-1", metricBurn: 4000 });
    expect(metric).toMatchObject({ burnRate: 4000, source: "startup_metrics", takenAt: null });
    const none = await resolveBurnRate(fakeSupabase() as never, { projectId: null, ownerUserId: "owner-1", metricBurn: null });
    expect(none).toMatchObject({ burnRate: 0, source: "none" });
  });

  it("passed inputs are used as-is (null = known absent, nothing re-read)", async () => {
    const sb = fakeSupabase({ connector_snapshots: [XERO], bank_transactions: [TX] });
    const b = await resolveBurnRate(sb as never, { projectId: "proj-1", ownerUserId: "owner-1", metricBurn: 4000, xeroSnapshot: null, bankCsv: null });
    expect(b.source).toBe("startup_metrics");
    expect(sb.find("connector_snapshots", "select")).toHaveLength(0);
    expect(sb.find("bank_transactions", "select")).toHaveLength(0);
  });
});
