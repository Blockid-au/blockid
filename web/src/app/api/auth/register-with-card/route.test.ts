// Colocated vitest for POST /api/auth/register-with-card (T0269, G12-6).
//
// The route is the only self-serve signup path and it now serves two
// ladders — founder (Starter / Growth / Enterprise) and evaluator (Scout /
// Firm / Program = investor_angel / investor_advisor / investor_vc_small).
// This suite pins the contracts the pre-implementation review flagged:
//
//   * plan allow-list: evaluator rungs accepted; founder_scale / VC Ent /
//     accelerator SKUs → 400 unsupported_plan BEFORE any DB / Stripe call
//   * account_type zod enum: founder, investor, accelerator, incubator,
//     advisor, service_provider, journalist; anything else → 400 invalid_body
//   * trial_period_days + trial_end_at come from the plan row's trial_days
//     (fallback 7), not a constant
//   * app_users.segment is written from account_type (+ plan) so
//     investor-weekly-digest (segment in investor_angel / investor_vc) fires
//   * card stays required: payment_method_id missing → 400
//     payment_method_required; subscription is created with
//     trial_settings.end_behavior.missing_payment_method = "cancel"

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface PlanRow {
  id: string;
  name: string;
  price_aud_cents: number;
  trial_days: number;
  stripe_price_id: string | null;
  active: boolean;
}

const mocks = vi.hoisted(() => ({
  checkRateLimit: vi.fn(() => ({ allowed: true, resetIn: 0 })),
  clientIpFromHeaders: vi.fn(() => "1.1.1.1"),
  hashIp: vi.fn(() => "hash"),
  isValidEmail: vi.fn(() => true),
  normaliseEmail: vi.fn((e: string) => e.toLowerCase()),
  createSessionRow: vi.fn(async () => "sess_1"),
  setSessionCookie: vi.fn(async () => undefined),
  getPlanCached: vi.fn<(id: string) => Promise<PlanRow | null>>(),
  initializeCredits: vi.fn(async () => undefined),
  sendPaymentConfirmation: vi.fn(async () => ({ ok: true })),
  processAttribution: vi.fn(async () => undefined),
  // Supabase fake state
  inserted: [] as Record<string, unknown>[],
  trialStateUpserts: [] as Record<string, unknown>[],
  existingEmails: new Set<string>(),
  // Stripe fake state
  subscriptionCreates: [] as Record<string, unknown>[],
}));

vi.mock("server-only", () => ({}));
vi.mock("bcryptjs", () => ({ default: { hash: async () => "$2a$12$hash" } }));

vi.mock("@/lib/auth", () => ({
  ADMIN_EMAIL: "admin@blockid.au",
  createSessionRow: mocks.createSessionRow,
  isValidEmail: mocks.isValidEmail,
  normaliseEmail: mocks.normaliseEmail,
  setSessionCookie: mocks.setSessionCookie,
}));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: mocks.checkRateLimit }));
vi.mock("@/lib/iphash", () => ({
  hashIp: mocks.hashIp,
  clientIpFromHeaders: mocks.clientIpFromHeaders,
}));
vi.mock("@/lib/plans-db", () => ({ getPlanCached: mocks.getPlanCached }));
vi.mock("@/lib/credits", () => ({ initializeCredits: mocks.initializeCredits }));
vi.mock("@/lib/email", () => ({ sendPaymentConfirmation: mocks.sendPaymentConfirmation }));
vi.mock("@/lib/reseller/attribution", () => ({ extractViaFromCookieHeader: () => null }));
vi.mock("@/lib/reseller/process-attribution", () => ({
  processAttribution: mocks.processAttribution,
}));

