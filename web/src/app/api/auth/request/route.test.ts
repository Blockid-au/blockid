// Colocated vitest for POST /api/auth/request — P9-auth-request-route-test.
//
// This is the magic-link request endpoint. Two security invariants dominate
// every behaviour here: (1) NEVER confirm or deny whether an email has an
// account (always returns ok:true for well-formed input); (2) NEVER let
// requestMagicLink() throw an error that leaks account state to the caller.
// Together they make account enumeration impossible via this surface. The
// route also honours a `next` redirect that MUST be a same-origin path
// (starts with "/") — pinning that stops an open-redirect vulnerability
// where a magic-link URL sends the user to attacker.com after auth.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  isValidEmailMock: vi.fn<(email: unknown) => boolean>(),
  normaliseEmailMock: vi.fn<(email: string) => string>(),
  requestMagicLinkMock: vi.fn<(input: {
    email: string;
    intent: "login" | "save_founder_pack";
    pendingPayload?: Record<string, unknown>;
    ipHash: string;
  }) => Promise<{ ok: true; token: string } | { ok: false; reason: string; token: string }>>(),
  sendMagicLinkMock: vi.fn<(input: {
    to: string;
    token: string;
    intent: string;
    ttlMinutes: number;
  }) => Promise<void>>(),
  hashIpMock: vi.fn<(ip: string) => string>(),
  clientIpFromHeadersMock: vi.fn<(h: Headers) => string>(),
  enforceRateLimitMock: vi.fn<(
    kind: string,
    key: string,
    request: Request,
    max: number,
    windowMs: number,
  ) => Response | null>(),
}));

vi.mock("@/lib/auth", () => ({
  isValidEmail: (e: unknown) => mocks.isValidEmailMock(e),
  normaliseEmail: (e: string) => mocks.normaliseEmailMock(e),
  requestMagicLink: (i: Parameters<typeof mocks.requestMagicLinkMock>[0]) =>
    mocks.requestMagicLinkMock(i),
  MAGIC_LINK_TTL_MIN: 15,
}));

vi.mock("@/lib/email", () => ({
  sendMagicLink: (i: Parameters<typeof mocks.sendMagicLinkMock>[0]) =>
    mocks.sendMagicLinkMock(i),
}));

vi.mock("@/lib/iphash", () => ({
  hashIp: (ip: string) => mocks.hashIpMock(ip),
  clientIpFromHeaders: (h: Headers) => mocks.clientIpFromHeadersMock(h),
}));

vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (
    kind: string,
    key: string,
    request: Request,
    max: number,
    windowMs: number,
  ) => mocks.enforceRateLimitMock(kind, key, request, max, windowMs),
}));

import { POST, dynamic } from "./route";

