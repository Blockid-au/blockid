// Colocated tests for the server-side Google OAuth helpers: sealed state
// cookie (HMAC, expiry, tamper), PKCE S256, authorize URL shape, and the
// error classifier that turns google-auth-library exceptions into the short
// codes the login page understands.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  GOOGLE_AUTHORIZE_URL,
  GOOGLE_OAUTH_STATE_TTL_SEC,
  buildGoogleAuthorizeUrl,
  classifyGoogleExchangeError,
  createGoogleOAuthState,
  googleOAuthStateCookieOptions,
  openGoogleOAuthState,
  pkceChallenge,
  sealGoogleOAuthState,
  stateMatches,
} from "./google-oauth";

const ENV = { GOOGLE_CLIENT_ID: "cid", GOOGLE_CLIENT_SECRET: "shh-secret" };
const NOW = Date.UTC(2026, 8, 15, 5, 0, 0);

describe("createGoogleOAuthState", () => {
  it("mints a fresh nonce + PKCE verifier and guards `next` to same-origin paths", () => {
    const a = createGoogleOAuthState("/dashboard", NOW);
    const b = createGoogleOAuthState("/dashboard", NOW);
    expect(a.state).not.toBe(b.state);
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
    expect(a.codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(a.codeVerifier.length).toBeLessThanOrEqual(128);
    expect(a.codeVerifier).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a.next).toBe("/dashboard");
    expect(a.iat).toBe(Math.floor(NOW / 1000));
  });

  it.each([
    ["https://evil.com/x", null],
    ["//evil.com", null],
    ["/\\evil.com", null],
    ["dashboard", null],
    ["", null],
    [null, null],
    ["/workspace/score/history?claimed=2", "/workspace/score/history?claimed=2"],
  ])("next=%j → %j", (raw, expected) => {
    expect(createGoogleOAuthState(raw, NOW).next).toBe(expected);
  });
});

