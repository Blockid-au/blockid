import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Colocated vitest for the previously-untested server-only
// `oauth-stripe-signals.ts` — the Stripe REST evidence connector that
// backs the founder Evidence tab (revenue signals surfaced on
// /dashboard/evidence). Regressions here are user-visible AND scoring-
// visible: (a) losing the FX table's conservative default (0.5x for
// unknown currencies) inflates a founder's MRR in the SVI Revenue band
// with any exotic-currency subscription; (b) losing the year → 1/12 or
// week → 4.345 or day → 30 branch normalises a US$120/year plan to
// $120/mo of MRR, three orders of magnitude off; (c) losing the
// `unit_amount ?? 0` guard throws NaN through the reducer the moment
// a metered / free-tier price arrives with null unit_amount, taking
// the whole tab down; (d) losing the `quantity ?? 1` guard drops
// per-seat revenue silently when Stripe omits an explicit quantity
// (single-seat subscriptions); (e) losing the paid+!refunded+succeeded
// filter counts declined / refunded / disputed charges as revenue,
// which would show a founder AOV they never actually earned; (f)
// losing the `!res.ok` short-circuit in `stripeGet` throws on the very
// first 401 / 402 / 429 / 500 and the whole tab errors instead of
// degrading; (g) losing the two-dp rounding on `mrrAud` +
// `averageOrderAud` shows founders 8-decimal-place floats, which is
// what triggered the original bug ticket.
//
// Fetch is stubbed globally with a per-URL responder queue so every
// Stripe API contract assertion (URL + headers + method + cache) rides
// the real production codepath. `server-only` is neutered by the
// vitest alias in `web/vitest.config.ts` so no runtime shim import
// is needed.

import {
  fetchStripeSignals,
  type StripeSignals,
} from "./oauth-stripe-signals";

interface FetchCall {
  url: string;
  init: RequestInit | undefined;
}

interface Responder {
  match: (url: string) => boolean;
  respond: () => Response | Promise<Response>;
}

const calls: FetchCall[] = [];
const responders: Responder[] = [];

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
    ...init,
  });
}

function queue(
  match: string | RegExp,
  body: unknown,
  init: ResponseInit = {},
): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match || u.startsWith(match)
        : (u) => match.test(u),
    respond: () => jsonResponse(body, init),
  });
}

function queueStatus(
  match: string | RegExp,
  status: number,
  body: unknown = "",
): void {
  responders.push({
    match:
      typeof match === "string"
        ? (u) => u === match || u.startsWith(match)
        : (u) => match.test(u),
    respond: () =>
      new Response(typeof body === "string" ? body : JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      }),
  });
}

function fakeFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const url = typeof input === "string" ? input : input.toString();
  calls.push({ url, init });
  for (let i = 0; i < responders.length; i += 1) {
    if (responders[i].match(url)) {
      const r = responders[i];
      responders.splice(i, 1);
      return Promise.resolve(r.respond());
    }
  }
  throw new Error(`fakeFetch: no responder queued for ${url}`);
}

interface SubItemInput {
  unit_amount: number | null;
  currency: string;
  interval?: "day" | "week" | "month" | "year";
  quantity?: number;
}

function makeSub(items: SubItemInput[], status = "active") {
  return {
    status,
    items: {
      data: items.map((it) => ({
        quantity: it.quantity,
        price: {
          unit_amount: it.unit_amount,
          currency: it.currency,
          recurring: it.interval ? { interval: it.interval } : null,
        },
      })),
    },
  };
}

function makeCharge(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    amount: 10000, // 100.00 in minor units
    currency: "aud",
    status: "succeeded",
    paid: true,
    refunded: false,
    created: Math.floor(Date.now() / 1000),
    ...overrides,
  };
}

const SUBS_URL_PREFIX =
  "https://api.stripe.com/v1/subscriptions?limit=100&status=active";
