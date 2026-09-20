import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { trialLengthDays } from "@/lib/billing/subscription-state";

// GET /api/stripe/trial-status
// Returns the calling user's current trial state (if any). Consumed by the
// account UI (trial banner, days-left countdown, "add card" nudge).
//
// G18-D (2026-09-19) adds the trial-truth fields: `trialDays` (Stripe's
// trial_start→trial_end span — equals plans.trial_days because checkout
// passes trial_period_days from that row), `firstChargeOn` (= trial_end
// while trialing and not cancelling) and `currentPeriodEnd`. The source is
// still the Stripe-mirrored `subscription_trial_state` row, which the
// webhook keeps current and /workspace/billing re-mirrors from Stripe live.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: true, inTrial: false, daysLeft: 0, trialEnd: null, requiresPayment: false },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const supabase = getSupabaseAdmin()!;

  const { data, error } = await supabase
    .from("subscription_trial_state")
    .select(
      "plan_id, status, trial_start, trial_end, current_period_end, cancel_at_period_end, payment_method_saved",
    )
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    console.error("[blockid:stripe:trial-status] lookup failed", error);
    return NextResponse.json(
      { ok: false, reason: "Lookup failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!data) {
    return NextResponse.json(
      {
        ok: true,
        inTrial: false,
        daysLeft: 0,
        trialEnd: null,
        requiresPayment: false,
        planId: null,
        status: null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const status = data.status ?? null;
  const trialEnd = data.trial_end ? new Date(data.trial_end) : null;
  const now = new Date();
  const inTrial = status === "trialing" && !!trialEnd && trialEnd > now;

  const daysLeft = inTrial && trialEnd
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / 86_400_000))
    : 0;

  // "Requires payment" = trialing and Stripe has not yet flagged a PM on file.
  // payment_method_saved is written by the setup_intent.succeeded handler.
  const requiresPayment = inTrial && !data.payment_method_saved;

  const cancelAtPeriodEnd = !!data.cancel_at_period_end;
  const trialDays = trialLengthDays({ trialStart: data.trial_start ?? null, trialEnd: data.trial_end ?? null });
  const currentPeriodEnd = data.current_period_end ? new Date(data.current_period_end) : null;

  return NextResponse.json(
    {
      ok: true,
      inTrial,
      daysLeft,
      trialEnd: trialEnd ? trialEnd.toISOString() : null,
      requiresPayment,
      planId: data.plan_id ?? null,
      status,
      cancelAtPeriodEnd,
      trialDays,
      // The card is first charged when the trial ends — unless the cancel is
      // already scheduled, in which case nothing is charged.
      firstChargeOn: inTrial && !cancelAtPeriodEnd && trialEnd ? trialEnd.toISOString() : null,
      currentPeriodEnd: currentPeriodEnd && Number.isFinite(currentPeriodEnd.getTime()) ? currentPeriodEnd.toISOString() : null,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export const dynamic = "force-dynamic";