describe("seal / open state", () => {
  it("round-trips", () => {
    const st = createGoogleOAuthState("/pricing", NOW);
    const sealed = sealGoogleOAuthState(st, ENV);
    expect(sealed).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const out = openGoogleOAuthState(sealed, { env: ENV, now: NOW + 1000 });
    expect(out).toEqual({ ok: true, state: st });
  });

  it("refuses a tampered body, a wrong key, garbage, and an empty cookie", () => {
    const st = createGoogleOAuthState("/pricing", NOW);
    const sealed = sealGoogleOAuthState(st, ENV);
    const [body, tag] = sealed.split(".");
    // Flip `next` to an attacker path but keep the tag.
    const forged = Buffer.from(JSON.stringify({ ...st, next: "/admin" })).toString("base64url");
    expect(openGoogleOAuthState(`${forged}.${tag}`, { env: ENV, now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
    expect(openGoogleOAuthState(sealed, { env: { ...ENV, GOOGLE_CLIENT_SECRET: "other" }, now: NOW })).toEqual({ ok: false, reason: "bad_signature" });
    expect(openGoogleOAuthState(body, { env: ENV, now: NOW })).toEqual({ ok: false, reason: "malformed" });
    expect(openGoogleOAuthState("not.base64.at.all", { env: ENV, now: NOW }).ok).toBe(false);
    expect(openGoogleOAuthState("", { env: ENV, now: NOW })).toEqual({ ok: false, reason: "missing" });
    expect(openGoogleOAuthState(undefined, { env: ENV, now: NOW })).toEqual({ ok: false, reason: "missing" });
  });

  it("expires after the TTL and rejects a far-future iat", () => {
    const st = createGoogleOAuthState(null, NOW);
    const sealed = sealGoogleOAuthState(st, ENV);
    expect(openGoogleOAuthState(sealed, { env: ENV, now: NOW + (GOOGLE_OAUTH_STATE_TTL_SEC - 1) * 1000 }).ok).toBe(true);
    expect(openGoogleOAuthState(sealed, { env: ENV, now: NOW + (GOOGLE_OAUTH_STATE_TTL_SEC + 2) * 1000 })).toEqual({ ok: false, reason: "expired" });
    expect(openGoogleOAuthState(sealed, { env: ENV, now: NOW - 5 * 60 * 1000 })).toEqual({ ok: false, reason: "expired" });
  });

  it("GOOGLE_OAUTH_STATE_SECRET takes precedence over the client secret; no key → throws on seal", () => {
    const st = createGoogleOAuthState(null, NOW);
    const withDedicated = { ...ENV, GOOGLE_OAUTH_STATE_SECRET: "dedicated" };
    const sealed = sealGoogleOAuthState(st, withDedicated);
    expect(openGoogleOAuthState(sealed, { env: withDedicated, now: NOW }).ok).toBe(true);
    expect(openGoogleOAuthState(sealed, { env: ENV, now: NOW }).ok).toBe(false);
    expect(() => sealGoogleOAuthState(st, { GOOGLE_CLIENT_ID: "cid" })).toThrow(/state key/);
  });

  it("a signed payload with the wrong shape is malformed, not a crash", () => {
    const body = Buffer.from(JSON.stringify({ state: 1 })).toString("base64url");
    const good = sealGoogleOAuthState(createGoogleOAuthState(null, NOW), ENV);
    // Re-sign the bad body with the real key by reusing seal on a fake object.
    const resealed = sealGoogleOAuthState({ state: 1 } as never, ENV);
    expect(openGoogleOAuthState(resealed, { env: ENV, now: NOW })).toEqual({ ok: false, reason: "malformed" });
    expect(body).not.toBe(good);
  });
});

describe("stateMatches", () => {
  it("exact match only, never for empty", () => {
    expect(stateMatches("abc", "abc")).toBe(true);
    expect(stateMatches("abd", "abc")).toBe(false);
    expect(stateMatches("ab", "abc")).toBe(false);
    expect(stateMatches("", "abc")).toBe(false);
    expect(stateMatches(null, "abc")).toBe(false);
  });
});

describe("buildGoogleAuthorizeUrl + PKCE", () => {
  it("S256 challenge is base64url(sha256(verifier))", () => {
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(pkceChallenge(v)).toBe(createHash("sha256").update(v).digest("base64url"));
    expect(pkceChallenge(v)).not.toContain("=");
  });

  it("has every required parameter and points at accounts.google.com", () => {
    const url = new URL(
      buildGoogleAuthorizeUrl({
        clientId: "cid",
        redirectUri: "https://blockid.au/api/auth/google/callback",
        state: "nonce-1",
        codeVerifier: "verifier-verifier-verifier-verifier-verifier",
        loginHint: "founder@example.com",
      }),
    );
    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTHORIZE_URL);
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("cid");
    expect(q.get("redirect_uri")).toBe("https://blockid.au/api/auth/google/callback");
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("openid email profile");
    expect(q.get("state")).toBe("nonce-1");
    expect(q.get("code_challenge")).toBe(pkceChallenge("verifier-verifier-verifier-verifier-verifier"));
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("prompt")).toBe("select_account");
    expect(q.get("login_hint")).toBe("founder@example.com");
    // The verifier itself must never leave the server.
    expect(url.toString()).not.toContain("verifier-verifier");
  });
});

describe("googleOAuthStateCookieOptions", () => {
  it("HttpOnly, Lax, scoped to /api/auth/google, 10 min, Secure in production", () => {
    const prod = googleOAuthStateCookieOptions({ NODE_ENV: "production" });
    expect(prod).toMatchObject({ httpOnly: true, sameSite: "lax", path: "/api/auth/google", secure: true, maxAge: 600 });
    expect(googleOAuthStateCookieOptions({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "http://localhost:4001" }).secure).toBe(false);
    expect(googleOAuthStateCookieOptions({ NODE_ENV: "development", NEXT_PUBLIC_SITE_URL: "https://dev.blockid.au" }).secure).toBe(true);
  });
});

describe("classifyGoogleExchangeError", () => {
  it.each([
    [{ response: { data: { error: "redirect_uri_mismatch", error_description: "Bad Request" } } }, "redirect_uri_mismatch"],
    [{ message: "invalid_client: Unauthorized" }, "invalid_client"],
    [{ code: "400", message: "invalid_grant: Bad Request" }, "invalid_grant"],
    [new Error("Token used too late, 1757912345 > 1757912000"), "token_invalid"],
    [new Error("Wrong recipient, payload audience != requiredAudience"), "token_invalid"],
    [new Error("getaddrinfo ENOTFOUND oauth2.googleapis.com"), "network"],
    [new Error("something else entirely"), "exchange_failed"],
    [null, "exchange_failed"],
  ])("%j → %s", (err, code) => {
    expect(classifyGoogleExchangeError(err)).toBe(code);
  });
});
