// POST /api/admin/users/create — mint a new app_users row on behalf of an
// admin, with optional credits grant and a magic-link invite email.
//
// Body: {
//   email:         string,                 // syntactically valid, lowercased server-side
//   segment:       CreateUserSegment,      // founder | investor_angel | … | admin
//   account_type:  AccountType,            // enum from P12.1 segments.ts
//   plan:          string,                 // plan slug, /^[a-z][a-z0-9_]{0,63}$/
//   credits?:      number,                 // optional grant, integer 0..100000
//   display_name?: string                  // optional, ≤ 120 chars
// }
//
// requireAdmin gate. Reads current app_users row by email — 409 if the row
// already exists so an admin does not silently overwrite an existing account.
// On success:
//   1. INSERT app_users(email, segment, account_type, plan, display_name)
//   2. Optionally grantCredits(new_id, credits, "admin_grant", …) when > 0
//   3. requestMagicLink({ email, intent: "login" }) — invite email dispatched
//      by /api/auth/request-link when the return payload flows through; here
//      we only mint the token row, mirroring the wholesale create-startup
//      flow. Email delivery is fire-and-forget out of scope for this endpoint.
//   4. appendAudit action="admin.user.created" with the actor + target detail
//      so the P12.8 impersonation trail tab can lift it off audit_events.

import { NextResponse } from "next/server";
import { getCurrentUser, requestMagicLink } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { appendAudit } from "@/lib/audit";
import { grantCredits } from "@/lib/credits";
import {
  buildAppUsersInsert,
  validateCreateUserBody,
} from "@/lib/admin/user-create";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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

  const parsed = validateCreateUserBody(raw);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, reason: parsed.reason }, { status: 400 });
  }
  const body = parsed.value;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  // Idempotency guard: refuse to overwrite an existing row. Admin promotes
  // an existing user via /api/admin/users/manage or /api/admin/users/[id]/*.
  const { data: existing } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("email", body.email)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { ok: false, reason: "email_taken", user_id: existing.id },
      { status: 409 },
    );
  }

  const insertRow = buildAppUsersInsert(body);
  const { data: created, error: insertErr } = await supabase
    .from("app_users")
    .insert(insertRow)
    .select("id, email, display_name, segment, account_type, plan, created_at")
    .single();
  if (insertErr || !created) {
    return NextResponse.json(
      {
        ok: false,
        reason: "insert_failed",
        error: insertErr?.message ?? "no row returned",
      },
      { status: 500 },
    );
  }

  // Credits grant is optional. grantCredits is a no-op for amount <= 0 so we
  // can skip the call rather than pay the double round-trip.
  let credits_granted = 0;
  if (body.credits > 0) {
    const grant = await grantCredits(created.id, body.credits, "admin_grant", {
      granted_by: currentUser!.email,
      admin_action: true,
      created_via: "admin.users.create",
    });
    if (grant.ok) credits_granted = body.credits;
  }

  // Magic-link invite. Fire-and-forget: an error here does not roll back the
  // user row — the admin can re-issue via /api/auth/request-link. We do not
  // return the token in the response (email is the delivery channel).
  const magic = await requestMagicLink({
    email: body.email,
    intent: "login",
  });

  try {
    await appendAudit({
      user_id: currentUser!.id,
      actor: "admin",
      action: "admin.user.created",
      resource_type: "app_users",
      resource_id: created.id,
      detail: {
        target_email: created.email,
        segment: body.segment,
        account_type: body.account_type,
        plan: body.plan,
        display_name: body.display_name,
        credits_granted,
        magic_link_issued: magic.ok,
        actor_email: currentUser!.email,
      },
    });
  } catch (err) {
    console.warn(
      "[admin:users:create] appendAudit failed",
      (err as Error).message,
    );
  }

  return NextResponse.json({
    ok: true,
    user: created,
    credits_granted,
    magic_link_issued: magic.ok,
  });
}
