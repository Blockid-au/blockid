// Unit test for POST /api/stripe/change-plan audit wire-in.
//
// Iteration-15 T1 (D3-CISO-05 SOC2-lite Wave 3). Asserts that a
// successful plan swap on an active recurring subscription logs
// `stripe.plan.changed` with { from_plan, to_plan, cadence } — no
// raw customer or price ids leak into the audit fields.

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const getCurrentUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

const isStripeConfiguredMock = vi.fn().mockReturnValue(true);
const stripeMock = {
  subscriptions: {
    list: vi.fn(),
    update: vi.fn(),
    cancel: vi.fn(),
  },
  checkout: { sessions: { create: vi.fn() } },
  invoices: { createPreview: vi.fn() },
  subscriptionSchedules: { retrieve: vi.fn(), create: vi.fn(), update: vi.fn() },
};
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => isStripeConfiguredMock(),
  getStripe: () => stripeMock,
  STRIPE_PRICE_MAP: { founder_scale: "price_scale", founder_growth: "price_growth", founder_package: "price_package" },
  isShareMgmtAddonPrice: () => false,
}));

const supabaseMock = {
  from: vi.fn(),
};
const isSupabaseConfiguredMock = vi.fn().mockReturnValue(true);
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => isSupabaseConfiguredMock(),
  getSupabaseAdmin: () => supabaseMock,
}));

vi.mock("@/lib/plans", () => ({
  getPlan: (id: string) => ({
    id,
    cadence: id === "founder_scale" ? "yearly" : id === "founder_package" ? "once" : "monthly",
    price: id === "founder_scale" ? 500 : id === "founder_package" ? 149 : 100,
  }),
  // Real map shape (lib/plans.ts) — G18-A remaps legacy ids through it.
  LEGACY_PLAN_MAP: {
    founding50: { id: "founder_starter", interval: "monthly" },
    growth: { id: "founder_growth", interval: "monthly" },
    growth_annual: { id: "founder_growth", interval: "yearly" },
  },
}));

// G18-A: the target rung resolves from the plans table (v2 SKUs priced by
// `plans.stripe_price_id[_annual]`). The mock mirrors the production rows the
// suite touches; `getPlanCachedMock` lets a test override one lookup.
const getPlanCachedMock = vi.fn(async (id: string) => ({
  id,
  name: id,
  segment: "founder",
  interval: id === "founder_scale" ? "yearly" : id === "founder_package" ? "once" : "monthly",
  price_aud_cents: id === "founder_scale" ? 50000 : id === "founder_package" ? 14900 : 10000,
  annual_price_aud_cents: id === "founder_growth" ? 69000 : 0,
  stripe_price_id:
    id === "founder_scale" ? "price_scale" : id === "founder_package" ? "price_package" : id === "founder_growth" ? "price_growth" : null,
  stripe_price_id_annual: id === "founder_growth" ? "price_growth_annual" : null,
  feature_flags: [],
}));
vi.mock("@/lib/plans-db", () => ({
  getPlanCached: (id: string) => getPlanCachedMock(id),
}));

vi.mock("@/lib/stripe/addon-schedule", () => ({
  buildAddonRemovalSchedulePhases: () => ({ ok: false, reason: "unused" }),
}));

vi.mock("@/lib/reseller/hash", () => ({
  hashUserId: (id: string) => `hash-${id}`,
}));

const logUserActionMock = vi.fn();
vi.mock("@/lib/audit/log", () => ({
  logUserAction: (input: unknown) => logUserActionMock(input),
  extractIp: () => "10.0.0.9",
  extractUserAgent: () => "vitest",
}));


// QA-3 P1-10 (2026-09-12): the route is rate-limited per user (10 / 15 min).
// Mocked so the shared in-memory limiter cannot bleed 429s across this file;
// the dedicated describe below pins the call shape and the 429 pass-through.
const enforceRateLimitMock = vi.hoisted(() =>
  vi.fn<(route: string, identity: string | null | undefined, req: Request, max: number, windowMs: number) => Response | null>(),
);
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (
    route: string,
    identity: string | null | undefined,
    req: Request,
    max: number,
    windowMs: number,
  ) => enforceRateLimitMock(route, identity, req, max, windowMs),
}));

