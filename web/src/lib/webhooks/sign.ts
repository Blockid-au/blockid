// S20-B — outbound webhook signing (Stripe-style).
//
//   X-BlockID-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, `${t}.${body}`)>
//   X-BlockID-Event:     <event name>
//   X-BlockID-Delivery:  <delivery uuid — idempotency key, stable across retries>
//
// Receivers recompute the HMAC over `${t}.${rawBody}` with the secret shown
// once at endpoint creation and compare in constant time, refusing a
// timestamp older than `toleranceSec` (300 s default) to bound replay.
//
// Secrets at rest: `secret_hash` (sha256 hex — never reversible, used only
// to prove "this endpoint has a secret") + `secret_enc` (AES-256-GCM sealed
// with WEBHOOK_SECRET_KEY, falling back to OAUTH_TOKEN_ENCRYPTION_KEY — the
// same scheme lib/oauth-connectors.ts uses for tokens) so the dispatcher can
// sign. With neither key set the seal degrades to a base64 `obf:` wrapper
// exactly like the OAuth tokens do — LOCAL DEV ONLY: in production
// `sealSecret` throws instead (S20-B review P2-4 — a mis-deployed env must
// not persist plaintext-equivalent secrets; the create route answers 500),
// and `openSecret` refuses an `obf:` row whenever a key IS set (logged,
// null → the dispatcher parks the endpoint as `secret_unreadable`).
//
// Pure `node:crypto`; no `server-only`, no Supabase — safe to unit test and
// to copy into the /docs verification snippet.

import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export const SIGNATURE_HEADER = "X-BlockID-Signature";
export const EVENT_HEADER = "X-BlockID-Event";
export const DELIVERY_HEADER = "X-BlockID-Delivery";
export const SIGNATURE_VERSION = "v1";
export const DEFAULT_TOLERANCE_SEC = 300;
export const SECRET_PREFIX = "whsec_";

/** New signing secret: `whsec_` + 32 random bytes (base64url). */
export function generateSecret(): string {
  return `${SECRET_PREFIX}${randomBytes(32).toString("base64url")}`;
}

/** sha256 hex of the secret — what `webhook_endpoints.secret_hash` stores. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Last 4 characters — enough for a user to tell two endpoints apart, never enough to sign. */
export function secretHint(secret: string): string {
  return secret.slice(-4);
}

