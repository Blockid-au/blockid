// POST /api/admin/verified-reviews/[orderId]/mark-reviewed — G35 Pricing v5 P4.
//
// Admin only (requireAdmin + markReviewed's own reviewer.isAdmin check).
// Idempotent: a second call on a delivered order answers 200
// { alreadyReviewed: true } and sends nothing. Refused with 409 when the
// order is refunded / not in review / not Verified / has no report. The
// whole flow (recompute, IN_REVIEW → READY compare-and-set, badge, Investor
// Pack without credits, buyer e-mail, analytics, audit rows) lives in
// lib/verified-review/mark-reviewed.ts. Audited (admin.verified_review.mark_reviewed).

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { apiRoute } from "@/lib/audit/api-route";
import { auditAction, auditNote } from "@/lib/audit/context";
import { httpStatusFor, isUuid } from "@/lib/verified-review/detail";
import { markReviewed } from "@/lib/verified-review/mark-reviewed";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 120;

type Params = { params: Promise<{ orderId: string }> };

async function POST_handler(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) return NextResponse.json({ ok: false, reason: err.code }, { status: err.code === "no_user" ? 401 : 403 });
    throw err;
  }
  const { orderId } = await params;
  if (!isUuid(orderId)) return NextResponse.json({ ok: false, reason: "bad_id" }, { status: 400 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const result = await markReviewed(supabase, { orderId, reviewer: { id: user.id, displayName: user.displayName, isAdmin: isAdmin(user) } });
  if (!result.ok) return NextResponse.json({ ok: false, reason: result.error }, { status: httpStatusFor(result.error) });

  auditAction("admin.verified_review.mark_reviewed");
  auditNote(orderId, {
    already_reviewed: result.alreadyReviewed,
    repaired: result.repaired,
    verification_level: result.verificationLevel,
    evidence_confidence: result.evidenceConfidence,
    email_sent: result.emailSent,
    sla_met: result.slaMet,
    warnings: result.warnings.length,
  });
  return NextResponse.json(result);
}

export const POST = apiRoute({ route: "api/admin/verified-reviews/[orderId]/mark-reviewed/route.ts", method: "POST" }, POST_handler);
