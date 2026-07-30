/**
 * Server-side SHA-256 verification for uploaded evidence bytes.
 *
 * The client SHOULD send the sha256 it computed locally; we
 * recompute it server-side before persisting the evidence row so a
 * malicious or buggy client cannot poison the tamper-evidence chain.
 *
 * Comparison is constant-time to avoid leaking the byte position of
 * the first mismatch under a timing attack — unlikely to matter in
 * practice for this endpoint but cheap to do correctly.
 *
 * Master Upgrade Plan Phase 3 §12.4 / §5.3.
 */

import { createHash, timingSafeEqual } from "crypto";

const SHA256_HEX_RE = /^[0-9a-f]{64}$/;

/**
 * Return true iff SHA-256(fileBuffer) equals expectedSha256.
 * expectedSha256 is normalised to lowercase before comparison so
 * clients that hex-encode uppercase are tolerated.
 * Returns false (never throws) for malformed / wrong-length hex.
 */
export async function verifyEvidenceHash(
  fileBuffer: Buffer,
  expectedSha256: string,
): Promise<boolean> {
  const normalised = expectedSha256.trim().toLowerCase();
  if (!SHA256_HEX_RE.test(normalised)) return false;

  const actualHex = createHash("sha256").update(fileBuffer).digest("hex");
  const actualBuf = Buffer.from(actualHex, "hex");
  const expectedBuf = Buffer.from(normalised, "hex");
  if (actualBuf.length !== expectedBuf.length) return false;

  return timingSafeEqual(actualBuf, expectedBuf);
}
