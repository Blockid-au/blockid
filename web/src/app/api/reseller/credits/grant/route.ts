// POST /api/reseller/credits/grant
//
// Track A P6.3 — reseller grants credits to an attributed customer.
//
// Per docs/plans/reseller-module-plan.md § U.4 (reseller capabilities),
// § D.3 (reseller_credit_grants mirror), § R8 (budget invariant):
//
//   1. scopedReseller(user) chokepoint — same as reveal-email/drawer.
//   2. target_user_id must live inside allowedCustomerIds() — you can only
//      grant to a customer you are attributed against.
//   3. decideGrant() enforces capability + monthly_credit_budget. Over-budget
//      requests return 402 with reason=over_budget_requires_approval so the
//      /admin requests inbox (P9.3) can approve out-of-band; this endpoint
//      never self-approves an over-budget grant.
//   4. On approval: bump credit_balances, insert credit_transactions (with
//      granted_by_reseller_id stamped), then mirror into
//      reseller_credit_grants with month_key + over_budget=false.
//   5. Write reseller_audit_log(action='grant_credits') BEFORE returning.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { gateRequireFeature } from "@/lib/feature-gate";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import { getSupabaseAdmin } from "@/lib/supabase";
import { decideReveal } from "@/lib/reseller/customer-reveal";
import {
  computeMonthlyUsage,
  decideGrant,
  monthKey,
  type ResellerCreditGrantRow,
} from "@/lib/reseller/credit-grants";

export const dynamic = "force-dynamic";

const ROUTE = "/api/reseller/credits/grant";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

interface GrantBody {
  target_user_id?: unknown;
  amount?: unknown;
  reason?: unknown;
  metadata?: unknown;
}

export async function POST(request: Request) {
  const gate = await gateRequireFeature("reseller.grant_credits");
  if (!gate.ok) return gate.response;
  const user = gate.user;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return NextResponse.json({ ok: false, reason: err.code }, { status: 403 });
    }
    throw err;
  }

  const body = (await request.json().catch(() => null)) as GrantBody | null;
  if (!body) {
    return NextResponse.json({ ok: false, reason: "invalid_body" }, { status: 400 });
  }

  const rawAmount = body.amount;
  const amount = typeof rawAmount === "number" ? rawAmount : Number(rawAmount);
  const reason = typeof body.reason === "string" && body.reason.trim().length > 0
    ? body.reason.trim().slice(0, 200)
    : "reseller_grant";
  const clientMetadata =
    body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
      ? (body.metadata as Record<string, unknown>)
      : {};

  const allowed = await scope.allowedCustomerIds();
  const target = decideReveal(body.target_user_id, allowed);
  if (!target.ok) {
    const status = target.reason === "not_in_scope" ? 403 : 400;
    return NextResponse.json({ ok: false, reason: target.reason }, { status });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ ok: false, reason: "not_configured" }, { status: 503 });
  }

  const db = resellerSupabase(scope);

  const self = await db.selfReseller();
  if (!self) {
    return NextResponse.json({ ok: false, reason: "reseller_missing" }, { status: 404 });
  }

  const key = monthKey(new Date());

  const { data: monthGrants, error: rollupErr } = await supabase
    .from("reseller_credit_grants")
    .select("kind, amount, month_key, over_budget")
    .eq("reseller_id", scope.reseller_id)
    .eq("month_key", key);
  if (rollupErr) {
    return NextResponse.json(
      { ok: false, reason: "rollup_failed", error: rollupErr.message },
      { status: 500 },
    );
  }

  const usage = computeMonthlyUsage(
    (monthGrants ?? []) as ResellerCreditGrantRow[],
    key,
  );

  const decision = decideGrant({
    requested_amount: amount,
    monthly_credit_budget: self.monthly_credit_budget as number,
    already_granted_this_month: usage.grant_credits_used,
    can_grant_credits: self.can_grant_credits as boolean,
    admin_over_budget_approved: false,
  });

  if (!decision.ok) {
    const status =
      decision.reason === "invalid_amount"
        ? 400
        : decision.reason === "capability_disabled"
          ? 403
          : 402;
    return NextResponse.json(
      {
        ok: false,
        reason: decision.reason,
        monthly_credit_budget: self.monthly_credit_budget,
        already_granted_this_month: usage.grant_credits_used,
        remaining_budget: Math.max(
          0,
          (self.monthly_credit_budget as number) - usage.grant_credits_used,
        ),
      },
      { status },
    );
  }

  const targetUserId = target.customerId;

  const { data: balanceRow, error: balReadErr } = await supabase
    .from("credit_balances")
    .select("balance, lifetime_earned")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (balReadErr) {
    return NextResponse.json(
      { ok: false, reason: "balance_read_failed", error: balReadErr.message },
      { status: 500 },
    );
  }

  const currentBalance = (balanceRow?.balance as number | null) ?? 0;
  const lifetimeEarned = (balanceRow?.lifetime_earned as number | null) ?? 0;
  const newBalance = currentBalance + amount;
  const now = new Date().toISOString();

  const { error: balUpErr } = await supabase
    .from("credit_balances")
    .upsert(
      {
        user_id: targetUserId,
        balance: newBalance,
        lifetime_earned: lifetimeEarned + amount,
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
      user_id: targetUserId,
      amount,
      balance_after: newBalance,
      reason,
      granted_by_reseller_id: scope.reseller_id,
      metadata: { ...clientMetadata, reseller_id: scope.reseller_id, granted_by_user: user.id },
    })
    .select("id")
    .single();
  if (txErr || !txRow) {
    return NextResponse.json(
      { ok: false, reason: "transaction_insert_failed", error: txErr?.message ?? "no_row" },
      { status: 500 },
    );
  }

  const { error: mirrorErr } = await supabase
    .from("reseller_credit_grants")
    .insert({
      reseller_id: scope.reseller_id,
      target_user_id: targetUserId,
      kind: "grant",
      amount,
      credit_transaction_id: txRow.id,
      month_key: key,
      over_budget: decision.over_budget,
      granted_by_user_id: user.id,
      metadata: { reason, ...clientMetadata },
    });
  if (mirrorErr) {
    return NextResponse.json(
      { ok: false, reason: "mirror_insert_failed", error: mirrorErr.message },
      { status: 500 },
    );
  }

  const { ip, ua } = readClientMeta(request);
  try {
    await db.auditLog({
      actor_user_id: user.id,
      subject_user_id: targetUserId,
      action: "grant_credits",
      fields: ["amount"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        amount,
        month_key: key,
        over_budget: decision.over_budget,
        credit_transaction_id: txRow.id,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, reason: "audit_failed", error: (err as Error).message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    balance: newBalance,
    credit_transaction_id: txRow.id,
    over_budget: decision.over_budget,
    month_key: key,
    remaining_budget: Math.max(
      0,
      (self.monthly_credit_budget as number) - usage.grant_credits_used - amount,
    ),
  });
}
