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
//     an anonymous prospect.
//   - Founding-50 (closed 2026-09-01). `source === "founding50"` answers
//     `promo_ended: true` and writes the lead row; G18-A (2026-09-19) removed
//     the Stripe Checkout + payment-link fork entirely, so the route must
//     never touch Stripe for any source.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks ------------------------------------------------------------------
// A minimal `.from().insert()` stub — the route only chains a single insert.

interface SupabaseInsertResult {
  error: unknown;
}
const insertMock = vi.fn<(row: unknown) => Promise<SupabaseInsertResult>>();
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

const sendEmailMock = vi.fn<(args: { to: string; subject: string; html: string }) => Promise<unknown>>();
const sendTelegramMock = vi.fn<(text: string) => Promise<boolean>>();

vi.mock("@/lib/email", () => ({
  sendPaymentLink: (args: {
    to: string;
    name: string;
    checkoutUrl: string;
    finalPrice: number;
    features: string[];
  }) => sendPaymentLinkMock(args),
  sendEmail: (args: { to: string; subject: string; html: string }) => sendEmailMock(args),
}));

vi.mock("@/lib/telegram", () => ({
  sendTelegram: (text: string) => sendTelegramMock(text),
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

// Founding 100 cutover — default true (promo active) so all existing tests
// keep their happy-path behaviour. The dedicated cutover describe() flips
// this to false to pin the post-2026-08-31 refusal path.
const isFoundingPromoActiveMock = vi.fn<() => boolean>();
vi.mock("@/lib/founding-promo", () => ({
  isFoundingPromoActive: () => isFoundingPromoActiveMock(),
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
  sendEmailMock.mockReset().mockResolvedValue({ ok: true });
  sendTelegramMock.mockReset().mockResolvedValue(true);
  sessionIdempotencyKeyMock
    .mockReset()
    .mockImplementation((scope, parts) => `bid:${scope}:${parts.join("|")}`);
  isFoundingPromoActiveMock.mockReset().mockReturnValue(true);
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as {
      payload: unknown;
    };
    expect(call.payload).toEqual({});
  });

  it("coerces a null payload to an empty object before persistence", async () => {
    await POST(req({ source: "demo", email: "u@example.com", payload: null }));
    const call = insertMock.mock.calls[0]?.[0] as unknown as {
      payload: unknown;
    };
    expect(call.payload).toEqual({});
  });

  it("coerces a scalar payload (string) to an empty object before persistence", async () => {
    // Only objects/arrays flow through stripHtml — a scalar becomes {}.
    await POST(req({ source: "demo", email: "u@example.com", payload: "junk" }));
    const call = insertMock.mock.calls[0]?.[0] as unknown as {
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as { payload: Record<string, unknown> };
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as {
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as { payload: { tags: string[] } };
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as {
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
    const call = insertMock.mock.calls[0]?.[0] as unknown as { payload: { msg: string } };
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
// Founding 100 cutover (2026-09-01 UTC) — /api/lead must NOT mint a Stripe
// checkout session for founding50 after the promo window closes. Mirrors the
// /api/stripe/checkout 410 guard so a stale /founding-50 page or an old email
// link cannot backdoor a new founding50 subscription after cutover.
// ---------------------------------------------------------------------------

describe("POST /api/lead — founding50 cutover", () => {
  beforeEach(() => {
    isStripeConfiguredMock.mockReturnValue(true);
    getStripeMock.mockReturnValue({
      checkout: { sessions: { create: stripeSessionsCreateMock } },
    });
    stripeSessionsCreateMock.mockResolvedValue({ url: "https://stripe.example/s" });
  });

  it("does NOT touch Stripe once the promo has ended", async () => {
    isFoundingPromoActiveMock.mockReturnValue(false);
    const res = await POST(
      req({ source: "founding50", email: "u@example.com" }),
    );
    expect(res.status).toBe(200);
    expect(stripeSessionsCreateMock).not.toHaveBeenCalled();
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
  });

  it("still writes the lead row post-cutover (waitlist stays open)", async () => {
    isFoundingPromoActiveMock.mockReturnValue(false);
    await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(insertMock).toHaveBeenCalled();
  });

  it("body carries promo_ended=true + a human-readable message post-cutover", async () => {
    isFoundingPromoActiveMock.mockReturnValue(false);
    const res = await POST(
      req({ source: "founding50", email: "u@example.com" }),
    );
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.promo_ended).toBe(true);
    expect(String(body.message)).toMatch(/founding 100/i);
  });

  // G18-A (2026-09-19): the Stripe fork itself is gone — even with the promo
  // flag forced on, /api/lead never mints a Checkout session or a payment
  // link. `STRIPE_PRICE_FOUNDING50` has no consumer left in src/.
  it("never mints a Stripe session for founding50, even with the promo flag forced on", async () => {
    isFoundingPromoActiveMock.mockReturnValue(true);
    const res = await POST(req({ source: "founding50", email: "u@example.com" }));
    expect(res.status).toBe(200);
    expect(stripeSessionsCreateMock).not.toHaveBeenCalled();
    expect(sendPaymentLinkMock).not.toHaveBeenCalled();
    const body = await json(res);
    expect(body).toEqual({ ok: true });
  });
});

// ---------------------------------------------------------------------------
// QA-3 P1-9 (2026-09-12) — honeypot, ?topic=, support alert on contact leads
// ---------------------------------------------------------------------------

describe("QA-3 P1-9 — honeypot", () => {
  it("drops a lead whose hidden company_website field is filled — same 200, nothing persisted, nobody paged", async () => {
    const res = await POST(
      req({ source: "contact", email: "bot@example.com", company_website: "https://spam.example", payload: { message: "buy now" } }),
    );
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
    expect(insertMock).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });

  it("also trips when the honeypot is nested inside payload", async () => {
    await POST(req({ source: "contact", email: "bot@example.com", payload: { company_website: "x", message: "hi" } }));
    expect(insertMock).not.toHaveBeenCalled();
  });

  it("an empty honeypot (what the browser sends for a hidden input) is a real lead and the field is not persisted", async () => {
    await POST(req({ source: "contact", email: "jo@acme.io", company_website: "", payload: { message: "hello", company_website: "" } }));
    expect(insertMock).toHaveBeenCalledTimes(1);
    const row = insertMock.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(row.payload).not.toHaveProperty("company_website");
  });
});

describe("QA-3 P1-9 — contact leads page ops + support inbox, honouring ?topic=", () => {
  it("source=contact → Telegram alert + email to admin@blockid.au with the topic, name, message and IP", async () => {
    const r = new Request("http://x/api/lead", {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.9, 10.0.0.1" },
      body: JSON.stringify({ source: "contact", email: "jo@acme.io", payload: { name: "Jo", message: "Can we see a demo?", topic: "demo" } }),
    });
    const res = await POST(r);
    expect(res.status).toBe(200);
    // Allow the fire-and-forget promises to settle.
    await new Promise((r) => setTimeout(r, 0));

    expect(sendTelegramMock).toHaveBeenCalledTimes(1);
    const tg = sendTelegramMock.mock.calls[0]?.[0] ?? "";
    expect(tg).toContain("Contact form");
    expect(tg).toContain("demo");
    expect(tg).toContain("Jo <jo@acme.io>");
    expect(tg).toContain("203.0.113.9");
    expect(tg).toContain("Can we see a demo?");

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    const mail = sendEmailMock.mock.calls[0]?.[0];
    expect(mail?.to).toBe("admin@blockid.au");
    expect(mail?.subject).toBe("[Contact · demo] Jo");
    expect(mail?.html).toContain("Can we see a demo?");
    expect(mail?.html).toContain("mailto:jo@acme.io");

    // The topic is persisted on the lead row, normalised.
    const row = insertMock.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(row.payload.topic).toBe("demo");
  });

  it("an unknown or missing topic normalises to 'general'", async () => {
    await POST(req({ source: "contact", email: "jo@acme.io", payload: { message: "hi", topic: "<script>x" } }));
    const row = insertMock.mock.calls[0]?.[0] as { payload: Record<string, unknown> };
    expect(row.payload.topic).toBe("general");
    expect(sendEmailMock.mock.calls[0]?.[0]?.subject).toBe("[Contact · general] jo@acme.io");
  });

  it("escapes HTML in the support email body (message is untrusted)", async () => {
    await POST(req({ source: "contact", email: "jo@acme.io", payload: { message: "a & b" } }));
    expect(sendEmailMock.mock.calls[0]?.[0]?.html).toContain("a &amp; b");
  });

  it("non-contact sources (waitlist, demo strip, tools) do not page ops", async () => {
    await POST(req({ source: "cta-strip", email: "jo@acme.io", payload: { message: "hi" } }));
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(sendTelegramMock).not.toHaveBeenCalled();
  });

  it("a Telegram or email failure never breaks the funnel", async () => {
    sendTelegramMock.mockRejectedValue(new Error("tg down"));
    sendEmailMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(req({ source: "contact", email: "jo@acme.io", payload: { message: "hi" } }));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });
});
