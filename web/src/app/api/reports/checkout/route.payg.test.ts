// G35 Pricing v5 P3 — POST /api/reports/checkout tier checkout.
//
// Pins: flag off → tier refused (403) and the A$3 session now carries the
// ATO invoice (G3); flag on → tier required, Stripe Price per SKU from env,
// order row BEFORE Stripe (metadata.order_id), Verified cap (409), upgrade
// ownership (403 / 409) at the D28 price difference, customer reuse (G7),
// in-flight per SKU (409 / resume), never a discount.

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => getCurrentUserMock() }));

const sessionCreateMock = vi.fn();
const sessionRetrieveMock = vi.fn();
vi.mock("@/lib/stripe", () => ({
  getStripe: () => ({ checkout: { sessions: { create: sessionCreateMock, retrieve: sessionRetrieveMock } } }),
  isStripeConfigured: () => true,
}));

import { PaygFakeDb, PAYG_UNIQUE } from "@/lib/pricing/payg-fake-db.fixture";
let db: PaygFakeDb;
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => db }));

const paygConfig = { current: { payg_enabled: false } as Record<string, unknown> };
vi.mock("@/lib/pricing/payg-flag", async () => {
  const { PAYG_CONFIG_DEFAULTS } = await import("@/lib/pricing/v5-payg");
  return { readPaygConfig: async () => ({ ...PAYG_CONFIG_DEFAULTS, ...paygConfig.current }) };
});

const assertProjectScopeMock = vi.fn();
vi.mock("@/lib/projects", () => ({ assertProjectScope: (...a: unknown[]) => assertProjectScopeMock(...a) }));

const resolveMock = vi.fn();
vi.mock("@/lib/reseller/resolve-promo", () => ({ resolvePromoCode: (c: string) => resolveMock(c) }));
vi.mock("@/lib/stripe/idempotency", () => ({ sessionIdempotencyKey: (scope: string, parts: unknown[]) => `${scope}:${parts.join("|")}` }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
const emitCheckoutMock = vi.fn();
vi.mock("@/lib/analytics/funnel", () => ({ emitCheckout: (i: unknown) => emitCheckoutMock(i) }));

import { POST } from "./route";
import { LEGAL_ENTITY } from "@/lib/site/legal-entity";

const BIZ = "11111111-2222-3333-4444-555555555555";
const USER = { id: "user-1", email: "u@x.au" };

const req = (body: Record<string, unknown>) => new Request("http://x/api/reports/checkout", { method: "POST", body: JSON.stringify(body) });

function seed(orders: Array<Record<string, unknown>> = [], appUser: Record<string, unknown> = {}) {
  db = new PaygFakeDb(
    {
      report_orders: orders.map((o) => ({ business_id: BIZ, user_id: USER.id, ...o })),
      app_users: [{ id: USER.id, email: USER.email, stripe_customer_id: null, ...appUser }],
      reseller_attributions: [],
    },
    { unique: PAYG_UNIQUE },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ ...USER });
  assertProjectScopeMock.mockResolvedValue({ projectId: BIZ });
  sessionCreateMock.mockImplementation(async () => ({ id: "cs_new", url: "https://checkout.stripe/s/new" }));
  resolveMock.mockResolvedValue(null);
  paygConfig.current = { payg_enabled: false };
  process.env.STRIPE_PRICE_TRUST_REPORT_5AUD = "price_a3";
  process.env.STRIPE_PRICE_REPORT_SNAPSHOT = "price_snap";
  process.env.STRIPE_PRICE_REPORT_FULL = "price_full";
  process.env.STRIPE_PRICE_REPORT_VERIFIED = "price_ver";
  process.env.STRIPE_PRICE_UPGRADE_SNAPSHOT_FULL = "price_up_sf";
  process.env.STRIPE_PRICE_UPGRADE_FULL_VERIFIED = "price_up_fv";
  seed();
});

describe("flag OFF (payg_enabled = false)", () => {
  it("refuses a v5 tier with 403 and touches nothing", async () => {
    const res = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ ok: false, code: "payg_disabled" });
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(db.rows("report_orders")).toHaveLength(0);
  });

  it("refuses an upgrade with 403", async () => {
    expect((await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }))).status).toBe(403);
  });

  it("the A$3 path is unchanged except the ATO tax invoice (gap G3)", async () => {
    const res = await POST(req({ businessId: BIZ }));
    expect(res.status).toBe(200);
    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.line_items).toEqual([{ price: "price_a3", quantity: 1 }]);
    expect(params.metadata).toMatchObject({ bid_scope: "report_order", bid_sku: "sku_trust_report_5aud" });
    expect(params.metadata.pricing_version).toBeUndefined();
    expect(params.invoice_creation).toEqual({
      enabled: true,
      invoice_data: {
        description: "BlockID.au — Trusted Business Report",
        custom_fields: [{ name: "Seller ABN", value: LEGAL_ENTITY.abn }],
        footer: expect.stringContaining("GST-registered"),
      },
    });
    expect(params.customer_email).toBe("u@x.au");
    expect(params.customer).toBeUndefined();
    expect(db.rows("report_orders")[0]).toMatchObject({ product_sku: "sku_trust_report_5aud", amount_aud: 300, stripe_session_id: "cs_new" });
    expect(db.rows("report_orders")[0]).not.toHaveProperty("tier");
  });
});