const CUSTOMERS_URL_PREFIX =
  "https://api.stripe.com/v1/customers?limit=100";
const CHARGES_URL_PREFIX = "https://api.stripe.com/v1/charges?limit=100";

beforeEach(() => {
  calls.length = 0;
  responders.length = 0;
  vi.stubGlobal("fetch", fakeFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchStripeSignals — happy path shape", () => {
  it("returns a fully-populated StripeSignals object when all endpoints answer", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 5000, currency: "aud", interval: "month" }]),
        makeSub([{ unit_amount: 12000, currency: "usd", interval: "year" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, {
      data: [{ id: "cus_1" }, { id: "cus_2" }, { id: "cus_3" }],
      has_more: false,
    });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 10000, currency: "aud" }), // 100 AUD
        makeCharge({ amount: 20000, currency: "aud" }), // 200 AUD
      ],
      has_more: false,
    });

    const out = await fetchStripeSignals("sk_test_abc");

    // AUD sub: 50/mo. USD/year 120.00 → toAud = (12000/100) * (1/0.65) ≈ 184.615 * (1/12) → 15.385/mo
    // Total mrrAud ≈ 65.38 → rounded
    expect(out.mrrAud).toBeGreaterThan(65);
    expect(out.mrrAud).toBeLessThan(66);
    expect(out.activeCustomers).toBe(3);
    expect(out.recentPayments30d).toBe(2);
    expect(out.averageOrderAud).toBe(150);
    // Ensure shape is exactly StripeSignals keys
    const keys = Object.keys(out).sort();
    expect(keys).toEqual([
      "activeCustomers",
      "averageOrderAud",
      "mrrAud",
      "recentPayments30d",
    ]);
  });

  it("returned mrrAud and averageOrderAud are always rounded to 2 decimal places", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([
          { unit_amount: 3333, currency: "usd", interval: "month" },
        ]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 3333, currency: "usd" }),
        makeCharge({ amount: 7777, currency: "usd" }),
        makeCharge({ amount: 1234, currency: "usd" }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(Number.isFinite(out.mrrAud)).toBe(true);
    expect(Number.isFinite(out.averageOrderAud)).toBe(true);
    // decimal-place assertion: no more than 2 places
    expect(out.mrrAud).toBe(Math.round(out.mrrAud * 100) / 100);
    expect(out.averageOrderAud).toBe(
      Math.round(out.averageOrderAud * 100) / 100,
    );
  });

  it("returns the four Signal keys and no extras", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    const expected: StripeSignals = {
      mrrAud: 0,
      activeCustomers: 0,
      recentPayments30d: 0,
      averageOrderAud: 0,
    };
    expect(out).toEqual(expected);
  });
});

