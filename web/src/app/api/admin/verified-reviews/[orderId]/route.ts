// PATCH /api/admin/verified-reviews/[orderId] — G35 Pricing v5 P4.
//
// Body { notes: string | null } — the reviewer's internal notes on a Verified
// review (report_reviews.notes, admin-only RLS; never shown to the buyer).
// Admin only. Refused with 409 once the order left IN_REVIEW. Audited
// (admin.verified_review.notes).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { readJsonBody } from "@/lib/security/request-guards";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { httpStatusFor, isUuid, saveReviewNotes } from "@/lib/verified-review/detail";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ orderId: string }> };

const BODY_MAX_BYTES = 24 * 1024;

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

  const parsed = await readJsonBody<{ notes?: unknown }>(request, BODY_MAX_BYTES);
  if (!parsed.ok) return parsed.response;
  if (!parsed.body || !("notes" in parsed.body)) return NextResponse.json({ ok: false, reason: "notes_required" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const result = await saveReviewNotes(supabase, { orderId, notes: parsed.body.notes ?? null, reviewerId: user.id });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.error }, { status: httpStatusFor(result.error) });

  auditAction("admin.verified_review.notes");
  auditNote(orderId, { review_id: result.reviewId, notes_length: result.notes?.length ?? 0 });
  return NextResponse.json({ ok: true, notes: result.notes });
}

export const PATCH = apiRoute({ route: "api/admin/verified-reviews/[orderId]/route.ts", method: "PATCH" }, PATCH_handler);