import { POST } from "./route";

function wireSupabase(customer: string | null, currentPlan: string | null) {
  const appUsersChain: Record<string, unknown> = {};
  appUsersChain.select = vi.fn().mockReturnValue(appUsersChain);
  appUsersChain.eq = vi.fn().mockReturnValue(appUsersChain);
  appUsersChain.maybeSingle = vi.fn().mockResolvedValue({
    data: customer ? { stripe_customer_id: customer, plan: currentPlan } : null,
  });
  const conversionChain = {
    insert: vi.fn().mockResolvedValue({ error: null }),
  };
  supabaseMock.from.mockImplementation((table: string) => {
    if (table === "conversion_events") return conversionChain;
    return appUsersChain;
  });
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  stripeMock.subscriptions.list.mockReset();
  stripeMock.subscriptions.update.mockReset();
  stripeMock.subscriptions.cancel.mockReset();
  stripeMock.checkout.sessions.create.mockReset();
  supabaseMock.from.mockReset();
  logUserActionMock.mockReset();
  logUserActionMock.mockResolvedValue({ ok: true });
});

describe("POST /api/stripe/change-plan audit wire-in", () => {
  it("logs stripe.plan.changed with { from_plan, to_plan, cadence } after a successful recurring plan swap", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_growth");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_abc", items: { data: [{ id: "si_1" }] } }],
    });
    stripeMock.subscriptions.update.mockResolvedValue({});

    const req = new Request("http://x/api/stripe/change-plan", {
      method: "POST",
      body: JSON.stringify({ newPlanId: "founder_scale" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    expect(logUserActionMock).toHaveBeenCalledTimes(1);
    const arg = logUserActionMock.mock.calls[0][0];
    expect(arg.action).toBe("stripe.plan.changed");
    expect(arg.subjectType).toBe("subscription");
    expect(arg.subjectId).toBe("sub_abc");
    expect(arg.fields).toEqual({
      from_plan: "founder_growth",
      to_plan: "founder_scale",
      cadence: "yearly",
    });
    expect(arg.route).toBe("/api/stripe/change-plan");
    // Guard: raw Stripe customer id must never appear in the audit fields.
    expect(JSON.stringify(arg.fields)).not.toContain("cus_123");
  });

  it("does not log when validation rejects the request (missing newPlanId)", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_growth");
    const req = new Request("http://x/api/stripe/change-plan", {
      method: "POST",
      body: JSON.stringify({}),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });

  it("does not log when auth fails", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const req = new Request("http://x/api/stripe/change-plan", {
      method: "POST",
      body: JSON.stringify({ newPlanId: "founder_scale" }),
    });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(logUserActionMock).not.toHaveBeenCalled();
  });
});

describe("QA-3 P1-10 — per-user rate limit on /api/stripe/change-plan", () => {
  it("calls enforceRateLimit('stripe-change-plan', user.id, request, 10, 15 min) after auth", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-rl", email: "rl@x.au", plan: "growth" });
    wireSupabase("cus_1", "growth");
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    await POST(new Request("http://x/api/stripe/change-plan", { method: "POST", body: JSON.stringify({ plan: "growth" }) }));
    expect(enforceRateLimitMock).toHaveBeenCalledWith("stripe-change-plan", "u-rl", expect.any(Request), 10, 15 * 60 * 1000);
  });

  it("returns the limiter's 429 before any Stripe call", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u-rl", email: "rl@x.au", plan: "growth" });
    enforceRateLimitMock.mockReturnValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "60" } }));
    const res = await POST(new Request("http://x/api/stripe/change-plan", { method: "POST", body: JSON.stringify({ plan: "growth" }) }));
    expect(res.status).toBe(429);
    expect(stripeMock.subscriptions.list).not.toHaveBeenCalled();
    expect(stripeMock.checkout.sessions.create).not.toHaveBeenCalled();
  });
});

