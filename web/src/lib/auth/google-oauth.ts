// Server-side Google OAuth 2.0 (authorization-code + PKCE) — the redirect
// alternative to the Google Identity Services pop-up on /auth/login.
//
// Why both exist: the GIS button hands the ID token to the page in the
// browser (pop-up → opener postMessage → POST /api/auth/google). That hand-
// off silently fails when pop-ups / third-party cookies are blocked, when
// FedCM is disabled, or when the consent screen refuses the account — and
// the server sees nothing at all. The redirect flow is a plain top-level
// navigation: Google → /api/auth/google/callback?code=… → session cookie →
// redirect, so every failure lands on the server as an `error=` code we
// can log and show.
//
// State: one HttpOnly cookie carries { state nonce, PKCE verifier, next,
// issued-at } as base64url JSON + HMAC-SHA256 tag. The signing key is
// derived from GOOGLE_OAUTH_STATE_SECRET, else GOOGLE_CLIENT_SECRET (the
// exchange needs it anyway, so the redirect flow is either fully configured
// or not at all). The cookie is scoped to /api/auth/google, lives 10 min,
// and is cleared by the callback.
//
// Pure `node:crypto`; no `server-only` so the route tests can import it.

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { canonicalSiteUrl } from "@/lib/site-url";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { GOOGLE_CALLBACK_PATH } from "./google-sign-in-errors";

export const GOOGLE_OAUTH_STATE_COOKIE = "blockid_google_oauth";
export const GOOGLE_OAUTH_STATE_TTL_SEC = 10 * 60;
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_SCOPES = "openid email profile";

export interface GoogleOAuthState {
  /** Random nonce echoed back by Google as `?state=`. */
  state: string;
  /** PKCE code_verifier (RFC 7636, 43–128 chars). */
  codeVerifier: string;
  /** Same-origin path to land on after login, or null for the route's default. */
  next: string | null;
  /** Issued-at, unix seconds. */
  iat: number;
}

type StateEnv = Record<string, string | undefined>;

export function googleRedirectUri(): string {
  return `${canonicalSiteUrl()}${GOOGLE_CALLBACK_PATH}`;
}

export function isGoogleRedirectFlowConfigured(env: StateEnv = process.env): boolean {
  return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

function stateKey(env: StateEnv): Buffer | null {
  const raw = env.GOOGLE_OAUTH_STATE_SECRET?.trim() || env.GOOGLE_CLIENT_SECRET?.trim();
  if (!raw) return null;
  return createHash("sha256").update(`blockid:google-oauth-state:${raw}`).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** S256 challenge for a verifier (RFC 7636 §4.2). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash("sha256").update(verifier).digest());
}

/** Fresh state + PKCE pair; `next` is open-redirect-guarded (same-origin path only). */
export function createGoogleOAuthState(
  next: string | null | undefined,
  now: number = Date.now(),
): GoogleOAuthState {
  return {
    state: b64url(randomBytes(24)),
    codeVerifier: b64url(randomBytes(48)), // 64 chars — inside the 43–128 window
    next: safeNextPath(next, "") || null,
    iat: Math.floor(now / 1000),
  };
}

/** Serialise + sign the state for the HttpOnly cookie. Throws when no key is configured. */
export function sealGoogleOAuthState(st: GoogleOAuthState, env: StateEnv = process.env): string {
  const key = stateKey(env);
  if (!key) throw new Error("google oauth state key missing (GOOGLE_CLIENT_SECRET)");
  const body = b64url(Buffer.from(JSON.stringify(st), "utf8"));
  const tag = b64url(createHmac("sha256", key).update(body).digest());
  return `${body}.${tag}`;
}

export type OpenStateFailure = "missing" | "malformed" | "bad_signature" | "expired";

