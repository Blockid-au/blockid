/**
 * W3C Verifiable Credential (VC) issuer keypair — sign/verify surface.
 *
 * Master Upgrade Plan §11.1 (BCR-* verifiable-credential lane) + §5.6.
 *
 * Algorithm: Ed25519 (EdDSA / RFC 8032). JOSE alg `EdDSA`. Chosen because:
 *   • deterministic signatures (no per-sig RNG),
 *   • 64-byte signature (compact JWTs on-the-wire),
 *   • widely supported by W3C VC verifiers (did:web + JWK OKP).
 *
 * Keypair storage:
 *   • PUBLIC key is served at `/.well-known/did.json` (did:web:blockid.au).
 *     Anyone can retrieve it and verify a VC without contacting BlockID.
 *   • PRIVATE key is read from env `BID_VC_ISSUER_PRIVATE_KEY_PEM` (PKCS#8
 *     PEM). Production storage: Vault / GCP Secret Manager. NEVER logged,
 *     NEVER committed. If absent, `signVc()` throws — a fail-fast that
 *     stops us silently emitting unsigned garbage.
 *
 * Test-time override: in vitest we materialise a fresh Ed25519 keypair via
 * `generateTestKeypair()` and bind it with `__setTestKeypair()` — this
 * lets the round-trip tests exercise the real crypto path without ever
 * needing a real production key.
 *
 * Compact JWT layout (three base64url segments joined by `.`):
 *   HEADER  = { alg: "EdDSA", typ: "JWT", kid: DID_KEY_ID }
 *   PAYLOAD = { iss, sub, iat, exp, jti, vc: {…W3C credentialSubject…}, nbf }
 *   SIG     = Ed25519(HEADER + "." + PAYLOAD)
 *
 * The signature covers the exact base64url-encoded header + payload bytes,
 * which is what any conformant JWT verifier reconstructs; a canonical-JSON
 * pass on payload alone is neither necessary nor sufficient here (JWS spec
 * §5.1 already fixes the input).
 */

import "server-only";
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as edSign,
  verify as edVerify,
  type KeyObject,
} from "crypto";

// ─── Constants ──────────────────────────────────────────────────────

export const DID_ISSUER = "did:web:blockid.au";
export const DID_KEY_ID = `${DID_ISSUER}#issuer-key-1`;
export const VC_JWT_ALG = "EdDSA";
export const VC_JWT_TYP = "JWT";

// ─── Types ──────────────────────────────────────────────────────────

export type VcCredentialType =
  | "BusinessIdentity"
  | "TrustLevel"
  | "UnicornStage";

/**
 * The claim body passed to `signVc`. `iat`/`exp`/`iss` are stamped by the
 * signer, not the caller — that keeps skew and issuer-DID drift centralised.
 */
export interface VcPayloadInput {
  sub: string; // credential subject id (typically `${SITE_URL}/id/${slug}`)
  jti: string; // credential id — reused as revocation ref
  ttlSeconds?: number; // default 90 days
  vc: {
    "@context": string[];
    type: string[];
    credentialSubject: Record<string, unknown>;
    [key: string]: unknown;
  };
}

/**
 * The full signed payload as it appears on the wire (post-verify).
 */
export interface VcPayload {
  iss: string;
  sub: string;
  iat: number;
  nbf: number;
  exp: number;
  jti: string;
  vc: VcPayloadInput["vc"];
}

// ─── Keypair resolution ─────────────────────────────────────────────

let cachedPublic: KeyObject | null = null;
let cachedPrivate: KeyObject | null = null;
let testOverride = false;

/**
 * Test-only helper: bind an in-memory keypair for the vitest round-trip
 * suites. Ignored in production (never called from app code).
 */
export function __setTestKeypair(
  publicKey: KeyObject,
  privateKey: KeyObject,
): void {
  cachedPublic = publicKey;
  cachedPrivate = privateKey;
  testOverride = true;
}

/**
 * Test-only helper: forget the injected keypair so the next call re-reads
 * from env. Called from `afterEach` in the sign/verify suite.
 */
export function __resetTestKeypair(): void {
  cachedPublic = null;
  cachedPrivate = null;
  testOverride = false;
}

/**
 * Generate a fresh Ed25519 keypair — used by tests, and documented in
 * `.env.example` as the one-shot equivalent of the `openssl genpkey`
 * one-liner. Never call this at request time.
 */
export function generateTestKeypair(): {
  publicKey: KeyObject;
  privateKey: KeyObject;
} {
  return generateKeyPairSync("ed25519");
}

