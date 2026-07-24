// POST /api/mentor/access-grant/[grantId]
//
// Founder approves (or denies) a pending mentor access request. Auth is the
// founder — not the mentor — so this route deliberately does NOT go through
// scopedReseller() (a founder is not a reseller admin). The grant row itself
// is scoped by (subject_user_id === user.id), which prevents any user from
// touching a grant that isn't for them.
//
// Body: { decision: 'approve' | 'deny' } — the tier is fixed at request time.
// The reseller_id + subject_user_id on the grant provide the audit context.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ROUTE = "/api/mentor/access-grant/[grantId]";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ grantId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, reason: "unauthorised" }, { status: 401 });

  const { grantId } = await params;
  if (typeof grantId !== "string" || grantId.length === 0) {
    return NextResponse.json({ ok: false, reason: "invalid_grant_id" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as { decision?: unknown } | null;
  const decision =
    body?.decision === "approve" || body?.decision === "deny" ? body.decision : null;
  if (!decision) {
    return NextResponse.json({ ok: false, reason: "invalid_decision" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });

  const { data: grant, error: readErr } = await supabase
    .from("mentor_access_grants")
    .select("id, mentor_user_id, subject_user_id, reseller_id, requested_tier, status")
    .eq("id", grantId)
    .maybeSingle();
  if (readErr) return NextResponse.json({ ok: false, reason: "lookup_failed", error: readErr.message }, { status: 500 });
  if (!grant) return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  if (grant.subject_user_id !== user.id) {
    return NextResponse.json({ ok: false, reason: "not_subject" }, { status: 403 });
  }
  if (grant.status !== "pending") {
    return NextResponse.json({ ok: false, reason: "not_pending", current_status: grant.status }, { status: 409 });
  }

  const now = new Date().toISOString();
  const updates =
    decision === "approve"
      ? { status: "granted", granted_at: now, granted_tier: grant.requested_tier }
      : { status: "denied", denied_at: now };

  const { data: updated, error: updErr } = await supabase
    .from("mentor_access_grants")
    .update(updates)
    .eq("id", grantId)
    .eq("subject_user_id", user.id)
    .eq("status", "pending") // guard against concurrent double-approval
    .select("id, status, granted_at, granted_tier")
    .single();
  if (updErr || !updated) {
    return NextResponse.json({ ok: false, reason: "update_failed", error: updErr?.message ?? "no_row" }, { status: 500 });
  }

  // If approved, mirror the granted tier onto reseller_attributions so
  // subsequent mentorScope() reads see the identified/pseudonymous flag.
  if (decision === "approve") {
    const { error: mirrorErr } = await supabase
      .from("reseller_attributions")
      .update({ consent_tier: grant.requested_tier })
      .eq("reseller_id", grant.reseller_id)
      .eq("subject_user_id", user.id);
    if (mirrorErr) {
      // Non-fatal — the grant is recorded, mentor UI will fall back to masked
      // fields until an operator reconciles. Log via console for the cron.
      console.warn("[mentor:access-grant] consent mirror failed", mirrorErr.message);
    }
  }

  // Audit the founder's decision. We insert directly (not through
  // resellerSupabase) because the founder is not a reseller admin, but we
  // still stamp the reseller_id from the grant row so the audit is scoped.
  const { ip, ua } = readClientMeta(request);
  const { error: auditErr } = await supabase.from("reseller_audit_log").insert({
    reseller_id: grant.reseller_id,
    actor_user_id: user.id,
    subject_user_id: user.id,
    action: decision === "approve" ? "mentor_access_grant" : "mentor_access_deny",
    fields: ["status"],
    route: ROUTE,
    ip: ip || null,
    user_agent: ua || null,
    metadata: {
      grant_id: grant.id,
      mentor_user_id: grant.mentor_user_id,
      requested_tier: grant.requested_tier,
    },
  });
  if (auditErr) {
    return NextResponse.json({ ok: false, reason: "audit_failed", error: auditErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, grant: updated });
}
