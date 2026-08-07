// Colocated vitest for POST /api/auth/login-password — P9-login-password-route-test.
//
// The password login is the surface EVERY brute-force / credential-stuffing
// attempt hits, so both the rate limit (5/IP/15min) and the error-mapping
// (never confirm "email exists but password wrong" separately from "email
// doesn't exist") are load-bearing. A regression that drops the rate limit
// or maps `no_password` to a distinct error would let attackers enumerate
// accounts and their auth methods. The route also sets the session cookie
// via setSessionCookie() — pinned so a refactor to setCookie() couldn't
// silently ship an unauthenticated success response.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  plan: string | null;
}

interface LoginResult {
  ok: boolean;
  reason?: string;
  sessionToken?: string;
  user?: AppUser;
}

const mocks = vi.hoisted(() => ({
  loginWithPasswordMock: vi.fn<(input: {
    email: string;
    password: string;
    ipHash: string;
    userAgent: string | null;
  }) => Promise<LoginResult>>(),
  setSessionCookieMock: vi.fn<(token: string) => Promise<void>>(),
  isValidEmailMock: vi.fn<(email: unknown) => boolean>(),
  checkRateLimitMock: vi.fn<(key: string, max: number, windowMs: number) => {
    allowed: boolean;
    resetIn: number;
  }>(),
  hashIpMock: vi.fn<(ip: string) => string>(),
  clientIpFromHeadersMock: vi.fn<(h: Headers) => string>(),
}));

vi.mock("@/lib/auth", () => ({
  loginWithPassword: (i: Parameters<typeof mocks.loginWithPasswordMock>[0]) =>
    mocks.loginWithPasswordMock(i),
  setSessionCookie: (t: string) => mocks.setSessionCookieMock(t),
  isValidEmail: (e: unknown) => mocks.isValidEmailMock(e),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (k: string, m: number, w: number) => mocks.checkRateLimitMock(k, m, w),
}));

vi.mock("@/lib/iphash", () => ({
  hashIp: (ip: string) => mocks.hashIpMock(ip),
  clientIpFromHeaders: (h: Headers) => mocks.clientIpFromHeadersMock(h),
}));

// Route import MUST come after mocks are registered.
import { POST, dynamic } from "./route";

const USER: AppUser = {
  id: "u1",
  email: "founder@example.com",
  displayName: "Fran",
  role: "user",
  plan: "growth",
};

