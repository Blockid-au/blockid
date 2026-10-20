// G35 Pricing v5 — POST /api/reports/checkout for an EVALUATOR buying a PAYG
// report on a startup in their deal flow (body.evaluationId).
//
// Pins: flag off → 403 and nothing touched (evaluator stays credits-only);
// flag on → the buyer is authorised by the evaluations row (never project
// scope), the order is the evaluator's and carries buyer_role/evaluation_id
// (order + session metadata), evaluator success/cancel URLs, no discount,
// the included-quota guard (Snapshot / Full refused, Verified allowed),
// and the founder path never loads the evaluator helpers.

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

const authoriseMock = vi.fn();
const quotaCoversMock = vi.fn();
vi.mock("@/lib/evaluations/payg-buyer", () => ({
  authoriseEvaluatorBuyer: (...a: unknown[]) => authoriseMock(...a),
  evaluatorQuotaCoversFull: (...a: unknown[]) => quotaCoversMock(...a),
  QUOTA_AVAILABLE_MESSAGE: "This report is included in your plan.",
}));

const resolveMock = vi.fn();
vi.mock("@/lib/reseller/resolve-promo", () => ({ resolvePromoCode: (c: string) => resolveMock(c) }));
vi.mock("@/lib/stripe/idempotency", () => ({ sessionIdempotencyKey: (scope: string, parts: unknown[]) => `${scope}:${parts.join("|")}` }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: () => null }));
vi.mock("@/lib/analytics/funnel", () => ({ emitCheckout: () => undefined }));

import { POST } from "./route";

const BIZ = "11111111-2222-3333-4444-555555555555";
const EVAL = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const EVALUATOR = { id: "evaluator-1", email: "partner@fund.au", plan: "evaluator_scout" };

const req = (body: Record<string, unknown>) => new Request("http://x/api/reports/checkout", { method: "POST", body: JSON.stringify(body) });

