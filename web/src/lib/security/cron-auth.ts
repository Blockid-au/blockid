// Constant-time cron authorisation (S8-C API security review, 2026-09-11;
// every /api/cron/* route migrated onto it in S8-E).
//
// Every /api/cron/* route used to compare the Authorization header with a
// template string (`authHeader !== \`Bearer ${CRON_SECRET}\``). V8's string
// equality short-circuits on the first differing byte, which — measured over
// many requests on a quiet box — leaks how many leading bytes of the secret
// an attacker has right. Both sides are hashed to a fixed 32-byte digest and
// compared with `crypto.timingSafeEqual`, so the comparison takes the same
// time whatever was presented (the oauth2/verify-bearer.ts pattern).
//
// Accepted credential forms are explicit opt-ins (`CronAuthOptions`) so the
// set a route accepts is visible at its call site and cannot silently widen:
//   * `Authorization: Bearer <CRON_SECRET>`   — always
//   * `x-cron-secret: <CRON_SECRET>`          — `xCronSecretHeader: true`
//   * `?secret=<CRON_SECRET>`                 — `querySecret: true`
// Every form fails closed when CRON_SECRET is unset or blank — a missing
// secret must never open a route. The static guard in
// `cron-auth.routes.test.ts` forbids any other `process.env.CRON_SECRET`
// read under src/app/api/cron/** so a future route cannot regress to an
// ad-hoc compare.
//
// No `server-only` import on purpose: the helper touches only `node:crypto`
// and the request headers, so the cron routes' colocated tests keep running
// without an extra mock. Never import it from a client component anyway.

import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Constant-time string equality. Hashing first removes the length side
 * channel `timingSafeEqual` would otherwise need the caller to handle.
 */
export function safeEqualStrings(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Extract the bearer token from an Authorization header, or null. The
 * `Bearer` scheme is matched case-sensitively: every legacy cron route
 * compared against the literal `Bearer ${secret}` and their colocated tests
 * pin that a lowercase `bearer` is rejected, and S8-E must not widen what
 * is accepted.
 */
export function bearerToken(request: Pick<Request, "headers">): string | null {
  const raw = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/.exec(raw.trim());
  return m ? m[1].trim() : null;
}

export interface CronAuthOptions {
  /** Secret to compare against; defaults to `process.env.CRON_SECRET`. */
  secret?: string;
  /** Also accept the legacy `x-cron-secret: <secret>` header. */
  xCronSecretHeader?: boolean;
  /** Also accept `?secret=<secret>` in the request URL. */
  querySecret?: boolean;
}

/** The minimum a route hands us: headers, plus the URL when `querySecret` is on. */
export type CronAuthRequest = Pick<Request, "headers"> & Partial<Pick<Request, "url">>;

/**
 * The shared cron secret, for a cron route that calls a sibling cron route
 * over HTTP and needs to forward the credential. Outbound use only — never
 * compare a presented value against it; that is what `isCronAuthorised` is
 * for.
 */
export function cronSecret(): string | undefined {
  return process.env.CRON_SECRET;
}

/**
 * True when the request carries the cron secret in an accepted form.
 * `Authorization: Bearer <CRON_SECRET>` is always accepted; the legacy
 * `x-cron-secret` header and `?secret=` query are opt-in per route.
 * Always false when CRON_SECRET is unset or blank.
 *
 * The second argument may be the secret itself (kept for the S8-C call
 * shape) or a `CronAuthOptions` object.
 */
export function isCronAuthorised(request: CronAuthRequest, options?: CronAuthOptions | string): boolean {
  const opts: CronAuthOptions = typeof options === "string" ? { secret: options } : options ?? {};
  const secret = opts.secret ?? process.env.CRON_SECRET;
  if (!secret || !secret.trim()) return false;

  const presented: string[] = [];
  const bearer = bearerToken(request);
  if (bearer !== null) presented.push(bearer);
  if (opts.xCronSecretHeader) {
    const header = request.headers.get("x-cron-secret");
    if (header) presented.push(header);
  }
  if (opts.querySecret && typeof request.url === "string") {
    let fromQuery: string | null = null;
    try {
      fromQuery = new URL(request.url).searchParams.get("secret");
    } catch {
      fromQuery = null;
    }
    if (fromQuery) presented.push(fromQuery);
  }

  // Evaluate every presented form (no early return) so the number of
  // constant-time compares depends only on what the caller sent.
  let ok = false;
  for (const value of presented) {
    if (safeEqualStrings(value, secret)) ok = true;
  }
  return ok;
}
