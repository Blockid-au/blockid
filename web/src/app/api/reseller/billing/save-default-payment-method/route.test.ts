// Colocated vitest for POST /api/reseller/billing/save-default-payment-method — P9 batch 2.
//
// Saves a confirmed Stripe SetupIntent as the reseller's default payment method.
// Money-movement gating: only owner/admin roles can bind PMs. Suite covers:
//   - gate feature 401/403 via gateRequireFeature
//   - 403 when ResellerScopeError
//   - 403 when insufficient role (viewer)
//   - 400 on bad JSON
//   - 503 when Stripe or DB not configured
//   - 404 when selfReseller not found
//   - 400 when saveResellerDefaultPaymentMethod fails
//   - 500 when audit log fails
//   - happy path: returns ok + pm + intent ids

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  gateRequireFeature: vi.fn(),
  scopedReseller: vi.fn(),
  isStripeConfigured: vi.fn(),
  getStripe: vi.fn(),
  getSupabaseAdmin: vi.fn(),
  resellerSupabase: vi.fn(),
  saveResellerDefaultPaymentMethod: vi.fn(),
  canProvisionSandbox: vi.fn(),
  RESELLER_STRIPE_BILLING_ERROR_MESSAGES: {} as Record<string, string>,
}));

vi.mock("@/lib/feature-gate", () => ({
  gateRequireFeature: (_feature: string) => mocks.gateRequireFeature(_feature),
}));
vi.mock("@/lib/reseller/scope", () => ({
  scopedReseller: (user: unknown) => mocks.scopedReseller(user),
  ResellerScopeError: class ResellerScopeError extends Error {
    code: string;
    constructor(code: string) { super(code); this.code = code; }
  },
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mocks.isStripeConfigured(),
  getStripe: () => mocks.getStripe(),
}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => mocks.getSupabaseAdmin() }));
vi.mock("@/lib/reseller/supabase", () => ({
  resellerSupabase: (scope: unknown) => mocks.resellerSupabase(scope),
}));
vi.mock("@/lib/reseller/stripe-billing-adapter", () => ({
  saveResellerDefaultPaymentMethod: (...args: unknown[]) =>
    mocks.saveResellerDefaultPaymentMethod(...args),
}));
vi.mock("@/lib/reseller/stripe-billing", () => ({
  RESELLER_STRIPE_BILLING_ERROR_MESSAGES: mocks.RESELLER_STRIPE_BILLING_ERROR_MESSAGES,
}));
vi.mock("@/lib/reseller/sandbox-provision", () => ({
  canProvisionSandbox: (role: string) => mocks.canProvisionSandbox(role),
}));

import { POST } from "./route";

const { ResellerScopeError } = await import("@/lib/reseller/scope");

const RESELLER_USER = { id: "res-user-1", email: "reseller@example.com", plan: "reseller", role: "user" };

function makeScope(role = "owner") {
  return { reseller_id: "res-1", role };
}

function makeDb(selfRaw: unknown = { id: "res-1", code: "CODE1", display_name: "Reseller 1", status: "active", billing_model: "prepaid", contact_email: null, stripe_customer_id: "cus_1", stripe_default_payment_method_id: null }) {
  const selfReseller = vi.fn().mockResolvedValue(selfRaw);
  const auditLog = vi.fn().mockResolvedValue(undefined);
  return { selfReseller, auditLog };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/reseller/billing/save-default-payment-method", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.gateRequireFeature.mockResolvedValue({ ok: true, user: RESELLER_USER });
  mocks.scopedReseller.mockResolvedValue(makeScope("owner"));
  mocks.canProvisionSandbox.mockReturnValue(true);
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.getStripe.mockReturnValue({ setupIntents: { retrieve: vi.fn() } });
  mocks.getSupabaseAdmin.mockReturnValue({});
  const db = makeDb();
  mocks.resellerSupabase.mockReturnValue(db);
  mocks.saveResellerDefaultPaymentMethod.mockResolvedValue({
    ok: true,
    stripe_customer_id: "cus_1",
    payment_method_id: "pm_1",
    setup_intent_id: "seti_1",
  });
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/reseller/billing/save-default-payment-method", () => {
  it("returns gate response when gateRequireFeature fails", async () => {
    const gateRes = new Response(JSON.stringify({ ok: false, reason: "unauthenticated" }), { status: 401 });
    mocks.gateRequireFeature.mockResolvedValue({ ok: false, response: gateRes });
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(401);
  });

  it("returns 403 when ResellerScopeError", async () => {
    mocks.scopedReseller.mockRejectedValue(new ResellerScopeError("not_reseller"));
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("not_reseller");
  });

  it("returns 403 when role is viewer (insufficient_role)", async () => {
    mocks.scopedReseller.mockResolvedValue(makeScope("viewer"));
    mocks.canProvisionSandbox.mockReturnValue(false);
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body.reason).toBe("insufficient_role");
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("invalid_json");
  });

  it("returns 503 when Stripe not configured", async () => {
    mocks.isStripeConfigured.mockReturnValue(false);
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(503);
  });

  it("returns 503 when DB not configured", async () => {
    mocks.getSupabaseAdmin.mockReturnValue(null);
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(503);
  });

  it("returns 404 when selfReseller not found", async () => {
    const db = makeDb(null);
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("reseller_missing");
  });

  it("returns 400 when saveResellerDefaultPaymentMethod fails", async () => {
    mocks.saveResellerDefaultPaymentMethod.mockResolvedValue({
      ok: false,
      reason: "setup_intent_not_found",
    });
    const res = await POST(req({ setup_intent_id: "seti_bad" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("setup_intent_not_found");
  });

  it("returns 500 when audit log fails", async () => {
    const db = makeDb();
    db.auditLog.mockRejectedValue(new Error("audit db down"));
    mocks.resellerSupabase.mockReturnValue(db);
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("audit_failed");
  });

  it("happy path: returns ok + pm_id + intent_id", async () => {
    const res = await POST(req({ setup_intent_id: "seti_1" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.stripe_customer_id).toBe("cus_1");
    expect(body.payment_method_id).toBe("pm_1");
    expect(body.setup_intent_id).toBe("seti_1");
  });

  it("writes audit log on success", async () => {
    const db = makeDb();
    mocks.resellerSupabase.mockReturnValue(db);
    await POST(req({ setup_intent_id: "seti_1" }));
    expect(db.auditLog).toHaveBeenCalledWith(
      expect.objectContaining({ action: "save_default_payment_method" }),
    );
  });
});
