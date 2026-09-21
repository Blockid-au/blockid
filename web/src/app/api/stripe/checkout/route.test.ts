// Colocated vitest for POST /api/stripe/checkout — P9-stripe-checkout-route-test.
//
// This is the primary payment surface. Every gated feature the founder pays
// for flows through here — recurring subscriptions (Growth), one-off
// Founding 100, one-off Startup Package. Regressions have direct revenue
// impact and can also corrupt the reseller attribution ledger, so this
// route is one of the highest-risk surfaces in the codebase.
//
// Focus of this suite (non-reseller path):
//   - auth 401 gate;
//   - configured 503 gate;
//   - JSON body 400 gate;
//   - plan validation 400 gate;
//   - the Founding-100 promo cutover 410 (post-2026-08-31);
//   - idempotencyKey stamped on every session create;
//   - metadata.blockid_user_id + blockid_plan stamped (webhook contract);
//   - success/cancel URLs;
//   - error handling 500 doesn't leak Stripe internals.
//
// Reseller-attribution path is intentionally OUT OF SCOPE per the current
// agent territory split — cookie is unset, promoCode absent, so the
// reseller lookup never fires.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  plan: string | null;
  role: string;
  displayName?: string | null;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  cookiesMock: vi.fn<() => Promise<{ get: (name: string) => { value: string } | undefined }>>(),
  isStripeConfiguredMock: vi.fn<() => boolean>(),
  getStripeMock: vi.fn<() => unknown | null>(),
  stripeCreateMock: vi.fn<(
    params: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; url: string }>>(),
  getPlanMock: vi.fn<(id: string) => { id: string; cadence: string; price: number } | undefined>(),
  isFoundingPromoActiveMock: vi.fn<() => boolean>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  getPlanCachedMock: vi.fn<(slug: string) => Promise<{
    trial_days?: number;
    segment?: string | null;
    id?: string;
    name?: string;
    interval?: string;
    price_aud_cents?: number;
    annual_price_aud_cents?: number;
    stripe_price_id?: string | null;
    stripe_price_id_annual?: string | null;
    feature_flags?: string[];
  } | null>>(),
  normaliseResellerCodeMock: vi.fn<(code: string | null) => string | null>(),
  viaClientReferenceIdMock: vi.fn<(code: string) => string>(),
  resolvePromoCodeMock: vi.fn<(code: string) => Promise<{ promoRowId: string } | null>>(),
  hashUserIdMock: vi.fn<(id: string) => string>(),
  buildCheckoutSuccessUrlMock: vi.fn<(site: string, plan: string, origin?: string) => string>(),
  sessionIdempotencyKeyMock: vi.fn<(kind: string, parts: unknown[]) => string>(),
  logUserActionMock: vi.fn<(input: Record<string, unknown>) => Promise<void>>(),
  extractIpMock: vi.fn<(h: Headers) => string>(),
  extractUserAgentMock: vi.fn<(h: Headers) => string>(),
  STRIPE_PRICE_MAP_FIXTURE: {
    founder_growth: "price_growth",
    founding50: "price_founding50",
    founder_package: "price_founder_package",
  } as Record<string, string | undefined>,
}));

