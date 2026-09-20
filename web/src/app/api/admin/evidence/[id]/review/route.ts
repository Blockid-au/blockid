// PATCH /api/admin/evidence/[id]/review — G14-S36 reviewer decision.
//
// Body { decision: "approve" | "reject", note?: string }. Admin only
// (requireAdmin — the same gate every /api/admin/* route uses). The only
// writer of `confidence_level = 'third_party_verified'` on
// svi_dimension_evidence (migration 0407 CHECK); the founder's own upload
// route caps at document_uploaded (lib/evidence/confidence-cap.ts D4).
// Only rows the founder queued ("Request verification" → review_status =
// 'pending') can be decided. Audited via apiRoute (admin.evidence.review).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { REVIEW_NOTE_MAX, applyEvidenceReview, isReviewDecision } from "@/lib/evidence/review";
import { emitEvidenceVerified } from "@/lib/analytics/fi-events";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

const BODY_MAX_BYTES = 8 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function PATCH_handler(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: err.code === "no_user" ? 401 : 403 });
    }
    throw err;
  }

  const { id } = await params;
  if (!UUID_RE.test(id ?? "")) {
    return NextResponse.json({ ok: false, reason: "bad_id" }, { status: 400 });
  }

  const parsed = await readJsonBody<{ decision?: unknown; note?: unknown }>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const decision = parsed.body?.decision;
  if (!isReviewDecision(decision)) {
    return NextResponse.json({ ok: false, reason: "bad_decision" }, { status: 400 });
  }
  const note = typeof parsed.body?.note === "string" ? parsed.body.note : null;
  if (note && note.length > REVIEW_NOTE_MAX) {
    return NextResponse.json({ ok: false, reason: "note_too_long", max: REVIEW_NOTE_MAX }, { status: 400 });
  }
  if (decision === "reject" && !(note && note.trim())) {
    return NextResponse.json({ ok: false, reason: "note_required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const result = await applyEvidenceReview(supabase, { evidenceId: id, decision, reviewerUserId: user.id, note });
  if (!result.ok) {
    const status = result.error === "not_found" ? 404 : result.error === "not_pending" ? 409 : 500;
    return NextResponse.json({ ok: false, reason: result.error }, { status });
  }

  auditAction(decision === "approve" ? "admin.evidence.approve" : "admin.evidence.reject");
  if (decision === "approve") {
    // G21 P1-C — FI analytics: evidence_verified (organisation = the project
    // owner, looked up from the project; startup = project).
    let ownerUserId: string | null = null;
    try {
      const { data: proj } = await supabase.from("projects").select("user_id").eq("id", result.row.project_id).maybeSingle();
      ownerUserId = ((proj as { user_id?: string } | null)?.user_id as string | undefined) ?? null;
    } catch {
      ownerUserId = null;
    }
    emitEvidenceVerified({
      ownerUserId,
      actorUserId: user.id,
      email: user.email,
      projectId: result.row.project_id,
      channel: "admin_review",
      evidenceId: result.row.id,
      level: result.row.confidence_level,
      reviewerId: user.id,
      dimension: result.row.dimension,
      evidenceType: result.row.evidence_type,
    });
  }
  auditNote(result.row.id, {
    project_id: result.row.project_id,
    dimension: result.row.dimension,
    evidence_type: result.row.evidence_type,
    confidence_level: result.row.confidence_level,
    linked_evidence_id: result.linked?.evidenceId ?? null,
  });

  return NextResponse.json({ ok: true, decision, row: result.row, linked: result.linked });
}

// S20-A — audited via apiRoute (src/lib/audit/api-route.ts).
export const PATCH = apiRoute({ route: "api/admin/evidence/[id]/review/route.ts", method: "PATCH" }, PATCH_handler);