// QA-3 P1-13 (2026-09-12): the one-off branch must NOT cancel the live
// subscription before the Checkout session is paid. The subscription id
// rides in session metadata; the webhook cancels it on
// checkout.session.completed.
describe("POST /api/stripe/change-plan — one-off plan keeps the subscription until payment (QA-3 P1-13)", () => {
  function oneOffReq() {
    return new Request("http://x/api/stripe/change-plan", {
      method: "POST",
      body: JSON.stringify({ newPlanId: "founder_package" }),
    });
  }

  it("does not call subscriptions.cancel; stamps cancel_subscription_id on the session metadata", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_growth");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_abc", items: { data: [{ id: "si_1" }] } }],
    });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_1", url: "https://checkout.stripe/cs_1" });

    const res = await POST(oneOffReq());
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();

    expect(stripeMock.checkout.sessions.create).toHaveBeenCalledTimes(1);
    const [params, opts] = stripeMock.checkout.sessions.create.mock.calls[0] as [
      { mode: string; metadata: Record<string, string> },
      { idempotencyKey: string },
    ];
    expect(params.mode).toBe("payment");
    expect(params.metadata.cancel_subscription_id).toBe("sub_abc");
    expect(params.metadata.blockid_plan).toBe("founder_package");
    // The subscription id is part of the idempotency key so a retry after
    // the sub changes mints a fresh session rather than replaying a stale one.
    expect(opts.idempotencyKey).toBeTruthy();
  });

  it("omits cancel_subscription_id when the founder has no active subscription", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", null);
    stripeMock.subscriptions.list.mockResolvedValue({ data: [] });
    stripeMock.checkout.sessions.create.mockResolvedValue({ id: "cs_2", url: "https://checkout.stripe/cs_2" });

    const res = await POST(oneOffReq());
    expect(res.status).toBe(200);
    const [params] = stripeMock.checkout.sessions.create.mock.calls[0] as [{ metadata: Record<string, string> }];
    expect(params.metadata).not.toHaveProperty("cancel_subscription_id");
    expect(stripeMock.subscriptions.cancel).not.toHaveBeenCalled();
  });
});

// G18-A (2026-09-19): a plan switch books the v2 rung's own Stripe price
// (plans.stripe_price_id) — legacy ids remap, and the legacy A$99 / A$950
// Growth prices are never sent to Stripe.
describe("POST /api/stripe/change-plan — v2 rungs + legacy remap (G18-A)", () => {
  function switchReq(newPlanId: string) {
    return new Request("http://x/api/stripe/change-plan", {
      method: "POST",
      body: JSON.stringify({ newPlanId }),
    });
  }

  it("switches an active subscription onto the v2 price from the plans row", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_starter");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_abc", items: { data: [{ id: "si_1" }] } }],
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_abc" });

    const res = await POST(switchReq("founder_growth"));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_abc",
      expect.objectContaining({ items: [{ id: "si_1", price: "price_growth" }] }),
    );
  });

  it("remaps legacy 'growth_annual' to founder_growth billed on the annual v2 price", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_starter");
    stripeMock.subscriptions.list.mockResolvedValue({
      data: [{ id: "sub_abc", items: { data: [{ id: "si_1" }] } }],
    });
    stripeMock.subscriptions.update.mockResolvedValue({ id: "sub_abc" });

    const res = await POST(switchReq("growth_annual"));
    expect(res.status).toBe(200);
    expect(stripeMock.subscriptions.update).toHaveBeenCalledWith(
      "sub_abc",
      expect.objectContaining({ items: [{ id: "si_1", price: "price_growth_annual" }] }),
    );
    expect(getPlanCachedMock).toHaveBeenCalledWith("founder_growth");
  });

  it("answers 400 (not a legacy price) when the plans row carries no Stripe price", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "u1" });
    wireSupabase("cus_123", "founder_starter");
    const res = await POST(switchReq("investor_vc_ent"));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { reason: string };
    expect(body.reason).toMatch(/Stripe price not configured for plan "investor_vc_ent"/);
    expect(stripeMock.subscriptions.update).not.toHaveBeenCalled();
  });
});
