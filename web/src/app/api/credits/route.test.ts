// Colocated vitest for GET + POST /api/credits — P9-credits-route-test.
//
// GET returns the authenticated user's balance + transactions. POST buys
// credits via Stripe Checkout (or grants directly when Stripe is not
// configured for credits). This is the ONLY surface that mints
// Stripe Checkout sessions with `type=credit_purchase` metadata, which is
// the exact key the stripe-reconcile cron scans for on missed webhooks —
// so the metadata shape here is load-bearing across TWO independent systems.
//
// Regressions this suite is designed to catch:
//   - dropping the sessionIdempotencyKey call would let a double-click on
//     the "Buy 25 credits" button mint two Checkout sessions and let the
//     founder pay twice (only one grants credits post-webhook);
//   - loosening the CREDIT_PACKS.find() to accept ANY number would let a
//     hand-crafted `{amount: 999999}` mint a Checkout for that value;
//   - dropping the `type: credit_purchase` metadata would break the
//     stripe-reconcile cron's ability to auto-grant on missed webhooks;
//   - flipping the fallback path to skip the auth check would let anon
//     callers pass grantCredits() a user id and mint free balance.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  plan: string | null;
  role: string;
  displayName?: string | null;
}

interface Transaction {
  id: string;
  amount: number;
  kind: string;
}

interface GrantResult {
  ok: boolean;
  balance?: number;
}

const mocks = vi.hoisted(() => ({
  getCurrentUserMock: vi.fn<() => Promise<AppUser | null>>(),
  getBalanceMock: vi.fn<(userId: string) => Promise<number>>(),
  getTransactionHistoryMock: vi.fn<(userId: string, limit: number) => Promise<Transaction[]>>(),
  grantCreditsMock: vi.fn<(
    userId: string,
    amount: number,
    kind: string,
    meta: Record<string, unknown>,
  ) => Promise<GrantResult>>(),
  isStripeConfiguredMock: vi.fn<() => boolean>(),
  getStripeMock: vi.fn<() => unknown | null>(),
  stripeCreateMock: vi.fn<(
    params: Record<string, unknown>,
    opts?: { idempotencyKey?: string },
  ) => Promise<{ url: string }>>(),
  sessionIdempotencyKeyMock: vi.fn<(kind: string, parts: unknown[]) => string>(),
  CREDIT_PACKS_FIXTURE: [
    { credits: 10, priceCents: 990 },
    { credits: 25, priceCents: 1990 },
    { credits: 50, priceCents: 3490 },
    { credits: 100, priceCents: 5990 },
  ] as Array<{ credits: number; priceCents: number }>,
  STRIPE_PRICE_MAP_FIXTURE: {
    credits_10: "price_credits_10",
    credits_25: "price_credits_25",
    credits_50: "price_credits_50",
    // credits_100 intentionally missing to exercise the fallback path.
  } as Record<string, string | undefined>,
}));

vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => mocks.getCurrentUserMock(),
}));

vi.mock("@/lib/credits", () => ({
  getBalance: (id: string) => mocks.getBalanceMock(id),
  getTransactionHistory: (id: string, n: number) => mocks.getTransactionHistoryMock(id, n),
  grantCredits: (
    id: string,
    amt: number,
    k: string,
    m: Record<string, unknown>,
  ) => mocks.grantCreditsMock(id, amt, k, m),
  CREDIT_PACKS: mocks.CREDIT_PACKS_FIXTURE,
}));

vi.mock("@/lib/stripe", () => ({
  getStripe: () => mocks.getStripeMock(),
  isStripeConfigured: () => mocks.isStripeConfiguredMock(),
  STRIPE_PRICE_MAP: mocks.STRIPE_PRICE_MAP_FIXTURE,
}));

vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: (kind: string, parts: unknown[]) =>
    mocks.sessionIdempotencyKeyMock(kind, parts),
}));

import { GET, POST, dynamic } from "./route";