function loadPrivateKey(): KeyObject {
  if (cachedPrivate) return cachedPrivate;
  const pem = process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM;
  if (!pem || !pem.includes("PRIVATE KEY")) {
    throw new Error(
      "[vc:issuer] BID_VC_ISSUER_PRIVATE_KEY_PEM missing — refusing to " +
        "sign a Verifiable Credential without a real Ed25519 issuer key. " +
        "See web/.env.example for the openssl one-liner and Vault path.",
    );
  }
  cachedPrivate = createPrivateKey({ key: pem, format: "pem" });
  return cachedPrivate;
}

function loadPublicKey(): KeyObject {
  if (cachedPublic) return cachedPublic;
  // Derive the public key from the private key so we NEVER need to ship a
  // separate public-PEM env — a mismatch would silently break every verifier.
  const priv = loadPrivateKey();
  cachedPublic = createPublicKey(priv);
  return cachedPublic;
}

/**
 * Public JWK (OKP / Ed25519) for the DID document. `crypto` returns the
 * modern JWK shape natively — we only trim to the canonical members the
 * DID resolvers expect (`kty`, `crv`, `x`).
 */
export function publicJwk(): { kty: string; crv: string; x: string } {
  const pub = loadPublicKey();
  const jwk = pub.export({ format: "jwk" }) as Record<string, string>;
  return { kty: jwk.kty ?? "OKP", crv: jwk.crv ?? "Ed25519", x: jwk.x ?? "" };
}

/**
 * True when a signing key is present — used by health checks to surface a
 * clear amber signal in dev/staging without crashing every request.
 */
export function issuerKeyConfigured(): boolean {
  if (testOverride) return cachedPrivate !== null;
  return typeof process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM === "string" &&
    process.env.BID_VC_ISSUER_PRIVATE_KEY_PEM.includes("PRIVATE KEY");
}

// ─── base64url helpers ──────────────────────────────────────────────

function b64url(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : input;
  return buf
    .toString("base64")
    .replace(/=+$/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function b64urlDecode(input: string): Buffer {
  const pad = input.length % 4 === 0 ? 0 : 4 - (input.length % 4);
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(pad);
  return Buffer.from(b64, "base64");
}

// ─── Sign ───────────────────────────────────────────────────────────

/**
 * Sign a VC payload and return a compact JWT (`header.payload.signature`).
 *
 * Stamps `iss`, `iat`, `nbf`, `exp` — callers only supply the domain-shape
 * fields (`sub`, `jti`, `vc`, optional `ttlSeconds`). Default TTL is 90 days.
 */
export async function signVc(input: VcPayloadInput): Promise<string> {
  const priv = loadPrivateKey();
  const now = Math.floor(Date.now() / 1000);
  const ttl = Math.max(60, input.ttlSeconds ?? 60 * 60 * 24 * 90);

  const header = { alg: VC_JWT_ALG, typ: VC_JWT_TYP, kid: DID_KEY_ID };
  const payload: VcPayload = {
    iss: DID_ISSUER,
    sub: input.sub,
    iat: now,
    nbf: now,
    exp: now + ttl,
    jti: input.jti,
    vc: input.vc,
  };

  const encHeader = b64url(JSON.stringify(header));
  const encPayload = b64url(JSON.stringify(payload));
  const signingInput = `${encHeader}.${encPayload}`;

  // Ed25519 in Node's `crypto.sign(null, ...)` ignores the digest arg — the
  // spec fixes it as SHA-512 internally. Passing `null` is the correct call.
  const sig = edSign(null, Buffer.from(signingInput, "utf8"), priv);
  const encSig = b64url(sig);

  return `${signingInput}.${encSig}`;
}

// ─── Verify ─────────────────────────────────────────────────────────

/**
 * Verify a VC JWT against the issuer's public key. Returns the parsed
 * payload on success, or `null` on any failure — signature mismatch,
 * malformed segments, wrong issuer, wrong alg, expired, or not-yet-valid.
 *
 * Deliberately never throws — callers should treat null as "reject".
 */
export async function verifyVc(jwt: string): Promise<VcPayload | null> {
  if (typeof jwt !== "string") return null;
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;

  let header: Record<string, unknown>;
  let payload: VcPayload;
  try {
    header = JSON.parse(b64urlDecode(parts[0]).toString("utf8"));
    payload = JSON.parse(b64urlDecode(parts[1]).toString("utf8")) as VcPayload;
  } catch {
    return null;
  }

  if (header?.alg !== VC_JWT_ALG || header?.typ !== VC_JWT_TYP) return null;
  if (payload?.iss !== DID_ISSUER) return null;

  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp <= now) return null;
  if (typeof payload.nbf === "number" && payload.nbf > now + 5) return null;
  if (typeof payload.iat !== "number" || payload.iat > now + 5) return null;

  const pub = loadPublicKey();
  const signingInput = `${parts[0]}.${parts[1]}`;
  const sig = b64urlDecode(parts[2]);
  const ok = edVerify(null, Buffer.from(signingInput, "utf8"), pub, sig);
  if (!ok) return null;

  return payload;
}
