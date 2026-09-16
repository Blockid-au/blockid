// Colocated tests for GET /api/auth/google/callback — step 2 of the
// server-side Google sign-in. Pins:
//   * Google `?error=` → 302 /auth/login?google_error=<code> (sanitised)
//   * missing / tampered / expired / mismatched state → 400, no exchange
//   * exchange failure → 302 with the classified code (redirect_uri_mismatch…)
//   * happy path: getToken(code + PKCE verifier) → verifyIdToken → the shared
//     back half (loginWithGoogle, setSessionCookie, claim) → 302 next|redirect
//     with ?logged_in=true, state cookie cleared
//   * `next` is only ever the same-origin path sealed in the cookie
//   * the log lines never carry the code, the token or the email

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGoogleOAuthState, sealGoogleOAuthState } from "@/lib/auth/google-oauth";

type SetCookie = { name: string; value: string } & Record<string, unknown>;
const jar = vi.hoisted(() => ({ get: new Map<string, string>(), set: [] as SetCookie[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.get.has(name) ? { name, value: jar.get.get(name)! } : undefined),
    set: (c: SetCookie) => {
      jar.set.push(c);
    },
  }),
}));

const google = vi.hoisted(() => ({
  ctorArgs: [] as unknown[],
  getToken: vi.fn<(o: unknown) => Promise<{ tokens: { id_token?: string | null } }>>(),
  verifyIdToken: vi.fn<(o: unknown) => Promise<{ getPayload: () => Record<string, unknown> | undefined }>>(),
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    constructor(...args: unknown[]) {
      google.ctorArgs.push(args[0]);
    }
    getToken(o: unknown) {
      return google.getToken(o);
    }
    verifyIdToken(o: unknown) {
      return google.verifyIdToken(o);
    }
  },
}));

const auth = vi.hoisted(() => ({
  loginWithGoogle: vi.fn<(p: unknown, o: unknown) => Promise<Record<string, unknown>>>(),
  setSessionCookie: vi.fn<(t: string) => Promise<void>>(),
}));
vi.mock("@/lib/auth", () => ({
  loginWithGoogle: (p: unknown, o: unknown) => auth.loginWithGoogle(p, o),
  setSessionCookie: (t: string) => auth.setSessionCookie(t),
  normaliseEmail: (e: string) => e.trim().toLowerCase(),
}));

const claim = vi.hoisted(() => ({ fn: vi.fn(async () => ({ analyses: 0, guestAnalyses: 0 })) }));
vi.mock("@/lib/analyses/claim", () => ({ claimForCurrentBrowser: (p: unknown) => claim.fn(p as never) }));

const db = vi.hoisted(() => ({ onboarding: false as boolean | null }));
vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: () =>
    db.onboarding === null
      ? null
      : {
          from: () => ({
            select: () => ({
              eq: () => ({ single: async () => ({ data: { onboarding_completed: db.onboarding } }) }),
            }),
          }),
        },
}));

vi.mock("@/lib/iphash", () => ({
  hashIp: (ip: string) => `h:${ip}`,
  clientIpFromHeaders: (h: Headers) => h.get("x-forwarded-for") ?? "0.0.0.0",
}));

import { GET } from "./route";

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_SITE_URL"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};
const USER = { id: "u1", email: "founder@example.com", displayName: "Fran", role: "user", plan: null };
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "cid-123";
  process.env.GOOGLE_CLIENT_SECRET = "shh";
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  jar.get.clear();
  jar.set.length = 0;
  google.ctorArgs.length = 0;
  google.getToken.mockReset().mockResolvedValue({ tokens: { id_token: "ID.TOKEN.SECRET" } });
  google.verifyIdToken.mockReset().mockResolvedValue({
    getPayload: () => ({ sub: "g-sub", email: "founder@example.com", email_verified: true, name: "Fran", picture: "p" }),
  });
  auth.loginWithGoogle.mockReset().mockResolvedValue({ ok: true, sessionToken: "sess-tok", user: USER });
  auth.setSessionCookie.mockReset().mockResolvedValue(undefined);
  claim.fn.mockClear();
  db.onboarding = true;
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

/** Seal a fresh state into the jar and return its nonce. */
function armState(next: string | null = "/workspace/score/history", now = Date.now()): string {
  const st = createGoogleOAuthState(next, now);
  jar.get.set("blockid_google_oauth", sealGoogleOAuthState(st));
  return st.state;
}