// Minimal chainable Supabase fake covering the calls the route makes:
//   from("app_users").select("id").eq("email", x).maybeSingle()
//   from("app_users").insert({...}).select("id").single()
//   from("app_users").update({...}).eq("id", x)
//   from("app_users").delete().eq("id", x)
//   from("subscription_trial_state").upsert({...}, opts)
function makeSupabase() {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let mode: "select" | "insert" | "update" | "delete" = "select";
      let filterEmail: string | null = null;
      chain.select = () => chain;
      chain.insert = (row: Record<string, unknown>) => {
        mode = "insert";
        if (table === "app_users") mocks.inserted.push(row);
        return chain;
      };
      chain.update = () => {
        mode = "update";
        return chain;
      };
      chain.delete = () => {
        mode = "delete";
        return chain;
      };
      chain.upsert = (row: Record<string, unknown>) => {
        if (table === "subscription_trial_state") mocks.trialStateUpserts.push(row);
        return Promise.resolve({ error: null });
      };
      chain.eq = (col: string, val: string) => {
        if (col === "email") filterEmail = val;
        if (mode === "update" || mode === "delete") {
          return Promise.resolve({ error: null });
        }
        return chain;
      };
      chain.maybeSingle = async () => ({
        data: filterEmail && mocks.existingEmails.has(filterEmail) ? { id: "dup" } : null,
        error: null,
      });
      chain.single = async () => ({ data: { id: "u_new" }, error: null });
      chain.then = undefined;
      return chain;
    },
  };
}

vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => makeSupabase(),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({
    customers: {
      create: async () => ({ id: "cus_1" }),
      update: async () => ({}),
      del: async () => ({}),
    },
    paymentMethods: { attach: async () => ({}) },
    subscriptions: {
      create: async (params: Record<string, unknown>) => {
        mocks.subscriptionCreates.push(params);
        return { id: "sub_1" };
      },
    },
  }),
}));

import { POST } from "./route";

const PLANS: Record<string, PlanRow> = {
  founder_starter: {
    id: "founder_starter",
    name: "Starter",
    price_aud_cents: 2900,
    trial_days: 7,
    stripe_price_id: "price_starter",
    active: true,
  },
  investor_angel: {
    id: "investor_angel",
    name: "Angel",
    price_aud_cents: 7900,
    trial_days: 7,
    stripe_price_id: "price_angel",
    active: true,
  },
  investor_vc_small: {
    id: "investor_vc_small",
    name: "VC Small (5-seat min)",
    price_aud_cents: 34900,
    trial_days: 14, // deliberately non-default to prove the plan row drives the length
    stripe_price_id: "price_vc_small",
    active: true,
  },
  investor_advisor: {
    id: "investor_advisor",
    name: "Advisor",
    price_aud_cents: 14900,
    trial_days: 0, // missing/zero → fallback 7
    stripe_price_id: "price_advisor",
    active: true,
  },
};

function body(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: "eva@example.com",
    password: "correct-horse",
    display_name: "Eva",
    account_type: "investor",
    plan_id: "investor_angel",
    payment_method_id: "pm_123",
    terms_accepted: true,
    ...overrides,
  };
}

