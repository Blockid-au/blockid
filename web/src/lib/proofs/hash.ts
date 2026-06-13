/**
 * SHA-256 hashing for tamper-evident score proofs.
 *
 * Uses Node.js built-in `crypto` module — no external dependencies.
 * Prefix format: `blockid:v1:<hex>` makes BlockID hashes unambiguous
 * when shared externally (e.g. on a blockchain explorer or audit report).
 */

import { createHash } from "crypto";

const HASH_PREFIX = "blockid:v1:";

/**
 * Compute a SHA-256 hash of the canonical JSON string.
 * Returns a prefixed hex string: `blockid:v1:<64-char hex>`.
 */
export function hashScore(canonicalJson: string): string {
  const hex = createHash("sha256").update(canonicalJson, "utf8").digest("hex");
  return `${HASH_PREFIX}${hex}`;
}

/**
 * Strip the prefix and return the raw 64-char hex digest, or null if the
 * string does not look like a BlockID v1 hash.
 */
export function rawHex(prefixedHash: string): string | null {
  if (!prefixedHash.startsWith(HASH_PREFIX)) return null;
  return prefixedHash.slice(HASH_PREFIX.length);
}