function run(qs: string) {
  return GET(new Request(`https://0.0.0.0:4001/api/auth/google/callback${qs}`, { headers: { "x-forwarded-for": "1.2.3.4", "user-agent": "vitest" } }));
}

function loc(res: Response): URL {
  return new URL(res.headers.get("location")!);
}

function clearedStateCookie(): boolean {
  return jar.set.some((c) => c.name === "blockid_google_oauth" && c.value === "" && c.maxAge === 0);
}

describe("GET /api/auth/google/callback — Google refused", () => {
  it("?error=access_denied → 302 /auth/login?google_error=access_denied (+ next from the cookie), cookie cleared, no exchange", async () => {
    armState("/pricing");
    const res = await run("?error=access_denied&state=whatever");
    expect(res.status).toBe(302);
    const url = loc(res);
    expect(url.origin + url.pathname).toBe("https://blockid.au/auth/login");
    expect(url.searchParams.get("google_error")).toBe("access_denied");
    expect(url.searchParams.get("next")).toBe("/pricing");
    expect(google.getToken).not.toHaveBeenCalled();
    expect(clearedStateCookie()).toBe(true);
  });

  it("an unexpected error string is sanitised to `unknown`, never echoed", async () => {
    const res = await run("?error=%3Cscript%3Ealert(1)%3C%2Fscript%3E");
    expect(loc(res).searchParams.get("google_error")).toBe("unknown");
  });
});

describe("GET /api/auth/google/callback — state guard", () => {
  it("no state cookie → 400 with a retry link, no exchange", async () => {
    const res = await run("?code=abc&state=nonce");
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toMatchObject({ ok: false, error: "state_mismatch", retry: "/auth/login?google_error=state_mismatch" });
    expect(google.getToken).not.toHaveBeenCalled();
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
  });

  it("?state differs from the cookie's nonce → 400", async () => {
    armState();
    const res = await run("?code=abc&state=someone-elses-nonce");
    expect(res.status).toBe(400);
    expect(google.getToken).not.toHaveBeenCalled();
    expect(clearedStateCookie()).toBe(true);
  });

  it("tampered cookie → 400", async () => {
    const nonce = armState();
    // Flip a character in the MIDDLE of the sealed token. The last base64url
    // character carries unused low bits, so flipping A↔B there can decode to
    // the same bytes and the cookie still verifies (flaky 302 at deploy gate 6).
    const sealed = jar.get.get("blockid_google_oauth")!;
    const i = Math.floor(sealed.length / 2);
    const flipped = sealed[i] === "A" ? "B" : "A";
    jar.get.set("blockid_google_oauth", sealed.slice(0, i) + flipped + sealed.slice(i + 1));
    const res = await run(`?code=abc&state=${nonce}`);
    expect(res.status).toBe(400);
    expect(google.getToken).not.toHaveBeenCalled();
  });

  it("expired cookie (> 10 min) → 400", async () => {
    const nonce = armState("/dashboard", Date.now() - 11 * 60 * 1000);
    const res = await run(`?code=abc&state=${nonce}`);
    expect(res.status).toBe(400);
    expect(google.getToken).not.toHaveBeenCalled();
  });

  it("valid state but no code → 302 google_error=missing_code", async () => {
    const nonce = armState();
    const res = await run(`?state=${nonce}`);
    expect(res.status).toBe(302);
    expect(loc(res).searchParams.get("google_error")).toBe("missing_code");
    expect(google.getToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/google/callback — exchange failures", () => {
  it.each([
    [{ response: { data: { error: "redirect_uri_mismatch" } } }, "redirect_uri_mismatch"],
    [new Error("invalid_client: Unauthorized"), "invalid_client"],
    [new Error("invalid_grant: Bad Request"), "invalid_grant"],
    [new Error("boom"), "exchange_failed"],
  ])("getToken rejects with %j → 302 google_error=%s, cookie cleared, no session", async (err, code) => {
    const nonce = armState("/pricing");
    google.getToken.mockRejectedValueOnce(err);
    const res = await run(`?code=one-shot-code&state=${nonce}`);
    expect(res.status).toBe(302);
    const url = loc(res);
    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("google_error")).toBe(code);
    expect(url.searchParams.get("next")).toBe("/pricing");
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
    expect(clearedStateCookie()).toBe(true);
    // Log line: stage + code only.
    const logged = errorSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toContain(`[auth:google] exchange ${code}`);
    expect(logged).not.toContain("one-shot-code");
  });

  it("no id_token in the response → exchange_failed", async () => {
    const nonce = armState();
    google.getToken.mockResolvedValueOnce({ tokens: { id_token: null } });
    const res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).searchParams.get("google_error")).toBe("exchange_failed");
  });

  it("verifyIdToken throws → token_invalid; unverified email → email_unverified", async () => {
    let nonce = armState();
    google.verifyIdToken.mockRejectedValueOnce(new Error("Wrong recipient"));
    let res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).searchParams.get("google_error")).toBe("token_invalid");

    jar.set.length = 0;
    nonce = armState();
    google.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ sub: "s", email: "x@y.z", email_verified: false }) });
    res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).searchParams.get("google_error")).toBe("email_unverified");
    expect(auth.loginWithGoogle).not.toHaveBeenCalled();
  });

  it("loginWithGoogle fails → login_failed", async () => {
    const nonce = armState();
    auth.loginWithGoogle.mockResolvedValueOnce({ ok: false, reason: "db_error" });
    const res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).searchParams.get("google_error")).toBe("login_failed");
    expect(auth.setSessionCookie).not.toHaveBeenCalled();
  });

  it("not configured → 302 google_error=not_configured before touching Google", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await run("?code=c&state=n");
    expect(loc(res).searchParams.get("google_error")).toBe("not_configured");
    expect(google.getToken).not.toHaveBeenCalled();
  });
});