function req(body: unknown, opts?: { badJson?: boolean; ip?: string; ua?: string }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.ip) headers["x-forwarded-for"] = opts.ip;
  if (opts?.ua) headers["user-agent"] = opts.ua;
  return new Request("http://x/api/auth/login-password", {
    method: "POST",
    headers,
    body: opts?.badJson ? "{bad json" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.loginWithPasswordMock.mockReset().mockResolvedValue({
    ok: true,
    sessionToken: "sess_xyz",
    user: USER,
  });
  mocks.setSessionCookieMock.mockReset().mockResolvedValue(undefined);
  mocks.isValidEmailMock.mockReset().mockReturnValue(true);
  mocks.checkRateLimitMock.mockReset().mockReturnValue({ allowed: true, resetIn: 0 });
  mocks.hashIpMock.mockReset().mockReturnValue("iphash_1");
  mocks.clientIpFromHeadersMock.mockReset().mockReturnValue("1.2.3.4");
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — module invariants", () => {
  it("exports dynamic='force-dynamic' so login attempts are never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Rate limit — must be the outermost gate
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — rate limit", () => {
  it("returns 429 when checkRateLimit denies", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 30_000 });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.ok).toBe(false);
    expect(String(body.error)).toMatch(/too many/i);
  });

  it("sets Retry-After header (seconds) on the 429", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 45_000 });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.headers.get("Retry-After")).toBe("45");
  });

  it("sets X-RateLimit-Remaining=0 on the 429", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
  });

  it("MUST NOT call loginWithPassword when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    await POST(req({ email: "a@b.co", password: "pw" }));
    expect(mocks.loginWithPasswordMock).not.toHaveBeenCalled();
  });

  it("MUST NOT set a session cookie when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    await POST(req({ email: "a@b.co", password: "pw" }));
    expect(mocks.setSessionCookieMock).not.toHaveBeenCalled();
  });

  it("keys the rate limit by client IP (first x-forwarded-for)", async () => {
    await POST(req({ email: "a@b.co", password: "pw" }, { ip: "9.9.9.9, 1.1.1.1" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledWith(
      "login:9.9.9.9",
      5,
      15 * 60 * 1000,
    );
  });

  it("keys the rate limit by 'unknown' when x-forwarded-for is missing", async () => {
    await POST(req({ email: "a@b.co", password: "pw" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledWith(
      "login:unknown",
      5,
      15 * 60 * 1000,
    );
  });

  it("uses max=5 attempts / 15-minute window (D3-CISO bruteforce cap)", async () => {
    await POST(req({ email: "a@b.co", password: "pw" }));
    const call = mocks.checkRateLimitMock.mock.calls[0];
    expect(call?.[1]).toBe(5);
    expect(call?.[2]).toBe(15 * 60 * 1000);
  });
});

// -----------------------------------------------------------------------------
// Body parsing (400)
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — body parsing", () => {
  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid request body");
  });

  it("returns 400 when email fails isValidEmail", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(req({ email: "not-an-email", password: "pw" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Valid email is required");
  });

  it("returns 400 when password is missing", async () => {
    const res = await POST(req({ email: "a@b.co" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Password is required");
  });

  it("returns 400 when password is a number", async () => {
    const res = await POST(req({ email: "a@b.co", password: 12345 }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when password is empty string", async () => {
    const res = await POST(req({ email: "a@b.co", password: "" }));
    expect(res.status).toBe(400);
  });

  it("does not call loginWithPassword when body validation fails", async () => {
    await POST(req({ email: "a@b.co" }));
    expect(mocks.loginWithPasswordMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// loginWithPassword failure reason mapping
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — failure reason mapping", () => {
  it("maps no_password to a 401 with 'Google or magic link' hint", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({ ok: false, reason: "no_password" });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(String(body.error)).toMatch(/google or magic link/i);
    expect(body.reason).toBe("no_password");
  });

  it("maps invalid_credentials to 401 with generic 'Invalid email or password' (no enumeration)", async () => {
    // Critical anti-enumeration pin: a user-not-found and a wrong-password
    // MUST NOT be distinguishable, otherwise attackers can enumerate accounts.
    mocks.loginWithPasswordMock.mockResolvedValue({
      ok: false,
      reason: "invalid_credentials",
    });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Invalid email or password");
  });

  it("maps not_configured to 'Authentication service unavailable'", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({ ok: false, reason: "not_configured" });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    expect(res.status).toBe(401);
    const body = await json(res);
    expect(body.error).toBe("Authentication service unavailable");
  });

  it("maps db_error to a retryable message", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({ ok: false, reason: "db_error" });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    const body = await json(res);
    expect(String(body.error)).toMatch(/database error/i);
    expect(String(body.error)).toMatch(/try again/i);
  });

  it("maps an unknown reason to 'Login failed (<reason>)'", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({ ok: false, reason: "cosmic_ray" });
    const res = await POST(req({ email: "a@b.co", password: "pw" }));
    const body = await json(res);
    expect(String(body.error)).toContain("Login failed");
    expect(String(body.error)).toContain("cosmic_ray");
  });

  it("MUST NOT set a session cookie on a failed login", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({
      ok: false,
      reason: "invalid_credentials",
    });
    await POST(req({ email: "a@b.co", password: "pw" }));
    expect(mocks.setSessionCookieMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — happy path", () => {
  it("returns 200 with the user identity payload on success", async () => {
    const res = await POST(req({ email: USER.email, password: "pw" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.user).toEqual({
      id: USER.id,
      email: USER.email,
      displayName: USER.displayName,
      role: USER.role,
      plan: USER.plan,
    });
  });

  it("calls setSessionCookie with the loginWithPassword-returned token", async () => {
    mocks.loginWithPasswordMock.mockResolvedValue({
      ok: true,
      sessionToken: "sess_specific_token_42",
      user: USER,
    });
    await POST(req({ email: USER.email, password: "pw" }));
    expect(mocks.setSessionCookieMock).toHaveBeenCalledWith("sess_specific_token_42");
  });

  it("passes ipHash + userAgent through to loginWithPassword (audit trail)", async () => {
    await POST(req({ email: USER.email, password: "pw" }, { ip: "5.5.5.5", ua: "TestUA/1" }));
    const call = mocks.loginWithPasswordMock.mock.calls[0]?.[0];
    expect(call?.ipHash).toBe("iphash_1");
    expect(call?.userAgent).toBe("TestUA/1");
  });

  it("passes null userAgent through when the header is missing", async () => {
    await POST(req({ email: USER.email, password: "pw" }));
    const call = mocks.loginWithPasswordMock.mock.calls[0]?.[0];
    expect(call?.userAgent).toBeNull();
  });

  it("passes the raw password (no trim, no case-fold) to loginWithPassword", async () => {
    await POST(req({ email: USER.email, password: "  MyPw!  " }));
    const call = mocks.loginWithPasswordMock.mock.calls[0]?.[0];
    expect(call?.password).toBe("  MyPw!  ");
  });

  it("passes the email through as provided (loginWithPassword itself normalises)", async () => {
    await POST(req({ email: "Founder@Example.COM", password: "pw" }));
    const call = mocks.loginWithPasswordMock.mock.calls[0]?.[0];
    expect(call?.email).toBe("Founder@Example.COM");
  });
});

// -----------------------------------------------------------------------------
// Exception path (500)
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — exception path", () => {
  it("returns 500 when loginWithPassword throws unexpectedly", async () => {
    mocks.loginWithPasswordMock.mockRejectedValue(new Error("db pool timeout"));
    const res = await POST(req({ email: USER.email, password: "pw" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Internal server error");
  });

  it("does not leak the underlying error message on 500", async () => {
    mocks.loginWithPasswordMock.mockRejectedValue(
      new Error("bcrypt row founder@example.com not found"),
    );
    const res = await POST(req({ email: USER.email, password: "pw" }));
    const body = await json(res);
    expect(String(body.error)).not.toContain("bcrypt");
    expect(String(body.error)).not.toContain("founder@example.com");
  });

  it("returns 500 when setSessionCookie throws (post-login)", async () => {
    mocks.setSessionCookieMock.mockRejectedValue(new Error("cookie store closed"));
    const res = await POST(req({ email: USER.email, password: "pw" }));
    expect(res.status).toBe(500);
  });
});

// -----------------------------------------------------------------------------
// Gate precedence — rate-limit > body parse > shape validation > loginWithPassword
// -----------------------------------------------------------------------------

describe("POST /api/auth/login-password — gate precedence", () => {
  it("rate-limit (429) fires BEFORE body parse (400)", async () => {
    // Anti-enumeration: an attacker probing malformed bodies should still hit
    // 429 rather than learning "your body was parseable" via a distinct 400.
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(429);
  });

  it("body parse (400) fires BEFORE email validation (400)", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    const body = await json(res);
    expect(body.error).toBe("Invalid request body");
  });

  it("email validation (400) fires BEFORE password check (400)", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(req({ email: "bad", password: "" }));
    const body = await json(res);
    expect(body.error).toBe("Valid email is required");
  });

  it("password check (400) fires BEFORE loginWithPassword call", async () => {
    const res = await POST(req({ email: "a@b.co" }));
    expect(res.status).toBe(400);
    expect(mocks.loginWithPasswordMock).not.toHaveBeenCalled();
  });
});