function req(payload: unknown): Request {
  return new Request("http://x/api/auth/register-with-card", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.inserted.length = 0;
  mocks.trialStateUpserts.length = 0;
  mocks.subscriptionCreates.length = 0;
  mocks.existingEmails.clear();
  mocks.getPlanCached.mockReset().mockImplementation(async (id) => PLANS[id] ?? null);
  mocks.checkRateLimit.mockReturnValue({ allowed: true, resetIn: 0 });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("plan allow-list", () => {
  it.each(["investor_angel", "investor_advisor", "investor_vc_small"])(
    "accepts evaluator rung %s",
    async (planId) => {
      const res = await POST(req(body({ plan_id: planId })));
      expect(res.status).toBe(200);
      const j = await json(res);
      expect(j.ok).toBe(true);
      expect((j.user as { plan: string }).plan).toBe(planId);
    },
  );

  it("still accepts the founder rungs", async () => {
    const res = await POST(req(body({ plan_id: "founder_starter", account_type: "founder" })));
    expect(res.status).toBe(200);
  });

  it.each(["founder_scale", "investor_vc_ent", "accelerator_starter", "founder_free", "bogus"])(
    "rejects %s with 400 unsupported_plan before touching the DB",
    async (planId) => {
      const res = await POST(req(body({ plan_id: planId })));
      expect(res.status).toBe(400);
      expect((await json(res)).error).toBe("unsupported_plan");
      expect(mocks.getPlanCached).not.toHaveBeenCalled();
      expect(mocks.inserted).toHaveLength(0);
    },
  );
});

describe("account_type enum", () => {
  it.each([
    "founder",
    "investor",
    "accelerator",
    "incubator",
    "advisor",
    "service_provider",
    "journalist",
  ])("accepts %s", async (accountType) => {
    const res = await POST(req(body({ account_type: accountType })));
    expect(res.status).toBe(200);
    expect(mocks.inserted[0]?.account_type).toBe(accountType);
  });

  it.each(["reseller", "affiliate", "lp", "admin", "INVESTOR", ""])(
    "rejects %s with 400 invalid_body (field account_type)",
    async (accountType) => {
      const res = await POST(req(body({ account_type: accountType })));
      expect(res.status).toBe(400);
      const j = await json(res);
      expect(j.error).toBe("invalid_body");
      expect(j.field).toBe("account_type");
      expect(mocks.inserted).toHaveLength(0);
    },
  );

  it("defaults to founder when account_type is omitted", async () => {
    const payload = body({ plan_id: "founder_starter" });
    delete payload.account_type;
    const res = await POST(req(payload));
    expect(res.status).toBe(200);
    expect(mocks.inserted[0]?.account_type).toBe("founder");
    expect(mocks.inserted[0]?.segment).toBe("founder");
  });
});

describe("app_users.segment written from account_type", () => {
  it.each([
    ["investor", "investor_angel", "investor_angel"],
    ["investor", "investor_advisor", "investor_angel"],
    ["investor", "investor_vc_small", "investor_vc"],
    ["advisor", "investor_advisor", "advisor"],
    ["service_provider", "investor_angel", "advisor"],
    ["accelerator", "investor_vc_small", "accelerator"],
    ["incubator", "investor_vc_small", "accelerator"],
    ["founder", "founder_starter", "founder"],
    ["journalist", "founder_starter", "founder"],
  ])("%s on %s → segment %s", async (accountType, planId, segment) => {
    const res = await POST(req(body({ account_type: accountType, plan_id: planId })));
    expect(res.status).toBe(200);
    expect(mocks.inserted).toHaveLength(1);
    expect(mocks.inserted[0]?.segment).toBe(segment);
    expect(mocks.inserted[0]?.plan).toBe(planId);
  });
});

describe("trial length comes from the plan row", () => {
  it("uses trial_days=14 from the plan for Stripe + trial_end_at + response", async () => {
    const before = Date.now();
    const res = await POST(req(body({ plan_id: "investor_vc_small" })));
    expect(res.status).toBe(200);
    const j = await json(res);
    expect((j.trial as { days: number }).days).toBe(14);
    expect(mocks.subscriptionCreates[0]?.trial_period_days).toBe(14);
    const endAt = Date.parse(String(mocks.inserted[0]?.trial_end_at));
    const days = (endAt - before) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect(mocks.trialStateUpserts[0]?.trial_end).toBe(mocks.inserted[0]?.trial_end_at);
  });

  it("falls back to 7 when the plan row carries trial_days=0", async () => {
    const before = Date.now();
    const res = await POST(req(body({ plan_id: "investor_advisor", account_type: "advisor" })));
    expect(res.status).toBe(200);
    expect((await json(res)).trial).toMatchObject({ days: 7, plan_name: "Advisor", price_display: "A$149" });
    expect(mocks.subscriptionCreates[0]?.trial_period_days).toBe(7);
    const days = (Date.parse(String(mocks.inserted[0]?.trial_end_at)) - before) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);
  });

  it("uses 7 for Scout (plan row trial_days=7)", async () => {
    const res = await POST(req(body({ plan_id: "investor_angel" })));
    expect((await json(res)).trial).toMatchObject({ days: 7, price_display: "A$79" });
    expect(mocks.subscriptionCreates[0]?.trial_period_days).toBe(7);
  });
});

describe("card stays required", () => {
  it("400 payment_method_required when payment_method_id is missing", async () => {
    const payload = body();
    delete payload.payment_method_id;
    const res = await POST(req(payload));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("payment_method_required");
  });

  it("creates the subscription with the payment method attached + cancel-if-missing", async () => {
    await POST(req(body()));
    expect(mocks.subscriptionCreates[0]).toMatchObject({
      customer: "cus_1",
      items: [{ price: "price_angel" }],
      default_payment_method: "pm_123",
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      metadata: { user_id: "u_new", plan_id: "investor_angel" },
    });
    expect(mocks.trialStateUpserts[0]).toMatchObject({
      user_id: "u_new",
      plan_id: "investor_angel",
      status: "trialing",
      payment_method_saved: true,
    });
  });

  it("409 email_taken for a duplicate email", async () => {
    mocks.existingEmails.add("eva@example.com");
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("email_taken");
  });
});
