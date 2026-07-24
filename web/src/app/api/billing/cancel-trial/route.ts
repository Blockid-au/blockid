// POST /api/billing/cancel-trial
//
// Called from the dashboard trial banner "Cancel trial" button. Cancels
// the user's Stripe subscription immediately (not at period end — trial
// carries no billing period yet) and downgrades app_users.plan to
// 'free_expired' with entitlements dropped.
//
// Safe to call multiple times: if no trialing subscription is found the
// route returns 200 with cancelled=false so the UI can idempotently
// remove the banner.

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { logUserAction, extractIp, extractUserAgent } from "@/lib/audit/log";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "auth_required" }, { status: 401 });
  }
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "supabase_unavailable" }, { status: 503 });
  }
  const supabase = getSupabaseAdmin()!;

  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id, trial_end_at, plan")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id ?? null;
  let cancelledSubId: string | null = null;

  if (customerId && isStripeConfigured()) {
    const stripe = getStripe()!;
    try {
      const list = await stripe.subscriptions.list({
        customer: customerId,
        status: "trialing",
        limit: 1,
      });
      const trialSub = list.data[0] ?? null;
      if (trialSub) {
        await stripe.subscriptions.cancel(trialSub.id);
        cancelledSubId = trialSub.id;
      }
    } catch (err) {
      console.error("[blockid:cancel-trial] stripe cancel failed", err);
      return NextResponse.json(
        { ok: false, reason: "stripe_cancel_failed" },
        { status: 502 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabase
    .from("app_users")
    .update({
      plan: "free_expired",
      cancel_at: nowIso,
      cancel_reason: JSON.stringify({ source: "trial_banner_cancel" }),
      trial_end_at: nowIso,
    })
    .eq("id", user.id);

  if (updErr) {
    console.error("[blockid:cancel-trial] app_users update failed", updErr);
  }

  await supabase.from("subscription_trial_state").upsert(
    {
      user_id: user.id,
      status: "canceled",
      cancel_at_period_end: false,
      updated_at: nowIso,
    },
    { onConflict: "user_id" },
  );

  await logUserAction({
    userId: user.id,
    action: "billing.trial.canceled",
    subjectType: "subscription",
    subjectId: cancelledSubId ?? user.id,
    fields: { source: "trial_banner" },
    route: "/api/billing/cancel-trial",
    ip: extractIp(request.headers),
    ua: extractUserAgent(request.headers),
  });

  return NextResponse.json({
    ok: true,
    cancelled: Boolean(cancelledSubId),
    subscription_id: cancelledSubId,
  });
}
