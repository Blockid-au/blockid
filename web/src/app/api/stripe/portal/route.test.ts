// Colocated vitest for POST /api/stripe/portal — P9-stripe-portal-route-test.
//
// This route mints a Stripe Customer Portal session so a founder can update
// their payment method, download invoices, and cancel. It is the ONLY place
// where a wholesale-provisioned founder must be refused: the reseller shares
// the same Stripe Customer, so opening the portal would let the founder
// modify or cancel OTHER attributed subscriptions (D3-CISO-06). Every gate
// below is either "must fire" (401 no user, 403 wholesale, 404 no customer,
// 503 unconfigured) or "must not skip" (D3-CISO-06 wholesale check MUST run
// BEFORE the Stripe API call).
//
// Regressions this suite is designed to catch:
//   - reordering isWholesaleProvisionedFounder() to fire AFTER the Stripe
//     call would leak a portal session URL to a wholesale founder;
//   - collapsing the 503 (unconfigured) branch into 500 would break
//     preview branches without Stripe keys;
//   - dropping the return_url from the create() call would land the founder
//     on Stripe's default post-portal page instead of /workspace/billing;
//   - regressing the try/catch to `await` without try would leak a raw
//     Stripe error to the client on transient outages.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  isStripeConfiguredMock: vi.fn<() => boolean>(),
  isSupabaseConfiguredMock: vi.fn<() => boolean>(),
  getStripeMock: vi.fn<() => unknown | null>(),
  getSupabaseAdminMock: vi.fn<() => unknown | null>(),
  isWholesaleProvisionedFounderMock: vi.fn<(userId: string) => Promise<boolean>>(),
  decidePortalAccessMock: vi.fn<
    (input: { hasActiveWholesaleProvisionedAttribution: boolean }) => {
      ok: boolean;
      reason?: string;
    }
  >(),
  stripeCreateSessionMock: vi.fn<
    (args: { customer: string; return_url: string }) => Promise<{ url: string }>
  >(),
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripeMock(),
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => mocks.getSupabaseAdminMock(),
  isSupabaseConfigured: () => mocks.isSupabaseConfiguredMock(),
}));

