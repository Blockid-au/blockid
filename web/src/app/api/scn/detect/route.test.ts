// Colocated vitest for POST /api/scn/detect — P9-scn-detect-route-test.
//
// The route is the front door of the SCN (Startup → Cofounder → Navigator)
// model. A founder submits a free-text idea / website / GitHub repo / revenue
// number; the route enforces a 20-per-minute rate limit keyed on user.id
// (falling back to x-forwarded-for or "anon"), guards the JSON body, requires
// at least one of the four inputs, and hands the payload to the pure
// `buildScnContext` engine along with the module-level network deps
// (fetchUrl + auditRepo). Silent regressions this pins against:
//
//   - dropping the `getCurrentUser().catch(() => null)` and letting an
//     un-configured Supabase env 500 the anon caller (SCN is intentionally
//     usable pre-login — no logged-in requirement);
//   - dropping the `x-forwarded-for` fallback in the rate-limit key so every
//     anon caller shares a single "scn-detect:anon" bucket (one anon user
//     locks everyone out for 60s);
//   - dropping the `"anon"` last-resort in the rate-limit key so a
//     Cloudflare-less local dev hit crashes on undefined-as-key;
//   - loosening the `20 / 60_000` rate-limit tuple (the SCN engine calls
//     multiple upstreams per hit — a laxer limit exhausts the OpenAI quota);
//   - flipping the `try/catch` on `request.json()` so a malformed body 500s
//     the front door instead of 400ing with "Invalid JSON";
//   - dropping the `!body.text && !body.websiteUrl && !body.githubUrl &&
//     !body.mrrAud` guard so a founder who submits `{}` triggers a full
//     valuation report on empty signals (garbage-in valuation);
//   - dropping the 500 wrapper on `buildScnContext` so a fetchUrl timeout
//     bubbles as an unhandled rejection instead of a founder-facing message;
//   - dropping the `err instanceof Error` narrowing so a non-Error throw
//     surfaces `"[object Object]"` instead of "Detection failed";
//   - dropping the `dynamic = "force-dynamic"` export and letting Next
//     prerender the SCN front door;
//   - dropping the `maxDuration = 30` cap and letting the fetchUrl on a
//     slow founder-supplied URL blow the default Vercel 10s ceiling.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// --- Mocks (registered BEFORE the route import) ---------------------------

const getCurrentUserMock = vi.fn<() => Promise<{ id: string; email: string } | null>>();
vi.mock("@/lib/auth", () => ({
  getCurrentUser: () => getCurrentUserMock(),
}));

interface RateLimitResult { allowed: boolean; remaining: number; resetIn: number }
const checkRateLimitMock = vi.fn<(key: string, max: number, windowMs: number) => RateLimitResult>();
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (key: string, max: number, windowMs: number) =>
    checkRateLimitMock(key, max, windowMs),
}));

