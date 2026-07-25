// Deterministic idempotency-key helper for Stripe mutating requests.
//
// Stripe recommends attaching an Idempotency-Key on every mutating POST
// (including checkout.sessions.create) so a client retry — a double-click, a
// dropped connection, or a browser refresh — does not create a duplicate
// resource. Same key within Stripe's 24-hour retention window returns the
// original response verbatim.
//
// We bucket by the hour so honest re-tries collapse but a user who genuinely
// abandons and returns much later still gets a fresh session. Keys are
// deterministic in the request inputs — no random or time-of-day noise.

import "server-only";
import { createHash } from "node:crypto";

/** Current UTC hour bucket (seconds since epoch / 3600, floored). */
function hourBucket(now: number = Date.now()): number {
  return Math.floor(now / 3_600_000);
}

/**
 * Build a Stripe idempotency key from a scope + arbitrary parts.
 *
 * The scope names the caller (e.g. "checkout", "credits", "analysis"). Parts
 * capture the request inputs that would need to differ to warrant a NEW
 * Stripe resource (user id, plan id, credit pack size, email, tier …).
 *
 * Output shape: `bid:<scope>:<hourBucket>:<sha256-12>`.
 */
export function sessionIdempotencyKey(
  scope: string,
  parts: Array<string | number | null | undefined>,
): string {
  const material = parts
    .map((p) => (p == null ? "" : String(p)))
    .join("|");
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 12);
  return `bid:${scope}:${hourBucket()}:${digest}`;
}