function seed(orders: Array<Record<string, unknown>> = []) {
  db = new PaygFakeDb(
    {
      report_orders: orders.map((o) => ({ business_id: BIZ, user_id: EVALUATOR.id, ...o })),
      app_users: [{ id: EVALUATOR.id, email: EVALUATOR.email, stripe_customer_id: null }],
      reseller_attributions: [],
    },
    { unique: PAYG_UNIQUE },
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserMock.mockResolvedValue({ ...EVALUATOR });
  // An evaluator has no project scope on the founder's startup.
  assertProjectScopeMock.mockRejectedValue(Object.assign(new Error("nope"), { name: "ProjectAccessError", code: "forbidden" }));
  authoriseMock.mockResolvedValue({ ok: true, evaluationId: EVAL });
  quotaCoversMock.mockResolvedValue(false);
  sessionCreateMock.mockImplementation(async () => ({ id: "cs_eval", url: "https://checkout.stripe/s/eval" }));
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

describe("flag OFF — the evaluator stays credits-only", () => {
  it("an evaluationId (with or without a tier) is refused 403 and nothing is touched", async () => {
    for (const body of [{ businessId: BIZ, evaluationId: EVAL, tier: "full" }, { businessId: BIZ, evaluationId: EVAL }]) {
      const res = await POST(req(body));
      expect(res.status).toBe(403);
      expect(await res.json()).toMatchObject({ ok: false, code: "payg_disabled" });
    }
    expect(authoriseMock).not.toHaveBeenCalled();
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(db.rows("report_orders")).toHaveLength(0);
  });
});

describe("flag ON — evaluator deal-flow card checkout", () => {
  beforeEach(() => {
    paygConfig.current = { payg_enabled: true };
  });

  it.each([
    ["snapshot", "report_snapshot", "price_snap", 1900],
    ["full", "report_full", "price_full", 4900],
    ["verified", "report_verified", "price_ver", 14900],
  ])("tier %s: authorised by the evaluations row, order owned by the evaluator, buyer role stamped", async (tier, sku, price, cents) => {
    const res = await POST(req({ businessId: BIZ, evaluationId: EVAL, tier }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ ok: true, url: "https://checkout.stripe/s/eval", sku, tier, amountCents: cents, appliedDiscount: null });

    expect(authoriseMock).toHaveBeenCalledWith(EVALUATOR.id, EVAL, BIZ);
    expect(assertProjectScopeMock).not.toHaveBeenCalled();

    const order = db.rows("report_orders")[0];
    expect(order).toMatchObject({
      id: body.orderId,
      business_id: BIZ,
      user_id: EVALUATOR.id,
      product_sku: sku,
      tier,
      amount_aud: cents,
      status: "CHECKOUT_INITIATED",
      stripe_session_id: "cs_eval",
    });
    expect(order.metadata).toMatchObject({ buyer_role: "evaluator", evaluation_id: EVAL, payment_path: "card", stripe_price_id: price });

    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price, quantity: 1 }]);
    expect(params.client_reference_id).toBe(EVALUATOR.id);
    expect(params.metadata).toMatchObject({
      bid_scope: "report_order",
      bid_sku: sku,
      bid_user_id: EVALUATOR.id,
      bid_business_id: BIZ,
      order_id: body.orderId,
      bid_buyer_role: "evaluator",
      bid_evaluation_id: EVAL,
    });
    expect(params.discounts).toBeUndefined();
    expect(params.invoice_creation).toMatchObject({ enabled: true });
    expect(params.success_url).toBe("http://x/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}&view=legacy");
    expect(params.cancel_url).toBe("http://x/workspace/evaluations?report_order=cancel");
  });

  it("not the caller's evaluation / no access → the helper's status, nothing created", async () => {
    authoriseMock.mockResolvedValueOnce({ ok: false, status: 404, code: "evaluation_not_found", reason: "That startup is not in your deal flow." });
    const res = await POST(req({ businessId: BIZ, evaluationId: EVAL, tier: "full" }));
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ code: "evaluation_not_found" });
    authoriseMock.mockResolvedValueOnce({ ok: false, status: 403, code: "forbidden", reason: "no access" });
    expect((await POST(req({ businessId: BIZ, evaluationId: EVAL, tier: "full" }))).status).toBe(403);
    expect(db.rows("report_orders")).toHaveLength(0);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it("an included Full report is never sold by card: Snapshot / Full → 409 quota_available; Verified still buyable", async () => {
    quotaCoversMock.mockResolvedValue(true);
    for (const tier of ["snapshot", "full"]) {
      const res = await POST(req({ businessId: BIZ, evaluationId: EVAL, tier }));
      expect(res.status).toBe(409);
      expect(await res.json()).toMatchObject({ code: "quota_available" });
    }
    expect(sessionCreateMock).not.toHaveBeenCalled();
    expect(db.rows("report_orders")).toHaveLength(0);

    const verified = await POST(req({ businessId: BIZ, evaluationId: EVAL, tier: "verified" }));
    expect(verified.status).toBe(200);
  });

  it("D28 upgrade on the evaluator's own delivered Snapshot", async () => {
    seed([{ id: "o-snap", status: "READY", product_sku: "report_snapshot", created_at: "2026-10-20T00:00:00Z" }]);
    const res = await POST(req({ businessId: BIZ, evaluationId: EVAL, upgradeFrom: "snapshot" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ sku: "upgrade_snapshot_full", tier: "full" });
    const order = db.rows("report_orders").find((o) => o.product_sku === "upgrade_snapshot_full");
    expect(order).toMatchObject({ user_id: EVALUATOR.id, upgrade_of_order_id: "o-snap" });
    expect(order?.metadata).toMatchObject({ buyer_role: "evaluator", evaluation_id: EVAL });
  });

  it("the founder path (no evaluationId) never loads the evaluator helpers and keeps its URLs", async () => {
    assertProjectScopeMock.mockResolvedValue({ projectId: BIZ });
    const res = await POST(req({ businessId: BIZ, tier: "full" }));
    expect(res.status).toBe(200);
    expect(authoriseMock).not.toHaveBeenCalled();
    expect(quotaCoversMock).not.toHaveBeenCalled();
    const [params] = sessionCreateMock.mock.calls[0];
    expect(params.metadata.bid_buyer_role).toBeUndefined();
    expect(params.success_url).toBe("http://x/workspace/reports/order?session_id={CHECKOUT_SESSION_ID}");
    expect(db.rows("report_orders")[0].metadata).not.toHaveProperty("buyer_role");
  });
});
