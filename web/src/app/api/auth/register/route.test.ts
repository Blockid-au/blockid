// Colocated vitest for POST /api/auth/register — P9-register-route-test.
//
// The registration surface has three security-critical gates that MUST NEVER
// regress: (1) IP-scoped rate limit (3 signups per IP per 15 min) so a bot
// can't drain the app_users id space; (2) HTML-tag stripping on displayName
// so a founder can't seed stored XSS by registering with
// "<script>fetch(...)</script>" as their name; (3) email_taken → 409 (not
// 200, not 400) so client can trigger the "log in instead" CTA reliably.
//
// Regressions this suite is designed to catch:
//   - dropping sanitizeName() would let stored XSS reach every rendered
//     display-name surface (dashboard, /admin/users, invoice-to);
//   - collapsing email_taken and weak_password into a single 400 would
//     silently break the "existing account? log in →" UX;
//   - loosening the 8-char password guard (or moving it below the auth
//     library call) would let 6-char passwords through if registerWithPassword
//     itself ever drops the check;
//   - moving setSessionCookie() before the ok:true return would leak a
//     session cookie on a failed registration.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface AppUser {
  id: string;
  email: string;
  displayName: string | null;
  role: string;
  plan: string | null;
}

interface RegisterResult {
  ok: boolean;
  reason?: string;
  sessionToken?: string;
  user?: AppUser;
}

const mocks = vi.hoisted(() => ({
  registerMock: vi.fn<(input: {
    email: string;
    password: string;
    displayName?: string;
    ipHash: string;
    userAgent: string | null;
  }) => Promise<RegisterResult>>(),
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
  registerWithPassword: (i: Parameters<typeof mocks.registerMock>[0]) => mocks.registerMock(i),
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
  email: "new@example.com",
  displayName: "Fran",
  role: "user",
  plan: "free",
};

function req(body: unknown, opts?: { badJson?: boolean; ip?: string; ua?: string }): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts?.ip) headers["x-forwarded-for"] = opts.ip;
  if (opts?.ua) headers["user-agent"] = opts.ua;
  return new Request("http://x/api/auth/register", {
    method: "POST",
    headers,
    body: opts?.badJson ? "{bad" : JSON.stringify(body),
  });
}

async function json(res: Response): Promise<Record<string, unknown>> {
  return (await res.json()) as Record<string, unknown>;
}

beforeEach(() => {
  mocks.registerMock.mockReset().mockResolvedValue({
    ok: true,
    sessionToken: "sess_new",
    user: USER,
  });
  mocks.setSessionCookieMock.mockReset().mockResolvedValue(undefined);
  mocks.isValidEmailMock.mockReset().mockReturnValue(true);
  mocks.checkRateLimitMock.mockReset().mockReturnValue({ allowed: true, resetIn: 0 });
  mocks.hashIpMock.mockReset().mockReturnValue("hash_x");
  mocks.clientIpFromHeadersMock.mockReset().mockReturnValue("1.1.1.1");
});

afterEach(() => {
  vi.clearAllMocks();
});

