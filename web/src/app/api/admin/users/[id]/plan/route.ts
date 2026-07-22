// POST /api/admin/users/[id]/plan — change a user's plan slug.
//
// Body: { plan: string, reconcile_credits?: boolean }
//
// Slug shape: /^[a-z][a-z0-9_]{0,63}$/ so an admin can flip a user onto
// either a v2 plans.csv id (founder_growth, investor_vc_small, …) or a
// grandfathered legacy id (free / founding50 / growth / growth_annual)
// that entitlements.LEGACY_PLAN_MAP still resolves. The route rejects
// slugs that resolve to neither so a typo cannot silently strand a user
// on a non-existent plan.
//
// requireAdmin gate. When reconcile_credits=true and the destination
// plan advertises a positive monthly_credits allowance, the route calls
// grantCredits(target, allowance, "plan_grant", …) so the ledger stays
// authoritative — mirrors the /api/admin/users/manage side-effect from
// L96-106. A no-op mutation (target already on the requested plan)
// returns { ok: true, unchanged: true } and skips both the UPDATE and
// the appendAudit write so the hash-chained log does not accumulate
// empty rows. Every changed write appends an audit_events row via
// appendAudit action="admin.plan.changed" — same shape family as
// admin.role.changed + admin.permissions.granted so the P12.8
// impersonation trail tab can lift all three off audit_events with
// one OR filter on action.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { grantCredits } from "@/lib/credits";
import { getPlanCached } from "@/lib/plans-db";
import { decidePlanChange, validatePlanBody } from "@/lib/admin/plan-mutation";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<Params> },
) {
  const { id } = await params;

  const currentUser = await getCurrentUser();
  try {
    requireAdmin(currentUser);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json(
        { ok: false, reason: err.code },
        { status: err.code === "no_user" ? 401 : 403 },
      );
    }
    throw err;
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const parsed = validatePlanBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });
  }
  const { plan, reconcile_credits } = parsed.value;

  // Resolve against plans-db so a slug that matches PLAN_SLUG but resolves to
  // neither v2 nor legacy is rejected. getPlanCached falls through to the
  // bundled GENERATED_PLANS_BY_ID snapshot, so a fresh DB without the plans
  // table seeded still validates against plans.csv.
  const planRow = await getPlanCached(plan);
  if (!planRow) {
    return NextResponse.json({ ok: false, reason: "plan_not_found" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: target } = await supabase
    .from("app_users")
    .select("id, email, plan")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const monthlyCredits = planRow.usage_limits?.monthly_credits;
  const decision = decidePlanChange(
    target.plan ?? "",
    plan,
    reconcile_credits,
    typeof monthlyCredits === "number" ? monthlyCredits : null,
  );

  if (!decision.changed) {
    return NextResponse.json({ ok: true, unchanged: true, plan });
  }

  const { error: updErr } = await supabase
    .from("app_users")
    .update({ plan })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, reason: "update_failed", error: updErr.message },
      { status: 500 },
    );
  }

  let credits_granted = 0;
  if (decision.grant_credits > 0) {
    const grant = await grantCredits(target.id, decision.grant_credits, "plan_grant", {
      plan,
      previous_plan: target.plan,
      granted_by: currentUser!.email,
      admin_action: true,
      changed_via: "admin.users.plan",
    });
    if (grant.ok) credits_granted = decision.grant_credits;
  }

  try {
    await appendAudit({
      user_id: currentUser!.id,
      actor: "admin",
      action: "admin.plan.changed",
      resource_type: "app_users",
      resource_id: id,
      detail: {
        target_email: target.email,
        previous_plan: target.plan,
        new_plan: plan,
        reconcile_credits,
        credits_granted,
        actor_email: currentUser!.email,
      },
    });
  } catch (err) {
    console.warn("[admin:users:plan] appendAudit failed", (err as Error).message);
  }

  return NextResponse.json({
    ok: true,
    plan,
    previous_plan: target.plan,
    credits_granted,
  });
}
