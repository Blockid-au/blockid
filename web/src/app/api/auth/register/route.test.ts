// Colocated vitest for POST /api/auth/register — P9-register-route-test.
//
// The registration surface has three security-critical gates that MUST NEVER
// regress: (1) rate limit — per-IP ceiling (20 / 15 min, trusted hop) plus a
// per-(IP, email) bucket (5 / 15 min), release QA-2 F7 — so a bot
// can't drain the app_users id space; (2) HTML-tag stripping on displayName
// so a founder can't seed stored XSS by registering with
// "<script>fetch(...)</script>" as their name; (3) email_taken → the SAME
// generic 200 "check your email" a pending signup gets (release QA-4 P2-a) —
// the account owner is told by email, never the caller — with no session
// cookie and no claim.
//
// Regressions this suite is designed to catch:
//   - dropping sanitizeName() would let stored XSS reach every rendered
//     display-name surface (dashboard, /admin/users, invoice-to);
//   - reintroducing a 409 / "already exists" message on email_taken would
//     let anyone enumerate registered emails;
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
  claimMock: vi.fn<(p: { userId: string; email?: string | null }) => Promise<{
    analyses: number;
    guestAnalyses: number;
  }>>(),
  sendExistingAccountNoticeMock: vi.fn<(a: { to: string }) => Promise<{ ok: boolean }>>(),
}));

vi.mock("@/lib/email", () => ({
  sendExistingAccountNotice: (a: { to: string }) => mocks.sendExistingAccountNoticeMock(a),
}));

vi.mock("@/lib/auth", () => ({
  registerWithPassword: (i: Parameters<typeof mocks.registerMock>[0]) => mocks.registerMock(i),
  setSessionCookie: (t: string) => mocks.setSessionCookieMock(t),
  isValidEmail: (e: unknown) => mocks.isValidEmailMock(e),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (k: string, m: number, w: number) => mocks.checkRateLimitMock(k, m, w),
}));