describe("GET /api/auth/google/callback — happy path", () => {
  it("exchanges code + PKCE verifier at the registered redirect_uri, verifies, sets the session, claims, and lands on `next`", async () => {
    const st = createGoogleOAuthState("/workspace/score/history?tab=all", Date.now());
    jar.get.set("blockid_google_oauth", sealGoogleOAuthState(st));

    const res = await run(`?code=one-shot-code&state=${st.state}`);
    expect(res.status).toBe(302);
    expect(loc(res).toString()).toBe("https://blockid.au/workspace/score/history?tab=all&logged_in=true");

    expect(google.ctorArgs[0]).toMatchObject({ clientId: "cid-123", clientSecret: "shh", redirectUri: "https://blockid.au/api/auth/google/callback" });
    expect(google.getToken).toHaveBeenCalledWith({
      code: "one-shot-code",
      codeVerifier: st.codeVerifier,
      redirect_uri: "https://blockid.au/api/auth/google/callback",
    });
    expect(google.verifyIdToken).toHaveBeenCalledWith({ idToken: "ID.TOKEN.SECRET", audience: "cid-123" });
    expect(auth.loginWithGoogle).toHaveBeenCalledWith(
      { sub: "g-sub", email: "founder@example.com", name: "Fran", picture: "p" },
      { ipHash: "h:1.2.3.4", userAgent: "vitest", referralCode: null, resellerCode: null },
    );
    expect(auth.setSessionCookie).toHaveBeenCalledWith("sess-tok");
    expect(claim.fn).toHaveBeenCalledWith({ userId: "u1", email: "founder@example.com" });
    expect(clearedStateCookie()).toBe(true);
    // Nothing secret in the logs.
    const logged = errorSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).not.toContain("ID.TOKEN");
    expect(logged).not.toContain("one-shot-code");
  });

  it("without `next`: /onboarding until the flag is set, then /dashboard", async () => {
    db.onboarding = false;
    let nonce = armState(null);
    let res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).toString()).toBe("https://blockid.au/onboarding?logged_in=true");

    db.onboarding = true;
    nonce = armState(null);
    res = await run(`?code=c&state=${nonce}`);
    expect(loc(res).toString()).toBe("https://blockid.au/dashboard?logged_in=true");
  });

  it("carries referral + reseller cookies into loginWithGoogle", async () => {
    const nonce = armState(null);
    jar.get.set("blockid_ref", "FRIEND1");
    jar.get.set("blockid_via", "RESELLER9");
    await run(`?code=c&state=${nonce}`);
    expect(auth.loginWithGoogle.mock.calls[0][1]).toMatchObject({ referralCode: "FRIEND1", resellerCode: "RESELLER9" });
  });

  it("`next` can never leave the origin — an off-origin value in a re-signed cookie is dropped", async () => {
    // Even if someone with the signing key wrote an absolute URL into the cookie, open() re-guards it.
    const st = { ...createGoogleOAuthState(null, Date.now()), next: "https://evil.com/steal" };
    jar.get.set("blockid_google_oauth", sealGoogleOAuthState(st));
    const res = await run(`?code=c&state=${st.state}`);
    expect(loc(res).origin).toBe("https://blockid.au");
    expect(loc(res).pathname).toBe("/dashboard");
  });
});
