// Colocated vitest for POST /api/svi-api/checkout — P9-svi-api-checkout-route-test.
//
// The SVI-API paid-tier checkout entry point (T_SVI_EXC_0014) — swaps a
// { tier: "team" | "institutional" } body into a Stripe Checkout Session
// keyed by the STRIPE_PRICE_MAP entries `svi_api_team` / `svi_api_institutional`.
//
// Regressions here can either (a) 503 the entire SVI-API paid tier surface
// (missing tier gate 400 vs missing price 503 vs Stripe-not-configured 503 —
// each is a distinct ops signal) or (b) create duplicate Stripe subscriptions
// on a double-click if the idempotencyKey is dropped. Every branch here is
// pinned so a subtle rewrite (e.g. dropping the TIER_MAP guard, letting the
// origin header slip into the customer_email field, forgetting to stamp
// metadata.userId on the subscription_data mirror the webhook depends on)
// surfaces at unit-test time.
//
// Scope: auth 401, invalid_json/bad-body → 400 (tier missing / tier unknown),
// stripe not configured → 503, price env missing → 503, happy path payload
// shape (mode/line_items/customer_email/success_url/cancel_url/metadata/
// subscription_data.metadata), idempotencyKey wiring, and origin header
// fallback to https://blockid.au.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  plan: string | null;
  role: string;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getStripeMock: vi.fn<() => unknown | null>(),
  stripeCreateMock: vi.fn<(
    params: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ id: string; url: string }>>(),
  sessionIdempotencyKeyMock: vi.fn<(scope: string, parts: unknown[]) => string>(),
  STRIPE_PRICE_MAP_FIXTURE: {
    svi_api_team: "price_team_1",
    svi_api_institutional: "price_inst_1",
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripeMock(),
  STRIPE_PRICE_MAP: mocks.STRIPE_PRICE_MAP_FIXTURE,
}));

vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: (scope: string, parts: unknown[]) =>
    mocks.sessionIdempotencyKeyMock(scope, parts),
}));

import { POST, dynamic } from "./route";
import type { NextRequest } from "next/server";

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