vi.mock("@/lib/analyses/claim", () => ({
  claimForCurrentBrowser: (p: Parameters<typeof mocks.claimMock>[0]) =>
    mocks.claimMock(p),
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
  mocks.claimMock.mockReset().mockResolvedValue({ analyses: 0, guestAnalyses: 0 });
  mocks.sendExistingAccountNoticeMock.mockReset().mockResolvedValue({ ok: true });
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

  // Release QA-2 F7 — two buckets: a per-IP ceiling (20/15 min) checked
  // first, then a per-(IP, email-hash) bucket (5/15 min). The IP is the
  // TRUSTED hop from clientIpFromHeaders (cf-connecting-ip / last XFF hop),
  // never the client-controlled first x-forwarded-for entry.
  it("bucket 1 = per-IP ceiling: 20 / 15 min, keyed on the trusted hop", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue("203.0.113.7");
    await POST(req({ email: "a@b.co", password: "longenough" }, { ip: "8.8.8.8, 203.0.113.7" }));
    const call = mocks.checkRateLimitMock.mock.calls[0];
    expect(call?.[0]).toBe("register:ip:203.0.113.7");
    expect(call?.[1]).toBe(20);
    expect(call?.[2]).toBe(15 * 60 * 1000);
  });

  it("bucket 2 = per (IP, email hash): 5 / 15 min, email never raw in the key", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue("203.0.113.7");
    await POST(req({ email: "Alice@B.co", password: "longenough" }));
    const call = mocks.checkRateLimitMock.mock.calls[1];
    expect(call?.[0]).toMatch(/^register:203\.0\.113\.7:[0-9a-f]{16}$/);
    expect(call?.[0]).not.toMatch(/alice|b\.co/i);
    expect(call?.[1]).toBe(5);
    expect(call?.[2]).toBe(15 * 60 * 1000);
  });

  it("the same email from the same IP hits the same identity bucket regardless of case", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue("203.0.113.7");
    await POST(req({ email: "Alice@B.co", password: "longenough" }));
    await POST(req({ email: "alice@b.co", password: "longenough" }));
    const [, first, , second] = mocks.checkRateLimitMock.mock.calls;
    expect(first?.[0]).toBe(second?.[0]);
  });

  it("two different emails behind one IP get DIFFERENT identity buckets (shared NAT / QA egress)", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue("203.0.113.7");
    await POST(req({ email: "a@b.co", password: "longenough" }));
    await POST(req({ email: "c@d.co", password: "longenough" }));
    const [, first, , second] = mocks.checkRateLimitMock.mock.calls;
    expect(first?.[0]).not.toBe(second?.[0]);
  });

  it("a client-forged first x-forwarded-for hop never picks the key", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue("203.0.113.7");
    await POST(req({ email: "a@b.co", password: "longenough" }, { ip: "1.1.1.1, 203.0.113.7" }));
    for (const call of mocks.checkRateLimitMock.mock.calls) {
      expect(call[0]).not.toContain("1.1.1.1");
    }
  });

  it("keys on 'unknown' when no trusted IP header is present", async () => {
    mocks.clientIpFromHeadersMock.mockReturnValue(null as unknown as string);
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.checkRateLimitMock.mock.calls[0]?.[0]).toBe("register:ip:unknown");
  });

  it("identity bucket denial → 429 before registerWithPassword", async () => {
    mocks.checkRateLimitMock
      .mockReturnValueOnce({ allowed: true, resetIn: 0 })
      .mockReturnValueOnce({ allowed: false, resetIn: 30_000 });
    const res = await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(mocks.registerMock).not.toHaveBeenCalled();
  });

  it("IP-ceiling denial short-circuits: the identity bucket is never consulted", async () => {
    mocks.checkRateLimitMock.mockReturnValue({ allowed: false, resetIn: 10_000 });
    await POST(req({ email: "a@b.co", password: "longenough" }));
    expect(mocks.checkRateLimitMock).toHaveBeenCalledTimes(1);
    expect(mocks.checkRateLimitMock.mock.calls[0]?.[0]).toMatch(/^register:ip:/);
  });

  it("a 429 never sends the existing-account notice nor the generic 'check your email' body", async () => {
    mocks.checkRateLimitMock
      .mockReturnValueOnce({ allowed: true, resetIn: 0 })
      .mockReturnValueOnce({ allowed: false, resetIn: 30_000 });
    const res = await POST(req({ email: "taken@example.com", password: "longenough" }));
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.pending).toBeUndefined();
    expect(String(body.error)).toMatch(/too many/i);
    expect(mocks.sendExistingAccountNoticeMock).not.toHaveBeenCalled();
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
  it("email_taken → generic 200 'check your email' (no 409, no 'already exists'), notice emailed to the owner", async () => {
    // Release QA-4 P2-a: the caller must not learn the email is registered.
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    const res = await POST(req({ email: "Taken@Example.com", password: "longenough" }));
    expect(res.status).toBe(200);
    const body = await json(res);
    expect(body.ok).toBe(true);
    expect(body.pending).toBe(true);
    expect(String(body.message)).toMatch(/check your email/i);
    expect(body.error).toBeUndefined();
    expect(body.user).toBeUndefined();
    expect(JSON.stringify(body)).not.toMatch(/already exists|log(ging)? in/i);
    expect(mocks.sendExistingAccountNoticeMock).toHaveBeenCalledTimes(1);
    expect(mocks.sendExistingAccountNoticeMock).toHaveBeenCalledWith({ to: "taken@example.com" });
  });

  it("email_taken response is unaffected by a failing notice email (fire-and-forget)", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    mocks.sendExistingAccountNoticeMock.mockRejectedValue(new Error("smtp down"));
    const res = await POST(req({ email: "taken@example.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect((await json(res)).pending).toBe(true);
  });

  it("email_taken generic 200 is reached only after BOTH limiters allowed (QA-2 + QA-4 coexist)", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    const res = await POST(req({ email: "taken@example.com", password: "longenough" }));
    expect(res.status).toBe(200);
    expect(mocks.checkRateLimitMock).toHaveBeenCalledTimes(2);
    expect(mocks.checkRateLimitMock.mock.calls[0]?.[0]).toMatch(/^register:ip:/);
    expect(mocks.checkRateLimitMock.mock.calls[1]?.[0]).toMatch(/^register:[^:]+:[0-9a-f]{16}$/);
  });

  it("does NOT send the existing-account notice on a fresh signup", async () => {
    await POST(req({ email: "new@example.com", password: "longenough" }));
    expect(mocks.sendExistingAccountNoticeMock).not.toHaveBeenCalled();
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

// -----------------------------------------------------------------------------
// Claim-on-signup — the work a founder did before they had an account
// -----------------------------------------------------------------------------

describe("POST /api/auth/register — claim on signup", () => {
  it("claims prior anonymous analyses for the new user id + email", async () => {
    await POST(req({ email: "new@example.com", password: "longenough" }));
    expect(mocks.claimMock).toHaveBeenCalledTimes(1);
    expect(mocks.claimMock).toHaveBeenCalledWith({
      userId: "u1",
      email: "new@example.com",
    });
  });

  it("claims AFTER the session cookie is set, so the claim runs authenticated", async () => {
    const order: string[] = [];
    mocks.setSessionCookieMock.mockImplementation(async () => {
      order.push("cookie");
    });
    mocks.claimMock.mockImplementation(async () => {
      order.push("claim");
      return { analyses: 0, guestAnalyses: 0 };
    });
    await POST(req({ email: "new@example.com", password: "longenough" }));
    expect(order).toEqual(["cookie", "claim"]);
  });

  it("reports the claim counts back to the caller", async () => {
    mocks.claimMock.mockResolvedValue({ analyses: 2, guestAnalyses: 1 });
    const res = await POST(req({ email: "new@example.com", password: "longenough" }));
    const body = await json(res);
    expect(body.claimed).toEqual({ analyses: 2, guestAnalyses: 1 });
  });

  it("MUST NOT claim when registration failed", async () => {
    mocks.registerMock.mockResolvedValue({ ok: false, reason: "email_taken" });
    await POST(req({ email: "taken@example.com", password: "longenough" }));
    expect(mocks.claimMock).not.toHaveBeenCalled();
  });
});
