// Unit tests for POST /api/lead — P9-lead-route-test.
//
// This route sits at the top of the marketing funnel: every "Book a demo",
// "Founding-50 waitlist" and similar CTA on the site POSTs here. It has three
// separable contracts that silently degrade if broken and would not show up in
// a click-through test:
//   - Input validation & XSS sanitisation. The route feeds `payload` straight
//     into `leads.payload jsonb`. A stored HTML tag or `<script>` in an email
//     later renders unescaped in the CRM/admin dashboard; the route strips
//     tags with `.replace(/<[^>]*>/g, "")` before persistence. The route also
//     rejects any email string containing `<`, `>`, or the literal token
//     `script` (case-insensitive) even if the format regex would otherwise
//     accept it — pin that guard here so an "improved" regex doesn't drop it.
//   - Fault-tolerant persistence. When Supabase insert fails, the route logs
//     and still returns `{ok:true}` — the funnel must never surface a 500 to
//     an anonymous prospect. Same for Stripe: a `sessions.create` throw must
//     leave `checkoutUrl` unset and NOT block the 200 response.
//   - Founding-50 Stripe/email fork. When `source === "founding50"` and Stripe
//     is configured the route creates a Checkout Session with an idempotency
//     key derived from lower-cased trimmed email + priceId, then fires (and
//     does NOT await) `sendPaymentLink`. Pin the metadata shape (no
//     `blockid_user_id` at lead stage — the webhook falls back to email
//     lookup), the `allow_promotion_codes: true` flag, the success/cancel
//     URLs, and the payment-link defaults (`finalPrice = 49`, name falls back
//     to email).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------
// A minimal `.from().insert()` stub — the route only chains a single insert.

interface SupabaseInsertResult {
  error: unknown;
}
const insertMock = vi.fn<() => Promise<SupabaseInsertResult>>();
const fromMock = vi.fn((_table: string) => ({ insert: insertMock }));
const supabaseAdminMock = vi.fn<() => { from: typeof fromMock } | null>();

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () => supabaseAdminMock(),
}));

const isStripeConfiguredMock = vi.fn<() => boolean>();
const stripeSessionsCreateMock = vi.fn();
const getStripeMock = vi.fn<
  () => { checkout: { sessions: { create: typeof stripeSessionsCreateMock } } } | null
>();

vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => isStripeConfiguredMock(),
  getStripe: () => getStripeMock(),
  STRIPE_PRICE_MAP: new Proxy<Record<string, string | undefined>>(
    { founding50: "price_founding50_test" },
    {
      get(target, prop: string) {
        return target[prop];
      },
    },
  ),
}));

const getPlanMock = vi.fn<(id: string) => { features: string[] } | undefined>();
vi.mock("@/lib/plans", () => ({
  getPlan: (id: string) => getPlanMock(id),
}));

const sendPaymentLinkMock = vi.fn<(args: {
  to: string;
  name: string;
  checkoutUrl: string;
  finalPrice: number;
  features: string[];
}) => Promise<unknown>>();

vi.mock("@/lib/email", () => ({
  sendPaymentLink: (args: {
    to: string;
    name: string;
    checkoutUrl: string;
    finalPrice: number;
    features: string[];
  }) => sendPaymentLinkMock(args),
}));

const sessionIdempotencyKeyMock = vi.fn<
  (scope: string, parts: Array<string | number | null | undefined>) => string
>();
vi.mock("@/lib/stripe/idempotency", () => ({
  sessionIdempotencyKey: (
    scope: string,
    parts: Array<string | number | null | undefined>,
  ) => sessionIdempotencyKeyMock(scope, parts),
}));

// Route import must come AFTER the mocks are registered.
import { POST, dynamic } from "./route";

// --- Helpers ----------------------------------------------------------------

function req(body: unknown, init?: { badJson?: boolean }): Request {
  const payload = init?.badJson ? "{not json" : JSON.stringify(body);
  return new Request("http://x/api/lead", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

// Silence expected console output; tests can inspect via mock counters.
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  insertMock.mockReset().mockResolvedValue({ error: null });
  fromMock.mockClear();
  supabaseAdminMock.mockReset().mockReturnValue({ from: fromMock });
  isStripeConfiguredMock.mockReset().mockReturnValue(false);
  stripeSessionsCreateMock.mockReset();
  getStripeMock.mockReset().mockReturnValue(null);
  getPlanMock.mockReset().mockReturnValue({ features: ["a", "b"] });
  sendPaymentLinkMock.mockReset().mockResolvedValue({ ok: true });
  sessionIdempotencyKeyMock
    .mockReset()
    .mockImplementation((scope, parts) => `bid:${scope}:${parts.join("|")}`);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  delete process.env.NEXT_PUBLIC_SITE_URL;
});