vi.mock("@/lib/stripe/portal-gate", () => ({
  isWholesaleProvisionedFounder: (id: string) =>
    mocks.isWholesaleProvisionedFounderMock(id),
  decidePortalAccess: (input: { hasActiveWholesaleProvisionedAttribution: boolean }) =>
    mocks.decidePortalAccessMock(input),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

// --- Fake Stripe + Supabase --------------------------------------------------

interface FakeState {
  customerRow: { stripe_customer_id?: string | null } | null;
  fromCalls: string[];
  selectCalls: string[];
  eqCalls: Array<[string, unknown]>;
}

const state: FakeState = {
  customerRow: { stripe_customer_id: "cus_test_abc" },
  fromCalls: [],
  selectCalls: [],
  eqCalls: [],
};

function makeChain() {
  const api: Record<string, unknown> = {};
  api.select = (cols: string) => {
    state.selectCalls.push(cols);
    return api;
  };
  api.eq = (col: string, val: unknown) => {
    state.eqCalls.push([col, val]);
    return api;
  };
  api.maybeSingle = () => Promise.resolve({ data: state.customerRow, error: null });
  return api;
}

function fakeSupabase() {
  return {
    from(table: string) {
      state.fromCalls.push(table);
      return makeChain();
    },
  };
}

function fakeStripe() {
  return {
    billingPortal: {
      sessions: {
        create: (args: { customer: string; return_url: string }) =>
          mocks.stripeCreateSessionMock(args),
      },
    },
  };
}

const USER: AppUser = { id: "user-42", email: "founder@example.com" };

beforeEach(() => {
  state.customerRow = { stripe_customer_id: "cus_test_abc" };
  state.fromCalls = [];
  state.selectCalls = [];
  state.eqCalls = [];

  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.isSupabaseConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.getSupabaseAdminMock.mockReset().mockReturnValue(fakeSupabase());
  mocks.isWholesaleProvisionedFounderMock.mockReset().mockResolvedValue(false);
  mocks.decidePortalAccessMock.mockReset().mockReturnValue({ ok: true });
  mocks.stripeCreateSessionMock
    .mockReset()
    .mockResolvedValue({ url: "https://stripe.example/portal/sess_1" });
});

afterEach(() => {
  vi.clearAllMocks();
});

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — module invariants", () => {
  it("exports dynamic='force-dynamic' so portal URLs are never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Auth gate (401)
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — auth gate", () => {
  it("returns 401 when no user session", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST();
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("does not call Stripe when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST();
    expect(mocks.stripeCreateSessionMock).not.toHaveBeenCalled();
  });

  it("does not check wholesale attribution when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST();
    expect(mocks.isWholesaleProvisionedFounderMock).not.toHaveBeenCalled();
  });

  it("does not query Supabase when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST();
    expect(state.fromCalls).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Configuration gate (503)
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — configuration gate", () => {
  it("returns 503 when Stripe is not configured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Payments not configured" });
  });

  it("returns 503 when Supabase is not configured", async () => {
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.reason).toBe("Payments not configured");
  });

  it("returns 503 when both Stripe and Supabase are unconfigured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    mocks.isSupabaseConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(503);
  });

  it("does not call Stripe when configuration gate trips", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    await POST();
    expect(mocks.stripeCreateSessionMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// D3-CISO-06 wholesale gate (403) — MUST run before Stripe API call
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — D3-CISO-06 wholesale gate", () => {
  it("returns 403 with the decidePortalAccess reason when wholesale-provisioned", async () => {
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    mocks.decidePortalAccessMock.mockReturnValue({
      ok: false,
      reason: "wholesale_provisioned",
    });
    const res = await POST();
    expect(res.status).toBe(403);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "wholesale_provisioned" });
  });

  it("MUST NOT call Stripe when the wholesale gate refuses", async () => {
    // The whole point of the D3-CISO-06 gate — never mint a portal URL for a
    // wholesale-provisioned founder because the URL exposes the reseller's
    // Stripe Customer object to a founder who does not own it.
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    mocks.decidePortalAccessMock.mockReturnValue({
      ok: false,
      reason: "wholesale_provisioned",
    });
    await POST();
    expect(mocks.stripeCreateSessionMock).not.toHaveBeenCalled();
  });

  it("MUST NOT query Supabase for stripe_customer_id when the wholesale gate refuses", async () => {
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    mocks.decidePortalAccessMock.mockReturnValue({
      ok: false,
      reason: "wholesale_provisioned",
    });
    await POST();
    expect(state.fromCalls).not.toContain("app_users");
  });

  it("passes the authenticated user's id to isWholesaleProvisionedFounder", async () => {
    await POST();
    expect(mocks.isWholesaleProvisionedFounderMock).toHaveBeenCalledWith(USER.id);
  });

  it("passes the wholesale flag verbatim into decidePortalAccess", async () => {
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    await POST();
    expect(mocks.decidePortalAccessMock).toHaveBeenCalledWith({
      hasActiveWholesaleProvisionedAttribution: true,
    });
  });

  it("also passes false through to decidePortalAccess (not truthy-collapsed)", async () => {
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(false);
    await POST();
    expect(mocks.decidePortalAccessMock).toHaveBeenCalledWith({
      hasActiveWholesaleProvisionedAttribution: false,
    });
  });
});

