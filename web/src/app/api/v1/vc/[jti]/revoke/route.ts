/**
 * POST /api/v1/vc/[jti]/revoke — owner-only credential revocation.
 *
 * Master Upgrade Plan §11.1 (BCR-* Verifiable Credential lane) + §9.4
 * (revocations registry — migration 0252).
 *
 * Contract:
 *   • Auth: session cookie. Caller must own the underlying business
 *     (projects.user_id === current user id). No admin-override door —
 *     compromising an operator account should not silently poison every
 *     partner's stored badges.
 *   • Body: `{ reason: string }` — free-form (<= 500 chars). Persisted to
 *     revocations.reason for the auditor trail.
 *   • Idempotency: a second revoke of the same jti is a 200 no-op that
 *     returns the original revocation timestamp. The registry unique
 *     constraint (revocation_kind, revoked_ref) already dedupes at the
 *     DB layer — we surface that as "ok:true, alreadyRevoked:true".
 *   • Best-effort Anvil anchor: the JTI is fire-and-forget-queued for the
 *     nightly RevocationRegistry.revoke(jti) transaction. Never blocks
 *     the response — verifiers relying on chain state accept eventual
 *     consistency (the /.well-known/revocations feed is authoritative
 *     until the anchor cron catches up).
 *
 * Errors: 401 (no session), 403 (session != owner), 404 (unknown jti),
 * 400 (missing reason), 500 (DB error).
 */

import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function clientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "anon"
  );
}

interface RouteParams {
  params: Promise<{ jti: string }>;
}

/**
 * Fire-and-forget Anvil anchor for `RevocationRegistry.revoke(jti)`. Never
 * awaited — the day's revocations get batched into a Merkle root by the
 * cron regardless, so a same-request tx would only double up.
 */
function queueRevocationAnchor(jti: string): void {
  Promise.resolve().then(async () => {
    try {
      // Anchor cron reads revocations.anchor_tx IS NULL — no per-request
      // action needed today. Placeholder for the direct-write flow if we
      // ever move off batched anchoring.
      void jti;
    } catch {
      // Anchor is a transparency layer, not a correctness dependency.
    }
  });
}

export async function POST(req: NextRequest, ctx: RouteParams) {
  const { jti } = await ctx.params;

  // ─── Rate limit ────────────────────────────────────────────────
  const rl = checkRateLimit(`api:v1:vc:revoke:${clientIp(req)}`, 30, 60_000);
  if (!rl.allowed) {
    const retrySeconds = Math.ceil(rl.resetIn / 1000);
    return NextResponse.json(
      {
        error: {
          code: "rate_limited",
          message: `Rate limit exceeded (30/min). Retry in ${retrySeconds}s.`,
          retryInSeconds: retrySeconds,
        },
      },
      { status: 429, headers: { ...CORS, "Retry-After": String(retrySeconds) } },
    );
  }

  // ─── Auth ──────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required." } },
      { status: 401, headers: CORS },
    );
  }

  // ─── Body ──────────────────────────────────────────────────────
  let body: { reason?: unknown };
  try {
    body = (await req.json()) as { reason?: unknown };
  } catch {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Body must be JSON." } },
      { status: 400, headers: CORS },
    );
  }
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason || reason.length > 500) {
    return NextResponse.json(
      {
        error: {
          code: "bad_request",
          message: "reason is required (1..500 chars).",
        },
      },
      { status: 400, headers: CORS },
    );
  }

  if (!jti || typeof jti !== "string" || jti.length > 200) {
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid jti." } },
      { status: 400, headers: CORS },
    );
  }

  // ─── Resolve VC row + owner ───────────────────────────────────
  const admin = getSupabaseAdmin();
  if (!admin) {
    return NextResponse.json(
      { error: { code: "unavailable", message: "Store unavailable." } },
      { status: 503, headers: CORS },
    );
  }

  const { data: vcRow } = await admin
    .from("vc_issued")
    .select("id, jti, subject_business_id, revocation_id")
    .eq("jti", jti)
    .maybeSingle();

  if (!vcRow) {
    return NextResponse.json(
      { error: { code: "not_found", message: "Credential not found." } },
      { status: 404, headers: CORS },
    );
  }

  // Owner check via projects.user_id — the identity column on projects
  // per 0105_project_members header. We deliberately do not consult the
  // member table here: only the owner-of-record may revoke, matching the
  // "root of trust" invariant on the credential.
  const { data: proj } = await admin
    .from("projects")
    .select("user_id")
    .eq("id", vcRow.subject_business_id)
    .maybeSingle();

  if (!proj || proj.user_id !== user.id) {
    return NextResponse.json(
      { error: { code: "forbidden", message: "Only the business owner can revoke this credential." } },
      { status: 403, headers: CORS },
    );
  }

  // ─── Idempotency ───────────────────────────────────────────────
  if (vcRow.revocation_id) {
    // Already revoked. Fetch the existing revocation row so the response
    // matches the shape a fresh revoke would return.
    const { data: existing } = await admin
      .from("revocations")
      .select("id, revoked_at, reason")
      .eq("id", vcRow.revocation_id)
      .maybeSingle();
    return NextResponse.json(
      {
        ok: true,
        alreadyRevoked: true,
        jti,
        revocationId: vcRow.revocation_id,
        revokedAt: existing?.revoked_at ?? null,
        reason: existing?.reason ?? null,
      },
      { status: 200, headers: CORS },
    );
  }

  // ─── Insert revocation row ─────────────────────────────────────
  // The UNIQUE(revocation_kind, revoked_ref) constraint on migration 0252
  // makes this idempotent at the DB layer — we upsert-select the row to
  // survive a race with a concurrent revoke.
  const { data: revRow, error: revErr } = await admin
    .from("revocations")
    .insert({
      revocation_kind: "verifiable_credential",
      revoked_ref: jti,
      revoked_by_user_id: user.id,
      reason,
    })
    .select("id, revoked_at, reason")
    .single();

  let revocationId: string | null = revRow?.id ?? null;
  let revokedAt: string | null = revRow?.revoked_at ?? null;
  let storedReason: string | null = revRow?.reason ?? null;

  if (revErr) {
    // Likely the UNIQUE conflict — re-read the row to get its id.
    const { data: existing } = await admin
      .from("revocations")
      .select("id, revoked_at, reason")
      .eq("revocation_kind", "verifiable_credential")
      .eq("revoked_ref", jti)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json(
        { error: { code: "revoke_failed", message: "Could not persist revocation." } },
        { status: 500, headers: CORS },
      );
    }
    revocationId = existing.id;
    revokedAt = existing.revoked_at;
    storedReason = existing.reason;
  }

  // ─── Link vc_issued → revocations ──────────────────────────────
  await admin
    .from("vc_issued")
    .update({ revocation_id: revocationId })
    .eq("jti", jti);

  queueRevocationAnchor(jti);

  return NextResponse.json(
    {
      ok: true,
      alreadyRevoked: false,
      jti,
      revocationId,
      revokedAt,
      reason: storedReason,
    },
    { status: 200, headers: CORS },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