/** Verify + parse the cookie. Never throws. */
export function openGoogleOAuthState(
  cookieValue: string | null | undefined,
  opts: { env?: StateEnv; now?: number; ttlSec?: number } = {},
): { ok: true; state: GoogleOAuthState } | { ok: false; reason: OpenStateFailure } {
  if (!cookieValue) return { ok: false, reason: "missing" };
  const key = stateKey(opts.env ?? process.env);
  if (!key) return { ok: false, reason: "bad_signature" };
  const dot = cookieValue.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const body = cookieValue.slice(0, dot);
  const tag = cookieValue.slice(dot + 1);
  const expected = createHmac("sha256", key).update(body).digest();
  let given: Buffer;
  try {
    given = Buffer.from(tag, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
    return { ok: false, reason: "bad_signature" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const p = parsed as Partial<GoogleOAuthState> | null;
  if (
    !p ||
    typeof p.state !== "string" ||
    typeof p.codeVerifier !== "string" ||
    typeof p.iat !== "number" ||
    (p.next !== null && typeof p.next !== "string")
  ) {
    return { ok: false, reason: "malformed" };
  }
  const nowSec = Math.floor((opts.now ?? Date.now()) / 1000);
  const ttl = opts.ttlSec ?? GOOGLE_OAUTH_STATE_TTL_SEC;
  if (p.iat > nowSec + 60 || nowSec - p.iat > ttl) return { ok: false, reason: "expired" };
  return {
    ok: true,
    state: {
      state: p.state,
      codeVerifier: p.codeVerifier,
      next: safeNextPath(p.next, "") || null,
      iat: p.iat,
    },
  };
}

/** Constant-time compare of the `?state=` Google echoed back against the cookie's. */
export function stateMatches(fromQuery: string | null | undefined, fromCookie: string): boolean {
  if (typeof fromQuery !== "string" || !fromQuery) return false;
  const a = Buffer.from(fromQuery, "utf8");
  const b = Buffer.from(fromCookie, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The Google authorize URL for one state — `prompt=select_account`, PKCE S256, openid email profile. */
export function buildGoogleAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  /** Pre-fill the account chooser when we already know the address (optional). */
  loginHint?: string | null;
}): string {
  const url = new URL(GOOGLE_AUTHORIZE_URL);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_SCOPES);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", pkceChallenge(args.codeVerifier));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("prompt", "select_account");
  url.searchParams.set("access_type", "online");
  url.searchParams.set("include_granted_scopes", "false");
  if (args.loginHint) url.searchParams.set("login_hint", args.loginHint);
  return url.toString();
}

/** Cookie attributes shared by the start (set) and callback (clear) routes. */
export function googleOAuthStateCookieOptions(env: StateEnv = process.env) {
  return {
    name: GOOGLE_OAUTH_STATE_COOKIE,
    httpOnly: true as const,
    // Lax: the callback is a top-level GET navigation from accounts.google.com,
    // which Lax still attaches the cookie to. Strict would drop it.
    sameSite: "lax" as const,
    path: "/api/auth/google",
    secure: env.NODE_ENV === "production" ? true : (env.NEXT_PUBLIC_SITE_URL?.startsWith("https") ?? false),
    maxAge: GOOGLE_OAUTH_STATE_TTL_SEC,
  };
}

/**
 * Map an error thrown by `OAuth2Client.getToken` / `verifyIdToken` (or the
 * `?error=` Google sent) to one short code for the login page + log line.
 * Never includes the token, the code, or Google's free-text description.
 */
export function classifyGoogleExchangeError(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown; response?: { data?: { error?: unknown } } } | null;
  const fromBody = e?.response?.data?.error;
  const candidates = [fromBody, e?.code, e?.message]
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.toLowerCase());
  const known = [
    "redirect_uri_mismatch",
    "invalid_client",
    "invalid_grant",
    "unauthorized_client",
    "access_denied",
    "invalid_request",
    "unsupported_grant_type",
  ];
  for (const c of candidates) {
    for (const k of known) if (c.includes(k)) return k;
  }
  for (const c of candidates) {
    if (c.includes("token used too late") || c.includes("expired")) return "token_invalid";
    if (c.includes("wrong recipient") || c.includes("audience")) return "token_invalid";
    if (c.includes("invalid token signature") || c.includes("invalid_token")) return "token_invalid";
    if (c.includes("enotfound") || c.includes("econnreset") || c.includes("fetch failed")) return "network";
  }
  return "exchange_failed";
}