// ---------------------------------------------------------------------------
// Route module invariants
// ---------------------------------------------------------------------------

describe("POST /api/lead — module invariants", () => {
  it('exports dynamic = "force-dynamic" so lead POSTs are never statically cached', () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// ---------------------------------------------------------------------------
// Body-parse
// ---------------------------------------------------------------------------

describe("POST /api/lead — body parsing", () => {
  it("returns 400 when the body is not valid JSON — no persistence touched", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    expect(supabaseAdminMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("400 body-parse response carries {ok:false, error} with a non-empty error string", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(typeof body.error).toBe("string");
    expect((body.error as string).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Email validation
// ---------------------------------------------------------------------------

describe("POST /api/lead — email validation", () => {
  it("returns 400 when email is missing entirely", async () => {
    const res = await POST(req({ source: "demo" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when email is not a string (number)", async () => {
    const res = await POST(req({ source: "demo", email: 12 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email is an empty string", async () => {
    const res = await POST(req({ source: "demo", email: "" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email fails the format regex (no @)", async () => {
    const res = await POST(req({ source: "demo", email: "not-an-email" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email TLD is a single char", async () => {
    const res = await POST(req({ source: "demo", email: "a@b.c" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email contains a `<` character even if regex would pass", async () => {
    const res = await POST(req({ source: "demo", email: "ok<@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email contains a `>` character", async () => {
    // Note: the local-part regex forbids `>`, so this also fails the regex —
    // but the XSS guard is an independent belt-and-braces check that must
    // stay in place regardless.
    const res = await POST(req({ source: "demo", email: "ok>@example.com" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when email contains the literal token 'script' (case-insensitive)", async () => {
    // The local-part regex accepts this pattern; the extra script-token guard
    // is what rejects it. If someone drops that guard, this test surfaces it.
    const res = await POST(req({ source: "demo", email: "myscript@example.com" }));
    expect(res.status).toBe(400);
  });

  it("400 email response body carries {ok:false, error:'Valid email is required'}", async () => {
    const res = await POST(req({ source: "demo", email: "bad" }));
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "Valid email is required" });
  });

  it("accepts a standard address with plus-addressing (regex allows +)", async () => {
    const res = await POST(req({ source: "demo", email: "user+tag@example.com" }));
    expect(res.status).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Source validation
// ---------------------------------------------------------------------------

describe("POST /api/lead — source validation", () => {
  it("returns 400 when source is missing", async () => {
    const res = await POST(req({ email: "user@example.com" }));
    expect(res.status).toBe(400);
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("returns 400 when source is not a string (boolean)", async () => {
    const res = await POST(req({ email: "user@example.com", source: true }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when source is an empty string", async () => {
    const res = await POST(req({ email: "user@example.com", source: "" }));
    expect(res.status).toBe(400);
  });

  it("400 source response body carries {ok:false, error:'source is required'}", async () => {
    const res = await POST(req({ email: "user@example.com" }));
    const body = await json(res);
    expect(body).toEqual({ ok: false, error: "source is required" });
  });
});

// ---------------------------------------------------------------------------
// Persistence — Supabase configured
// ---------------------------------------------------------------------------

describe("POST /api/lead — Supabase persistence", () => {
  it("inserts into the `leads` table when Supabase admin is configured", async () => {
    await POST(req({ source: "demo", email: "u@example.com", payload: { plan: "growth" } }));
    expect(fromMock).toHaveBeenCalledWith("leads");
    expect(insertMock).toHaveBeenCalledTimes(1);
  });

  it("passes email, source, and safePayload straight through to Supabase insert", async () => {
    await POST(
      req({ source: "demo", email: "u@example.com", payload: { plan: "growth", n: 1 } }),
    );
    expect(insertMock).toHaveBeenCalledWith({
      email: "u@example.com",
      source: "demo",
      payload: { plan: "growth", n: 1 },
    });
  });

  it("still returns 200 {ok:true} when the Supabase insert errors — the funnel must not break", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    const res = await POST(req({ source: "demo", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true });
  });

  it("logs to console.error when the Supabase insert errors", async () => {
    insertMock.mockResolvedValue({ error: { message: "boom" } });
    await POST(req({ source: "demo", email: "u@example.com" }));
    expect(errorSpy).toHaveBeenCalled();
    // First call, first arg contains the tag so a log rename surfaces here.
    expect(String(errorSpy.mock.calls[0]?.[0])).toContain("[blockid:lead]");
  });

  it("coerces a missing payload to an empty object before persistence", async () => {
    await POST(req({ source: "demo", email: "u@example.com" }));
    const call = insertMock.mock.calls[0]?.[0] as {
      payload: unknown;
    };
    expect(call.payload).toEqual({});
  });

  it("coerces a null payload to an empty object before persistence", async () => {
    await POST(req({ source: "demo", email: "u@example.com", payload: null }));
    const call = insertMock.mock.calls[0]?.[0] as {
      payload: unknown;
    };
    expect(call.payload).toEqual({});
  });

  it("coerces a scalar payload (string) to an empty object before persistence", async () => {
    // Only objects/arrays flow through stripHtml — a scalar becomes {}.
    await POST(req({ source: "demo", email: "u@example.com", payload: "junk" }));
    const call = insertMock.mock.calls[0]?.[0] as {
      payload: unknown;
    };
    expect(call.payload).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Persistence — Supabase unconfigured
// ---------------------------------------------------------------------------

describe("POST /api/lead — Supabase unconfigured", () => {
  beforeEach(() => {
    supabaseAdminMock.mockReturnValue(null);
  });

  it("returns 200 {ok:true} and logs a console.warn instead of persisting", async () => {
    const res = await POST(req({ source: "demo", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true });
    expect(insertMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });

  it("warn message is tagged '[blockid:lead]' so a log rename surfaces here", async () => {
    await POST(req({ source: "demo", email: "u@example.com" }));
    expect(String(warnSpy.mock.calls[0]?.[0])).toContain("[blockid:lead]");
  });
});

// ---------------------------------------------------------------------------
// XSS sanitisation of `payload`
// ---------------------------------------------------------------------------

describe("POST /api/lead — payload XSS sanitisation", () => {
  it("strips HTML tags from top-level string values in payload", async () => {
    await POST(
      req({
        source: "demo",
        email: "u@example.com",
        payload: { note: "<script>alert(1)</script>hello" },
      }),
    );
    const call = insertMock.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(call.payload.note).toBe("alert(1)hello");
  });

  it("strips HTML tags recursively from nested objects", async () => {
    await POST(
      req({
        source: "demo",
        email: "u@example.com",
        payload: { profile: { bio: "<b>bold</b>text" } },
      }),
    );
    const call = insertMock.mock.calls[0]?.[0] as {
      payload: { profile: { bio: string } };
    };
    expect(call.payload.profile.bio).toBe("boldtext");
  });

  it("strips HTML tags from string elements inside arrays", async () => {
    await POST(
      req({
        source: "demo",
        email: "u@example.com",
        payload: { tags: ["<i>a</i>", "<b>b</b>"] },
      }),
    );
    const call = insertMock.mock.calls[0]?.[0] as { payload: { tags: string[] } };
    expect(call.payload.tags).toEqual(["a", "b"]);
  });

  it("leaves non-string scalars (numbers, booleans, null) untouched", async () => {
    await POST(
      req({
        source: "demo",
        email: "u@example.com",
        payload: { n: 42, b: true, z: null },
      }),
    );
    const call = insertMock.mock.calls[0]?.[0] as {
      payload: { n: number; b: boolean; z: null };
    };
    expect(call.payload).toEqual({ n: 42, b: true, z: null });
  });

  it("removes the tag but keeps the inner text (no XSS-safe encoding — that's the DB layer's job)", async () => {
    // Explicit pin: the sanitiser is tag-strip, not HTML-encode. If someone
    // "hardens" it to encode `<` as `&lt;` we want the CRM view to know.
    await POST(
      req({
        source: "demo",
        email: "u@example.com",
        payload: { msg: "<img src=x onerror=alert(1)>hi" },
      }),
    );
    const call = insertMock.mock.calls[0]?.[0] as { payload: { msg: string } };
    expect(call.payload.msg).toBe("hi");
  });
});

// ---------------------------------------------------------------------------
// Non-founding50 sources must never touch Stripe or the payment-link mailer
// ---------------------------------------------------------------------------

describe("POST /api/lead — non-founding50 sources", () => {
  it("does NOT call Stripe for source='demo' even when Stripe is configured", async () => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      checkout: { sessions: { create: stripeSessionsCreateMock } },
    });
    await POST(req({ source: "demo", email: "u@example.com" }));
    expect(stripeSessionsCreateMock).not.toHaveBeenCalled();
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("returns 200 with no checkoutUrl key for a non-founding50 source", async () => {
    const res = await POST(req({ source: "demo", email: "u@example.com" }));
    const body = await json(res);
    expect(body).toEqual({ ok: true });
    expect(body.checkoutUrl).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Founding-50 branch — Stripe unconfigured / price missing
// ---------------------------------------------------------------------------

describe("POST /api/lead — founding50 without Stripe", () => {
  it("returns 200 {ok:true} with no checkoutUrl when Stripe is not configured", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    const res = await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true });
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("logs a console.warn when Stripe is not configured for founding50", async () => {
    isStripeConfiguredMock.mockReturnValue(false);
    await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(warnSpy).toHaveBeenCalled();
    expect(String(warnSpy.mock.calls.at(-1)?.[0])).toContain("Stripe not configured");
  });
});

// ---------------------------------------------------------------------------
// Founding-50 branch — happy path
// ---------------------------------------------------------------------------

describe("POST /api/lead — founding50 happy path", () => {
  beforeEach(() => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      checkout: { sessions: { create: stripeSessionsCreateMock } },
    });
    stripeSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/pay/abc" });
  });

  it("returns 200 with a checkoutUrl from the Stripe session", async () => {
    const res = await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/abc");
  });

  it("creates the Stripe session with mode='payment' and the founding50 price line-item", async () => {
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = stripeSessionsCreateMock.mock.calls[0]?.[0] as {
      mode: string;
      customer_email: string;
      line_items: Array<{ price: string; quantity: number }>;
    };
    expect(args.mode).toBe("payment");
    expect(args.customer_email).toBe("u@example.com");
    expect(args.line_items).toEqual([{ price: "price_founding50_test", quantity: 1 }]);
  });

  it("sets allow_promotion_codes: true so coupon codes work at checkout", async () => {
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = stripeSessionsCreateMock.mock.calls[0]?.[0] as {
      allow_promotion_codes: boolean;
    };
    expect(args.allow_promotion_codes).toBe(true);
  });

  it("session metadata omits blockid_user_id at lead stage (webhook falls back to email lookup)", async () => {
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = stripeSessionsCreateMock.mock.calls[0]?.[0] as {
      metadata: Record<string, string>;
    };
    expect(args.metadata).toEqual({
      blockid_source: "founding50",
      blockid_email: "u@example.com",
      blockid_plan: "founding50",
    });
    expect(args.metadata.blockid_user_id).toBeUndefined();
  });

  it("uses NEXT_PUBLIC_SITE_URL when set (trailing slash stripped)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://staging.blockid.au/";
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = stripeSessionsCreateMock.mock.calls[0]?.[0] as {
      success_url: string;
      cancel_url: string;
    };
    expect(args.success_url).toBe(
      "https://staging.blockid.au/checkout/success?plan=founding50",
    );
    expect(args.cancel_url).toBe("https://staging.blockid.au/founding-50");
  });

  it("falls back to https://blockid.au for the checkout URLs when NEXT_PUBLIC_SITE_URL is unset", async () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = stripeSessionsCreateMock.mock.calls[0]?.[0] as {
      success_url: string;
      cancel_url: string;
    };
    expect(args.success_url).toBe("https://blockid.au/checkout/success?plan=founding50");
    expect(args.cancel_url).toBe("https://blockid.au/founding-50");
  });

  it("builds the Stripe idempotency key from lower-cased trimmed email + priceId", async () => {
    // Verifies the exact args handed to sessionIdempotencyKey, not the digest
    // itself — that's covered by the idempotency-lib test. Note: the email
    // format regex rejects surrounding whitespace, so the trim() in the route
    // is defensive — supply a mixed-case address (which the regex allows) and
    // pin that the key derivation still lower-cases it.
    await POST(req({ source: "founding50", email: "U@Example.COM" }));
    expect(sessionIdempotencyKeyMock).toHaveBeenCalledWith("founding50", [
      "u@example.com",
      "price_founding50_test",
    ]);
    const optsArg = stripeSessionsCreateMock.mock.calls[0]?.[1] as {
      idempotencyKey: string;
    };
    expect(optsArg.idempotencyKey).toBe("bid:founding50:u@example.com|price_founding50_test");
  });

  it("still returns 200 {ok:true} without checkoutUrl when Stripe session creation throws", async () => {
    stripeSessionsCreateMock.mockRejectedValue(new Error("stripe boom"));
    const res = await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.checkoutUrl).toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("does not send the payment-link email when the Stripe session has no url", async () => {
    stripeSessionsCreateMock.mockResolvedValue({ url: null });
    await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Founding-50 branch — payment link email
// ---------------------------------------------------------------------------

describe("POST /api/lead — founding50 payment-link email", () => {
  beforeEach(() => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      checkout: { sessions: { create: stripeSessionsCreateMock } },
    });
    stripeSessionsCreateMock.mockResolvedValue({ url: "https://checkout.stripe.com/pay/xyz" });
  });

  it("sends the payment-link email with the checkout URL and the plan's features", async () => {
    getPlanMock.mockReturnValue({ features: ["Priority onboarding", "Slack DM"] });
    await POST(
      req({
        source: "founding50",
        email: "u@example.com",
        payload: { name: "Alex", finalPrice: 39 },
      }),
    );
    expect(sendPaymentLinkMock).toHaveBeenCalledTimes(1);
    expect(sendPaymentLinkMock).toHaveBeenCalledWith({
      to: "u@example.com",
      name: "Alex",
      checkoutUrl: "https://checkout.stripe.com/pay/xyz",
      finalPrice: 39,
      features: ["Priority onboarding", "Slack DM"],
    });
  });

  it("defaults finalPrice to 49 when payload.finalPrice is missing", async () => {
    await POST(
      req({ source: "founding50", email: "u@example.com", payload: { name: "Alex" } }),
    );
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.finalPrice).toBe(49);
  });

  it("defaults finalPrice to 49 when payload.finalPrice is a string (typeof !== 'number')", async () => {
    // The check is `typeof === 'number'`; a stringified number must fall back.
    await POST(
      req({
        source: "founding50",
        email: "u@example.com",
        payload: { finalPrice: "39" },
      }),
    );
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.finalPrice).toBe(49);
  });

  it("falls back to email as the name when payload.name is missing", async () => {
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.name).toBe("u@example.com");
  });

  it("falls back to email as the name when payload.name is empty string", async () => {
    await POST(
      req({ source: "founding50", email: "u@example.com", payload: { name: "" } }),
    );
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.name).toBe("u@example.com");
  });

  it("falls back to email as the name when payload.name is a non-string", async () => {
    await POST(
      req({ source: "founding50", email: "u@example.com", payload: { name: 42 } }),
    );
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.name).toBe("u@example.com");
  });

  it("supplies features: [] when getPlan returns undefined", async () => {
    getPlanMock.mockReturnValue(undefined);
    await POST(req({ source: "founding50", email: "u@example.com" }));
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.features).toEqual([]);
  });

  it("returns 200 even when sendPaymentLink rejects — the mailer is fire-and-forget", async () => {
    sendPaymentLinkMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.checkoutUrl).toBe("https://checkout.stripe.com/pay/xyz");
    // Give the .catch() microtask a chance to run so the console.error assert holds.
    await new Promise((resolve) => setImmediate(resolve));
    expect(errorSpy).toHaveBeenCalled();
  });

  it("uses the payload.name after HTML tags have been stripped (safePayload feeds the mailer)", async () => {
    // The route reads name from `safePayload` (the stripHtml output), not the
    // raw body. A tag in the display name must not survive into the email.
    await POST(
      req({
        source: "founding50",
        email: "u@example.com",
        payload: { name: "<b>Alex</b>" },
      }),
    );
    const args = sendPaymentLinkMock.mock.calls[0]?.[0];
    expect(args?.name).toBe("Alex");
  });
});