const buildScnContextMock = vi.fn<(input: unknown, deps: unknown) => Promise<unknown>>();
vi.mock("@/lib/scn-detect", () => ({
  buildScnContext: (input: unknown, deps: unknown) => buildScnContextMock(input, deps),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic, maxDuration } from "./route";

function postReq(
  body: unknown,
  opts: { rawBody?: string; headers?: Record<string, string> } = {},
): Request {
  return new Request("http://localhost/api/scn/detect", {
    method: "POST",
    headers: { "content-type": "application/json", ...(opts.headers ?? {}) },
    body: opts.rawBody ?? JSON.stringify(body ?? {}),
  });
}

function allowedResult(): RateLimitResult {
  return { allowed: true, remaining: 19, resetIn: 60_000 };
}

beforeEach(() => {
  getCurrentUserMock.mockReset();
  checkRateLimitMock.mockReset();
  buildScnContextMock.mockReset();
  getCurrentUserMock.mockResolvedValue(null);
  checkRateLimitMock.mockReturnValue(allowedResult());
  buildScnContextMock.mockResolvedValue({ inputType: "idea", stage: 0 });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Tests ----------------------------------------------------------------

describe("/api/scn/detect — module surface", () => {
  it('exports dynamic = "force-dynamic" so the SCN front door is never prerendered', () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("exports maxDuration = 30 so slow founder-supplied URLs cannot blow the Vercel default", () => {
    expect(maxDuration).toBe(30);
  });
});

describe("POST — rate-limit key composition", () => {
  it("keys on the authed user.id when getCurrentUser resolves a user", async () => {
    getCurrentUserMock.mockResolvedValue({ id: "user-42", email: "f@x.com" });
    await POST(postReq({ text: "an idea" }));
    expect(checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(checkRateLimitMock.mock.calls[0][0]).toBe("scn-detect:user-42");
  });

  it("falls back to x-forwarded-for when the caller is anon", async () => {
    await POST(
      postReq({ text: "an idea" }, { headers: { "x-forwarded-for": "203.0.113.7" } }),
    );
    expect(checkRateLimitMock.mock.calls[0][0]).toBe("scn-detect:203.0.113.7");
  });

  it('falls back to "anon" when there is no user and no x-forwarded-for header', async () => {
    await POST(postReq({ text: "an idea" }));
    expect(checkRateLimitMock.mock.calls[0][0]).toBe("scn-detect:anon");
  });

  it("uses 20 attempts per 60_000ms — the SCN engine calls upstreams per hit so the limit cannot loosen", async () => {
    await POST(postReq({ text: "an idea" }));
    expect(checkRateLimitMock.mock.calls[0][1]).toBe(20);
    expect(checkRateLimitMock.mock.calls[0][2]).toBe(60_000);
  });

  it("does NOT throw when getCurrentUser rejects (SCN is intentionally usable pre-login)", async () => {
    getCurrentUserMock.mockRejectedValue(new Error("session_broken"));
    const res = await POST(
      postReq({ text: "an idea" }, { headers: { "x-forwarded-for": "1.2.3.4" } }),
    );
    expect(res.status).toBe(200);
    expect(checkRateLimitMock.mock.calls[0][0]).toBe("scn-detect:1.2.3.4");
  });
});

describe("POST — rate-limit denial", () => {
  it("returns 429 with retryAfter reflecting rl.resetIn and never invokes buildScnContext", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 42_000 });
    const res = await POST(postReq({ text: "an idea" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({
      ok: false,
      error: "Rate limited",
      retryAfter: 42_000,
    });
    expect(buildScnContextMock).not.toHaveBeenCalled();
  });

  it("rate-limit denial short-circuits before request.json() is parsed", async () => {
    checkRateLimitMock.mockReturnValue({ allowed: false, remaining: 0, resetIn: 5000 });
    const req = postReq(undefined, { rawBody: "{not-json" });
    const res = await POST(req);
    expect(res.status).toBe(429);
    expect(buildScnContextMock).not.toHaveBeenCalled();
  });
});

describe("POST — body-parse + input guards", () => {
  it("returns 400 { Invalid JSON } on an unparseable body and never invokes buildScnContext", async () => {
    const res = await POST(postReq(undefined, { rawBody: "{not-json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ ok: false, error: "Invalid JSON" });
    expect(buildScnContextMock).not.toHaveBeenCalled();
  });

  it("returns 400 with the enumerated field hint when all four inputs are missing", async () => {
    const res = await POST(postReq({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.error).toMatch(/text/);
    expect(body.error).toMatch(/websiteUrl/);
    expect(body.error).toMatch(/githubUrl/);
    expect(body.error).toMatch(/mrrAud/);
    expect(buildScnContextMock).not.toHaveBeenCalled();
  });

  it("falsy inputs (empty string, 0) still trigger the missing-input guard", async () => {
    const res = await POST(
      postReq({ text: "", websiteUrl: "", githubUrl: "", mrrAud: 0 }),
    );
    expect(res.status).toBe(400);
    expect(buildScnContextMock).not.toHaveBeenCalled();
  });
});

describe("POST — happy path input branches", () => {
  it("accepts text-only input, forwards it verbatim, and returns { ok:true, context }", async () => {
    const ctx = { inputType: "idea", stage: 1, stageLabel: "ideation" };
    buildScnContextMock.mockResolvedValue(ctx);
    const res = await POST(postReq({ text: "we make widgets" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, context: ctx });
    expect(buildScnContextMock).toHaveBeenCalledTimes(1);
    expect(buildScnContextMock.mock.calls[0][0]).toEqual({ text: "we make widgets" });
  });

  it("accepts websiteUrl-only input", async () => {
    const res = await POST(postReq({ websiteUrl: "https://example.com" }));
    expect(res.status).toBe(200);
    expect(buildScnContextMock.mock.calls[0][0]).toEqual({
      websiteUrl: "https://example.com",
    });
  });

  it("accepts githubUrl-only input", async () => {
    const res = await POST(postReq({ githubUrl: "https://github.com/foo/bar" }));
    expect(res.status).toBe(200);
    expect(buildScnContextMock.mock.calls[0][0]).toEqual({
      githubUrl: "https://github.com/foo/bar",
    });
  });

  it("accepts mrrAud-only input (a numeric revenue signal is enough on its own)", async () => {
    const res = await POST(postReq({ mrrAud: 12500 }));
    expect(res.status).toBe(200);
    expect(buildScnContextMock.mock.calls[0][0]).toEqual({ mrrAud: 12500 });
  });

  it("forwards optional sector + monthlyGrowthRatePct alongside the primary signals", async () => {
    const payload = {
      text: "an idea",
      sector: "fintech",
      monthlyGrowthRatePct: 12,
    };
    await POST(postReq(payload));
    expect(buildScnContextMock.mock.calls[0][0]).toEqual(payload);
  });
});

describe("POST — deps wiring", () => {
  it("passes deps with fetchUrl + auditRepo function references (the network adapters live in-route)", async () => {
    await POST(postReq({ text: "an idea" }));
    const deps = buildScnContextMock.mock.calls[0][1] as {
      fetchUrl: unknown;
      auditRepo: unknown;
    };
    expect(typeof deps.fetchUrl).toBe("function");
    expect(typeof deps.auditRepo).toBe("function");
  });
});

describe("POST — buildScnContext error envelope", () => {
  it("returns 500 with the underlying Error message when buildScnContext throws an Error", async () => {
    buildScnContextMock.mockRejectedValue(new Error("upstream timeout"));
    const res = await POST(postReq({ text: "an idea" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "upstream timeout" });
  });

  it('returns 500 with "Detection failed" fallback when buildScnContext throws a non-Error', async () => {
    buildScnContextMock.mockRejectedValue("string-not-error");
    const res = await POST(postReq({ text: "an idea" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "Detection failed" });
  });

  it("returns the context payload verbatim on success — no wrapping or renaming", async () => {
    const ctx = {
      inputType: "mixed",
      stage: 3,
      stageLabel: "traction",
      evidence: ["signal-a", "signal-b"],
      valuation: { low: 100, mid: 200, high: 300 },
    };
    buildScnContextMock.mockResolvedValue(ctx);
    const res = await POST(postReq({ text: "idea", mrrAud: 1000 }));
    const body = await res.json();
    expect(body).toEqual({ ok: true, context: ctx });
    expect(Object.keys(body).sort()).toEqual(["context", "ok"]);
  });
});