describe("stripeGet — request contract", () => {
  it("sends Bearer authorization header with the supplied token", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("sk_secret_xyz");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_secret_xyz");
  });

  it("sends the application/json Accept header", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    const headers = calls[0].init?.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/json");
  });

  it("uses no-store cache mode so signals are always fresh", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    expect(calls[0].init?.cache).toBe("no-store");
  });

  it("does not specify a method (defaults to GET)", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    expect(calls[0].init?.method).toBeUndefined();
  });

  it("re-uses the same header shape across every call in a single invocation", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    const [h0, h1, h2] = calls.map(
      (c) => c.init?.headers as Record<string, string>,
    );
    expect(h0).toEqual(h1);
    expect(h1).toEqual(h2);
  });

  it("hits the three Stripe URLs the module documents", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    const urls = calls.map((c) => c.url).sort();
    expect(
      urls.some((u) =>
        u.startsWith("https://api.stripe.com/v1/subscriptions"),
      ),
    ).toBe(true);
    expect(
      urls.some((u) => u.startsWith("https://api.stripe.com/v1/customers")),
    ).toBe(true);
    expect(
      urls.some((u) => u.startsWith("https://api.stripe.com/v1/charges")),
    ).toBe(true);
  });

  it("filters active-only subscriptions via the URL query string", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    const subsCall = calls.find((c) =>
      c.url.startsWith("https://api.stripe.com/v1/subscriptions"),
    );
    expect(subsCall?.url).toContain("status=active");
    expect(subsCall?.url).toContain("limit=100");
  });

  it("pins limit=100 on customers list URL", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    const custCall = calls.find((c) =>
      c.url.startsWith("https://api.stripe.com/v1/customers"),
    );
    expect(custCall?.url).toContain("limit=100");
  });

  it("uses a created[gte] window on the charges URL (30-day recency)", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const nowSec = Math.floor(Date.now() / 1000);
    await fetchStripeSignals("tok");
    const chargesCall = calls.find((c) =>
      c.url.startsWith("https://api.stripe.com/v1/charges"),
    );
    expect(chargesCall?.url).toMatch(/created\[gte\]=\d+/);
    const m = chargesCall?.url.match(/created\[gte\]=(\d+)/);
    const ts = m ? Number(m[1]) : 0;
    // ts should be roughly 30 days ago — within a wide tolerance.
    const thirtyDaysAgo = nowSec - 30 * 24 * 60 * 60;
    expect(Math.abs(ts - thirtyDaysAgo)).toBeLessThan(120);
  });

  it("issues exactly three Stripe API calls per invocation", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    await fetchStripeSignals("tok");
    expect(calls.length).toBe(3);
  });
});

describe("fetchStripeSignals — endpoint degradation", () => {
  it("treats a 401 on /subscriptions as MRR=0 without throwing", async () => {
    queueStatus(SUBS_URL_PREFIX, 401);
    queue(CUSTOMERS_URL_PREFIX, { data: [{ id: "c" }], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(0);
    expect(out.activeCustomers).toBe(1);
  });

  it("treats a 500 on /customers as activeCustomers=0 without throwing", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queueStatus(CUSTOMERS_URL_PREFIX, 500);
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.activeCustomers).toBe(0);
  });

  it("treats a 429 on /charges as zero recent payments without throwing", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queueStatus(CHARGES_URL_PREFIX, 429);
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(0);
    expect(out.averageOrderAud).toBe(0);
  });

  it("returns the all-zeroes shape when every Stripe endpoint fails", async () => {
    queueStatus(SUBS_URL_PREFIX, 500);
    queueStatus(CUSTOMERS_URL_PREFIX, 500);
    queueStatus(CHARGES_URL_PREFIX, 500);
    const out = await fetchStripeSignals("tok");
    expect(out).toEqual({
      mrrAud: 0,
      activeCustomers: 0,
      recentPayments30d: 0,
      averageOrderAud: 0,
    });
  });
});