// -----------------------------------------------------------------------------
// No-customer branch (404)
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — no-customer branch", () => {
  it("returns 404 when the user row has no stripe_customer_id", async () => {
    state.customerRow = { stripe_customer_id: null };
    const res = await POST();
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "No active subscription found" });
  });

  it("returns 404 when the user row is missing entirely", async () => {
    state.customerRow = null;
    const res = await POST();
    expect(res.status).toBe(404);
    const body = await json(res);
    expect(body.reason).toBe("No active subscription found");
  });

  it("returns 404 when stripe_customer_id is empty string", async () => {
    state.customerRow = { stripe_customer_id: "" };
    const res = await POST();
    expect(res.status).toBe(404);
  });

  it("does not call Stripe when there is no customer id", async () => {
    state.customerRow = { stripe_customer_id: null };
    await POST();
    expect(mocks.stripeCreateSessionMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// DB lookup shape
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — DB lookup shape", () => {
  it("queries app_users for stripe_customer_id keyed by user.id", async () => {
    await POST();
    expect(state.fromCalls).toContain("app_users");
    expect(state.selectCalls).toContain("stripe_customer_id");
    expect(state.eqCalls).toContainEqual(["id", USER.id]);
  });
});

// -----------------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — happy path", () => {
  it("returns 200 with the Stripe portal URL", async () => {
    const res = await POST();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      url: "https://stripe.example/portal/sess_1",
    });
  });

  it("passes the resolved customer id verbatim to billingPortal.sessions.create", async () => {
    state.customerRow = { stripe_customer_id: "cus_specific_xyz" };
    await POST();
    const call = mocks.stripeCreateSessionMock.mock.calls[0]?.[0];
    expect(call?.customer).toBe("cus_specific_xyz");
  });

  it("uses NEXT_PUBLIC_SITE_URL for the return_url when set", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au";
    try {
      await POST();
      const call = mocks.stripeCreateSessionMock.mock.calls[0]?.[0];
      expect(call?.return_url).toBe("https://staging.blockid.au/workspace/billing");
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it("falls back to https://blockid.au when NEXT_PUBLIC_SITE_URL is unset", async () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    try {
      await POST();
      const call = mocks.stripeCreateSessionMock.mock.calls[0]?.[0];
      expect(call?.return_url).toBe("https://blockid.au/workspace/billing");
    } finally {
      if (prev !== undefined) process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  it("return_url always lands on /workspace/billing (not the marketing homepage)", async () => {
    await POST();
    const call = mocks.stripeCreateSessionMock.mock.calls[0]?.[0];
    expect(call?.return_url).toMatch(/\/workspace\/billing$/);
  });

  it("returns application/json content-type on the happy path", async () => {
    const res = await POST();
    expect((res.headers.get("Content-Type") ?? "").toLowerCase()).toContain(
      "application/json",
    );
  });
});

// -----------------------------------------------------------------------------
// Stripe error handling (500)
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — Stripe error handling", () => {
  it("returns 500 with a generic reason when Stripe throws", async () => {
    mocks.stripeCreateSessionMock.mockRejectedValue(new Error("network blip"));
    const res = await POST();
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body).toEqual({
      ok: false,
      reason: "Failed to create portal session",
    });
  });

  it("does not leak the raw Stripe error message to the client", async () => {
    mocks.stripeCreateSessionMock.mockRejectedValue(
      new Error("cus_test_abc invalid: no such customer"),
    );
    const res = await POST();
    const body = await json(res);
    expect(String(body.reason)).not.toContain("cus_test_abc");
    expect(String(body.reason)).not.toContain("no such customer");
  });

  it("swallows both sync and async Stripe failures uniformly", async () => {
    mocks.stripeCreateSessionMock.mockImplementation(() => {
      throw new Error("sync boom");
    });
    const res = await POST();
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// Gate precedence — auth > config > wholesale > customer > stripe
// -----------------------------------------------------------------------------

describe("POST /api/stripe/portal — gate precedence", () => {
  it("auth (401) fires before configuration (503)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("configuration (503) fires before wholesale gate (403)", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    const res = await POST();
    expect(res.status).toBe(503);
    expect(mocks.isWholesaleProvisionedFounderMock).not.toHaveBeenCalled();
  });

  it("wholesale gate (403) fires before the customer lookup (404)", async () => {
    mocks.isWholesaleProvisionedFounderMock.mockResolvedValue(true);
    mocks.decidePortalAccessMock.mockReturnValue({
      ok: false,
      reason: "wholesale_provisioned",
    });
    state.customerRow = null; // would 404 if we ever reached the DB
    const res = await POST();
    expect(res.status).toBe(403);
    expect(state.fromCalls).not.toContain("app_users");
  });

  it("customer lookup (404) fires before the Stripe API call (200 or 500)", async () => {
    state.customerRow = { stripe_customer_id: null };
    mocks.stripeCreateSessionMock.mockRejectedValue(new Error("would be 500"));
    const res = await POST();
    expect(res.status).toBe(404);
    expect(mocks.stripeCreateSessionMock).not.toHaveBeenCalled();
  });
});