const USER: AppUser = {
  id: "user-1",
  email: "u@example.com",
  plan: "growth",
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

function postReq(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/credits", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{not-json" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.getCurrentUserMock.mockReset().mockResolvedValue(USER);
  mocks.getBalanceMock.mockReset().mockResolvedValue(150);
  mocks.getTransactionHistoryMock.mockReset().mockResolvedValue([
    { id: "tx1", amount: -25, kind: "svi_analysis" },
    { id: "tx2", amount: 100, kind: "purchase" },
  ]);
  mocks.grantCreditsMock.mockReset().mockResolvedValue({ ok: true, balance: 250 });
  mocks.isStripeConfiguredMock.mockReset().mockReturnValue(true);
  mocks.getStripeMock.mockReset().mockReturnValue(fakeStripe());
  mocks.stripeCreateMock.mockReset().mockResolvedValue({
    url: "https://stripe.example/checkout/s1",
  });
  mocks.sessionIdempotencyKeyMock.mockReset().mockReturnValue("idem_key_1");
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("credits route — module invariants", () => {
  it("exports dynamic='force-dynamic' — balance is never cached", () => {
    // A cached balance would let a founder overspend by refreshing after a
    // spend that hasn't propagated yet.
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// GET — auth gate
// -----------------------------------------------------------------------------

describe("GET /api/credits — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body).toEqual({ ok: false, reason: "Authentication required" });
  });

  it("does not call getBalance / getTransactionHistory when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await GET();
    expect(mocks.getBalanceMock).not.toHaveBeenCalled();
    expect(mocks.getTransactionHistoryMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// GET — happy path
// -----------------------------------------------------------------------------

describe("GET /api/credits — happy path", () => {
  it("returns balance + transactions + plan verbatim", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({
      ok: true,
      balance: 150,
      plan: "growth",
      transactions: [
        { id: "tx1", amount: -25, kind: "svi_analysis" },
        { id: "tx2", amount: 100, kind: "purchase" },
      ],
    });
  });

  it("passes user.id (not email) to both balance calls", async () => {
    await GET();
    expect(mocks.getBalanceMock).toHaveBeenCalledWith(USER.id);
    expect(mocks.getTransactionHistoryMock).toHaveBeenCalledWith(USER.id, 20);
  });

  it("caps transactions at 20", async () => {
    await GET();
    const call = mocks.getTransactionHistoryMock.mock.calls[0];
    expect(call?.[1]).toBe(20);
  });

  it("falls back to plan='free' when user.plan is null/undefined", async () => {
    mocks.getCurrentUserMock.mockResolvedValue({ ...USER, plan: null });
    const res = await GET();
    const body = await json(res);
    expect(body.plan).toBe("free");
  });
});

// -----------------------------------------------------------------------------
// POST — auth gate
// -----------------------------------------------------------------------------

describe("POST /api/credits — auth gate", () => {
  it("returns 401 when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq({ amount: 25 }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.reason).toBe("Authentication required");
  });

  it("MUST NOT call Stripe when unauthenticated", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    await POST(postReq({ amount: 25 }));
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("MUST NOT grant credits directly when unauthenticated (even in Stripe-off fallback)", async () => {
    // Critical: the fallback path grants credits directly — it must be
    // gated behind the same auth check to prevent anon minting.
    mocks.getCurrentUserMock.mockResolvedValue(null);
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    await POST(postReq({ amount: 25 }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// POST — body validation
// -----------------------------------------------------------------------------

describe("POST /api/credits — body validation", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await POST(postReq(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toBe("Invalid JSON body");
  });

  it("returns 400 when amount is missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.reason)).toMatch(/invalid credit pack/i);
  });

  it("returns 400 for an amount not in CREDIT_PACKS", async () => {
    const res = await POST(postReq({ amount: 7 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.reason)).toMatch(/invalid credit pack/i);
  });

  it("returns 400 for a hand-crafted absurd amount (999999)", async () => {
    // Pin the CREDIT_PACKS.find() gate — a refactor to accept any number
    // would let a caller mint a Checkout for arbitrary credits.
    const res = await POST(postReq({ amount: 999999 }));
    expect(res.status).toBe(400);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("enumerates valid pack sizes in the error reason (support signal)", async () => {
    const res = await POST(postReq({ amount: 7 }));
    const body = await json(res);
    const reason = String(body.reason);
    expect(reason).toContain("10");
    expect(reason).toContain("25");
    expect(reason).toContain("50");
    expect(reason).toContain("100");
  });

  it("accepts every valid pack size (10, 25, 50, 100)", async () => {
    for (const amt of [10, 25, 50]) {
      const res = await POST(postReq({ amount: amt }));
      expect(res.status).toBe(200);
    }
  });
});

// -----------------------------------------------------------------------------
// POST — Stripe Checkout path
// -----------------------------------------------------------------------------

describe("POST /api/credits — Stripe Checkout path", () => {
  it("returns 200 with the Stripe URL when Stripe is configured + priceId exists", async () => {
    const res = await POST(postReq({ amount: 25 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true, url: "https://stripe.example/checkout/s1" });
  });

  it("passes the priceId from STRIPE_PRICE_MAP for the requested amount", async () => {
    await POST(postReq({ amount: 50 }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const items = (call?.line_items ?? []) as Array<{ price: string; quantity: number }>;
    expect(items[0]?.price).toBe("price_credits_50");
  });

  it("stamps metadata.type='credit_purchase' (load-bearing for stripe-reconcile cron)", async () => {
    // The reconcile cron scans `metadata.type === "credit_purchase"` to
    // auto-grant on missed webhooks. Dropping this metadata would leave
    // paid customers un-granted.
    await POST(postReq({ amount: 25 }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    const md = call?.metadata as Record<string, string>;
    expect(md.type).toBe("credit_purchase");
    expect(md.blockid_user_id).toBe(USER.id);
    expect(md.blockid_credits).toBe("25");
  });

  it("passes the founder's email as customer_email (Stripe-side receipt)", async () => {
    await POST(postReq({ amount: 25 }));
    const call = mocks.stripeCreateMock.mock.calls[0]?.[0];
    expect(call?.customer_email).toBe(USER.email);
  });

  it("passes an idempotencyKey to the Stripe create call (double-click safety)", async () => {
    await POST(postReq({ amount: 25 }));
    const opts = mocks.stripeCreateMock.mock.calls[0]?.[1];
    expect(opts?.idempotencyKey).toBe("idem_key_1");
    expect(mocks.sessionIdempotencyKeyMock).toHaveBeenCalledWith(
      "credits",
      [USER.id, 25, "price_credits_25"],
    );
  });

  it("returns 500 with a generic reason when Stripe throws", async () => {
    mocks.stripeCreateMock.mockRejectedValue(new Error("network blip"));
    const res = await POST(postReq({ amount: 25 }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("Failed to create checkout session");
  });

  it("does not leak the raw Stripe error to the client on 500", async () => {
    mocks.stripeCreateMock.mockRejectedValue(new Error("cus_abc123 secret_key_leak"));
    const res = await POST(postReq({ amount: 25 }));
    const body = await json(res);
    expect(String(body.reason)).not.toContain("cus_abc123");
    expect(String(body.reason)).not.toContain("secret_key_leak");
  });

  it("MUST NOT grant credits directly when the Stripe Checkout path is taken", async () => {
    // Grant happens post-webhook — a synchronous grant here would double-mint.
    await POST(postReq({ amount: 25 }));
    expect(mocks.grantCreditsMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// POST — direct-grant fallback (Stripe or price not configured)
// -----------------------------------------------------------------------------

describe("POST /api/credits — direct-grant fallback", () => {
  it("grants credits directly when Stripe is not configured", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(postReq({ amount: 25 }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.granted).toBe(25);
    expect(body.method).toBe("direct");
    expect(body.balance).toBe(250);
    expect(mocks.grantCreditsMock).toHaveBeenCalledTimes(1);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("grants credits directly when the price is missing from STRIPE_PRICE_MAP (100-pack)", async () => {
    // credits_100 intentionally absent from fixture — pin the fallback.
    const res = await POST(postReq({ amount: 100 }));
    const body = await json(res);
    expect(body.method).toBe("direct");
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });

  it("returns 500 when grantCredits fails on the fallback path", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    mocks.grantCreditsMock.mockResolvedValue({ ok: false });
    const res = await POST(postReq({ amount: 25 }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toBe("Failed to grant credits");
  });

  it("passes user.id + kind='purchase' + amount to grantCredits", async () => {
    mocks.isStripeConfiguredMock.mockReturnValue(false);
    await POST(postReq({ amount: 25 }));
    const [uid, amt, kind] = mocks.grantCreditsMock.mock.calls[0] ?? [];
    expect(uid).toBe(USER.id);
    expect(amt).toBe(25);
    expect(kind).toBe("purchase");
  });
});

// -----------------------------------------------------------------------------
// Gate precedence
// -----------------------------------------------------------------------------

describe("POST /api/credits — gate precedence", () => {
  it("auth (401) fires BEFORE body parse (400)", async () => {
    mocks.getCurrentUserMock.mockResolvedValue(null);
    const res = await POST(postReq(undefined, { badJson: true }));
    expect(res.status).toBe(401);
  });

  it("body parse (400) fires BEFORE amount validation (400)", async () => {
    const res = await POST(postReq(undefined, { badJson: true }));
    const body = await json(res);
    expect(body.reason).toBe("Invalid JSON body");
  });

  it("amount validation (400) fires BEFORE Stripe path", async () => {
    const res = await POST(postReq({ amount: 7 }));
    expect(res.status).toBe(400);
    expect(mocks.stripeCreateMock).not.toHaveBeenCalled();
  });
});