describe("MRR conversion — FX and interval branches", () => {
  it("passes through AUD subscriptions with a 1:1 rate", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 4900, currency: "aud", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(49);
  });

  it("converts USD subscriptions with the 0.65 rate", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 6500, currency: "usd", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 65 USD / 0.65 = 100 AUD
    expect(out.mrrAud).toBe(100);
  });

  it("converts EUR subscriptions with the 0.6 rate", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 6000, currency: "eur", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 60 EUR / 0.6 = 100 AUD
    expect(out.mrrAud).toBe(100);
  });

  it("converts GBP subscriptions with the 0.5 rate", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 5000, currency: "gbp", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 50 GBP / 0.5 = 100 AUD
    expect(out.mrrAud).toBe(100);
  });

  it("uses the 0.5 conservative default for unknown currencies", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 5000, currency: "zzz", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 50 ZZZ / 0.5 = 100 AUD
    expect(out.mrrAud).toBe(100);
  });

  it("treats currency case-insensitively (upper-case AUD matches lower-case entry)", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 4900, currency: "AUD", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(49);
  });

  it("normalises a yearly plan to 1/12 of the annual amount", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 120000, currency: "aud", interval: "year" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 1200 AUD/year → 100 AUD/month
    expect(out.mrrAud).toBe(100);
  });

  it("normalises a weekly plan by 4.345 weeks/month", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 1000, currency: "aud", interval: "week" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 10 AUD/week × 4.345 = 43.45
    expect(out.mrrAud).toBe(43.45);
  });

  it("normalises a daily plan by 30 days/month", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 100, currency: "aud", interval: "day" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 1 AUD/day × 30 = 30
    expect(out.mrrAud).toBe(30);
  });

  it("defaults to monthly when a price has no recurring block (one-off treated as month)", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 4900, currency: "aud" /* no interval */ }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(49);
  });

  it("multiplies by quantity when Stripe includes an explicit quantity", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([
          {
            unit_amount: 1000,
            currency: "aud",
            interval: "month",
            quantity: 5,
          },
        ]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    // 10 AUD × 5 = 50
    expect(out.mrrAud).toBe(50);
  });

  it("defaults quantity to 1 when Stripe omits the field", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([
          { unit_amount: 4900, currency: "aud", interval: "month" },
        ]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(49);
  });

  it("treats a null unit_amount (metered / free-tier) as 0 revenue rather than NaN", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: null, currency: "aud", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(0);
    expect(Number.isNaN(out.mrrAud)).toBe(false);
  });

  it("sums multiple items in the same subscription", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([
          { unit_amount: 1000, currency: "aud", interval: "month" },
          { unit_amount: 2000, currency: "aud", interval: "month" },
          { unit_amount: 3000, currency: "aud", interval: "month" },
        ]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(60);
  });

  it("sums MRR across multiple subscriptions", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([{ unit_amount: 4900, currency: "aud", interval: "month" }]),
        makeSub([{ unit_amount: 9900, currency: "aud", interval: "month" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(148);
  });

  it("returns MRR=0 when the subscriptions data array is empty", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [{ id: "c" }], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBe(0);
  });

  it("mixes currencies and intervals correctly in a single account", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        // 100 AUD/mo
        makeSub([{ unit_amount: 10000, currency: "aud", interval: "month" }]),
        // 12 USD/yr → 12/0.65/12 = 1.538 AUD/mo
        makeSub([{ unit_amount: 1200, currency: "usd", interval: "year" }]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.mrrAud).toBeGreaterThan(101);
    expect(out.mrrAud).toBeLessThan(102);
  });
});

describe("activeCustomers — customer counting", () => {
  it("counts the customers.data length verbatim", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, {
      data: Array.from({ length: 7 }, (_, i) => ({ id: `cus_${i}` })),
      has_more: false,
    });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.activeCustomers).toBe(7);
  });

  it("returns 0 customers when the endpoint returns an empty data array", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.activeCustomers).toBe(0);
  });

  it("returns 0 customers when the endpoint returns 404 (no data at all)", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queueStatus(CUSTOMERS_URL_PREFIX, 404);
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.activeCustomers).toBe(0);
  });
});

