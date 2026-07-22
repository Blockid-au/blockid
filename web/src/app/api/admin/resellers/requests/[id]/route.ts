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
//   - code_request → mint Stripe coupon (tier > 0) + promotion_code, then
//     INSERT into reseller_promotion_codes and stamp
//     linked_promotion_code_id on the request row. Tier 0 skips Stripe per
//     ck_stripe_objects_by_tier. Coupon id is deterministic per
//     (reseller_id, tier) so a re-approval no-ops safely.
//   - collateral_approval → mark approved. Reseller sees a green banner in
//     /reseller/settings once P4 collateral page ships.
//
// Deny + cancel are pure status flips with an optional reason.

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getCurrentUser } from "@/lib/auth";
import { requireAdmin, AdminGateError } from "@/lib/reseller/require-admin";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getStripe } from "@/lib/stripe";
import { validateAdminDecision } from "@/lib/reseller/requests";
import { monthKey } from "@/lib/reseller/credit-grants";
import { decideCodeMint } from "@/lib/reseller/promotion-code-mint";

export const dynamic = "force-dynamic";

const ROUTE = "/api/admin/resellers/requests/[id]";

function readClientMeta(request: Request): { ip: string; ua: string } {
  const fwd = request.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "";
  const ua = request.headers.get("user-agent") || "";
  return { ip, ua };
}

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
  let linkedPromotionCodeId: string | null = null;

  if (decision.status === "approved" && current.request_type === "code_request") {
    const payload = current.payload as {
      tier_pct?: number;
      suggested_suffix?: string | null;
    };
    const tier = Number(payload.tier_pct);
    if (!Number.isFinite(tier)) {
      return NextResponse.json(
        { ok: false, reason: "payload_incomplete" },
        { status: 422 },
      );
    }

    const { data: resellerRow, error: resellerErr } = await supabase
      .from("resellers")
      .select("id, code")
      .eq("id", current.reseller_id)
      .maybeSingle();
    if (resellerErr || !resellerRow) {
      return NextResponse.json(
        { ok: false, reason: "reseller_read_failed", error: resellerErr?.message ?? "not_found" },
        { status: 500 },
      );
    }

    const plan = decideCodeMint({
      reseller: { id: resellerRow.id as string, code: resellerRow.code as string },
      tierPct: tier,
      suggestedSuffix: payload.suggested_suffix ?? null,
      resellerRequestId: current.id,
    });
    if (!plan.ok) {
      return NextResponse.json({ ok: false, reason: plan.reason }, { status: 422 });
    }

    // Existing (reseller_id, tier_pct) row wins — approving twice is a no-op.
    const { data: existingRow, error: existingErr } = await supabase
      .from("reseller_promotion_codes")
      .select("id")
      .eq("reseller_id", resellerRow.id)
      .eq("tier_pct", tier)
      .maybeSingle();
    if (existingErr) {
      return NextResponse.json(
        { ok: false, reason: "existing_code_read_failed", error: existingErr.message },
        { status: 500 },
      );
    }

    if (existingRow) {
      linkedPromotionCodeId = existingRow.id as string;
    } else {
      let stripeCouponId: string | null = null;
      let stripePromotionCodeId: string | null = null;

      if (plan.plan.kind === "stripe_mint") {
        const stripe = getStripe();
        if (!stripe) {
          return NextResponse.json(
            { ok: false, reason: "stripe_not_configured" },
            { status: 503 },
          );
        }
        try {
          const coupon = await ensureStripeCoupon(stripe, plan.plan.coupon);
          stripeCouponId = coupon.id;
          const promo = await stripe.promotionCodes.create({
            promotion: { coupon: coupon.id, type: "coupon" },
            code: plan.plan.promotionCode.code,
            metadata: plan.plan.promotionCode.metadata,
          });
          stripePromotionCodeId = promo.id;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return NextResponse.json(
            { ok: false, reason: "stripe_mint_failed", error: msg },
            { status: 502 },
          );
        }
      }

      const { data: promoRow, error: promoErr } = await supabase
        .from("reseller_promotion_codes")
        .insert({
          reseller_id: plan.plan.row.reseller_id,
          tier_pct: plan.plan.row.tier_pct,
          code: plan.plan.code,
          stripe_coupon_id: stripeCouponId,
          stripe_promotion_code_id: stripePromotionCodeId,
          active: true,
        })
        .select("id")
        .single();
      if (promoErr || !promoRow) {
        return NextResponse.json(
          {
            ok: false,
            reason: "promotion_code_insert_failed",
            error: promoErr?.message ?? "no_row",
          },
          { status: 500 },
        );
      }
      linkedPromotionCodeId = promoRow.id as string;
    }
  }

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
      linked_promotion_code_id: linkedPromotionCodeId,
    })
    .eq("id", current.id)
    .eq("status", "pending")
    .select(
      "id, status, decision_at, decision_reason, linked_credit_transaction_id, linked_promotion_code_id",
    )
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

  // Observability record for the sensitive admin transition. Non-fatal:
  // the ledger writes and request flip are already committed, and the
  // reseller-side auditors should not see 500s from a downstream table
  // hiccup after the state has moved. Matches the affiliate-revoke pattern
  // at /api/admin/affiliate/attributions/[id]/revoke.
  try {
    const { ip, ua } = readClientMeta(request);
    const subjectUserId =
      current.request_type === "over_budget_approval"
        ? ((current.payload as { target_user_id?: string }).target_user_id ?? null)
        : null;
    await supabase.from("reseller_audit_log").insert({
      reseller_id: current.reseller_id,
      actor_user_id: user.id,
      subject_user_id: subjectUserId,
      action: `${decision.status === "cancelled" ? "cancel" : decision.status === "approved" ? "approve" : "deny"}_request`,
      fields: ["status"],
      route: ROUTE,
      ip,
      user_agent: ua,
      metadata: {
        request_id: current.id,
        request_type: current.request_type,
        linked_credit_transaction_id: linkedCreditTransactionId,
        linked_promotion_code_id: linkedPromotionCodeId,
        decision_reason: decision.decision_reason,
      },
    });
  } catch (err) {
    console.warn(
      "[admin.reseller.requests.PATCH] reseller_audit_log insert failed",
      err,
    );
  }

  return NextResponse.json({ ok: true, request: updated });
}

/**
 * Idempotent Stripe coupon lookup-or-create keyed on the deterministic id
 * from buildStripeCouponSpec. A pre-existing coupon at the same id (e.g.
 * from a previous approval attempt that failed after Stripe succeeded but
 * before the DB insert) is reused so we never end up with two Stripe
 * coupons for the same (reseller, tier).
 */
async function ensureStripeCoupon(
  stripe: Stripe,
  spec: { id: string; percent_off: number; duration: "forever"; metadata: Record<string, string> },
): Promise<Stripe.Coupon> {
  try {
    return await stripe.coupons.retrieve(spec.id);
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError && err.code === "resource_missing") {
      return await stripe.coupons.create({
        id: spec.id,
        percent_off: spec.percent_off,
        duration: spec.duration,
        metadata: spec.metadata,
      });
    }
    throw err;
  }
}
