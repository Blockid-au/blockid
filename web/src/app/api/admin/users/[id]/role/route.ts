// POST /api/admin/users/[id]/role — change a user's role.
//
// Body: { role: "user" | "admin" }
//
// requireAdmin gate. Refuses self-demotion (an admin cannot flip their own
// role via this endpoint — must be done by another admin or the DB). The
// mutation is written to audit_events with the previous role and actor.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const VALID_ROLES = ["user", "admin"] as const;
type Role = (typeof VALID_ROLES)[number];

interface Params {
  id: string;
}

interface Body {
  role?: string;
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

  if (currentUser!.id === id) {
    return NextResponse.json(
      { ok: false, reason: "cannot_change_own_role" },
      { status: 400 },
    );
  }

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const role = body.role as Role | undefined;
  if (!role || !(VALID_ROLES as readonly string[]).includes(role)) {
    return NextResponse.json(
      { ok: false, reason: "role_invalid" },
      { status: 400 },
    );
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: target } = await supabase
    .from("app_users")
    .select("id, email, role")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  if (target.role === role) {
    return NextResponse.json({ ok: true, role, unchanged: true });
  }

  const { error: updErr } = await supabase
    .from("app_users")
    .update({ role })
    .eq("id", id);
  if (updErr) {
    return NextResponse.json(
      { ok: false, reason: "update_failed", error: updErr.message },
      { status: 500 },
    );
  }

  try {
    await appendAudit({
      user_id: currentUser!.id,
      actor: "admin",
      action: "admin.role.changed",
      resource_type: "app_users",
      resource_id: id,
      detail: {
        target_email: target.email,
        previous_role: target.role,
        new_role: role,
        actor_email: currentUser!.email,
      },
    });
  } catch (err) {
    console.warn("[admin:users:role] appendAudit failed", (err as Error).message);
  }

  return NextResponse.json({ ok: true, role });
}