describe("flag ON (payg_enabled = true)", () => {
  beforeEach(() => {
    paygConfig.current = { payg_enabled: true };
  });

  it("requires a tier (the A$3 SKU is no longer sold)", async () => {
    const res = await POST(req({ businessId: BIZ }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "tier_required" });
    expect((await POST(req({ businessId: BIZ, tier: "gold" }))).status).toBe(400);
    expect((await POST(req({ businessId: BIZ, tier: "full", upgradeFrom: "snapshot" }))).status).toBe(400);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it.each([
    ["snapshot", "report_snapshot", "price_snap", 1900],
    ["full", "report_full", "price_full", 4900],
    ["verified", "report_verified", "price_ver", 14900],
  ])("tier %s → SKU %s, Stripe Price from env, order row before Stripe", async (tier, sku, price, cents) => {
    const res = await POST(req({ businessId: BIZ, tier, firstTouch: "g4" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, url: "https://checkout.stripe/s/new", sku, tier, amountCents: cents, appliedDiscount: null });

    const order = db.rows("report_orders")[0];
    expect(order).toMatchObject({
      id: body.orderId,
      product_sku: sku,
      tier,
      currency: "aud",
      amount_aud: cents,
      status: "CHECKOUT_INITIATED",
      expires_at: null,
      upgrade_of_order_id: null,
      stripe_session_id: "cs_new",
    });

    const [params, opts] = sessionCreateMock.mock.calls[0];
    expect(params.line_items).toEqual([{ price, quantity: 1 }]);
    expect(params.mode).toBe("payment");
    expect(params.automatic_tax).toEqual({ enabled: true });
    expect(params.invoice_creation.invoice_data.custom_fields).toEqual([{ name: "Seller ABN", value: LEGAL_ENTITY.abn }]);
    expect(params.invoice_creation.invoice_data.description).toMatch(/BlockID Report/);
    expect(params.metadata).toEqual({
      bid_scope: "report_order",
      bid_sku: sku,
      bid_tier: tier,
      bid_business_id: BIZ,
      bid_user_id: "user-1",
      order_id: body.orderId,
      pricing_version: "v5",
      bid_first_touch: "g4",
    });
    expect(params.discounts).toBeUndefined();
    expect(params.customer_email).toBe("u@x.au");
    expect(params.customer_creation).toBe("always");
    expect(params.success_url).toBe("http://x/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}");
    expect(params.cancel_url).toBe(`http://x/workspace/reports/business?pid=${BIZ}&report_order=cancel`);
    expect(opts.idempotencyKey).toContain(body.orderId);
    expect(emitCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({ sku, amountCents: cents, orderId: body.orderId }));
  });

  it("G7: reuses the Stripe customer when app_users has one", async () => {
    seed([], { stripe_customer_id: "cus_123" });
    await POST(req({ businessId: BIZ, tier: "full" }));
    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.customer).toBe("cus_123");
    expect(params.customer_update).toEqual({ address: "auto", name: "auto" });
    expect(params.customer_email).toBeUndefined();
    expect(params.customer_creation).toBeUndefined();
  });

  it("D29: Verified refused with 409 while open Verified work ≥ cap (and when the count cannot be read)", async () => {
    seed(
      Array.from({ length: 5 }, (_, i) => ({ id: `v${i}`, user_id: `other-${i}`, business_id: `b${i}`, product_sku: i % 2 ? "upgrade_full_verified" : "report_verified", status: ["PAID", "GENERATING", "IN_REVIEW"][i % 3] })),
    );
    const res = await POST(req({ businessId: BIZ, tier: "verified" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "verified_full", reason: expect.stringMatching(/fully booked/) });
    expect(sessionCreateMock).not.toHaveBeenCalled();
    // Full is still on sale.
    expect((await POST(req({ businessId: BIZ, tier: "full" }))).status).toBe(200);
  });

  it("Verified: delivered (READY) Verified orders do not count against the cap", async () => {
    seed(Array.from({ length: 6 }, (_, i) => ({ id: `r${i}`, user_id: `o${i}`, business_id: `b${i}`, product_sku: "report_verified", status: "READY" })));
    expect((await POST(req({ businessId: BIZ, tier: "verified" }))).status).toBe(200);
  });

  it("upgrade without a delivered lower tier → 403 not_owned", async () => {
    const res = await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_owned" });
  });

  it("upgrade while the Snapshot is still generating → 409; once held higher → 409", async () => {
    seed([{ id: "s1", status: "GENERATING", product_sku: "report_snapshot" }]);
    expect((await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }))).status).toBe(409);
    seed([{ id: "f1", status: "READY", product_sku: "report_full" }]);
    const res = await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "already_higher" });
  });

  it("another user's Snapshot never qualifies", async () => {
    seed([{ id: "s-other", status: "READY", product_sku: "report_snapshot", user_id: "user-2" }]);
    expect((await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }))).status).toBe(403);
  });

  it("Snapshot → Full: upgrade SKU at the A$30 difference, upgrade_of_order_id set", async () => {
    seed([{ id: "s1", status: "READY", product_sku: "report_snapshot", report_id: "rpt" }]);
    const res = await POST(req({ businessId: BIZ, upgradeFrom: "snapshot" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ sku: "upgrade_snapshot_full", tier: "full", amountCents: 3000 });
    const order = db.rows("report_orders").find((o) => o.id === body.orderId)!;
    expect(order).toMatchObject({ product_sku: "upgrade_snapshot_full", tier: "full", amount_aud: 3000, upgrade_of_order_id: "s1" });
    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.line_items).toEqual([{ price: "price_up_sf", quantity: 1 }]);
    expect(params.metadata).toMatchObject({ bid_sku: "upgrade_snapshot_full", bid_upgrade_of_order_id: "s1", order_id: body.orderId });
  });

  it("Full → Verified: A$100 upgrade, and the Verified cap applies", async () => {
    seed([{ id: "f1", status: "READY", product_sku: "report_full", report_id: "rpt" }]);
    const res = await POST(req({ businessId: BIZ, upgradeFrom: "full" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sku: "upgrade_full_verified", tier: "verified", amountCents: 10000 });
    expect(sessionCreateMock.mock.calls[0][0].line_items).toEqual([{ price: "price_up_fv", quantity: 1 }]);

    paygConfig.current = { payg_enabled: true, payg_verified_max_open: 0 };
    seed([{ id: "f1", status: "READY", product_sku: "report_full", report_id: "rpt" }]);
    expect((await POST(req({ businessId: BIZ, upgradeFrom: "full" }))).status).toBe(409);
  });

  it("one in-flight order per SKU: PAID → 409; open CHECKOUT_INITIATED → resumed; expired → closed and a new session", async () => {
    seed([{ id: "p1", status: "PAID", product_sku: "report_full" }]);
    const paid = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(paid.status).toBe(409);
    expect(await paid.json()).toMatchObject({ code: "in_flight", orderId: "p1" });
    // a different SKU is fine
    expect((await POST(req({ businessId: BIZ, tier: "snapshot" }))).status).toBe(200);

    seed([{ id: "c1", status: "CHECKOUT_INITIATED", product_sku: "report_full", stripe_session_id: "cs_open" }]);
    sessionRetrieveMock.mockResolvedValueOnce({ id: "cs_open", status: "open", url: "https://checkout.stripe/s/open" });
    const resumed = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(await resumed.json()).toMatchObject({ ok: true, orderId: "c1", url: "https://checkout.stripe/s/open", resumed: true });
    expect(sessionCreateMock).toHaveBeenCalledTimes(1); // only the snapshot above

    seed([{ id: "c2", status: "CHECKOUT_INITIATED", product_sku: "report_full", stripe_session_id: "cs_old" }]);
    sessionRetrieveMock.mockResolvedValueOnce({ id: "cs_old", status: "expired", url: null });
    const fresh = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(fresh.status).toBe(200);
    expect(db.row("report_orders", "c2")).toMatchObject({ status: "FAILED", failure_reason: "checkout_expired" });
  });

  it("a reseller code is attribution only — never a Stripe discount", async () => {
    resolveMock.mockResolvedValue({ code: "IFV20", resellerId: "r1", resellerCode: "IFV", resellerSlug: "ifv", discountPct: 20, stripePromotionCodeId: "promo_1", promoRowId: "pr1" });
    const res = await POST(req({ businessId: BIZ, tier: "full", promoCode: "IFV20" }));
    expect(res.status).toBe(200);
    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.discounts).toBeUndefined();
    expect(params.metadata).toMatchObject({ bid_reseller_id: "r1", bid_promo_code: "IFV20", bid_promo_tier_pct: "0" });
    expect(db.rows("reseller_attributions")[0]).toMatchObject({ reseller_id: "r1", metadata: expect.objectContaining({ applied_discount_pct: 0 }) });
  });

  it("503 when the tier's Stripe Price is not minted; 403 when the buyer cannot see the business", async () => {
    delete process.env.STRIPE_PRICE_REPORT_FULL;
    const missing = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(missing.status).toBe(503);
    expect(await missing.json()).toMatchObject({ code: "price_not_provisioned" });

    process.env.STRIPE_PRICE_REPORT_FULL = "price_full";
    assertProjectScopeMock.mockRejectedValueOnce(Object.assign(new Error("nope"), { name: "ProjectAccessError", code: "forbidden" }));
    const denied = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(denied.status).toBe(403);
    expect(db.rows("report_orders")).toHaveLength(0);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("a failed Stripe call closes the order (no orphan in-flight row)", async () => {
    sessionCreateMock.mockRejectedValueOnce(new Error("card_declined"));
    const res = await POST(req({ businessId: BIZ, tier: "snapshot" }));
    expect(res.status).toBe(502);
    expect(db.rows("report_orders")[0]).toMatchObject({ status: "FAILED" });
  });
});
