// S23-A — OAuth connector tokens sealed at rest (AES-256-GCM).
//
// Pure `node:crypto`; no `server-only`, no Supabase — imported by
// `lib/oauth-connectors.ts` (the v2 vault), the legacy `/api/oauth/*`
// callbacks, the LinkedIn poster cron, and mirrored byte-for-byte by
// `scripts/reseal-oauth-tokens.mjs` (cross-checked in its test).
//
// Wire formats
//   gcm:<iv b64>:<tag b64>:<ciphertext b64>   sealed — the only form that is
//                                             acceptable at rest in production
//   obf:<base64 plaintext>                    keyless-dev wrapper (plaintext-
//                                             equivalent; S23-A: refused once
//                                             a key exists unless migrating)
//   <anything else>                           raw legacy plaintext (the
//                                             pre-0087 `oauth_connections`
//                                             table wrote tokens verbatim) —
//                                             same policy as `obf:`
//
// Keys
//   OAUTH_TOKEN_ENCRYPTION_KEY           current — 64 hex chars = raw AES-256
//                                        key; anything else is sha256'd
//   OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS  optional, for rotation — `openToken`
//                                        tries current then previous; the
//                                        reseal script re-encrypts previous →
//                                        current so the previous key can be
//                                        dropped afterwards
//   OAUTH_TOKEN_MIGRATION=1              transitional — lets `openToken`
//                                        accept `obf:`/raw rows while a key is
//                                        set so live connectors keep working
//                                        until `reseal-oauth-tokens.mjs --write`
//                                        has run. Unset it (or =0) afterwards.
//
// Policy (mirrors lib/webhooks/sign.ts sealSecret/openSecret, S20-B P2-4)
//   * sealToken: production + no key → throws OAuthSealKeyMissingError; a
//     mis-deployed env must never persist a plaintext-equivalent token. Dev
//     without a key still writes `obf:` so local OAuth flows do not 500.
//   * openToken: key set + `obf:`/raw + migration flag off → logged once,
//     null (fail closed — the connector reports "reconnect"). No key at all
//     → `obf:`/raw still open (dev parity with the writer).
//   * Nothing here ever logs token bytes — only the form and the reason.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const GCM_PREFIX = "gcm:";
export const OBF_PREFIX = "obf:";

export type SealEnv = NodeJS.ProcessEnv;

/** The stored form of a token payload. */
export type TokenForm = "empty" | "gcm" | "obf" | "raw";

export function classifyToken(payload: string | null | undefined): TokenForm {
  if (!payload) return "empty";
  if (payload.startsWith(GCM_PREFIX)) return "gcm";
  if (payload.startsWith(OBF_PREFIX)) return "obf";
  return "raw";
}

/** True for `obf:` and raw rows — anything readable without a key. */
export function isPlaintextEquivalent(payload: string | null | undefined): boolean {
  const form = classifyToken(payload);
  return form === "obf" || form === "raw";
}

