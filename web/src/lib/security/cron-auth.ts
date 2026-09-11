// Constant-time cron authorisation (S8-C API security review, 2026-09-11).
//
// Every /api/cron/* route used to compare the Authorization header with a
// template string (`authHeader !== \`Bearer ${CRON_SECRET}\``). V8's string
// equality short-circuits on the first differing byte, which — measured over
// many requests on a quiet box — leaks how many leading bytes of the secret
// an attacker has right. Both sides are hashed to a fixed 32-byte digest and
// compared with `crypto.timingSafeEqual`, so the comparison takes the same
// time whatever was presented (the oauth2/verify-bearer.ts pattern).
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

/** Extract the bearer token from an Authorization header, or null. */
export function bearerToken(request: Pick<Request, "headers">): string | null {
  const raw = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(raw.trim());
  return m ? m[1].trim() : null;
}

/**
 * True when the request carries `Authorization: Bearer <CRON_SECRET>`.
 * Always false when CRON_SECRET is unset or blank — a missing secret must
 * never open the route.
 */
export function isCronAuthorised(request: Pick<Request, "headers">, secret: string | undefined = process.env.CRON_SECRET): boolean {
  if (!secret || !secret.trim()) return false;
  const presented = bearerToken(request);
  if (presented === null) return false;
  return safeEqualStrings(presented, secret);
}
