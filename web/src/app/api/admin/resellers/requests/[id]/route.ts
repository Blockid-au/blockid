// PATCH /api/admin/resellers/requests/[id] — approve / deny a pending request
//
// Track A P9.3. requireAdmin gate. Body: {action: "approve"|"deny"|"cancel",
// decision_reason?: string}.
//
// Approval side-effects, per request_type:
//   - over_budget_approval → bump credit_balances + insert credit_transactions
//     (reason='reseller_grant_over_budget') + insert reseller_credit_grants
//     (kind=grant, over_budget=true). linked_credit_transaction_id is stamped
//     on the request row before it flips to status=approved.
//   - code_request → NO Stripe call here. Stripe coupon+promotion_code
//     creation is a separate admin action (§ C.5). Approving this request
//     just marks it ready for the admin to mint the Stripe objects via the
//     existing /admin/resellers/[code] promotion-codes editor.
//   - collateral_approval → mark approved. Reseller sees a green banner in
//     /reseller/settings once P4 collateral page ships.
//
// Deny + cancel are pure status flips with an optional reason.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { validateAdminDecision } from "@/lib/reseller/requests";
import { monthKey } from "@/lib/reseller/credit-grants";

export const dynamic = "force-dynamic";

interface RequestRow {
  id: string;
  reseller_id: string;
  requested_by: string;
  request_type: "code_request" | "over_budget_approval" | "collateral_approval";
  status: "pending" | "approved" | "denied" | "cancelled";
  payload: Record<string, unknown>;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  try {
    requireAdmin(user);
  } catch (err) {
    if (err instanceof AdminGateError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 401 });
    }
    throw err;
  }
  if (!user) {
    return NextResponse.json({ ok: false, reason: "no_user" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const body = (await request.json().catch(() => null)) as unknown;

  const { data: row, error: readErr } = await supabase
    .from("reseller_requests")
    .select("id, reseller_id, requested_by, request_type, status, payload")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    return NextResponse.json(
      { ok: false, reason: "read_failed", error: readErr.message },
      { status: 500 },
    );
  }
  if (!row) {
    return NextResponse.json({ ok: false, reason: "not_found" }, { status: 404 });
  }

  const current = row as RequestRow;
  const decision = validateAdminDecision({ status: current.status }, body);
  if (!decision.ok) {
    const status = decision.reason === "already_decided" ? 409 : 400;
    return NextResponse.json({ ok: false, reason: decision.reason }, { status });
  }

  const now = new Date().toISOString();
  let linkedCreditTransactionId: string | null = null;

  if (decision.status === "approved" && current.request_type === "over_budget_approval") {
    const payload = current.payload as {
      target_user_id?: string;
      requested_amount?: number;
      reason?: string | null;
    };
    if (!payload.target_user_id || !payload.requested_amount) {
      return NextResponse.json(
        { ok: false, reason: "payload_incomplete" },
        { status: 422 },
      );
    }

    const { data: balanceRow, error: balReadErr } = await supabase
      .from("credit_balances")
      .select("balance, lifetime_earned")
      .eq("user_id", payload.target_user_id)
      .maybeSingle();
    if (balReadErr) {
      return NextResponse.json(
        { ok: false, reason: "balance_read_failed", error: balReadErr.message },
        { status: 500 },
      );
    }
    const currentBalance = (balanceRow?.balance as number | null) ?? 0;
    const lifetimeEarned = (balanceRow?.lifetime_earned as number | null) ?? 0;
    const newBalance = currentBalance + payload.requested_amount;

    const { error: balUpErr } = await supabase
      .from("credit_balances")
      .upsert(
        {
          user_id: payload.target_user_id,
          balance: newBalance,
          lifetime_earned: lifetimeEarned + payload.requested_amount,
          updated_at: now,
        },
        { onConflict: "user_id" },
      );
    if (balUpErr) {
      return NextResponse.json(
        { ok: false, reason: "balance_upsert_failed", error: balUpErr.message },
        { status: 500 },
      );
    }

    const { data: txRow, error: txErr } = await supabase
      .from("credit_transactions")
      .insert({
        user_id: payload.target_user_id,
        amount: payload.requested_amount,
        balance_after: newBalance,
        reason: "reseller_grant_over_budget",
        granted_by_reseller_id: current.reseller_id,
        metadata: {
          reseller_id: current.reseller_id,
          reseller_request_id: current.id,
          approved_by_admin: user.id,
          user_facing_reason: payload.reason ?? null,
        },
      })
      .select("id")
      .single();
    if (txErr || !txRow) {
      return NextResponse.json(
        { ok: false, reason: "transaction_insert_failed", error: txErr?.message ?? "no_row" },
        { status: 500 },
      );
    }
    linkedCreditTransactionId = txRow.id;

    const { error: mirrorErr } = await supabase
      .from("reseller_credit_grants")
      .insert({
        reseller_id: current.reseller_id,
        target_user_id: payload.target_user_id,
        kind: "grant",
        amount: payload.requested_amount,
        credit_transaction_id: txRow.id,
        month_key: monthKey(new Date()),
        over_budget: true,
        granted_by_user_id: current.requested_by,
        metadata: {
          approved_by_admin: user.id,
          reseller_request_id: current.id,
          reason: payload.reason ?? null,
        },
      });
    if (mirrorErr) {
      return NextResponse.json(
        { ok: false, reason: "mirror_insert_failed", error: mirrorErr.message },
        { status: 500 },
      );
    }
  }

  const { data: updated, error: updateErr } = await supabase
    .from("reseller_requests")
    .update({
      status: decision.status,
      decision_by: user.id,
      decision_at: now,
      decision_reason: decision.decision_reason,
      linked_credit_transaction_id: linkedCreditTransactionId,
    })
    .eq("id", current.id)
    .eq("status", "pending")
    .select("id, status, decision_at, decision_reason, linked_credit_transaction_id")
    .single();

  if (updateErr || !updated) {
    return NextResponse.json(
      {
        ok: false,
        reason: "update_failed",
        error: updateErr?.message ?? "no_row",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, request: updated });
}
