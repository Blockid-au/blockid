// G35 Pricing v5 P3 (D27) — POST /api/reports/redeem with credits per tier.
//
// Pins: flag off → `tier` refused (403); flag on → tier required, Snapshot
// debits 19 / Full 49 credits (FEATURE_COSTS), Verified is card-only, the
// order lands PAID with the v5 SKU + tier and is enqueued; one in-flight
// order per SKU; a short balance → 402 with nothing debited.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

import { PaygFakeDb } from "@/lib/pricing/payg-fake-db.fixture";
let db: PaygFakeDb;
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db, isSupabaseConfigured: () => false }));

const enqueueOrderMock = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/paywall/report-order-worker", () => ({ enqueueOrder: (...a: unknown[]) => enqueueOrderMock(...(a as [])) }));

const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  return { readPaygConfig: async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current }) };
});
vi.mock("@/lib/projects", () => ({ assertProjectScope: async () => ({ projectId: "p" }) }));
const emitMock = vi.fn();
vi.mock("@/lib/analytics/server", () => ({ emitEventSafe: (e: unknown) => emitMock(e) }));

import { POST } from "./route";

const BIZ = "11111111-2222-3333-4444-555555555555";
const req = (body: Record<string, unknown>) => new Request("http://x/api/reports/redeem", { method: "POST", body: JSON.stringify(body) });

function seed(balance: number, orders: Array<Record<string, unknown>> = []) {
  db = new PaygFakeDb({
    report_orders: orders.map((o) => ({ business_id: BIZ, user_id: "user-1", ...o })),
    credit_balances: [{ user_id: "user-1", balance, lifetime_spent: 0 }],
    usage_logs: [],
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ id: "user-1", email: "u@x.au" });
  paygConfig.current = { payg_enabled: false };
  seed(100);
});

describe("POST /api/reports/redeem — Pricing v5", () => {
  it("flag off: a tier is refused with 403 and nothing is debited", async () => {
    const res = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(res.status).toBe(403);
    expect(db.rows("credit_balances")[0].balance).toBe(100);
    expect(db.rows("report_orders")).toHaveLength(0);
  });

  it.each([
    ["snapshot", "report_snapshot", 19],
    ["full", "report_full", 49],
  ])("flag on: %s debits %s credits and books a PAID %s order", async (tier, sku, credits) => {
    paygConfig.current = { payg_enabled: true };
    const res = await POST(req({ businessId: BIZ, tier }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, tier, sku, credits, newBalance: 100 - (credits as number) });
    expect(db.rows("credit_balances")[0]).toMatchObject({ balance: 100 - (credits as number), lifetime_spent: credits });
    expect(db.rows("report_orders")[0]).toMatchObject({ product_sku: sku, tier, status: "PAID", credits_used: credits, amount_aud: 0, expires_at: null });
    expect(enqueueOrderMock).toHaveBeenCalledWith(db, { orderId: body.orderId, businessId: BIZ });
    expect(emitMock).toHaveBeenCalledWith(expect.objectContaining({ name: "payg_paid", params: expect.objectContaining({ paid_via: "credits", sku }) }));
  });

  it("flag on: Verified is card-only (400) and a missing tier is 400", async () => {
    paygConfig.current = { payg_enabled: true };
    const v = await POST(req({ businessId: BIZ, tier: "verified" }));
    expect(v.status).toBe(400);
    expect(await v.json()).toMatchObject({ code: "card_only" });
    expect((await POST(req({ businessId: BIZ }))).status).toBe(400);
    expect(db.rows("credit_balances")[0].balance).toBe(100);
  });

  it("flag on: short balance → 402, nothing debited", async () => {
    paygConfig.current = { payg_enabled: true };
    seed(20);
    const res = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(res.status).toBe(402);
    expect(db.rows("credit_balances")[0].balance).toBe(20);
  });

  it("flag on: one in-flight order per SKU → 409", async () => {
    paygConfig.current = { payg_enabled: true };
    seed(100, [{ id: "o1", status: "GENERATING", product_sku: "report_full" }]);
    const res = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(res.status).toBe(409);
    expect(db.rows("credit_balances")[0].balance).toBe(100);
  });
});
