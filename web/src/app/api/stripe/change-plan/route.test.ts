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
  STRIPE_PRICE_MAP: { founder_scale: "price_scale", founder_growth: "price_growth" },
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
    cadence: id === "founder_scale" ? "yearly" : "monthly",
    price: id === "founder_scale" ? 500 : 100,
  }),
}));

vi.mock("@/lib/plans-db", () => ({
  getPlanCached: async (id: string) => ({
    id,
    segment: "founder",
    price_aud_cents: id === "founder_scale" ? 50000 : 10000,
  }),
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
