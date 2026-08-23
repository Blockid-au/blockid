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
  isGrowthEarlyBirdMock: vi.fn<() => boolean>(),
  isFoundingPromoActiveMock: vi.fn<() => boolean>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  getPlanCachedMock: vi.fn<(slug: string) => Promise<{
    trial_days?: number;
    segment?: string | null;
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
    growth: "price_growth",
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
  isGrowthEarlyBird: () => mocks.isGrowthEarlyBirdMock(),
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
  // Empty cookie store (no blockid_via) → reseller path skipped.
  mocks.cookiesMock.mockReset().mockResolvedValue({ get: () => undefined });
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.stripeCreateMock.mockReset().mockResolvedValue({
    id: "cs_test_1",
    url: "https://stripe.example/cs_test_1",
  });
  mocks.getPlanMock.mockReset().mockReturnValue({
    id: "growth",
    cadence: "monthly",
    price: 9900,
  });
  mocks.isGrowthEarlyBirdMock.mockReset().mockReturnValue(true);
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
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("Authentication required");
  });

  it("MUST NOT call Stripe when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(req({ plan: "growth" }));
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Config gate (503)
// -----------------------------------------------------------------------------

describe("stripe/checkout — config gate", () => {
  it("returns 503 when Stripe is unconfigured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ plan: "growth" }));
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
// Happy path — subscription
// -----------------------------------------------------------------------------

describe("stripe/checkout — subscription happy path", () => {
  it("returns 200 with the Stripe URL", async () => {
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://stripe.example/cs_test_1");
  });

  it("uses mode='subscription' for recurring plans", async () => {
    await POST(req({ plan: "growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.mode).toBe("subscription");
  });

  it("stamps blockid_user_id + blockid_plan on session.metadata (webhook contract)", async () => {
    await POST(req({ plan: "growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const md = call?.metadata as Record<string, string>;
    expect(md.blockid_user_id).toBe(USER.id);
    expect(md.blockid_plan).toBe("growth");
    expect(md.blockid_user_hash).toBe(`h_${USER.id}`);
  });

  it("passes the founder's email as customer_email", async () => {
    await POST(req({ plan: "growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.customer_email).toBe(USER.email);
  });

  it("uses buildCheckoutSuccessUrl for success_url (respects wizard origin)", async () => {
    mocks.buildCheckoutSuccessUrlMock.mockReturnValue(
      "https://x/onboarding-thankyou",
    );
    await POST(req({ plan: "growth", origin: "onboarding" }));
    expect(mocks.buildCheckoutSuccessUrlMock).toHaveBeenCalledWith(
      expect.any(String),
      "growth",
      "onboarding",
    );
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.success_url).toBe("https://x/onboarding-thankyou");
  });

  it("passes the priceId from STRIPE_PRICE_MAP", async () => {
    await POST(req({ plan: "growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const items = (call?.line_items ?? []) as Array<{ price: string }>;
    expect(items[0]?.price).toBe("price_growth");
  });

  it("sets payment_method_collection='always' on recurring subs (v2 trial policy)", async () => {
    await POST(req({ plan: "growth" }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.payment_method_collection).toBe("always");
  });

  it("stamps an idempotencyKey on the session create call", async () => {
    await POST(req({ plan: "growth" }));
    const opts = mocks.stripeCreateMock.mock.calls[0]?.[1];
    expect(opts?.idempotencyKey).toBe("idem_1");
  });

  it("appends a stripe.checkout.create audit-log entry on success", async () => {
    await POST(req({ plan: "growth" }));
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
// Promo code (unknown / expired) — 400
// -----------------------------------------------------------------------------

describe("stripe/checkout — promo code", () => {
  it("returns 400 for an unknown/expired promoCode", async () => {
    mocks.resolvePromoCodeMock.mockResolvedValue(null);
    const res = await POST(req({ plan: "growth", promoCode: "TYPO99" }));
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
    const res = await POST(req({ plan: "growth" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("Failed to create checkout session");
  });

  it("does not leak the raw Stripe error to the client on 500", async () => {
    mocks.stripeCreateMock.mockRejectedValue(
      new Error("sk_live_ABC123 unauthorised"),
    );
    const res = await POST(req({ plan: "growth" }));
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
    const res = await POST(req({ plan: "growth" }));
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
