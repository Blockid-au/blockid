// POST /api/admin/users/[id]/permissions — grant or revoke one permission
// entry on app_users.permissions (jsonb array).
//
// Body: { action: "grant" | "revoke", permission: string }
//
// Slug shape: /^[a-z][a-z0-9_.]{0,63}$/ so an admin can grant a forward-
// looking capability (e.g. "reports.export") before the P12.4 detail panel's
// KNOWN_PERMISSIONS list is updated. The panel already surfaces unknown
// entries in an amber ring, so unfamiliar grants are not silent.
//
// requireAdmin gate. Refuses self-mutation so an admin cannot lock or unlock
// their own console. Every changed write appends an audit_events row via
// appendAudit (hash-chained + HMAC-signed per web/src/lib/audit.ts). Grant
// action → "admin.permissions.granted"; revoke → "admin.permissions.revoked".
// No-op mutations (grant when already present, revoke when absent) return
// { ok: true, unchanged: true } and skip the audit write so the chain does
// not accumulate empty rows.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import {
  applyPermissionMutation,
  normalisePermissionsColumn,
  validatePermissionBody,
} from "@/lib/admin/permissions-mutation";

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

  if (currentUser!.id === id) {
    return NextResponse.json(
      { ok: false, reason: "cannot_change_own_permissions" },
      { status: 400 },
    );
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const parsed = validatePermissionBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });
  }
  const { action, permission } = parsed.value;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: target } = await supabase
    .from("app_users")
    .select("id, email, permissions")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const currentPerms = normalisePermissionsColumn(target.permissions);
  const mutation = applyPermissionMutation(currentPerms, action, permission);

  if (!mutation.changed) {
    return NextResponse.json({
      ok: true,
      unchanged: true,
      permissions: currentPerms,
    });
  }

  const { error: updErr } = await supabase
    .from("app_users")
    .update({ permissions: mutation.next })
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
      action: action === "grant"
        ? "admin.permissions.granted"
        : "admin.permissions.revoked",
      resource_type: "app_users",
      resource_id: id,
      detail: {
        target_email: target.email,
        permission,
        was_known: mutation.was_known,
        previous: currentPerms,
        next: mutation.next,
        actor_email: currentUser!.email,
      },
    });
  } catch (err) {
    console.warn(
      "[admin:users:permissions] appendAudit failed",
      (err as Error).message,
    );
  }

  return NextResponse.json({
    ok: true,
    action,
    permission,
    was_known: mutation.was_known,
    permissions: mutation.next,
  });
}