// -----------------------------------------------------------------------------
// Module invariants
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — module invariants", () => {
  it("exports dynamic='force-dynamic' so signup responses are never cached", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

// -----------------------------------------------------------------------------
// Rate limit (429) — outermost gate
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — rate limit", () => {
  it("returns 429 when checkRateLimit denies", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 60_000 });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(String(body.error)).toMatch(/too many/i);
  });

  it("sets Retry-After header (seconds) on the 429", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 90_000 });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.headers.get("Retry-After")).toBe("90");
  });

  it("uses max=3 attempts per 15-min window (tighter than login)", async () => {
    await POST(req({ email: "a@b.co", password: "longenough" }));
    const call = mocks.checkRateLimitMock.mock.calls[0];
    expect(call?.[1]).toBe(3);
    expect(call?.[2]).toBe(15 * 60 * 1000);
  });

  it("keys the rate limit by client IP", async () => {
    await POST(req({ email: "a@b.co", password: "longenough" }, { ip: "8.8.8.8" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledWith(
      "register:8.8.8.8",
      3,
      15 * 60 * 1000,
    );
  });

  it("MUST NOT call registerWithPassword when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.registerMock).not.toHaveBeenCalled();
  });

  it("MUST NOT set a session cookie when rate-limited", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.setSessionCookieMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Body parsing (400)
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — body parsing", () => {
  it("returns 400 on invalid JSON body", async () => {
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Invalid request body");
  });

  it("returns 400 when email fails isValidEmail", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(req({ email: "x", password: "longenough" }));
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
    const res = await POST(req({ email: "a@b.co", password: 12345678 }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Password is required");
  });

  it("returns 400 'Password must be at least 8 characters' for a 7-char password", async () => {
    const res = await POST(req({ email: "a@b.co", password: "1234567" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Password must be at least 8 characters");
  });

  it("accepts exactly 8 characters (boundary pin)", async () => {
    await POST(req({ email: "a@b.co", password: "12345678" }));
    expect(mocks.registerMock).toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// displayName XSS sanitisation
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — displayName sanitisation", () => {
  it("strips HTML tags from displayName before passing to registerWithPassword", async () => {
    // Critical security pin: a founder must not be able to seed stored XSS
    // via their profile name — the tag stripper is the ONLY defense here.
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: "<script>alert(1)</script>Fran",
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBe("alert(1)Fran");
  });

  it("strips <img onerror> payloads too", async () => {
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: "F<img src=x onerror=alert(1)>ran",
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBe("Fran");
  });

  it("trims whitespace on displayName", async () => {
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: "  Fran Founder  ",
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBe("Fran Founder");
  });

  it("caps displayName at 100 characters", async () => {
    const raw = "F".repeat(500);
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: raw,
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName?.length).toBe(100);
  });

  it("passes displayName=undefined when field is missing", async () => {
    await POST(req({ email: "a@b.co", password: "longenough" }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBeUndefined();
  });

  it("passes displayName=undefined when field is a number", async () => {
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: 42,
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBeUndefined();
  });

  it("passes displayName=undefined for empty-string after trim (whitespace only)", async () => {
    await POST(req({
      email: "a@b.co",
      password: "longenough",
      displayName: "     ",
    }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.displayName).toBeUndefined();
  });
});

// -----------------------------------------------------------------------------
// registerWithPassword failure mapping
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — failure mapping", () => {
  it("maps email_taken to 409 (conflict) with a login-hint message", async () => {
    // 409 is what enables the client's "already have an account? log in →"
    // CTA — a refactor to 400 would silently break the sign-up funnel.
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(409);
    const body = await json(res);
    expect(String(body.error)).toMatch(/already exists/i);
    expect(String(body.error)).toMatch(/log(ging)? in/i);
  });

  it("maps weak_password to 400", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "weak_password" });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(String(body.error)).toMatch(/8 characters/i);
  });

  it("maps unknown reason to a generic 400 'Registration failed'", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "unexpected" });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(400);
    const body = await json(res);
    expect(body.error).toBe("Registration failed");
  });

  it("MUST NOT set a session cookie when registration fails", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.setSessionCookieMock).not.toHaveBeenCalled();
  });
});

// -----------------------------------------------------------------------------
// Happy path
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — happy path", () => {
  it("returns 200 with the user identity payload", async () => {
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
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

  it("sets the session cookie with the returned token", async () => {
    mocks.registerMock.mockResolvedValue({
      ok: true,
      sessionToken: "sess_freshly_signed",
      user: USER,
    });
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.setSessionCookieMock).toHaveBeenCalledWith("sess_freshly_signed");
  });

  it("passes ipHash + userAgent through for the audit trail", async () => {
    await POST(req({ email: "a@b.co", password: "longenough" }, { ua: "TestUA/1" }));
    const call = mocks.registerMock.mock.calls[0]?.[0];
    expect(call?.ipHash).toBe("hash_x");
    expect(call?.userAgent).toBe("TestUA/1");
  });
});

// -----------------------------------------------------------------------------
// Exception path (500)
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — exception path", () => {
  it("returns 500 on unexpected registerWithPassword throw", async () => {
    mocks.registerMock.mockRejectedValue(new Error("bcrypt oom"));
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(500);
    const body = await json(res);
    expect(body.error).toBe("Internal server error");
  });

  it("does not leak the underlying error message on 500", async () => {
    mocks.registerMock.mockRejectedValue(new Error("db pool row a@b.co conflict"));
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    const body = await json(res);
    expect(String(body.error)).not.toContain("a@b.co");
    expect(String(body.error)).not.toContain("db pool");
  });
});

// -----------------------------------------------------------------------------
// Gate precedence
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — gate precedence", () => {
  it("rate-limit (429) fires BEFORE body parse (400)", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 5_000 });
    const res = await POST(req(undefined, { badJson: true }));
    expect(res.status).toBe(429);
  });

  it("email check (400) fires BEFORE password check (400)", async () => {
    mocks.isValidEmailMock.mockReturnValue(false);
    const res = await POST(req({ email: "bad", password: "" }));
    const body = await json(res);
    expect(body.error).toBe("Valid email is required");
  });

  it("password-present (400) fires BEFORE 8-char guard (400)", async () => {
    // No password at all → "Password is required", not "at least 8 characters".
    const res = await POST(req({ email: "a@b.co" }));
    const body = await json(res);
    expect(body.error).toBe("Password is required");
  });
});
