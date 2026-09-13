// Auth rate-limit keys for /api/auth/register + /api/auth/login-password
// (release QA-2 F7).
//
// Before: both routes keyed on the FIRST `x-forwarded-for` hop — a value
// the client controls (S8-C rule: only `cf-connecting-ip` or the LAST hop,
// which nginx appends, is trustworthy) — and every user behind one egress
// (QA lanes, an office NAT, a mobile carrier) shared a single 3- or 5-token
// bucket, so a second person logging in got a 429.
//
// Now two buckets per route, checked in order:
//   1. a wide per-IP CEILING (`<kind>:ip:<ip>`) — the abuse cap; checked
//      before the body is parsed so a malformed-body probe still burns a
//      token and still sees 429 (gate-precedence invariant in the route
//      tests);
//   2. the tight per-IDENTITY bucket (`<kind>:<ip>:<sha256(email)[0..16]>`)
//      — brute-force / re-register protection for one account from one
//      place. Different accounts behind the same IP no longer collide.
//
// Emails never appear raw in a key (the admin dashboard snapshots keys).

import { createHash } from "node:crypto";
import { checkRateLimit } from "@/lib/rate-limit";
import { clientIpFromHeaders } from "@/lib/iphash";

export type AuthRateLimitKind = "register" | "register-with-card" | "login";

const WINDOW_MS = 15 * 60 * 1000;

// S31-C capacity audit (2026-09-13): the per-IP ceilings were sized for an
// office NAT (20 sign-ups / 15 min). A trial wave arrives from university
// labs, accelerator cohorts and mobile CGNAT where hundreds of real people
// share one egress, so the ceilings now only bound scripted floods; the
// per-(IP, email) buckets stay at 5 and remain the brute-force / re-register
// defence. `register-with-card` (the trial sign-up path) used to be a bare
// `register-with-card:<ip>` 5 / 15 min key — the 6th trial sign-up from one
// campus got `rate_limited`.
export const AUTH_RATE_LIMITS: Record<
  AuthRateLimitKind,
  { perIp: { max: number; windowMs: number }; perIdentity: { max: number; windowMs: number } }
> = {
  // Register: 5 attempts for the same email from the same IP; 60 sign-ups
  // per IP per 15 min as the ceiling (a classroom fits; a script does not).
  register: { perIp: { max: 60, windowMs: WINDOW_MS }, perIdentity: { max: 5, windowMs: WINDOW_MS } },
  // Card-required trial sign-up: same shape as register. Stripe's own
  // card-testing controls sit behind this, so the ceiling is the same.
  "register-with-card": { perIp: { max: 60, windowMs: WINDOW_MS }, perIdentity: { max: 5, windowMs: WINDOW_MS } },
  // Login: 5 attempts per account per IP (D3-CISO brute-force cap kept);
  // 120 per IP per 15 min as the credential-stuffing ceiling (one campus
  // logging in after a lecture is ~1 per person; a stuffing script is not).
  login: { perIp: { max: 120, windowMs: WINDOW_MS }, perIdentity: { max: 5, windowMs: WINDOW_MS } },
};

/** Trusted client IP for rate-limit keys: cf-connecting-ip → last XFF hop → x-real-ip → "unknown". */
export function authRateLimitIp(headers: Headers): string {
  return clientIpFromHeaders(headers) ?? "unknown";
}

/** Short, non-reversible bucket id for an email (lower-cased, trimmed). */
export function emailBucketHash(email: string): string {
  return createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export interface AuthRateLimitVerdict {
  allowed: boolean;
  resetIn: number;
}

/** Bucket 1 — per-IP ceiling. Call before parsing the body. */
export function checkAuthIpCeiling(kind: AuthRateLimitKind, headers: Headers): AuthRateLimitVerdict {
  const { max, windowMs } = AUTH_RATE_LIMITS[kind].perIp;
  const rl = checkRateLimit(`${kind}:ip:${authRateLimitIp(headers)}`, max, windowMs);
  return { allowed: rl.allowed, resetIn: rl.resetIn };
}

/** Bucket 2 — per (IP, email) identity. Call once the email has been validated. */
export function checkAuthIdentityLimit(
  kind: AuthRateLimitKind,
  headers: Headers,
  email: string,
): AuthRateLimitVerdict {
  const { max, windowMs } = AUTH_RATE_LIMITS[kind].perIdentity;
  const rl = checkRateLimit(
    `${kind}:${authRateLimitIp(headers)}:${emailBucketHash(email)}`,
    max,
    windowMs,
  );
  return { allowed: rl.allowed, resetIn: rl.resetIn };
}
