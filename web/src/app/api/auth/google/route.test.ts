// Colocated tests for POST /api/auth/google (GIS pop-up credential). Pins
// the short `code` the login form now keys its copy + telemetry on, the
// shared back half (session cookie, claim, onboarding redirect), and that
// the log line never carries the token.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => ({ get: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.get.has(name) ? { name, value: jar.get.get(name)! } : undefined),
    set: () => {},
  }),
}));

const google = vi.hoisted(() => ({
  verifyIdToken: vi.fn<(o: unknown) => Promise<{ getPayload: () => Record<string, unknown> | undefined }>>(),
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
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
vi.mock("@/lib/analyses/claim", () => ({ claimForCurrentBrowser: async () => ({ analyses: 0, guestAnalyses: 0 }) }));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/iphash", () => ({ hashIp: (ip: string) => `h:${ip}`, clientIpFromHeaders: () => "1.1.1.1" }));

import { POST } from "./route";

const USER = { id: "u1", email: "admin@blockid.au", displayName: "A", role: "admin", plan: null };
let errorSpy: ReturnType<typeof vi.spyOn>;
const savedClientId = process.env.GOOGLE_CLIENT_ID;

beforeEach(() => {
  process.env.GOOGLE_CLIENT_ID = "cid-123";
  jar.get.clear();
  google.verifyIdToken.mockReset().mockResolvedValue({
    getPayload: () => ({ sub: "g-sub", email: "admin@blockid.au", email_verified: true }),
  });
  auth.loginWithGoogle.mockReset().mockResolvedValue({ ok: true, sessionToken: "sess", user: USER });
  auth.setSessionCookie.mockReset().mockResolvedValue(undefined);
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  if (savedClientId === undefined) delete process.env.GOOGLE_CLIENT_ID;
  else process.env.GOOGLE_CLIENT_ID = savedClientId;
  vi.restoreAllMocks();
});

function post(body: unknown, raw = false) {
  return POST(
    new Request("https://0.0.0.0:4001/api/auth/google", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ? (body as string) : JSON.stringify(body),
    }),
  );
}

describe("POST /api/auth/google", () => {
  it("happy path: verifies the credential, sets the session cookie, returns redirect + isAdmin", async () => {
    const res = await post({ credential: "ID.TOKEN" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, redirect: "/dashboard", isAdmin: true, user: { id: "u1" } });
    expect(google.verifyIdToken).toHaveBeenCalledWith({ idToken: "ID.TOKEN", audience: "cid-123" });
    expect(auth.setSessionCookie).toHaveBeenCalledWith("sess");
  });

  it("400 invalid_json / missing_credential", async () => {
    expect((await post("{bad", true)).status).toBe(400);
    const res = await post({});
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ ok: false, code: "missing_credential" });
  });

  it("401 token_invalid with a short code and no token in the log line", async () => {
    google.verifyIdToken.mockRejectedValueOnce(new Error("Token used too late"));
    const res = await post({ credential: "ID.TOKEN.SECRET" });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, code: "token_invalid" });
    const logged = errorSpy.mock.calls.map((c) => c.map(String).join(" ")).join("\n");
    expect(logged).toContain("[auth:google] verify token_invalid");
    expect(logged).not.toContain("ID.TOKEN");
  });

  it("403 email_unverified; 503 not_configured; 500 login_failed", async () => {
    google.verifyIdToken.mockResolvedValueOnce({ getPayload: () => ({ sub: "s", email: "x@y.z", email_verified: false }) });
    expect((await post({ credential: "t" })).status).toBe(403);

    auth.loginWithGoogle.mockResolvedValueOnce({ ok: false, reason: "db_error" });
    const failed = await post({ credential: "t" });
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ ok: false, code: "login_failed", reason: "db_error" });
    expect(auth.setSessionCookie).not.toHaveBeenCalled();

    delete process.env.GOOGLE_CLIENT_ID;
    const nc = await post({ credential: "t" });
    expect(nc.status).toBe(503);
    expect(await nc.json()).toMatchObject({ code: "not_configured" });
  });
});
