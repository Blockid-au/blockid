/**
 * POST /api/verification/abr — Phase 2 Batch F sub-F4.
 *
 * Master Upgrade Plan §11.1 Business ID first-class. Signed-in owner asks
 * the platform to (re-)verify a business's ABN against the ABR. On success
 * we recompute the verification level via the pure engine and stamp
 * `projects.verification_level` + `last_verified_at`.
 *
 * Contract
 * --------
 * Request:
 *   { businessId: string (uuid); abn: string (11 digits after strip) }
 * Response:
 *   200 { ok: true, verificationLevel, abrResult }
 *   200 { ok: false, reason }   ← for domain failures we've handled cleanly
 *   401 Authentication required
 *   400 Invalid body
 *   403 Business not owned by caller
 *   503 Database not configured
 *
 * Idempotency: an in-memory guard keyed by (userId, businessId, abn,
 * UTC-day) short-circuits duplicate submissions inside the same day. This
 * is a best-effort single-process guard — the DB update itself is idempotent
 * because we always overwrite verification_level + last_verified_at with
 * server-computed values, so a duplicate slipping past the guard causes no
 * corruption. A shared Redis guard would be needed for a multi-node deploy
 * and lands with the Phase 6 businesses table.
 *
 * Audit: emits an `verification.abr_lookup` event via lib/audit/log.ts.
 * Failure to write the audit row never blocks the response (audit helper
 * swallows errors by contract).
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { lookupAbn } from "@/lib/verification/abr-adapter";
import {
  computeVerificationLevel,
  type VerificationLevel,
} from "@/lib/verification/level-engine";
import {
  extractIp,
  extractUserAgent,
  logUserAction,
} from "@/lib/audit/log";

interface RequestBody {
  businessId?: unknown;
  abn?: unknown;
}

/* ------------------------------------------------------------------ */
/* Idempotency guard (in-memory, best-effort)                          */
/* ------------------------------------------------------------------ */

const IDEMPOTENCY_TTL_MS = 26 * 60 * 60 * 1000; // Slightly > 24h so entries live through a full UTC day.
const idempotencyGuard = new Map<string, number>();

function utcDayKey(userId: string, businessId: string, abn: string): string {
  const now = new Date();
  const day = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-${String(now.getUTCDate()).padStart(2, "0")}`;
  return `${userId}::${businessId}::${abn}::${day}`;
}

function pruneExpiredIdempotencyEntries(): void {
  const now = Date.now();
  for (const [key, ts] of idempotencyGuard) {
    if (ts + IDEMPOTENCY_TTL_MS < now) idempotencyGuard.delete(key);
  }
}

/** Test-only: reset the guard. */
export function _resetIdempotencyGuard(): void {
  idempotencyGuard.clear();
}

/* ------------------------------------------------------------------ */
/* Route                                                               */
/* ------------------------------------------------------------------ */

export async function POST(request: Request): Promise<NextResponse> {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  let body: RequestBody = {};
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return NextResponse.json(
      { ok: false, reason: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const businessId = typeof body.businessId === "string" ? body.businessId : "";
  if (!/^[0-9a-f-]{36}$/i.test(businessId)) {
    return NextResponse.json(
      { ok: false, reason: "businessId must be a uuid" },
      { status: 400 },
    );
  }

  const rawAbn = typeof body.abn === "string" ? body.abn.replace(/\D+/g, "") : "";
  if (rawAbn.length !== 11) {
    return NextResponse.json(
      { ok: false, reason: "abn must be 11 digits" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, reason: "Database not configured" },
      { status: 503 },
    );
  }

  // Ownership check — the caller must own the project (Business ID scaffold).
  const { data: project, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", businessId)
    .maybeSingle();

  if (projErr) {
    console.error("[blockid:verification/abr] project lookup failed", {
      code: projErr.code,
      message: projErr.message,
    });
    return NextResponse.json(
      { ok: false, reason: "Database error" },
      { status: 500 },
    );
  }
  if (!project) {
    return NextResponse.json(
      { ok: false, reason: "Business not found" },
      { status: 404 },
    );
  }
  if (project.user_id !== user.id) {
    return NextResponse.json(
      { ok: false, reason: "Business not owned by caller" },
      { status: 403 },
    );
  }

  // Idempotency short-circuit (in-memory, single-process best-effort).
  pruneExpiredIdempotencyEntries();
  const key = utcDayKey(user.id, businessId, rawAbn);
  if (idempotencyGuard.has(key)) {
    return NextResponse.json({
      ok: false,
      reason: "duplicate_within_utc_day",
    });
  }
  idempotencyGuard.set(key, Date.now());

  // Live ABR call. Adapter returns null on missing GUID, network failure,
  // malformed payload, or unknown ABN — we surface a soft "unresolved" reply
  // so the client can decide whether to retry rather than showing an error.
  const abrResult = await lookupAbn(rawAbn);
  if (!abrResult) {
    return NextResponse.json({
      ok: false,
      reason: "abr_lookup_failed_or_unknown",
    });
  }

  // Recompute the ladder. We only KNOW abrConfirmed + abrStatus + hasBusinessId
  // from this route; the other signals stay at their persisted defaults
  // (conservative false). A follow-up sub-task in Phase 2 will fold the
  // domain/email/attestation signals into a single readVerificationInputs()
  // helper so higher rungs can also be granted here.
  const verificationLevel: VerificationLevel = computeVerificationLevel({
    hasBusinessId: true,
    abrConfirmed: true,
    abrStatus: abrResult.status,
    domainVerified: false,
    emailVerified: true, // caller is signed in, so their session email is verified
    financialsAttested: false,
    independentlyAudited: false,
    continuouslyMonitored: false,
  });

  const now = new Date().toISOString();
  const { error: updateErr } = await supabase
    .from("projects")
    .update({
      verification_level: verificationLevel,
      last_verified_at: now,
      updated_at: now,
    })
    .eq("id", businessId);

  if (updateErr) {
    console.error("[blockid:verification/abr] project update failed", {
      code: updateErr.code,
      message: updateErr.message,
    });
    return NextResponse.json(
      { ok: false, reason: "Database write failed" },
      { status: 500 },
    );
  }

  // Best-effort audit — never blocks the response.
  await logUserAction({
    userId: user.id,
    action: "verification.abr_lookup",
    subjectType: "business",
    subjectId: businessId,
    fields: {
      abn: rawAbn,
      abr_status: abrResult.status,
      entity_type: abrResult.entityType,
      verification_level: verificationLevel,
      source: abrResult.source,
    },
    route: "/api/verification/abr",
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({
    ok: true,
    verificationLevel,
    abrResult,
  });
}
