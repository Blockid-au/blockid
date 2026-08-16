// Reseller commission recording for checkout.session.completed (M3).
//
// Writes a row into checkout_session_reseller_commissions for each attributed
// Stripe checkout session. Idempotent via UNIQUE(stripe_session_id) — Stripe
// event retries are safe.
//
// Commission = 20% of ex-GST (gross / 1.1 * 0.2), rounded to nearest cent.
// This matches the retail reseller commission documented in
// docs/plans/reseller-module-plan.md § G.2 for the checkout-session path.
//
// Server-only — never import from client components.

import { getSupabaseAdmin } from "@/lib/supabase";

export interface RecordResellerCommissionArgs {
  resellerId: string;
  founderId: string;
  promoCode: string;
  stripeSessionId: string;
  grossAmountAudCents: number;
}

/**
 * Record a reseller commission row for a completed Stripe checkout session.
 *
 * Commission = Math.round(grossAmountAudCents / 1.1 * 0.2)
 * (20% of ex-GST amount, as per the retail reseller commission formula)
 *
 * Idempotent — the UNIQUE constraint on stripe_session_id means Stripe event
 * retries are silently ignored (ignoreDuplicates: true).
 *
 * Never throws — commission recording is a non-fatal side-effect of checkout.
 * The caller should catch and log any errors rather than failing the webhook.
 */
export async function recordResellerCommission(
  args: RecordResellerCommissionArgs,
): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return;

  // Commission = 20% of ex-GST amount.
  // ex-GST = gross / 1.1; commission = ex-GST * 0.20
  const commissionAudCents = Math.round((args.grossAmountAudCents / 1.1) * 0.2);

  const { error } = await supabase
    .from("checkout_session_reseller_commissions")
    .upsert(
      {
        reseller_id: args.resellerId,
        founder_id: args.founderId,
        promo_code: args.promoCode,
        stripe_session_id: args.stripeSessionId,
        gross_amount_aud_cents: args.grossAmountAudCents,
        commission_aud_cents: commissionAudCents,
        status: "pending",
      },
      { onConflict: "stripe_session_id", ignoreDuplicates: true },
    );

  if (error) {
    // Log but never throw — webhook must not fail on a bookkeeping side-effect.
    console.warn(
      "[reseller] recordResellerCommission upsert failed",
      { stripeSessionId: args.stripeSessionId, error },
    );
  }
}
