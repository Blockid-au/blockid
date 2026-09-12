// Valuation certificate (S22-A) — certificate number + content hash.
//
// Both reuse the score-proof primitives (`lib/proofs`): the payload is
// canonicalised (sorted keys, no whitespace) and SHA-256'd with the
// `blockid:v1:` prefix so a certificate hash reads exactly like a score
// proof hash on the verify page and on an explorer.
//
// Node `crypto` only — no `server-only` marker so the colocated suites
// and the verify page (a server component) can both import it. Never
// import this from a "use client" file: the panel gets the number and
// hash back from the API.

import { createHash, randomBytes } from "crypto";
import { canonicalizeScore } from "@/lib/proofs/canonical-json";
import { hashScore } from "@/lib/proofs/hash";
import type { ValuationCertificateData } from "./types";

export const CERTIFICATE_NO_RE = /^VC-[0-9A-HJ-NP-Z]{5}-[0-9A-HJ-NP-Z]{5}$/;

// Crockford-ish base32 (no I, L, O — they read as 1/1/0 on paper).
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

/**
 * `VC-XXXXX-XXXXX` — 10 base32 characters (50 bits) derived from a SHA-256 of
 * `seed` plus fresh randomness, so two certificates for the same project in
 * the same second still differ. Uniqueness is enforced by the DB column; the
 * route retries on a collision.
 */
export function certificateNumber(seed: string, entropy: Buffer = randomBytes(16)): string {
  const digest = createHash("sha256").update(seed, "utf8").update(entropy).digest();
  let out = "";
  for (let i = 0; i < 10; i++) out += ALPHABET[digest[i] % ALPHABET.length];
  return `VC-${out.slice(0, 5)}-${out.slice(5, 10)}`;
}

export function isCertificateNo(v: unknown): v is string {
  return typeof v === "string" && CERTIFICATE_NO_RE.test(v);
}

/** Canonical JSON of the payload — what gets hashed and what the verify page re-hashes. */
export function canonicalCertificateJson(data: ValuationCertificateData): string {
  return canonicalizeScore(data);
}

/** `blockid:v1:<sha256 hex>` of the canonical payload. */
export function certificateContentHash(data: ValuationCertificateData): string {
  return hashScore(canonicalCertificateJson(data));
}

/** Does a stored payload still hash to the stored `content_hash`? */
export function certificateHashMatches(data: ValuationCertificateData, storedHash: string): boolean {
  return certificateContentHash(data) === storedHash;
}

/** Short fingerprint for the cover: first 12 hex chars of the digest. */
export function shortFingerprint(contentHash: string): string {
  const hex = contentHash.split(":").pop() ?? contentHash;
  return hex.slice(0, 12).toUpperCase();
}
