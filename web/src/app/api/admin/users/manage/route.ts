// POST /api/admin/users/manage — Change user plan or role
// Body: { email, field: "plan" | "role", value: string }
// Admin only

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantCredits, PLAN_CREDITS } from "@/lib/credits";

export const dynamic = "force-dynamic";

const VALID_PLANS = ["free", "founding50", "growth"] as const;
const VALID_ROLES = ["user", "admin"] as const;

async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return null;
  }
  return user;
}

export async function POST(request: Request) {
  const user = await requireAdmin();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Admin access required" }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });

  const { email, field, value } = body as {
    email?: string;
    field?: string;
    value?: string;
  };

  if (!email || !field || !value) {
    return NextResponse.json(
      { ok: false, error: "email, field, value required" },
      { status: 400 },
    );
  }

  if (field !== "plan" && field !== "role") {
    return NextResponse.json(
      { ok: false, error: "field must be 'plan' or 'role'" },
      { status: 400 },
    );
  }

  // Validate value based on field
  if (field === "plan" && !(VALID_PLANS as readonly string[]).includes(value)) {
    return NextResponse.json(
      { ok: false, error: `plan must be one of: ${VALID_PLANS.join(", ")}` },
      { status: 400 },
    );
  }

  if (field === "role" && !(VALID_ROLES as readonly string[]).includes(value)) {
    return NextResponse.json(
      { ok: false, error: `role must be one of: ${VALID_ROLES.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "DB not configured" }, { status: 503 });
  }

  // Find user by email
  const { data: targetUser } = await supabase
    .from("app_users")
    .select("id, email, display_name, plan, role")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();

  if (!targetUser) {
    return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
  }

  // Update the field
  const { error: updateErr } = await supabase
    .from("app_users")
    .update({ [field]: value })
    .eq("id", targetUser.id);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  // If plan changed, grant appropriate credits
  if (field === "plan" && value !== targetUser.plan) {
    const planConfig = PLAN_CREDITS[value];
    if (planConfig && planConfig.amount > 0) {
      await grantCredits(targetUser.id, planConfig.amount, "plan_grant", {
        plan: value,
        previous_plan: targetUser.plan,
        granted_by: user.email,
        admin_action: true,
      });
    }
  }

  // Re-read updated user
  const { data: updatedUser } = await supabase
    .from("app_users")
    .select("id, email, display_name, plan, role")
    .eq("id", targetUser.id)
    .single();

  return NextResponse.json({ ok: true, user: updatedUser });
}