export function deriveKey(raw: string | undefined | null): Buffer | null {
  if (!raw) return null;
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function currentKey(env: SealEnv = process.env): Buffer | null {
  return deriveKey(env.OAUTH_TOKEN_ENCRYPTION_KEY);
}

export function previousKey(env: SealEnv = process.env): Buffer | null {
  return deriveKey(env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS);
}

export function isMigrationMode(env: SealEnv = process.env): boolean {
  const v = (env.OAUTH_TOKEN_MIGRATION ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export class OAuthSealKeyMissingError extends Error {
  code = "oauth_seal_key_missing";
  constructor() {
    super("OAUTH_TOKEN_ENCRYPTION_KEY is required to seal OAuth tokens in production");
    this.name = "OAuthSealKeyMissingError";
  }
}

function gcmSeal(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function gcmOpen(payload: string, key: Buffer): string | null {
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

function plainOpen(payload: string, form: TokenForm): string {
  return form === "obf" ? Buffer.from(payload.slice(OBF_PREFIX.length), "base64").toString("utf8") : payload;
}

/**
 * Seal a token for storage. Null for empty input (never coerces to "null").
 * Throws `OAuthSealKeyMissingError` in production when no key is configured.
 */
export function sealToken(plain: string | null | undefined, env: SealEnv = process.env): string | null {
  if (plain == null || plain === "") return null;
  const key = currentKey(env);
  if (!key) {
    if (env.NODE_ENV === "production") throw new OAuthSealKeyMissingError();
    return `${OBF_PREFIX}${Buffer.from(plain, "utf8").toString("base64")}`;
  }
  return gcmSeal(plain, key);
}

// One log line per process per form — the reseal runbook is the fix, not a
// log flood. Reset in tests via `_resetOpenWarnings()`.
const warned = new Set<string>();
export function _resetOpenWarnings(): void {
  warned.clear();
}
function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  console.error(`[blockid:oauth-seal] ${message}`);
}

/** Which key opened a `gcm:` payload. */
export type OpenedWith = "current" | "previous";

/**
 * Open a `gcm:` payload with current-then-previous key. Null when neither
 * opens it (tampered / unknown key / no key).
 */
export function openGcm(payload: string, env: SealEnv = process.env): { plain: string; key: OpenedWith } | null {
  const cur = currentKey(env);
  if (cur) {
    const p = gcmOpen(payload, cur);
    if (p !== null) return { plain: p, key: "current" };
  }
  const prev = previousKey(env);
  if (prev) {
    const p = gcmOpen(payload, prev);
    if (p !== null) return { plain: p, key: "previous" };
  }
  return null;
}

/**
 * Open a stored token. Null when: empty; `gcm:` and no key opens it; or a
 * plaintext-equivalent (`obf:` / raw) row is met while a key is configured
 * and OAUTH_TOKEN_MIGRATION is not on (fail closed → "reconnect").
 */
export function openToken(payload: string | null | undefined, env: SealEnv = process.env): string | null {
  const form = classifyToken(payload);
  if (form === "empty" || !payload) return null;
  if (form === "gcm") return openGcm(payload, env)?.plain ?? null;
  // obf: / raw
  const keyConfigured = Boolean(currentKey(env) || previousKey(env));
  if (keyConfigured && !isMigrationMode(env)) {
    warnOnce(
      form,
      `refusing ${form} (plaintext-equivalent) token while a sealing key is configured — run scripts/reseal-oauth-tokens.mjs --write (or set OAUTH_TOKEN_MIGRATION=1 transitionally); connector reports "reconnect"`,
    );
    return null;
  }
  return plainOpen(payload, form);
}

export type ResealAction = "skip_empty" | "unchanged" | "resealed" | "unreadable";
export type ResealSource = "empty" | "obf" | "raw" | "gcm_current" | "gcm_previous" | "gcm_unknown";

export interface ResealResult {
  action: ResealAction;
  from: ResealSource;
  /** New payload to store when `action === "resealed"`; the input otherwise (null when unreadable / empty). */
  sealed: string | null;
}

/**
 * Re-seal a stored payload under the CURRENT key regardless of the
 * migration flag (this IS the migration). Throws when no current key is set.
 *   obf:/raw           → resealed
 *   gcm (previous key) → resealed (rotation)
 *   gcm (current key)  → unchanged
 *   gcm (no key opens) → unreadable (left alone; founder must reconnect)
 */
export function resealToken(payload: string | null | undefined, env: SealEnv = process.env): ResealResult {
  const key = currentKey(env);
  if (!key) throw new OAuthSealKeyMissingError();
  const form = classifyToken(payload);
  if (form === "empty" || !payload) return { action: "skip_empty", from: "empty", sealed: null };
  if (form === "gcm") {
    const opened = openGcm(payload, env);
    if (!opened) return { action: "unreadable", from: "gcm_unknown", sealed: null };
    if (opened.key === "current") return { action: "unchanged", from: "gcm_current", sealed: payload };
    return { action: "resealed", from: "gcm_previous", sealed: gcmSeal(opened.plain, key) };
  }
  return { action: "resealed", from: form, sealed: gcmSeal(plainOpen(payload, form), key) };
}