function req(body: unknown, opts?: { badJson?: boolean }): Request {
  return new Request("http://x/api/auth/request", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.isValidEmailMock.mockReset().mockReturnValue(true);
  mocks.normaliseEmailMock.mockReset().mockImplementation((e: string) => e.toLowerCase().trim());
  mocks.requestMagicLinkMock.mockReset().mockResolvedValue({
    ok: true,
    token: "tok_1",
  });
  mocks.sendMagicLinkMock.mockReset().mockResolvedValue(undefined);
  mocks.hashIpMock.mockReset().mockReturnValue("hash_x");
  mocks.clientIpFromHeadersMock.mockReset().mockReturnValue("1.1.1.1");
  mocks.enforceRateLimitMock.mockReset().mockReturnValue(null);
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — module invariants", () => {
  it("exports dynamic='force-dynamic'", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Body parsing (400)
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — body parsing", () => {
  it("returns 400 on invalid JSON", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid JSON body");
  });

  it("returns 400 when email fails isValidEmail", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(req({ email: "not-an-email" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Valid email is required");
  });

  it("MUST NOT call requestMagicLink on a body-parse failure", async () => {
    await POST(req(undefined, { badJson: true }));
    expect(mocks.requestMagicLinkMock).not.toHaveBeenCalled();
  });

  it("MUST NOT call requestMagicLink on an invalid email", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    await POST(req({ email: "nope" }));
    expect(mocks.requestMagicLinkMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Rate limit — MUST fire before requestMagicLink
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — rate limit", () => {
  it("returns the enforceRateLimit response verbatim when limited", async () => {
    const throttled = new Response(
      JSON.stringify({ ok: false, error: "throttled" }),
      { status: 429 },
    );
    mocks.enforceRateLimitMock.mockReturnValue(throttled);
    const res = await POST(req({ email: "a@b.co" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.error).toBe("throttled");
  });

  it("keys the rate limit by email + kind='magic-link'", async () => {
    await POST(req({ email: "a@b.co" }));
    const call = mocks.enforceRateLimitMock.mock.calls[0];
    expect(call?.[0]).toBe("magic-link");
    expect(call?.[1]).toBe("a@b.co");
    expect(call?.[3]).toBe(5); // max
    expect(call?.[4]).toBe(15 * 60 * 1000); // window
  });

  it("MUST NOT call requestMagicLink when rate-limited", async () => {
    const throttled = new Response("{}", { status: 429 });
    mocks.enforceRateLimitMock.mockReturnValue(throttled);
    await POST(req({ email: "a@b.co" }));
    expect(mocks.requestMagicLinkMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Anti-enumeration — always ok:true on well-formed input
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — anti-enumeration", () => {
  it("returns ok:true even when requestMagicLink itself failed (not_configured)", async () => {
    // Critical anti-enum pin: the caller MUST NOT learn Supabase is missing.
    mocks.requestMagicLinkMock.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      token: "tok_dev",
    });
    const res = await POST(req({ email: "a@b.co" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body).toEqual({ ok: true, ttlMinutes: 15 });
  });

  it("returns ok:true when requestMagicLink returns any other failure reason", async () => {
    mocks.requestMagicLinkMock.mockResolvedValue({
      ok: false,
      reason: "unknown_reason",
      token: "tok_x",
    });
    const res = await POST(req({ email: "a@b.co" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
  });

  it("body shape stays {ok, ttlMinutes} on every 200 (no extra leaked fields)", async () => {
    const res = await POST(req({ email: "a@b.co" }));
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "ttlMinutes"]);
  });

  it("body shape stays {ok, ttlMinutes} even on the failure branch", async () => {
    mocks.requestMagicLinkMock.mockResolvedValue({
      ok: false,
      reason: "db_error",
      token: "tok_z",
    });
    const res = await POST(req({ email: "a@b.co" }));
    const body = await json(res);
    expect(Object.keys(body).sort()).toEqual(["ok", "ttlMinutes"]);
  });
});

// -----------------------------------------------------------------------------
// Intent whitelist
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — intent", () => {
  it("defaults to intent='save_founder_pack' when omitted", async () => {
    await POST(req({ email: "a@b.co" }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.intent).toBe("save_founder_pack");
  });

  it("accepts intent='login'", async () => {
    await POST(req({ email: "a@b.co", intent: "login" }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.intent).toBe("login");
  });

  it("silently coerces any unknown intent to 'save_founder_pack'", async () => {
    // Pin whitelist behaviour — a refactor that lets arbitrary strings through
    // would let a client force `intent: "admin_promote"` on the magic-link row.
    await POST(req({ email: "a@b.co", intent: "admin_promote" }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.intent).toBe("save_founder_pack");
  });
});

// -----------------------------------------------------------------------------
// `next` open-redirect guard
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — next redirect guard", () => {
  it("passes a same-origin next path through to pendingPayload", async () => {
    await POST(req({ email: "a@b.co", next: "/workspace/dashboard" }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.pendingPayload).toMatchObject({ next: "/workspace/dashboard" });
  });

  it("REJECTS a next that does not start with '/' (open-redirect guard)", async () => {
    // Critical: an attacker who owns a landing page could set next=https://evil
    // and steal the post-login session. Pin the "/" gate.
    await POST(req({ email: "a@b.co", next: "https://evil.example/steal" }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.pendingPayload?.next).toBeUndefined();
  });

  it("REJECTS a next that is not a string", async () => {
    await POST(req({ email: "a@b.co", next: { url: "/x" } }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.pendingPayload?.next).toBeUndefined();
  });

  it("merges next INTO an existing pendingPayload (both keys survive)", async () => {
    await POST(req({
      email: "a@b.co",
      next: "/workspace/x",
      pendingPayload: { flow: "onboarding" },
    }));
    const call = mocks.requestMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.pendingPayload).toMatchObject({
      flow: "onboarding",
      next: "/workspace/x",
    });
  });
});

// -----------------------------------------------------------------------------
// Email side-effect
// -----------------------------------------------------------------------------

describe("POST /api/auth/request — email side-effect", () => {
  it("fires sendMagicLink on requestMagicLink.ok=true", async () => {
    // Fire-and-forget — the route does not await it, so give it a tick.
    mocks.requestMagicLinkMock.mockResolvedValue({ ok: true, token: "tok_send" });
    await POST(req({ email: "a@b.co" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendMagicLinkMock).toHaveBeenCalledTimes(1);
    const call = mocks.sendMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.to).toBe("a@b.co");
    expect(call?.token).toBe("tok_send");
    expect(call?.ttlMinutes).toBe(15);
  });

  it("MUST NOT call sendMagicLink on requestMagicLink.ok=false", async () => {
    mocks.requestMagicLinkMock.mockResolvedValue({
      ok: false,
      reason: "not_configured",
      token: "tok_dev",
    });
    await POST(req({ email: "a@b.co" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(mocks.sendMagicLinkMock).not.toHaveBeenCalled();
  });

  it("normalises the email before passing to sendMagicLink", async () => {
    mocks.normaliseEmailMock.mockImplementation((e: string) => e.toLowerCase().trim());
    await POST(req({ email: "  A@B.CO  " }));
    await new Promise((r) => setTimeout(r, 0));
    const call = mocks.sendMagicLinkMock.mock.calls[0]?.[0];
    expect(call?.to).toBe("a@b.co");
  });
});
