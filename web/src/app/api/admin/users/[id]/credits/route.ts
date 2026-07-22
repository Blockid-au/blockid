// POST /api/admin/users/[id]/credits — grant credits to a user.
//
// Body: { amount: number (> 0), reason: string }
//
// Uses grantCredits() from web/src/lib/credits.ts as-is. The reason is
// forwarded verbatim so it appears in credit_transactions.reason, and a
// separate audit_events row records the admin actor + full metadata.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { grantCredits } from "@/lib/credits";
import { appendAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

interface Params {
  id: string;
}

interface Body {
  amount?: number;
  reason?: string;
  metadata?: Record<string, unknown>;
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

  let body: Body = {};
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json(
      { ok: false, reason: "amount_invalid" },
      { status: 400 },
    );
  }
  const reason = (body.reason ?? "admin_grant").trim() || "admin_grant";

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const { data: target } = await supabase
    .from("app_users")
    .select("id, email")
    .eq("id", id)
    .maybeSingle();
  if (!target) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  // Merge caller-supplied metadata (e.g. { by: 'affiliate_view' } from the
  // /admin/affiliate cross-view) with the server-authoritative fields.
  // Server keys win on conflict so a client cannot spoof actor identity.
  const callerMetadata =
    body.metadata && typeof body.metadata === "object" ? body.metadata : {};
  const mergedMetadata: Record<string, unknown> = {
    ...callerMetadata,
    admin_action: true,
    granted_by_user_id: currentUser!.id,
    granted_by_email: currentUser!.email,
  };

  const result = await grantCredits(id, amount, reason, mergedMetadata);

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, reason: "grant_failed" },
      { status: 500 },
    );
  }

  try {
    await appendAudit({
      user_id: currentUser!.id,
      actor: "admin",
      action: "admin.credits.granted",
      resource_type: "app_users",
      resource_id: id,
      detail: {
        target_email: target.email,
        amount,
        reason,
        balance_after: result.balance,
        actor_email: currentUser!.email,
        caller_metadata: callerMetadata,
      },
    });
  } catch (err) {
    // Non-fatal: credits already granted, only audit failed.
    console.warn("[admin:users:credits] appendAudit failed", (err as Error).message);
  }

  return NextResponse.json({ ok: true, balance: result.balance });
}
