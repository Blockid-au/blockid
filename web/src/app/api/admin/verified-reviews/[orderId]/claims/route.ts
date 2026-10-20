// PATCH /api/admin/verified-reviews/[orderId]/claims — G35 Pricing v5 P4.
//
// Body { ref: "hub:<uuid>" | "ev:<id>" | "claim:<uuid>", decision: "accept" |
// "reject", note?: string }. Admin only (requireAdmin). A reject needs a note.
// The decision is stored in report_review_claims; an Evidence Hub row
// (hub:<uuid>) is ALSO approved / rejected through lib/evidence/review.ts so
// svi_dimension_evidence.review_status stays the single source. Refused with
// 409 once the order left IN_REVIEW (refunded / delivered). Audited
// (admin.verified_review.claim).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { httpStatusFor, isUuid, recordClaimDecision } from "@/lib/verified-review/detail";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

const BODY_MAX_BYTES = 8 * 1024;
const REF_RE = /^(hub|ev|claim):[A-Za-z0-9_.:-]{1,200}$/;

async function PATCH_handler(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) return NextResponse.json({ ok: false, reason: err.code }, { status: err.code === "no_user" ? 401 : 403 });
    throw err;
  }
  const { orderId } = await params;
  if (!isUuid(orderId)) return NextResponse.json({ ok: false, reason: "bad_id" }, { status: 400 });

  const parsed = await readJsonBody<{ ref?: unknown; decision?: unknown; note?: unknown }>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  const ref = parsed.body?.ref;
  if (typeof ref !== "string" || !REF_RE.test(ref)) return NextResponse.json({ ok: false, reason: "bad_ref" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const result = await recordClaimDecision(supabase, { orderId, ref, decision: parsed.body?.decision, note: parsed.body?.note, reviewerId: user.id });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.error }, { status: httpStatusFor(result.error) });

  auditAction(result.item.decision === "accept" ? "admin.verified_review.claim_accept" : "admin.verified_review.claim_reject");
  auditNote(orderId, { ref: result.item.ref, kind: result.item.kind, review_id: result.reviewId, evidence_level: result.evidence?.row.confidence_level ?? null });
  return NextResponse.json({ ok: true, item: result.item });
}

export const PATCH = apiRoute({ route: "api/admin/verified-reviews/[orderId]/claims/route.ts", method: "PATCH" }, PATCH_handler);
