/**
 * OAuth2 partner bearer verifier.
 *
 * Master Upgrade Plan §5.5 — validates a `Authorization: Bearer <token>`
 * header from a partner API caller. Splits into two layers:
 *
 *   1. `decidePartnerAccess(record, requiredScope, nowIso)` — a pure,
 *      test-friendly predicate that decides accept/deny given a fetched
 *      DB row + the requested scope + current time. Zero I/O.
 *
 *   2. `verifyPartnerBearer(header, requiredScope)` — the async wrapper
 *      that parses the header, hashes the presented bearer, does a
 *      constant-time DB lookup, and delegates the accept/deny to (1).
 *
 * All comparison against `token_hash` is via `crypto.timingSafeEqual` on
 * fixed-length SHA-256 hex digests (64 bytes) — no early-out on prefix.
 */

import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── Types ─────────────────────────────────────────────────────────

/**
 * The minimal fetched-row shape the pure predicate needs. Keeps the
 * predicate testable without a Supabase mock — callers project the DB
 * row onto this shape and pass it in.
 */
export interface OAuth2TokenRecord {
  client_id: string;
  token_hash: string;
  token_kind: "access" | "refresh";
  scopes: string[];
  expires_at: string; // ISO timestamp
  revoked_at: string | null;
  subject_user_id: string | null;
  subject_business_id: string | null;
}

export type PartnerAccessDecision =
  | {
      ok: true;
      clientId: string;
      scopes: string[];
      subject: { userId: string | null; businessId: string | null };
    }
  | {
      ok: false;
      reason:
        | "bad-format"
        | "not-found"
        | "expired"
        | "revoked"
        | "wrong-kind"
        | "scope-miss";
    };

// ─── Pure predicate (unit-tested) ──────────────────────────────────

/**
 * Decide accept/deny given a token record + required scope + current
 * time. Pure — no I/O, no clock reads outside the injected `nowIso`.
 *
 * Reasons match the union above; callers translate to a 401/403.
 */
export function decidePartnerAccess(
  record: OAuth2TokenRecord | null,
  requiredScope: string,
  nowIso: string,
): PartnerAccessDecision {
  if (!record) return { ok: false, reason: "not-found" };

  // Only access tokens are usable at the API edge; refresh tokens go
  // through the /oauth/token endpoint.
  if (record.token_kind !== "access") {
    return { ok: false, reason: "wrong-kind" };
  }

  if (record.revoked_at !== null && record.revoked_at !== undefined) {
    return { ok: false, reason: "revoked" };
  }

  const now = Date.parse(nowIso);
  const exp = Date.parse(record.expires_at);
  if (!Number.isFinite(now) || !Number.isFinite(exp) || exp <= now) {
    return { ok: false, reason: "expired" };
  }

  if (!Array.isArray(record.scopes) || !record.scopes.includes(requiredScope)) {
    return { ok: false, reason: "scope-miss" };
  }

  return {
    ok: true,
    clientId: record.client_id,
    scopes: record.scopes.slice(),
    subject: {
      userId: record.subject_user_id ?? null,
      businessId: record.subject_business_id ?? null,
    },
  };
}

// ─── Header + hash helpers ────────────────────────────────────────

/**
 * Parse the raw bearer out of an `Authorization` header value. Returns
 * `null` for anything malformed — the caller renders that as 401.
 */
export function parseBearerHeader(header: string | null | undefined): string | null {
  if (typeof header !== "string") return null;
  const trimmed = header.trim();
  if (trimmed.length === 0) return null;
  // Case-insensitive scheme match; the token part MUST be non-empty and
  // must not contain whitespace.
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]+)$/i.exec(trimmed);
  if (!m) return null;
  return m[1];
}

/**
 * SHA-256 hex digest of the raw bearer — the shape stored in
 * `oauth2_tokens.token_hash`.
 */
export function hashBearer(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Constant-time hex-string comparison. Both inputs must be equal-length
 * hex; anything else returns false without leaking length via early-out.
 */
export function constantTimeHexEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

// ─── Async wrapper (I/O) ──────────────────────────────────────────

/**
 * Validate a partner bearer + scope. Reads once from `oauth2_tokens`,
 * constant-time compares the hash, then hands off to `decidePartnerAccess`.
 */
export async function verifyPartnerBearer(
  header: string | null | undefined,
  requiredScope: string,
): Promise<PartnerAccessDecision> {
  const raw = parseBearerHeader(header);
  if (!raw) return { ok: false, reason: "bad-format" };

  const admin = getSupabaseAdmin();
  if (!admin) return { ok: false, reason: "not-found" };

  const hash = hashBearer(raw);

  const { data, error } = await admin
    .from("oauth2_tokens")
    .select(
      "client_id, token_hash, token_kind, scopes, expires_at, revoked_at, subject_user_id, subject_business_id",
    )
    .eq("token_hash", hash)
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "not-found" };

  // Defence in depth: even though we filtered by token_hash, still do a
  // constant-time compare on the returned value in case a future join
  // or view returns a prefix-matched row.
  if (!constantTimeHexEqual(hash, String((data as Record<string, unknown>).token_hash))) {
    return { ok: false, reason: "not-found" };
  }

  return decidePartnerAccess(
    data as unknown as OAuth2TokenRecord,
    requiredScope,
    new Date().toISOString(),
  );
}
