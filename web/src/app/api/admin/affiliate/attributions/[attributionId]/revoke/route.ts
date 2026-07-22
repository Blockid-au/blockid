// POST /api/admin/affiliate/attributions/[attributionId]/revoke
//
// Soft-delete a reseller_attributions row from the admin cross-view.
// Sets status='revoked' + writes both an audit_events chain entry and a
// reseller_audit_log row so the reseller can see the override on their
// side too. Idempotent — a second call on an already-revoked row is a
// 200 no-op.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ attributionId: string }> },
) {
  const user = await getCurrentUser();
  if (!user || !isAdmin(user)) {
    return NextResponse.json(
      { ok: false, error: "Admin access required" },
      { status: 403 },
    );
  }

  const { attributionId } = await params;
  if (!attributionId || !UUID_RE.test(attributionId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_attribution_id" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json(
      { ok: false, error: "DB not configured" },
      { status: 503 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const reason = typeof body?.reason === "string" ? body.reason : "affiliate_view_revoke";

  // Load current state so the audit row captures the pre-image.
  const { data: current, error: readErr } = await supabase
    .from("reseller_attributions")
    .select(
      "id, reseller_id, subject_type, subject_user_id, subject_project_id, source, status",
    )
    .eq("id", attributionId)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { ok: false, error: readErr.message },
      { status: 500 },
    );
  }
  if (!current) {
    return NextResponse.json(
      { ok: false, error: "attribution_not_found" },
      { status: 404 },
    );
  }

  if (current.status === "revoked") {
    return NextResponse.json({ ok: true, already: true });
  }

  const now = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("reseller_attributions")
    .update({
      status: "revoked",
      metadata: {
        revoked_by: user.email,
        revoked_via: "admin_affiliate_view",
        revoked_at: now,
        reason,
      },
    })
    .eq("id", attributionId);
  if (updErr) {
    return NextResponse.json(
      { ok: false, error: updErr.message },
      { status: 500 },
    );
  }

  // Hash-chained audit trail (compliance-material state change).
  try {
    await appendAudit({
      user_id: user.id,
      actor: "admin",
      action: "reseller_attribution.revoked",
      resource_type: "reseller_attribution",
      resource_id: attributionId,
      detail: {
        reseller_id: current.reseller_id,
        subject_type: current.subject_type,
        subject_user_id: current.subject_user_id,
        subject_project_id: current.subject_project_id,
        source: current.source,
        previous_status: current.status,
        via: "admin_affiliate_view",
        reason,
      },
    });
  } catch (err) {
    // Non-fatal — DB row already flipped; log for ops.
    console.warn("[affiliate.revoke] appendAudit failed", err);
  }

  // Reseller-side audit log so reseller admins see the override too.
  try {
    await supabase.from("reseller_audit_log").insert({
      reseller_id: current.reseller_id,
      actor_user_id: user.id,
      subject_user_id: current.subject_user_id,
      action: "attribution_revoked_by_admin",
      fields: ["status"],
      route: "/api/admin/affiliate/attributions/[id]/revoke",
      ip: null,
      user_agent: null,
      metadata: { attribution_id: attributionId, source: current.source, reason },
    });
  } catch (err) {
    console.warn("[affiliate.revoke] reseller_audit_log insert failed", err);
  }

  return NextResponse.json({ ok: true, attribution_id: attributionId });
}
