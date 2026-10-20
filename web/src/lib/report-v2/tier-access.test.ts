// G35 Pricing v5 — resolveFounderReportTier (server-side cut for the project
// report page). Pins: plan report.premium → full; Full / Verified / legacy
// orders → full / verified; a Snapshot order never unlocks the project page;
// a refund AFTER delivery keeps the tier (G5) but a refunded failed order does
// not; read errors fail closed to free.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const getEntitlementsMock = vi.fn<(plan: string, userId: string) => Promise<string[]>>();
vi.mock("@/lib/entitlements", () => ({ getEntitlements: (p: string, u: string) => getEntitlementsMock(p, u) }));

import { resolveFounderReportTier } from "./tier-access";
import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";

const input = { userId: "u1", plan: "free", projectId: "p1" };
const db = (rows: Array<Record<string, unknown>>, failing = false) =>
  new PaygFakeDb({ report_orders: rows.map((r) => ({ user_id: "u1", business_id: "p1", report_id: null, ...r })) }, failing ? { failing: ["report_orders"] } : {}) as never;

beforeEach(() => {
  getEntitlementsMock.mockReset().mockResolvedValue([]);
});

describe("resolveFounderReportTier", () => {
  it("plan carries report.premium → full", async () => {
    getEntitlementsMock.mockResolvedValue(["report.premium"]);
    expect(await resolveFounderReportTier(db([]), input)).toBe("full");
  });

  it("orders decide: verified > full; legacy A$3 = full; Snapshot alone = free", async () => {
    expect(await resolveFounderReportTier(db([{ status: "IN_REVIEW", product_sku: "report_verified" }, { status: "READY", product_sku: "report_full" }]), input)).toBe("verified");
    expect(await resolveFounderReportTier(db([{ status: "READY", product_sku: "sku_trust_report_5aud" }]), input)).toBe("full");
    expect(await resolveFounderReportTier(db([{ status: "READY", product_sku: "report_snapshot" }]), input)).toBe("free");
    expect(await resolveFounderReportTier(db([{ status: "READY", product_sku: "upgrade_snapshot_full" }]), input)).toBe("full");
  });

  it("G5: REFUNDED with a delivered report keeps its tier; REFUNDED without a report entitles nothing", async () => {
    expect(await resolveFounderReportTier(db([{ status: "REFUNDED", product_sku: "report_full", report_id: "rpt" }]), input)).toBe("full");
    expect(await resolveFounderReportTier(db([{ status: "REFUNDED", product_sku: "report_full", report_id: null }]), input)).toBe("free");
  });

  it("other users / businesses, unpaid orders and read errors → free", async () => {
    expect(await resolveFounderReportTier(db([{ status: "READY", product_sku: "report_full", user_id: "u2" }]), input)).toBe("free");
    expect(await resolveFounderReportTier(db([{ status: "CHECKOUT_INITIATED", product_sku: "report_full" }]), input)).toBe("free");
    expect(await resolveFounderReportTier(db([{ status: "READY", product_sku: "report_full" }], true), input)).toBe("free");
    expect(await resolveFounderReportTier(null, input)).toBe("free");
  });
});