vi.mock("next/headers", () => ({
  cookies: () => mocks.cookiesMock(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripeMock(),
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
  STRIPE_PRICE_MAP: mocks.STRIPE_PRICE_MAP_FIXTURE,
}));

vi.mock("@/lib/plans", () => ({
  getPlan: (id: string) => mocks.getPlanMock(id),
  // Real map shape (lib/plans.ts) — the route remaps legacy ids through it.
  LEGACY_PLAN_MAP: {
    founding50: { id: "founder_starter", interval: "monthly" },
    growth: { id: "founder_growth", interval: "monthly" },
    growth_annual: { id: "founder_growth", interval: "yearly" },
  },
}));

vi.mock("@/lib/founding-promo", () => ({
  isFoundingPromoActive: () => mocks.isFoundingPromoActiveMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
}));

vi.mock("@/lib/plans-db", () => ({
  getPlanCached: (slug: string) => mocks.getPlanCachedMock(slug),
}));

vi.mock("@/lib/reseller/attribution", () => ({
  normaliseResellerCode: (c: string | null) => mocks.normaliseResellerCodeMock(c),
}));

vi.mock("@/lib/reseller/attribution-server", () => ({
  viaClientReferenceId: (c: string) => mocks.viaClientReferenceIdMock(c),
}));

vi.mock("@/lib/reseller/resolve-promo", () => ({
  resolvePromoCode: (c: string) => mocks.resolvePromoCodeMock(c),
}));

vi.mock("@/lib/reseller/hash", () => ({
  hashUserId: (id: string) => mocks.hashUserIdMock(id),
}));

vi.mock("@/lib/stripe/checkout-success-url", () => ({
  buildCheckoutSuccessUrl: (s: string, p: string, o?: string) =>
    mocks.buildCheckoutSuccessUrlMock(s, p, o),
}));

vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: (kind: string, parts: unknown[]) =>
    mocks.sessionIdempotencyKeyMock(kind, parts),
}));

