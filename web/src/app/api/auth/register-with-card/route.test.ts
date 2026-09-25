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
  interval?: string;
  stripe_price_id_annual?: string | null;
  annual_price_aud_cents?: number;
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
  claimForCurrentBrowser: vi.fn(async (_p: { userId: string; email?: string | null; emailVerified?: boolean }) => ({ analyses: 0, guestAnalyses: 0 })),
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
vi.mock("@/lib/analyses/claim", () => ({ claimForCurrentBrowser: mocks.claimForCurrentBrowser }));
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

// G14-S33: evaluator_trial_started is emitted server-side; observe only.
const emitCalls: Array<{ name: string; params: Record<string, unknown>; userId?: string | null }> = [];
vi.mock("@/lib/analytics/server", () => ({
  emitEventSafe: (input: { name: string; params: Record<string, unknown>; userId?: string | null }) => {
    emitCalls.push(input);
  },
  emitEvent: async (input: { name: string; params: Record<string, unknown>; userId?: string | null }) => {
    emitCalls.push(input);
  },
}));

// G16-A: the funnel `sign_up` step — this route creates app_users itself,
// so it must emit exactly one sign_up (method "card") per successful signup.
const signUps: Array<Record<string, unknown>> = [];
vi.mock("@/lib/analytics/funnel", () => ({
  emitSignUp: (input: Record<string, unknown>) => {
    signUps.push(input);
  },
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
    stripe_price_id_annual: "price_angel_annual",
    annual_price_aud_cents: 79000,
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
  emitCalls.length = 0;
  signUps.length = 0;
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

// S31-C capacity audit (2026-09-13): the trial sign-up path is keyed like
// /api/auth/register — a wide per-IP ceiling (60 / 15 min) checked BEFORE
// the body is parsed, then a per-(IP, sha256(email)[0..16]) bucket (5 / 15
// min). A single `register-with-card:<ip>` 5 / 15 min key used to lock out
// the 6th real person behind one campus / office / CGNAT egress.
describe("S31-C rate-limit keying (shared-IP trial wave)", () => {
  const WINDOW = 15 * 60 * 1000;

  it("bucket 1 = per-IP ceiling 60 / 15 min on the trusted hop, checked before the body is read", async () => {
    mocks.checkRateLimit.mockReturnValueOnce({ allowed: false, resetIn: 90_000 });
    const res = await POST(req("not json"));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("90");
    expect(await json(res)).toMatchObject({ ok: false, error: "rate_limited" });
    const call = mocks.checkRateLimit.mock.calls[0];
    expect(call?.[0]).toBe("register-with-card:ip:1.1.1.1");
    expect(call?.[1]).toBe(60);
    expect(call?.[2]).toBe(WINDOW);
    expect(mocks.checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it("bucket 2 = per (IP, email hash) 5 / 15 min — the email never appears raw in the key", async () => {
    const res = await POST(req(body({ email: "Eva@Example.com" })));
    expect(res.status).toBe(200);
    const call = mocks.checkRateLimit.mock.calls[1];
    expect(call?.[0]).toMatch(/^register-with-card:1\.1\.1\.1:[0-9a-f]{16}$/);
    expect(call?.[0]).not.toContain("eva");
    expect(call?.[1]).toBe(5);
    expect(call?.[2]).toBe(WINDOW);
  });

  it("two different people behind one IP do not share the identity bucket", async () => {
    await POST(req(body({ email: "a@example.com" })));
    await POST(req(body({ email: "b@example.com" })));
    const identityKeys = mocks.checkRateLimit.mock.calls
      .map((c) => String(c[0]))
      .filter((k) => /^register-with-card:1\.1\.1\.1:/.test(k));
    expect(identityKeys).toHaveLength(2);
    expect(identityKeys[0]).not.toBe(identityKeys[1]);
  });

  it("a 429 on the identity bucket carries Retry-After and stops before any DB write", async () => {
    mocks.checkRateLimit
      .mockReturnValueOnce({ allowed: true, resetIn: 0 })
      .mockReturnValueOnce({ allowed: false, resetIn: 30_000 });
    const res = await POST(req(body()));
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(mocks.inserted).toHaveLength(0);
  });
});

describe("S8-C input guards", () => {
  it("413s an oversize body before parsing; 400s a payment_method_id that is not a Stripe pm_ id", async () => {
    const big = await POST(req(body({ display_name: "x".repeat(20 * 1024) })));
    expect(big.status).toBe(413);
    for (const bad of ["cus_123", "pm_", "pm_1 2", "pm_<script>", "x".repeat(200)]) {
      const res = await POST(req(body({ payment_method_id: bad })));
      expect(res.status, bad).toBe(400);
      expect(await res.json()).toMatchObject({ ok: false, error: "payment_method_required" });
    }
  });
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

  // Review 2026-09-10 #17: founder_enterprise is on the id allow-list (the
  // /signup ladder shows it) but its plan row is negotiated (interval =
  // custom, A$1,500 "from" price, trial_days 0) — it must never start a
  // self-serve card trial, even when a Stripe price happens to be provisioned.
  it("rejects a custom-priced plan row (founder_enterprise) with 400 plan_not_self_serve before Stripe or the DB", async () => {
    mocks.getPlanCached.mockImplementation(async (id) =>
      id === "founder_enterprise"
        ? { id, name: "Enterprise", price_aud_cents: 150000, trial_days: 0, stripe_price_id: "price_ent", active: true, interval: "custom" }
        : PLANS[id] ?? null,
    );
    const res = await POST(req(body({ plan_id: "founder_enterprise", account_type: "founder" })));
    expect(res.status).toBe(400);
    expect(await json(res)).toMatchObject({ error: "plan_not_self_serve", plan_id: "founder_enterprise" });
    expect(mocks.inserted).toHaveLength(0);
    expect(mocks.subscriptionCreates).toHaveLength(0);
  });

  // Pricing v4 (2026-09-16): accelerator_starter (Cohort 25) is self-serve now; accelerator_enterprise + index_api stay out.
  it.each(["founder_scale", "investor_vc_ent", "accelerator_enterprise", "index_api", "founder_free", "bogus"])(
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

describe("S-IA4: `redirect` in the response is the single /onboarding wizard for every fresh account", () => {
  it.each([["founder", "founder_starter"], ["investor", "investor_angel"], ["advisor", "investor_advisor"], ["accelerator", "investor_vc_small"]])(
    "%s on %s → /onboarding",
    async (accountType, planId) => {
      const res = await POST(req(body({ account_type: accountType, plan_id: planId })));
      expect(res.status).toBe(200);
      expect((await json(res)).redirect).toBe("/onboarding");
    },
  );
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

// G14-S33 — the evaluator trial starts here (Stripe subscription minted in
// trial mode), so the money event is server truth: one emit per evaluator
// signup, none for a founder rung.
describe("evaluator_trial_started (G14-S33)", () => {
  it("emits once for an evaluator plan with plan / trial_days / account_type / user_id", async () => {
    const res = await POST(req(body({ plan_id: "investor_vc_small", account_type: "accelerator" })));
    expect(res.status).toBe(200);
    const ev = emitCalls.filter((c) => c.name === "evaluator_trial_started");
    expect(ev).toHaveLength(1);
    expect(ev[0].params).toEqual({ plan: "investor_vc_small", trial_days: 14, account_type: "accelerator", user_id: "u_new" });
    expect(ev[0].userId).toBe("u_new");
  });

  it("does not emit for a founder rung", async () => {
    const res = await POST(req(body({ plan_id: "founder_starter", account_type: "founder" })));
    expect(res.status).toBe(200);
    expect(emitCalls.find((c) => c.name === "evaluator_trial_started")).toBeUndefined();
  });
});

// G16-A — funnel truth: one `sign_up` per created account, method "card",
// persona = account_type, segment mapped from the plan's segment.
describe("sign_up funnel event (G16-A)", () => {
  it("emits once for an evaluator signup with method card + persona", async () => {
    const res = await POST(req(body({ plan_id: "investor_vc_small", account_type: "accelerator" })));
    expect(res.status).toBe(200);
    expect(signUps).toEqual([
      { userId: "u_new", email: "eva@example.com", method: "card", segment: "unknown", persona: "accelerator" },
    ]);
  });

  it("maps a founder rung to segment founder and an investor rung to investor", async () => {
    expect((await POST(req(body({ plan_id: "founder_starter", account_type: "founder" })))).status).toBe(200);
    expect(signUps[0]).toMatchObject({ method: "card", segment: "founder", persona: "founder" });
    signUps.length = 0;
    expect((await POST(req(body()))).status).toBe(200);
    expect(signUps[0]).toMatchObject({ method: "card", segment: "investor", persona: "investor" });
  });

  it("does not emit when the email is already taken (no account created)", async () => {
    mocks.existingEmails.add("eva@example.com");
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect(signUps).toEqual([]);
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

  // 2026-09-16 pricing audit: the Annual toggle on /pricing now reaches the
  // charge. Annual bills `stripe_price_id_annual`; a rung without one falls
  // back to monthly and says so — never the annual figure at a monthly SKU.
  it("interval=annual bills the plan's annual Stripe Price and reports it", async () => {
    const res = await POST(req(body({ interval: "annual" })));
    const json = (await res.json()) as { ok: boolean; trial: { price_display: string; interval: string } };
    expect(res.status).toBe(200);
    expect(mocks.subscriptionCreates[0]).toMatchObject({
      items: [{ price: "price_angel_annual" }],
      metadata: { plan_id: "investor_angel", interval: "annual" },
    });
    expect(json.trial.interval).toBe("annual");
    expect(json.trial.price_display).toBe("A$790");
  });

  it("interval=annual on a rung without an annual Price bills monthly and says so", async () => {
    const res = await POST(req(body({ plan_id: "founder_starter", account_type: "founder", interval: "annual" })));
    const json = (await res.json()) as { trial: { price_display: string; interval: string } };
    expect(mocks.subscriptionCreates[0]).toMatchObject({
      items: [{ price: "price_starter" }],
      metadata: { interval: "monthly" },
    });
    expect(json.trial.interval).toBe("monthly");
    expect(json.trial.price_display).toBe("A$29");
  });

  it("omitting interval keeps the monthly Price (existing callers unchanged)", async () => {
    await POST(req(body()));
    expect(mocks.subscriptionCreates[0]).toMatchObject({ items: [{ price: "price_angel" }] });
  });

  it("409 email_taken for a duplicate email", async () => {
    mocks.existingEmails.add("eva@example.com");
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("email_taken");
    expect(mocks.claimForCurrentBrowser).not.toHaveBeenCalled();
  });
});

describe("G34 DC04 claim on signup", () => {
  it("claims this browser's pre-signup work for the new account — cookie only, the typed address is not verified", async () => {
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    expect(mocks.claimForCurrentBrowser).toHaveBeenCalledTimes(1);
    const arg = mocks.claimForCurrentBrowser.mock.calls[0][0];
    expect(arg).toEqual({ userId: "u_new", email: "eva@example.com" });
    expect(arg.emailVerified).toBeUndefined();
  });
});
