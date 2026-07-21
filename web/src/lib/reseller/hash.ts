// Reseller-scoped one-way hashing.
//
// Per docs/plans/reseller-module-plan.md § U.15.12 R-07 (CISO D3-CISO-07):
// any user_id written to Stripe metadata must be hashed so it cannot be
// used to correlate BlockID accounts from Stripe dashboard access.

import "server-only";
import { createHash } from "node:crypto";

/**
 * Deterministic SHA-256 hash of a user UUID, salted by a per-environment
 * secret. Set `RESELLER_METADATA_SALT` in the environment; a placeholder is
 * used only during development. Rotating the salt is a breaking change —
 * requires a Stripe metadata backfill.
 */
export function hashUserId(userId: string): string {
  if (!userId || typeof userId !== "string") {
    throw new Error("hashUserId: userId is required");
  }
  const salt =
    process.env.RESELLER_METADATA_SALT ??
    "dev-only-placeholder-salt-do-not-use-in-prod";
  return createHash("sha256")
    .update(salt)
    .update("\0")
    .update(userId)
    .digest("hex")
    .slice(0, 32); // 128-bit truncation is plenty for lookup and non-reversible
}