vi.mock("@/lib/audit/log", () => ({
  logUserAction: (i: Record<string, unknown>) => mocks.logUserActionMock(i),
  extractIp: (h: Headers) => mocks.extractIpMock(h),
  extractUserAgent: (h: Headers) => mocks.extractUserAgentMock(h),
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

// G23-B — the conversion branch reads the pilot order through a dynamic
// import of lib/pilots/paid-orders; mocked so no Supabase client is needed.
const findPilotOrderByIdMock = vi.hoisted(() => vi.fn<(id: string) => Promise<Record<string, unknown> | null>>());
vi.mock("@/lib/pilots/paid-orders", () => ({
  findPilotOrderById: (id: string) => findPilotOrderByIdMock(id),
}));

import { POST, dynamic } from "./route";

const USER: AppUser = {
  id: "user-1",
  email: "founder@example.com",
  plan: "free",
  role: "user",
};

function fakeStripe() {
  return {
    checkout: {
      sessions: {
        create: (
          params: Record<string, unknown>,
          opts?: { idempotencyKey?: string },
        ) => mocks.stripeCreateMock(params, opts),
      },
    },
  };
}

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/stripe/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  // Empty cookie store (no blockid_via) → reseller path skipped.
  mocks.cookiesMock.mockReset().mockResolvedValue({ get: () => undefined });
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.stripeCreateMock.mockReset().mockResolvedValue({
    id: "cs_test_1",
    url: "https://stripe.example/cs_test_1",
  });
  mocks.getPlanMock.mockReset().mockReturnValue({
    id: "founder_growth",
    cadence: "monthly",
    price: 9900,
  });
  mocks.isFoundingPromoActiveMock.mockReset().mockReturnValue(true);
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(null); // segment lookup skipped
  mocks.getPlanCachedMock.mockReset().mockResolvedValue(null);
  mocks.normaliseResellerCodeMock.mockReset().mockImplementation((c) => c);
  mocks.viaClientReferenceIdMock.mockReset().mockImplementation((c: string) => `ref_${c}`);
  mocks.resolvePromoCodeMock.mockReset().mockResolvedValue(null);
  mocks.hashUserIdMock.mockReset().mockImplementation((id: string) => `h_${id}`);
  mocks.buildCheckoutSuccessUrlMock.mockReset().mockImplementation(
    (site: string, plan: string) => `${site}/success?p=${plan}`,
  );
  mocks.sessionIdempotencyKeyMock.mockReset().mockReturnValue("idem_1");
  mocks.logUserActionMock.mockReset().mockResolvedValue(undefined);
  mocks.extractIpMock.mockReset().mockReturnValue("1.1.1.1");
  mocks.extractUserAgentMock.mockReset().mockReturnValue("test-ua");
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("stripe/checkout — module invariants", () => {
  it("exports dynamic='force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Auth gate (401)
// -----------------------------------------------------------------------------

describe("stripe/checkout — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("Authentication required");
  });

  it("MUST NOT call Stripe when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(req({ plan: "founder_growth" }));
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Config gate (503)
// -----------------------------------------------------------------------------

describe("stripe/checkout — config gate", () => {
  it("returns 503 when Stripe is unconfigured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("Payments not configured");
  });
});

// -----------------------------------------------------------------------------
// Body validation (400)
// -----------------------------------------------------------------------------

describe("stripe/checkout — body validation", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Invalid JSON body");
  });

  it("returns 400 when plan is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Plan ID is required");
  });

  it("returns 400 when plan is a number", async () => {
    const res = await POST(req({ plan: 123 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when plan is unknown (getPlan returns undefined)", async () => {
    mocks.getPlanMock.mockReturnValue(undefined);
    const res = await POST(req({ plan: "hallucinated" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Invalid or free plan");
  });

  it("returns 400 when the resolved plan is free-cadence", async () => {
    mocks.getPlanMock.mockReturnValue({ id: "free", cadence: "free", price: 0 });
    const res = await POST(req({ plan: "free" }));
    expect(res.status).toBe(400);
  });

  it("returns 503 when the plan has no STRIPE_PRICE_MAP / stripe_price_id entry (plan_not_provisioned)", async () => {
    mocks.getPlanMock.mockReturnValue({ id: "custom", cadence: "monthly", price: 99 });
    const res = await POST(req({ plan: "custom" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(String(body.error ?? body.reason)).toMatch(/plan_not_provisioned|stripe price not configured/i);
  });
});

// -----------------------------------------------------------------------------
// Founding 100 cutover (410)
// -----------------------------------------------------------------------------

describe("stripe/checkout — Founding 100 cutover", () => {
  it("returns 410 for planId='founding50' AFTER the promo cutover", async () => {
    // Post-cutover fast-fail — a fresh Founding 100 checkout attempted
    // after 2026-08-31 must NOT touch Stripe.
    mocks.isFoundingPromoActiveMock.mockReturnValue(false);
    mocks.getPlanMock.mockReturnValue({ id: "founding50", cadence: "once", price: 500 });
    const res = await POST(req({ plan: "founding50" }));
    expect(res.status).toBe(410);
    const body = await json(res);
    expect(String(body.reason)).toMatch(/founding 100/i);
    expect(String(body.reason)).toMatch(/2026-08-31/);
    // S31-B: the reason is shown verbatim by CreditGate — it must name the
    // live ladder (Starter A$29 / Growth A$69), never the retired A$99.
    expect(String(body.reason)).toContain("Starter (A$29/mo)");
    expect(String(body.reason)).toContain("Growth (A$69/mo)");
    expect(String(body.reason)).not.toContain("A$99");
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("allows founding50 checkout while the promo is active", async () => {
    mocks.isFoundingPromoActiveMock.mockReturnValue(true);
    mocks.getPlanMock.mockReturnValue({ id: "founding50", cadence: "once", price: 500 });
    const res = await POST(req({ plan: "founding50" }));
    expect(res.status).toBe(200);
  });

  it("410 fires BEFORE the reseller / promo DB lookup (saves a Supabase query)", async () => {
    mocks.isFoundingPromoActiveMock.mockReturnValue(false);
    mocks.getPlanMock.mockReturnValue({ id: "founding50", cadence: "once", price: 500 });
    await POST(req({ plan: "founding50", promoCode: "IFV20" }));
    expect(mocks.resolvePromoCodeMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// G18-A — legacy plan ids remap to the v2 rung (never the A$99 / A$499 prices)
// -----------------------------------------------------------------------------

describe("stripe/checkout — legacy plan ids (G18-A)", () => {
  it("remaps planId 'growth' to founder_growth and books the v2 price", async () => {
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(200);
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.line_items).toEqual([{ price: "price_growth", quantity: 1 }]);
    const md = call?.metadata as Record<string, string>;
    expect(md.blockid_plan).toBe("founder_growth");
    expect(mocks.getPlanMock).toHaveBeenCalledWith("founder_growth");
  });

  it("remaps 'growth_annual' to founder_growth billed annually when the row has an annual price", async () => {
    mocks.getPlanCachedMock.mockResolvedValue({
      id: "founder_growth",
      name: "Growth",
      segment: "founder",
      interval: "monthly",
      price_aud_cents: 6900,
      annual_price_aud_cents: 69000,
      stripe_price_id: "price_growth",
      stripe_price_id_annual: "price_growth_annual",
      trial_days: 7,
      feature_flags: [],
    });
    await POST(req({ plan: "growth_annual" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.line_items).toEqual([{ price: "price_growth_annual", quantity: 1 }]);
    const md = call?.metadata as Record<string, string>;
    expect(md.blockid_plan).toBe("founder_growth");
  });

  it("never reads STRIPE_PRICE_GROWTH_499 — the early-bird escalation is gone", async () => {
    process.env.STRIPE_PRICE_GROWTH_499 = "price_growth_499";
    try {
      await POST(req({ plan: "growth" }));
      const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
      expect(call?.line_items).toEqual([{ price: "price_growth", quantity: 1 }]);
    } finally {
      delete process.env.STRIPE_PRICE_GROWTH_499;
    }
  });
});

// -----------------------------------------------------------------------------
// Happy path — subscription
// -----------------------------------------------------------------------------

describe("stripe/checkout — subscription happy path", () => {
  it("returns 200 with the Stripe URL", async () => {
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://stripe.example/cs_test_1");
  });

  it("uses mode='subscription' for recurring plans", async () => {
    await POST(req({ plan: "founder_growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.mode).toBe("subscription");
  });

  it("stamps blockid_user_id + blockid_plan on session.metadata (webhook contract)", async () => {
    await POST(req({ plan: "founder_growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const md = call?.metadata as Record<string, string>;
    expect(md.blockid_user_id).toBe(USER.id);
    expect(md.blockid_plan).toBe("founder_growth");
    expect(md.blockid_user_hash).toBe(`h_${USER.id}`);
  });

  it("passes the founder's email as customer_email", async () => {
    await POST(req({ plan: "founder_growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.customer_email).toBe(USER.email);
  });

  it("uses buildCheckoutSuccessUrl for success_url (respects wizard origin)", async () => {
    mocks.buildCheckoutSuccessUrlMock.mockReturnValue(
      "https://x/onboarding-thankyou",
    );
    await POST(req({ plan: "founder_growth", origin: "onboarding" }));
    expect(mocks.buildCheckoutSuccessUrlMock).toHaveBeenCalledWith(
      expect.any(String),
      "founder_growth",
      "onboarding",
    );
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.success_url).toBe("https://x/onboarding-thankyou");
  });

  // 2026-09-16 pricing audit: /pricing's Annual toggle now reaches checkout
  // via Billing / onboarding (`interval: "annual"`). Honoured only when the
  // plan row carries an annual Price; otherwise monthly, never the annual
  // figure on a monthly SKU.
  describe("interval=annual", () => {
    const scout = {
      id: "investor_angel",
      name: "Scout",
      interval: "monthly",
      price_aud_cents: 7900,
      annual_price_aud_cents: 79000,
      stripe_price_id: "price_scout_m",
      stripe_price_id_annual: "price_scout_y",
      trial_days: 7,
      segment: "investor_angel",
      feature_flags: [],
    };

    it("bills the annual Price and stamps interval=annual in customer metadata", async () => {
      mocks.getPlanCachedMock.mockResolvedValue(scout);
      await POST(req({ plan: "investor_angel", interval: "annual" }));
      const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
      expect((call?.line_items as Array<{ price: string }>)[0]?.price).toBe("price_scout_y");
      expect((call?.subscription_data as { metadata?: Record<string, string> })?.metadata?.interval).toBe("annual");
    });

    it("answers interval_unavailable (400) when the row has no annual Price — never silently bills monthly (G18 review)", async () => {
      mocks.getPlanCachedMock.mockResolvedValue({ ...scout, stripe_price_id_annual: null });
      const res = await POST(req({ plan: "investor_angel", interval: "annual" }));
      expect(res.status).toBe(400);
      expect((await res.json()).error).toBe("interval_unavailable");
      expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
    });

    it("interval omitted / monthly keeps the monthly Price even when annual exists", async () => {
      mocks.getPlanCachedMock.mockResolvedValue(scout);
      await POST(req({ plan: "investor_angel" }));
      let call = mocks.stripeCreateMock.mock.calls[0]?.[0];
      expect((call?.line_items as Array<{ price: string }>)[0]?.price).toBe("price_scout_m");
      mocks.stripeCreateMock.mockClear();
      await POST(req({ plan: "investor_angel", interval: "monthly" }));
      call = mocks.stripeCreateMock.mock.calls[0]?.[0];
      expect((call?.line_items as Array<{ price: string }>)[0]?.price).toBe("price_scout_m");
    });

    it("rejects an unknown interval spelling with 400", async () => {
      mocks.getPlanCachedMock.mockResolvedValue(scout);
      const res = await POST(req({ plan: "investor_angel", interval: "yearly" }));
      expect(res.status).toBe(400);
    });
  });

  it("passes the priceId from STRIPE_PRICE_MAP", async () => {
    await POST(req({ plan: "founder_growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const items = (call?.line_items ?? []) as Array<{ price: string }>;
    expect(items[0]?.price).toBe("price_growth");
  });

  it("sets payment_method_collection='always' on recurring subs (v2 trial policy)", async () => {
    await POST(req({ plan: "founder_growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.payment_method_collection).toBe("always");
  });

  it("stamps an idempotencyKey on the session create call", async () => {
    await POST(req({ plan: "founder_growth" }));
    const opts = mocks.stripeCreateMock.mock.calls[0]?.[1];
    expect(opts?.idempotencyKey).toBe("idem_1");
  });

  it("appends a stripe.checkout.create audit-log entry on success", async () => {
    await POST(req({ plan: "founder_growth" }));
    expect(mocks.logUserActionMock).toHaveBeenCalledTimes(1);
    const entry = mocks.logUserActionMock.mock.calls[0]?.[0];
    expect(entry?.action).toBe("stripe.checkout.create");
    expect(entry?.userId).toBe(USER.id);
  });
});

// -----------------------------------------------------------------------------
// Startup Package (founder_package) one-off
// -----------------------------------------------------------------------------

describe("stripe/checkout — Startup Package one-off", () => {
  it("synthesises a plan for founder_package (not in LEGACY_PLANS)", async () => {
    // getPlan returns undefined for founder_package — the route must still
    // route it through the one-off checkout because plans.csv carries it.
    mocks.getPlanMock.mockReturnValue(undefined);
    const res = await POST(req({ plan: "founder_package" }));
    expect(res.status).toBe(200);
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.mode).toBe("payment");
  });

  it("stamps metadata.plan='founder_package' on the session", async () => {
    mocks.getPlanMock.mockReturnValue(undefined);
    await POST(req({ plan: "founder_package" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const md = call?.metadata as Record<string, string>;
    expect(md.plan).toBe("founder_package");
  });

  it("stamps metadata.project_id when a project_id is supplied", async () => {
    mocks.getPlanMock.mockReturnValue(undefined);
    await POST(req({ plan: "founder_package", projectId: "proj-xyz" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const md = call?.metadata as Record<string, string>;
    expect(md.project_id).toBe("proj-xyz");
  });

  it("uses a startup-package idempotency key (distinct family from checkout)", async () => {
    mocks.getPlanMock.mockReturnValue(undefined);
    mocks.sessionIdempotencyKeyMock.mockReturnValue("idem_pkg_1");
    await POST(req({ plan: "founder_package" }));
    expect(mocks.sessionIdempotencyKeyMock).toHaveBeenCalledWith(
      "startup-package",
      expect.any(Array),
    );
  });
});

// -----------------------------------------------------------------------------
// G21 P0-C — Cohort Validation Pilot (cohort_pilot_25 / _50) one-off
// -----------------------------------------------------------------------------

describe("stripe/checkout — Cohort Validation Pilot one-off (G21 P0-C)", () => {
  afterEach(() => {
    delete mocks.STRIPE_PRICE_MAP_FIXTURE.cohort_pilot_25;
    delete mocks.STRIPE_PRICE_MAP_FIXTURE.cohort_pilot_50;
  });

  it("409 sku_unconfigured + the contact fallback when the price id is unset — Stripe never called", async () => {
    mocks.getPlanMock.mockReturnValue(undefined);
    const res = await POST(req({ plan: "cohort_pilot_25" }));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(body.error).toBe("sku_unconfigured");
    expect(body.fallback).toBe("/contact?topic=pilot");
    expect(body.planId).toBe("cohort_pilot_25");
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
    expect(mocks.getPlanCachedMock).not.toHaveBeenCalled();
  });

  it("requires a signed-in user (401 before anything else)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ plan: "cohort_pilot_25" }));
    expect(res.status).toBe(401);
  });

  it("mode=payment, sku metadata, success → /workspace/accelerator?pilot=paid, cancel → /solutions/accelerator#pilot", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.cohort_pilot_25 = "price_pilot_25";
    mocks.getPlanMock.mockReturnValue(undefined);
    const res = await POST(req({ plan: "cohort_pilot_25", projectId: "proj-1" }));
    expect(res.status).toBe(200);
    expect((await json(res)).url).toBe("https://stripe.example/cs_test_1");
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.mode).toBe("payment");
    expect(call.line_items).toEqual([{ price: "price_pilot_25", quantity: 1 }]);
    // The Stripe session id rides along so the workspace banner shows "payment
    // received" only on a real return (review P2, 2026-09-20).
    expect(call.success_url).toMatch(/\/workspace\/accelerator\?pilot=paid&session_id=\{CHECKOUT_SESSION_ID\}$/);
    expect(call.cancel_url).toMatch(/\/solutions\/accelerator#pilot$/);
    const md = call.metadata as Record<string, string>;
    expect(md.kind).toBe("cohort_pilot");
    expect(md.sku).toBe("cohort_pilot_25");
    expect(md.applicants_cap).toBe("25");
    // project_id is never carried: the button does not send one and ownership is not verified.
    expect(md.project_id).toBeUndefined();
    expect(md.blockid_user_id).toBe(USER.id);
    expect(md.blockid_plan).toBe("cohort_pilot_25");
    // One-off: no subscription block, invoice creation on, payment-only.
    expect(call.subscription_data).toBeUndefined();
    expect((call.invoice_creation as { enabled: boolean }).enabled).toBe(true);
  });

  it("the 50-applicant size books its own price and cap; idempotency family is cohort-pilot", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.cohort_pilot_50 = "price_pilot_50";
    mocks.getPlanMock.mockReturnValue(undefined);
    const res = await POST(req({ plan: "cohort_pilot_50" }));
    expect(res.status).toBe(200);
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(call.line_items).toEqual([{ price: "price_pilot_50", quantity: 1 }]);
    expect((call.metadata as Record<string, string>).applicants_cap).toBe("50");
    expect(mocks.sessionIdempotencyKeyMock).toHaveBeenCalledWith("cohort-pilot", [USER.id, "cohort_pilot_50", "price_pilot_50", null, null]);
  });
});

// -----------------------------------------------------------------------------
// Promo code (unknown / expired) — 400
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// G23-B — pilot → annual Cohort plan (convert_from_pilot)
// -----------------------------------------------------------------------------

describe("stripe/checkout — pilot conversion (G23-B)", () => {
  const ORDER_ID = "22222222-2222-4222-8222-222222222222";
  const cohort25 = {
    id: "accelerator_starter",
    name: "Cohort 25",
    interval: "monthly",
    price_aud_cents: 50000,
    annual_price_aud_cents: 500000,
    stripe_price_id: "price_c25_m",
    stripe_price_id_annual: "price_c25_y",
    trial_days: 14,
    segment: "accelerator",
    feature_flags: [],
  };
  const order = (over: Record<string, unknown> = {}) => ({
    id: ORDER_ID,
    user_id: USER.id,
    project_id: null,
    buyer_email: USER.email,
    sku: "cohort_pilot_25",
    applicants_cap: 25,
    amount_cents: 150000,
    currency: "aud",
    stripe_session_id: "cs_pilot",
    stripe_payment_intent: null,
    status: "paid",
    entitlement_until: new Date(Date.now() + 30 * 86_400_000).toISOString(),
    metrics: {},
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-01T00:00:00Z",
    ...over,
  });
  const body = (over: Record<string, unknown> = {}) => ({ plan: "accelerator_starter", interval: "annual", convert_from_pilot: ORDER_ID, ...over });

  beforeEach(() => {
    mocks.getPlanCachedMock.mockResolvedValue(cohort25);
    findPilotOrderByIdMock.mockReset().mockResolvedValue(order());
    process.env.STRIPE_COUPON_PILOT_CREDIT_25 = "coupon_pilot25_TEST";
  });
  afterEach(() => {
    delete process.env.STRIPE_COUPON_PILOT_CREDIT_25;
  });

  it("applies the founder-minted coupon (read by env NAME), stamps pilot_order_id on the subscription + session metadata, bills the annual Price", async () => {
    const res = await POST(req(body()));
    expect(res.status).toBe(200);
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.mode).toBe("subscription");
    expect((call?.line_items as Array<{ price: string }>)[0]?.price).toBe("price_c25_y");
    expect(call?.discounts).toEqual([{ coupon: "coupon_pilot25_TEST" }]);
    expect(call?.allow_promotion_codes).toBeUndefined();
    expect((call?.subscription_data as { metadata?: Record<string, string> })?.metadata).toMatchObject({ pilot_order_id: ORDER_ID, pilot_sku: "cohort_pilot_25", plan_id: "accelerator_starter", interval: "annual" });
    expect(call?.metadata).toMatchObject({ pilot_order_id: ORDER_ID, kind: "pilot_conversion" });
    expect(String(call?.success_url)).toContain("/workspace/accelerator/pilot?converted=1");
    expect(mocks.sessionIdempotencyKeyMock).toHaveBeenCalledWith("pilot-conversion", [USER.id, "accelerator_starter", "price_c25_y", ORDER_ID]);
    expect(mocks.logUserActionMock).toHaveBeenCalledWith(expect.objectContaining({ fields: expect.objectContaining({ pilot_order_id: ORDER_ID, pilot_conversion: true }) }));
    // The coupon value never reaches the client.
    expect(JSON.stringify(await json(res))).not.toContain("coupon_pilot25_TEST");
  });

  it("409 coupon_unconfigured + the contact fallback when the env NAME is unset — Stripe never called", async () => {
    delete process.env.STRIPE_COUPON_PILOT_CREDIT_25;
    const res = await POST(req(body()));
    expect(res.status).toBe(409);
    const j = await json(res);
    expect(j.error).toBe("coupon_unconfigured");
    expect(j.fallback).toBe("/contact?topic=pilot");
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("403 when the caller is not the order owner; 404 unknown order; 400 malformed id", async () => {
    findPilotOrderByIdMock.mockResolvedValue(order({ user_id: "someone-else" }));
    expect((await POST(req(body()))).status).toBe(403);
    findPilotOrderByIdMock.mockResolvedValue(null);
    expect((await POST(req(body()))).status).toBe(404);
    expect((await POST(req(body({ convert_from_pilot: "nope" })))).status).toBe(400);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("409 conversion_window_closed outside 60 days of entitlement_until; 409 already_converted; 409 when the rung does not match the SKU; 400 when not annual", async () => {
    findPilotOrderByIdMock.mockResolvedValue(order({ entitlement_until: new Date(Date.now() - 61 * 86_400_000).toISOString() }));
    let res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("conversion_window_closed");

    findPilotOrderByIdMock.mockResolvedValue(order({ converted_at: "2026-09-10T00:00:00Z" }));
    res = await POST(req(body()));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("already_converted");

    // A 25 pilot converts to Cohort 25, never Cohort 100.
    mocks.getPlanCachedMock.mockResolvedValue({ ...cohort25, id: "accelerator_growth", name: "Cohort 100", stripe_price_id_annual: "price_c100_y" });
    res = await POST(req(body({ plan: "accelerator_growth" })));
    expect(res.status).toBe(409);
    expect((await json(res)).error).toBe("conversion_plan_mismatch");

    mocks.getPlanCachedMock.mockResolvedValue(cohort25);
    res = await POST(req(body({ interval: "monthly" })));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("conversion_plan_mismatch");
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("a plain Cohort 25 annual checkout without convert_from_pilot never reads the order and never applies the coupon", async () => {
    await POST(req({ plan: "accelerator_starter", interval: "annual" }));
    expect(findPilotOrderByIdMock).not.toHaveBeenCalled();
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.discounts).toBeUndefined();
    expect(call?.allow_promotion_codes).toBe(true);
  });
});

describe("stripe/checkout — promo code", () => {
  it("returns 400 for an unknown/expired promoCode", async () => {
    mocks.resolvePromoCodeMock.mockResolvedValue(null);
    const res = await POST(req({ plan: "founder_growth", promoCode: "TYPO99" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.reason)).toMatch(/unknown or expired promotion code/i);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Stripe error handling
// -----------------------------------------------------------------------------

describe("stripe/checkout — error handling", () => {
  it("returns 500 with a generic reason when Stripe throws", async () => {
    mocks.stripeCreateMock.mockRejectedValue(new Error("network blip"));
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("Failed to create checkout session");
  });

  it("does not leak the raw Stripe error to the client on 500", async () => {
    mocks.stripeCreateMock.mockRejectedValue(
      new Error("sk_live_ABC123 unauthorised"),
    );
    const res = await POST(req({ plan: "founder_growth" }));
    const body = await json(res);
    expect(String(body.reason)).not.toContain("sk_live");
    expect(String(body.reason)).not.toContain("ABC123");
  });
});

// -----------------------------------------------------------------------------
// Gate precedence
// -----------------------------------------------------------------------------

describe("stripe/checkout — gate precedence", () => {
  it("auth (401) fires BEFORE config (503)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(401);
  });

  it("config (503) fires BEFORE body parse (400)", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(503);
  });

  it("founding cutover (410) fires BEFORE promoCode (400)", async () => {
    // The cutover check runs BEFORE the promo lookup — both would ship 4xx,
    // but the cutover message is more actionable to the founder.
    mocks.isFoundingPromoActiveMock.mockReturnValue(false);
    mocks.getPlanMock.mockReturnValue({ id: "founding50", cadence: "once", price: 500 });
    const res = await POST(req({ plan: "founding50", promoCode: "TYPO" }));
    expect(res.status).toBe(410);
  });
});

describe("QA-3 P1-10 — per-user rate limit on /api/stripe/checkout", () => {
  it("calls enforceRateLimit('stripe-checkout', user.id, request, 10, 15 min) after auth", async () => {
    await POST(req({ plan: "founder_growth" }));
    expect(enforceRateLimitMock).toHaveBeenCalledWith("stripe-checkout", USER.id, expect.any(Request), 10, 15 * 60 * 1000);
  });

  it("returns the limiter's 429 and never reaches Stripe", async () => {
    enforceRateLimitMock.mockReturnValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "60" } }));
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(429);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("does not consult the limiter for an unauthenticated caller (401 first)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(req({ plan: "founder_growth" }));
    expect(res.status).toBe(401);
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
  });
});
