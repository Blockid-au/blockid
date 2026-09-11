// Colocated vitest for POST /api/funding/checkout (T0242, guest A$3 rail).
//
// Pins: email validation + disposable-domain block, intake validation, the
// row-before-Stripe order (funding_reports insert happens before
// checkout.sessions.create and carries status/paid_via/intake), the Stripe
// metadata contract the webhook keys on (scope=funding_report,
// funding_report_id), the success/cancel URLs, the price-missing 503, and the
// Stripe-failure path (row → failed, 502).

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const enforceRateLimitMock = vi.hoisted(() => vi.fn<(...a: unknown[]) => Response | null>());
vi.mock("@/lib/rate-limit", () => ({ enforceRateLimit: (...a: unknown[]) => enforceRateLimitMock(...a) }));

const { createSessionMock, priceMap } = vi.hoisted(() => ({
  createSessionMock: vi.fn(),
  priceMap: { funding_report: "price_funding_TEST" } as Record<string, string | undefined>,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: (p: unknown) => createSessionMock(p) } } }),
  STRIPE_PRICE_MAP: priceMap,
}));

const { order, updates } = vi.hoisted(() => ({
  order: [] as string[],
  updates: [] as Array<{ patch: Record<string, unknown>; id: unknown }>,
}));
vi.mock("@/lib/supabase", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseAdmin: () => ({
    from: () => {
      const c: Record<string, unknown> = {};
      let patch: Record<string, unknown> = {};
      c.update = (p: Record<string, unknown>) => {
        patch = p;
        return c;
      };
      c.eq = (_k: string, id: unknown) => {
        updates.push({ patch, id });
        return c;
      };
      c.then = (r: (v: unknown) => unknown) => r({ data: null, error: null });
      return c;
    },
  }),
}));

const createPendingMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/funding/reports", () => ({
  createPendingGuestReport: (args: unknown) => {
    order.push("insert");
    return createPendingMock(args);
  },
}));

import { POST } from "./route";

const GOOD = {
  email: "Founder@Example.com",
  description: "Soil sensors for grain farmers in regional NSW",
  state: "NSW",
  stage: "mvp",
};

function req(body: unknown): Request {
  return new Request("http://localhost:4001/api/funding/checkout", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  order.length = 0;
  updates.length = 0;
  enforceRateLimitMock.mockReset();
  enforceRateLimitMock.mockReturnValue(null);
  createPendingMock.mockReset();
  createPendingMock.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111", access_token: "tok" });
  createSessionMock.mockReset();
  createSessionMock.mockImplementation(async () => {
    order.push("stripe");
    return { id: "cs_test_fund", url: "https://checkout.stripe.com/c/pay/cs_test_fund" };
  });
  priceMap.funding_report = "price_funding_TEST";
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

describe("POST /api/funding/checkout — validation", () => {
  it("400s on a missing / malformed email and names the field", async () => {
    const res = await POST(req({ ...GOOD, email: "not-an-email" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, field: "email" });
    expect(createPendingMock).not.toHaveBeenCalled();
  });

  it("blocks disposable domains before touching the DB or Stripe", async () => {
    const res = await POST(req({ ...GOOD, email: "x@mailinator.com" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "email" });
    expect(createPendingMock).not.toHaveBeenCalled();
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it("S8-C: oversize body → 413 before any parsing or DB work", async () => {
    const big = await POST(req({ email: "a@b.co", description: "x".repeat(20 * 1024), state: "NSW", stage: "mvp" }));
    expect(big.status).toBe(413);
  });

  it("400s on a bad intake with the field name", async () => {
    const res = await POST(req({ ...GOOD, description: "too short" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ field: "description" });
  });

  it("applies the per-IP limit first, then the per-email limit", async () => {
    await POST(req(GOOD));
    const routes = enforceRateLimitMock.mock.calls.map((c) => c[0]);
    expect(routes).toEqual(["funding-checkout", "funding-checkout-per-email"]);
    expect(enforceRateLimitMock.mock.calls[1][1]).toBe("founder@example.com");
  });

  it("503s when the Stripe price is not minted, before inserting a row", async () => {
    priceMap.funding_report = undefined;
    const res = await POST(req(GOOD));
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: expect.stringContaining("STRIPE_PRICE_FUNDING_REPORT") });
    expect(createPendingMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/funding/checkout — row before Stripe + metadata", () => {
  it("inserts the pending row BEFORE Stripe and hands the webhook its keys", async () => {
    const res = await POST(req(GOOD));
    expect(res.status).toBe(200);
    expect(order).toEqual(["insert", "stripe"]);

    const insertArgs = createPendingMock.mock.calls[0][0] as { email: string; intake: Record<string, unknown>; amountCents: number };
    expect(insertArgs.email).toBe("founder@example.com");
    expect(insertArgs.intake).toMatchObject({ state: "NSW", stage: "mvp" });
    expect(insertArgs.amountCents).toBe(300);

    const params = createSessionMock.mock.calls[0][0] as Record<string, unknown>;
    expect(params.mode).toBe("payment");
    expect(params.line_items).toEqual([{ price: "price_funding_TEST", quantity: 1 }]);
    expect(params.customer_email).toBe("founder@example.com");
    expect(params.metadata).toEqual({
      scope: "funding_report",
      funding_report_id: "11111111-1111-4111-8111-111111111111",
      sku: "sku_funding_report_3aud",
      email: "founder@example.com",
    });
    expect(params.success_url).toBe(
      "http://localhost:4001/funding/report/11111111-1111-4111-8111-111111111111?s={CHECKOUT_SESSION_ID}",
    );
    expect(params.cancel_url).toBe("http://localhost:4001/funding?canceled=1");
    expect((params.automatic_tax as { enabled: boolean }).enabled).toBe(true);

    // Session id stamped back onto the row.
    expect(updates).toContainEqual({ patch: { stripe_session_id: "cs_test_fund" }, id: "11111111-1111-4111-8111-111111111111" });

    expect(await res.json()).toEqual({
      ok: true,
      checkoutUrl: "https://checkout.stripe.com/c/pay/cs_test_fund",
      fundingReportId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("marks the row failed and 502s when Stripe throws", async () => {
    createSessionMock.mockRejectedValueOnce(new Error("card network down"));
    const res = await POST(req(GOOD));
    expect(res.status).toBe(502);
    expect(updates.at(-1)).toMatchObject({ patch: { status: "failed", error_message: "stripe: card network down" } });
  });

  it("500s when the row insert fails and never calls Stripe", async () => {
    createPendingMock.mockResolvedValueOnce({ error: "boom" });
    const res = await POST(req(GOOD));
    expect(res.status).toBe(500);
    expect(createSessionMock).not.toHaveBeenCalled();
  });
});