function req(
  body: unknown,
  opts?: { badJson?: boolean; origin?: string | null },
): NextRequest {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.origin !== undefined && opts.origin !== null) {
    headers.origin = opts.origin;
  }
  return new Request("http://x/api/svi-api/checkout", {
    method: "POST",
    headers,
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  }) as unknown as NextRequest;
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.stripeCreateMock.mockReset().mockResolvedValue({
    id: "cs_test_1",
    url: "https://stripe.example/cs_test_1",
  });
  mocks.sessionIdempotencyKeyMock.mockReset().mockReturnValue("idem_svi_api_1");
  mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_team = "price_team_1";
  mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_institutional = "price_inst_1";
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("route module exports", () => {
  it("marks route dynamic so Next never prerenders the checkout POST", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("auth gate", () => {
  it("returns 401 when getCurrentUser resolves null and never touches Stripe", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(401);
    expect(await json(res)).toEqual({ ok: false, error: "Sign in required" });
    expect(mocks.getStripeMock).not.toHaveBeenCalled();
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
    expect(mocks.sessionIdempotencyKeyMock).not.toHaveBeenCalled();
  });

  it("401 message is a stable string — a wording drift breaks the sign-in modal copy", async () => {
    mocks.getCurrentUserMock.mockResolvedValueOnce(null);
    const res = await POST(req({ tier: "team" }));
    const body = await json(res);
    expect(body.error).toBe("Sign in required");
  });
});

describe("body + tier validation", () => {
  it("swallows invalid JSON body and falls through to the missing-tier 400 branch (never 500)", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    expect(await json(res)).toEqual({
      ok: false,
      error: "tier must be team or institutional",
    });
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("400 when body has no tier field", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("tier must be team or institutional");
  });

  it("400 when tier is an unknown string (e.g. 'enterprise') — TIER_MAP guard fires", async () => {
    const res = await POST(req({ tier: "enterprise" }));
    expect(res.status).toBe(400);
    expect((await json(res)).error).toBe("tier must be team or institutional");
    expect(mocks.getStripeMock).not.toHaveBeenCalled();
  });

  it("400 when tier is 'TEAM' — TIER_MAP lookup is case-sensitive", async () => {
    const res = await POST(req({ tier: "TEAM" }));
    expect(res.status).toBe(400);
  });

  it("400 when tier is a non-string type (number)", async () => {
    const res = await POST(req({ tier: 1 }));
    expect(res.status).toBe(400);
  });

  it("accepts 'team' — the first canonical tier", async () => {
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(200);
  });

  it("accepts 'institutional' — the second canonical tier", async () => {
    const res = await POST(req({ tier: "institutional" }));
    expect(res.status).toBe(200);
  });
});

describe("stripe-not-configured 503 gate", () => {
  it("returns 503 with 'Billing not configured' when getStripe returns null", async () => {
    mocks.getStripeMock.mockReturnValueOnce(null);
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({ ok: false, error: "Billing not configured" });
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
    expect(mocks.sessionIdempotencyKeyMock).not.toHaveBeenCalled();
  });
});

describe("missing-price 503 gate", () => {
  it("returns 503 when svi_api_team price is undefined (env not provisioned)", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_team = undefined;
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(503);
    expect(await json(res)).toEqual({
      ok: false,
      error: "Stripe price for team not configured",
    });
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("returns 503 when svi_api_institutional price is undefined", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_institutional = undefined;
    const res = await POST(req({ tier: "institutional" }));
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe(
      "Stripe price for institutional not configured",
    );
  });

  it("missing-price error message echoes the tier back to the founder (ops signal)", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_team = undefined;
    const res = await POST(req({ tier: "team" }));
    expect((await json(res)).error).toContain("team");
  });

  it("empty-string price is treated as missing (same 503) — env drift guard", async () => {
    mocks.STRIPE_PRICE_MAP_FIXTURE.svi_api_team = "";
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(503);
    expect((await json(res)).error).toBe("Stripe price for team not configured");
  });
});

describe("happy path — Stripe session payload shape", () => {
  it("returns 200 { ok: true, url } echoing the created session url", async () => {
    const res = await POST(req({ tier: "team" }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({
      ok: true,
      url: "https://stripe.example/cs_test_1",
    });
  });

  it("stripe.checkout.sessions.create is called exactly once", async () => {
    await POST(req({ tier: "team" }));
    expect(mocks.stripeCreateMock).toHaveBeenCalledTimes(1);
  });

  it("mode is 'subscription' — recurring, not one-off", async () => {
    await POST(req({ tier: "team" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.mode).toBe("subscription");
  });

  it("line_items forwards the resolved price id with quantity 1", async () => {
    await POST(req({ tier: "team" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.line_items).toEqual([{ price: "price_team_1", quantity: 1 }]);
  });

  it("institutional tier resolves to the svi_api_institutional price", async () => {
    await POST(req({ tier: "institutional" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.line_items).toEqual([{ price: "price_inst_1", quantity: 1 }]);
  });

  it("customer_email is stamped from the signed-in user (never trusts the body)", async () => {
    await POST(req({ tier: "team", customer_email: "attacker@example.com" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.customer_email).toBe(USER.email);
  });

  it("session metadata carries { userId, sviApiTier } — webhook contract", async () => {
    await POST(req({ tier: "team" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.metadata).toEqual({ userId: USER.id, sviApiTier: "team" });
  });

  it("subscription_data.metadata mirrors { userId, sviApiTier } so the subscription itself is traceable", async () => {
    await POST(req({ tier: "institutional" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.subscription_data).toEqual({
      metadata: { userId: USER.id, sviApiTier: "institutional" },
    });
  });
});

describe("success_url + cancel_url + origin header", () => {
  it("success_url uses request origin + {CHECKOUT_SESSION_ID} placeholder + tier query", async () => {
    await POST(req({ tier: "team" }, { origin: "https://blockid.au" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.success_url).toBe(
      "https://blockid.au/workspace/svi-api?session_id={CHECKOUT_SESSION_ID}&tier=team",
    );
  });

  it("cancel_url routes back to /workspace/svi-api (no query)", async () => {
    await POST(req({ tier: "institutional" }, { origin: "https://blockid.au" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.cancel_url).toBe("https://blockid.au/workspace/svi-api");
  });

  it("origin header from a custom preview host propagates into both URLs", async () => {
    await POST(req({ tier: "team" }, { origin: "https://preview.blockid.au" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.success_url).toContain("https://preview.blockid.au/workspace/svi-api?");
    expect(params.cancel_url).toBe("https://preview.blockid.au/workspace/svi-api");
  });

  it("missing origin header falls back to https://blockid.au (production default)", async () => {
    await POST(req({ tier: "team" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.success_url).toBe(
      "https://blockid.au/workspace/svi-api?session_id={CHECKOUT_SESSION_ID}&tier=team",
    );
    expect(params.cancel_url).toBe("https://blockid.au/workspace/svi-api");
  });

  it("tier appears verbatim in success_url — a founder returning to /workspace/svi-api sees which tier they bought", async () => {
    await POST(req({ tier: "institutional" }));
    const [params] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(params.success_url).toContain("&tier=institutional");
  });
});

describe("idempotencyKey wiring", () => {
  it("sessionIdempotencyKey is called with scope 'svi_api' and [userId, tier, priceId]", async () => {
    await POST(req({ tier: "team" }));
    expect(mocks.sessionIdempotencyKeyMock).toHaveBeenCalledTimes(1);
    const [scope, parts] = mocks.sessionIdempotencyKeyMock.mock.calls[0]!;
    expect(scope).toBe("svi_api");
    expect(parts).toEqual([USER.id, "team", "price_team_1"]);
  });

  it("idempotencyKey is stamped on the sessions.create options", async () => {
    mocks.sessionIdempotencyKeyMock.mockReturnValueOnce("idem_svi_team_hour42");
    await POST(req({ tier: "team" }));
    const [, opts] = mocks.stripeCreateMock.mock.calls[0]!;
    expect(opts).toEqual({ idempotencyKey: "idem_svi_team_hour42" });
  });

  it("institutional tier passes the institutional priceId into the idempotency key parts", async () => {
    await POST(req({ tier: "institutional" }));
    const [, parts] = mocks.sessionIdempotencyKeyMock.mock.calls[0]!;
    expect(parts).toEqual([USER.id, "institutional", "price_inst_1"]);
  });

  it("idempotencyKey differs across tiers for the same user (team vs institutional are distinct Stripe resources)", async () => {
    mocks.sessionIdempotencyKeyMock.mockImplementation(
      (_scope: string, parts: unknown[]) => `k_${(parts as string[]).join("_")}`,
    );
    await POST(req({ tier: "team" }));
    const teamKey = mocks.stripeCreateMock.mock.calls[0]![1]?.idempotencyKey;
    mocks.stripeCreateMock.mockClear();
    await POST(req({ tier: "institutional" }));
    const instKey = mocks.stripeCreateMock.mock.calls[0]![1]?.idempotencyKey;
    expect(teamKey).not.toBe(instKey);
    expect(teamKey).toContain("team");
    expect(instKey).toContain("institutional");
  });
});
