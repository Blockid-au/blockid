// Colocated vitest for POST /api/stripe/analysis — P9 batch 1.
//
// Public (no-auth) guest checkout for per-analysis SVI payment. A bypass
// or validation gap could create bad Stripe sessions. Suite covers:
//   - 503 when Stripe not configured
//   - 400 on bad JSON
//   - 400 when email missing
//   - 400 when email has no @
//   - 500 when price ID not in STRIPE_PRICE_MAP
//   - 500 when stripe.checkout.sessions.create throws
//   - happy path early-bird price (svi_analysis)
//   - happy path standard price (svi_analysis_25)
//   - idempotency key is passed to Stripe
//   - metadata includes blockid_type + blockid_email
//   - success_url encodes email correctly

import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isStripeConfigured: vi.fn(),
  getStripe: vi.fn(),
  STRIPE_PRICE_MAP: {
    svi_analysis: "price_svi_1",
    svi_analysis_25: "price_svi_25",
  } as Record<string, string | undefined>,
  isEarlyBird: vi.fn(),
  sessionIdempotencyKey: vi.fn(),
  stripeSessionCreate: vi.fn(),
}));

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => mocks.isStripeConfigured(),
  getStripe: () => mocks.getStripe(),
  STRIPE_PRICE_MAP: mocks.STRIPE_PRICE_MAP,
}));
vi.mock("@/lib/plans", () => ({
  isEarlyBird: () => mocks.isEarlyBird(),
}));
vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: (...args: unknown[]) => mocks.sessionIdempotencyKey(...args),
}));

import { POST } from "./route";

function makeStripe() {
  return {
    checkout: {
      sessions: {
        create: (...args: unknown[]) => mocks.stripeSessionCreate(...args),
      },
    },
  };
}

function req(body: unknown, opts?: { badJson?: boolean }) {
  return new Request("http://x/api/stripe/analysis", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response) {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.isStripeConfigured.mockReturnValue(true);
  mocks.getStripe.mockReturnValue(makeStripe());
  mocks.isEarlyBird.mockReturnValue(true);
  mocks.sessionIdempotencyKey.mockReturnValue("idem_analysis_1");
  mocks.stripeSessionCreate.mockResolvedValue({
    id: "cs_test_1",
    url: "https://stripe.example/cs_test_1",
  });
  // Reset price map to defaults
  mocks.STRIPE_PRICE_MAP.svi_analysis = "price_svi_1";
  mocks.STRIPE_PRICE_MAP.svi_analysis_25 = "price_svi_25";
});

afterEach(() => { vi.clearAllMocks(); });

describe("POST /api/stripe/analysis", () => {
  it("returns 503 when Stripe not configured", async () => {
    mocks.isStripeConfigured.mockReturnValue(false);
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(503);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 on bad JSON body", async () => {
    const res = await POST(req(null, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.ok).toBe(false);
  });

  it("returns 400 when email is missing", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.reason).toMatch(/email/i);
  });

  it("returns 400 when email has no @", async () => {
    const res = await POST(req({ email: "notanemail" }));
    expect(res.status).toBe(400);
  });

  it("returns 500 when svi_analysis price not configured (early-bird)", async () => {
    mocks.isEarlyBird.mockReturnValue(true);
    mocks.STRIPE_PRICE_MAP.svi_analysis = undefined;
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.reason).toMatch(/price not configured/i);
  });

  it("returns 500 when svi_analysis_25 price not configured (standard)", async () => {
    mocks.isEarlyBird.mockReturnValue(false);
    mocks.STRIPE_PRICE_MAP.svi_analysis_25 = undefined;
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(500);
  });

  it("returns 500 when Stripe session creation throws", async () => {
    mocks.stripeSessionCreate.mockRejectedValue(new Error("Stripe error"));
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(body.reason).toMatch(/checkout failed/i);
  });

  it("happy path early-bird: uses svi_analysis price", async () => {
    mocks.isEarlyBird.mockReturnValue(true);
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.url).toBe("https://stripe.example/cs_test_1");
    const createCall = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    const lineItems = createCall.line_items as Array<{ price: string }>;
    expect(lineItems[0].price).toBe("price_svi_1");
  });

  it("happy path standard: uses svi_analysis_25 price", async () => {
    mocks.isEarlyBird.mockReturnValue(false);
    const res = await POST(req({ email: "founder@example.com" }));
    expect(res.status).toBe(200);
    const createCall = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    const lineItems = createCall.line_items as Array<{ price: string }>;
    expect(lineItems[0].price).toBe("price_svi_25");
  });

  it("passes idempotency key to Stripe", async () => {
    mocks.sessionIdempotencyKey.mockReturnValue("idem_test_key");
    await POST(req({ email: "founder@example.com" }));
    const opts = mocks.stripeSessionCreate.mock.calls[0][1] as { idempotencyKey?: string };
    expect(opts.idempotencyKey).toBe("idem_test_key");
  });

  it("sets metadata with blockid_type and blockid_email", async () => {
    await POST(req({ email: "founder@example.com" }));
    const params = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    const meta = params.metadata as Record<string, string>;
    expect(meta.blockid_type).toBe("svi_analysis");
    expect(meta.blockid_email).toBe("founder@example.com");
  });

  it("encodes email in success_url", async () => {
    await POST(req({ email: "founder+test@example.com" }));
    const params = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    const successUrl = params.success_url as string;
    expect(successUrl).toContain(encodeURIComponent("founder+test@example.com"));
  });

  it("mode is payment (not subscription)", async () => {
    await POST(req({ email: "founder@example.com" }));
    const params = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.mode).toBe("payment");
  });

  it("uses customer_email not auth session", async () => {
    await POST(req({ email: "guest@example.com" }));
    const params = mocks.stripeSessionCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(params.customer_email).toBe("guest@example.com");
  });
});