describe("recentPayments30d / averageOrderAud — charge filter semantics", () => {
  it("counts every paid + succeeded + not-refunded charge", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 10000, currency: "aud" }),
        makeCharge({ amount: 20000, currency: "aud" }),
        makeCharge({ amount: 30000, currency: "aud" }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(3);
    expect(out.averageOrderAud).toBe(200);
  });

  it("excludes refunded charges from recentPayments30d", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 10000, refunded: false }),
        makeCharge({ amount: 5000, refunded: true }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(1);
    expect(out.averageOrderAud).toBe(100);
  });

  it("excludes charges whose paid flag is false", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 10000, paid: true }),
        makeCharge({ amount: 99999, paid: false }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(1);
    expect(out.averageOrderAud).toBe(100);
  });

  it("excludes non-succeeded charges (pending / failed)", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 10000, status: "succeeded" }),
        makeCharge({ amount: 20000, status: "pending" }),
        makeCharge({ amount: 40000, status: "failed" }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(1);
    expect(out.averageOrderAud).toBe(100);
  });

  it("returns averageOrderAud=0 when no charges qualify (avoid divide-by-zero)", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ paid: false }),
        makeCharge({ refunded: true }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(0);
    expect(out.averageOrderAud).toBe(0);
    expect(Number.isNaN(out.averageOrderAud)).toBe(false);
  });

  it("converts charges in USD to AUD before averaging", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 6500, currency: "usd" }), // 100 AUD
        makeCharge({ amount: 13000, currency: "usd" }), // 200 AUD
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(2);
    expect(out.averageOrderAud).toBe(150);
  });

  it("uses the conservative 0.5 default for unknown-currency charges", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [makeCharge({ amount: 5000, currency: "zzz" })],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    // 50 ZZZ / 0.5 = 100 AUD
    expect(out.averageOrderAud).toBe(100);
  });

  it("returns 0 for both fields when the charges endpoint 404s", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queueStatus(CHARGES_URL_PREFIX, 404);
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(0);
    expect(out.averageOrderAud).toBe(0);
  });

  it("returns 0 for both fields when the charges data array is empty", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, { data: [], has_more: false });
    const out = await fetchStripeSignals("tok");
    expect(out.recentPayments30d).toBe(0);
    expect(out.averageOrderAud).toBe(0);
  });

  it("handles NZD (0.9) and SGD (0.7) rates end-to-end", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 9000, currency: "nzd" }), // 90 NZD / 0.9 = 100 AUD
        makeCharge({ amount: 7000, currency: "sgd" }), // 70 SGD / 0.7 = 100 AUD
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.averageOrderAud).toBe(100);
    expect(out.recentPayments30d).toBe(2);
  });

  it("handles CAD (0.65) end-to-end", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [makeCharge({ amount: 6500, currency: "cad" })],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    // 65 CAD / 0.65 = 100 AUD
    expect(out.averageOrderAud).toBe(100);
  });
});

describe("integration — realistic multi-signal accounts", () => {
  it("does not let a refunded USD charge poison the AUD average", async () => {
    queue(SUBS_URL_PREFIX, { data: [], has_more: false });
    queue(CUSTOMERS_URL_PREFIX, { data: [{ id: "c" }], has_more: false });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 6500, currency: "usd", refunded: false }), // 100 AUD
        makeCharge({ amount: 999999, currency: "usd", refunded: true }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.averageOrderAud).toBe(100);
    expect(out.recentPayments30d).toBe(1);
  });

  it("returns a coherent object even when Stripe returns wildly-mixed shapes", async () => {
    queue(SUBS_URL_PREFIX, {
      data: [
        makeSub([
          { unit_amount: 5000, currency: "usd", interval: "month" },
          { unit_amount: 12000, currency: "eur", interval: "year" },
          { unit_amount: null, currency: "aud", interval: "month" },
        ]),
      ],
      has_more: false,
    });
    queue(CUSTOMERS_URL_PREFIX, {
      data: [{ id: "c1" }, { id: "c2" }],
      has_more: false,
    });
    queue(CHARGES_URL_PREFIX, {
      data: [
        makeCharge({ amount: 5000, currency: "usd" }),
        makeCharge({ amount: 5000, currency: "gbp" }),
        makeCharge({ amount: 5000, currency: "aud", status: "pending" }),
      ],
      has_more: false,
    });
    const out = await fetchStripeSignals("tok");
    expect(out.activeCustomers).toBe(2);
    expect(out.recentPayments30d).toBe(2); // pending excluded
    expect(out.mrrAud).toBeGreaterThan(0);
    expect(out.averageOrderAud).toBeGreaterThan(0);
    // Basic invariants: rounding, non-negative
    expect(out.mrrAud).toBeGreaterThanOrEqual(0);
    expect(out.averageOrderAud).toBeGreaterThanOrEqual(0);
  });
});
