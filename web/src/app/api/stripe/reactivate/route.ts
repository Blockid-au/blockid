import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/stripe/reactivate
// Reactivates a subscription that was previously scheduled for cancellation
// (cancel_at_period_end = true). Clears the cancellation so the subscription
// continues normally after the current period.

export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { ok: false, reason: "Authentication required" },
      { status: 401 },
    );
  }

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json(
      { ok: false, reason: "Payments not configured" },
      { status: 503 },
    );
  }

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  // Look up the user's stripe_customer_id.
  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json(
      { ok: false, reason: "No subscription found" },
      { status: 404 },
    );
  }

  try {
    // Find subscriptions that are scheduled for cancellation.
    // Active subscriptions with cancel_at_period_end=true still have status "active".
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 10,
    });

    const pendingCancelSub = subscriptions.data.find(
      (sub) => sub.cancel_at_period_end === true,
    );

    if (!pendingCancelSub) {
      return NextResponse.json(
        { ok: false, reason: "No subscription pending cancellation found" },
        { status: 404 },
      );
    }

    // Reactivate by clearing cancel_at_period_end.
    await stripe.subscriptions.update(pendingCancelSub.id, {
      cancel_at_period_end: false,
    });

    // Clear cancellation metadata from the user record.
    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        cancel_reason: null,
        cancel_at: null,
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error(
        "[blockid:stripe] reactivate: failed to clear cancellation metadata",
        { error: updateErr, userId: user.id },
      );
      // Non-fatal: the Stripe reactivation already went through.
    }

    console.log(
      `[blockid:stripe] reactivated subscription ${pendingCancelSub.id} for user ${user.id}`,
    );

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[blockid:stripe] reactivate failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to reactivate subscription" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