/** HMAC-SHA256 hex over `${timestamp}.${body}`. */
export function computeSignature(secret: string, timestamp: number, body: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`, "utf8").digest("hex");
}

/** The `X-BlockID-Signature` header value for `body` at `timestamp` (unix seconds). */
export function buildSignatureHeader(secret: string, body: string, timestamp: number = nowSec()): string {
  return `t=${timestamp},${SIGNATURE_VERSION}=${computeSignature(secret, timestamp, body)}`;
}

export function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

export interface ParsedSignature {
  timestamp: number;
  signatures: string[];
}

/** Parse `t=…,v1=…[,v1=…]`. Null when malformed. */
export function parseSignatureHeader(header: string | null | undefined): ParsedSignature | null {
  if (!header || typeof header !== "string") return null;
  let timestamp: number | null = null;
  const signatures: string[] = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (Number.isInteger(n) && n > 0) timestamp = n;
    } else if (key === SIGNATURE_VERSION && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (timestamp === null || signatures.length === 0) return null;
  return { timestamp, signatures };
}

export type VerifyFailure = "malformed_header" | "timestamp_out_of_tolerance" | "signature_mismatch";
export type VerifyResult = { ok: true; timestamp: number } | { ok: false; reason: VerifyFailure };

/**
 * Verify a received webhook. `body` must be the RAW request body (not a
 * re-serialised object). Constant-time compare; timestamp must be within
 * `toleranceSec` of `now` (both directions — receiver clocks drift too).
 */
export function verifySignature(
  secret: string,
  header: string | null | undefined,
  body: string,
  opts: { toleranceSec?: number; now?: number } = {},
): VerifyResult {
  const parsed = parseSignatureHeader(header);
  if (!parsed) return { ok: false, reason: "malformed_header" };
  const tolerance = opts.toleranceSec ?? DEFAULT_TOLERANCE_SEC;
  const now = opts.now ?? nowSec();
  if (Math.abs(now - parsed.timestamp) > tolerance) return { ok: false, reason: "timestamp_out_of_tolerance" };
  const expected = Buffer.from(computeSignature(secret, parsed.timestamp, body), "hex");
  for (const sig of parsed.signatures) {
    const got = Buffer.from(sig, "hex");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return { ok: true, timestamp: parsed.timestamp };
  }
  return { ok: false, reason: "signature_mismatch" };
}

// ── Secret sealing (at rest) ────────────────────────────────────────────────

function sealKey(env: NodeJS.ProcessEnv = process.env): Buffer | null {
  const raw = env.WEBHOOK_SECRET_KEY || env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) return null;
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export class WebhookSealKeyMissingError extends Error {
  code = "webhook_seal_key_missing";
  constructor() {
    super("WEBHOOK_SECRET_KEY (or OAUTH_TOKEN_ENCRYPTION_KEY) is required to seal webhook secrets in production");
    this.name = "WebhookSealKeyMissingError";
  }
}

/**
 * Seal a secret for `webhook_endpoints.secret_enc`. Throws
 * `WebhookSealKeyMissingError` in production when no key is configured —
 * never store an `obf:` (plaintext-equivalent) secret where it matters.
 */
export function sealSecret(secret: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = sealKey(env);
  if (!key) {
    if (env.NODE_ENV === "production") throw new WebhookSealKeyMissingError();
    return `obf:${Buffer.from(secret, "utf8").toString("base64")}`;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `gcm:${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

/**
 * Open a sealed secret. Null when the key is missing / the payload is
 * tampered / an `obf:` row is met while a key is configured (a leftover
 * from a keyless deploy — refused rather than trusted; recreate the
 * endpoint).
 */
export function openSecret(sealed: string | null | undefined, env: NodeJS.ProcessEnv = process.env): string | null {
  if (!sealed) return null;
  const key = sealKey(env);
  if (sealed.startsWith("obf:")) {
    if (key) {
      console.error("[blockid:webhooks] refusing obf: sealed secret while a sealing key is configured — recreate the endpoint");
      return null;
    }
    return Buffer.from(sealed.slice(4), "base64").toString("utf8");
  }
  if (!sealed.startsWith("gcm:")) return null;
  const [, ivB64, tagB64, dataB64] = sealed.split(":");
  if (!key || !ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

// ── Reference receiver implementation (docs) ────────────────────────────────
//
// S20-B review P2-5: the /docs snippet used to be a hand-written copy that
// could THROW on a 64-char non-hex `v1` (`timingSafeEqual` on buffers of
// different length → RangeError → the receiver 500s). This string is the
// single source: /docs renders it verbatim and sign.test.ts executes it
// against `verifySignature` so the two cannot drift. Same rules:
//   * header `t=<int>,v1=<64 hex>[,v1=…]` — anything else → false
//   * |now − t| ≤ toleranceSec (both directions)
//   * HMAC-SHA256(secret, `${t}.${rawBody}`), constant-time compare with a
//     length guard, any listed v1 may match (key rotation)
// Dependency-free apart from node:crypto; Node 18+.

export const WEBHOOK_VERIFY_SNIPPET = `// Node 18+ — verify a BlockID webhook. rawBody = the exact bytes received, as a string.
import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyBlockIdWebhook(rawBody, header, secret, toleranceSec = 300, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof header !== "string" || !header) return false;
  let t = null;
  const signatures = [];
  for (const part of header.split(",")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (key === "t") {
      const n = Number(value);
      if (Number.isInteger(n) && n > 0) t = n;
    } else if (key === "v1" && /^[0-9a-f]{64}$/i.test(value)) {
      signatures.push(value.toLowerCase());
    }
  }
  if (t === null || signatures.length === 0) return false;
  if (Math.abs(nowSec - t) > toleranceSec) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(\`\${t}.\${rawBody}\`, "utf8").digest("hex"), "hex");
  for (const sig of signatures) {
    const got = Buffer.from(sig, "hex");
    if (got.length === expected.length && timingSafeEqual(got, expected)) return true;
  }
  return false;
}`;

/** Express usage shown under the reference implementation on /docs. */
export const WEBHOOK_VERIFY_EXPRESS_EXAMPLE = `app.post("/hooks/blockid", express.raw({ type: "application/json" }), (req, res) => {
  const ok = verifyBlockIdWebhook(req.body.toString("utf8"), req.get("${SIGNATURE_HEADER}") ?? "", process.env.BLOCKID_WEBHOOK_SECRET);
  if (!ok) return res.status(400).send("bad signature");
  const envelope = JSON.parse(req.body.toString("utf8"));
  // envelope.event === "svi.rescored" → envelope.data.svi_total, .delta, .project_id …
  res.sendStatus(200);
});`;
