// Colocated tests for GET /api/auth/google/start — the server-side Google
// sign-in entry point. Pins: the sealed state cookie (HttpOnly, path-scoped,
// 10 min), PKCE S256 + state in the authorize URL, the same-origin `next`
// guard, and the not-configured fallback to /auth/login?google_error=.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openGoogleOAuthState, pkceChallenge } from "@/lib/auth/google-oauth";

type SetCookie = { name: string; value: string } & Record<string, unknown>;
const jar = vi.hoisted(() => ({ set: [] as SetCookie[] }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => undefined,
    set: (c: SetCookie) => {
      jar.set.push(c);
    },
  }),
}));

import { GET } from "./route";

const ENV_KEYS = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "NEXT_PUBLIC_SITE_URL", "GOOGLE_OAUTH_STATE_SECRET"] as const;
const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  process.env.GOOGLE_CLIENT_ID = "cid-123";
  process.env.GOOGLE_CLIENT_SECRET = "shh";
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au";
  delete process.env.GOOGLE_OAUTH_STATE_SECRET;
  jar.set.length = 0;
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

function run(qs = "") {
  return GET(new Request(`https://0.0.0.0:4001/api/auth/google/start${qs}`));
}

describe("GET /api/auth/google/start", () => {
  it("302 → accounts.google.com with PKCE S256 + state, and seals both in an HttpOnly cookie", async () => {
    const res = await run("?next=%2Fworkspace%2Fanalyses");
    expect(res.status).toBe(302);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const url = new URL(res.headers.get("location")!);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe("cid-123");
    expect(url.searchParams.get("redirect_uri")).toBe("https://blockid.au/api/auth/google/callback");
    expect(url.searchParams.get("scope")).toBe("openid email profile");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("prompt")).toBe("select_account");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    expect(jar.set).toHaveLength(1);
    const cookie = jar.set[0];
    expect(cookie).toMatchObject({ name: "blockid_google_oauth", httpOnly: true, sameSite: "lax", path: "/api/auth/google", maxAge: 600 });
    const opened = openGoogleOAuthState(cookie.value);
    expect(opened.ok).toBe(true);
    if (!opened.ok) return;
    expect(url.searchParams.get("state")).toBe(opened.state.state);
    expect(url.searchParams.get("code_challenge")).toBe(pkceChallenge(opened.state.codeVerifier));
    expect(opened.state.next).toBe("/workspace/analyses");
    // The verifier is only in the cookie, never in the URL.
    expect(url.toString()).not.toContain(opened.state.codeVerifier);
  });

  it("drops an off-origin `next` (open redirect guard) and passes a login_hint email through", async () => {
    const res = await run("?next=https%3A%2F%2Fevil.com%2Fphish&login_hint=Founder%40Example.com");
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("login_hint")).toBe("founder@example.com");
    const opened = openGoogleOAuthState(jar.set[0].value);
    expect(opened.ok && opened.state.next).toBeNull();
  });

  it("ignores a non-email login_hint", async () => {
    const res = await run("?login_hint=not-an-email");
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.has("login_hint")).toBe(false);
  });

  it("redirect_uri follows NEXT_PUBLIC_SITE_URL, never the request host", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://dev.blockid.au/";
    const res = await run();
    const url = new URL(res.headers.get("location")!);
    expect(url.searchParams.get("redirect_uri")).toBe("https://dev.blockid.au/api/auth/google/callback");
  });

  it("not configured (no client secret) → back to /auth/login?google_error=not_configured, no cookie", async () => {
    delete process.env.GOOGLE_CLIENT_SECRET;
    const res = await run("?next=%2Fdashboard");
    expect(res.status).toBe(302);
    const url = new URL(res.headers.get("location")!);
    expect(url.pathname).toBe("/auth/login");
    expect(url.searchParams.get("google_error")).toBe("not_configured");
    expect(url.searchParams.get("next")).toBe("/dashboard");
    expect(jar.set).toHaveLength(0);
  });
});
