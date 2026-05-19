import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendCancellationEmail } from "@/lib/email";

// POST /api/stripe/cancel
// Body: { reason?, feedback? }
// Cancels the user's subscription at the end of the current billing period
// (not immediately). Stores the cancellation reason and sends a retention
// email with a 30% discount offer.

export async function POST(request: Request) {
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

  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    // Body is optional; reason/feedback are not required.
    body = {};
  }

  const { reason, feedback } =
    (body as { reason?: string; feedback?: string }) ?? {};

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
      { ok: false, reason: "No active subscription found" },
      { status: 404 },
    );
  }

  try {
    // Find the active subscription.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });

    const activeSub = subscriptions.data[0] ?? null;
    if (!activeSub) {
      return NextResponse.json(
        { ok: false, reason: "No active subscription found" },
        { status: 404 },
      );
    }

    // Cancel at period end (not immediately).
    const updated = await stripe.subscriptions.update(activeSub.id, {
      cancel_at_period_end: true,
    });

    // In Stripe SDK v22, current_period_end lives on the subscription item.
    const periodEndUnix =
      updated.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000);
    const periodEnd = new Date(periodEndUnix * 1000).toISOString();

    // Store cancellation reason in the user record.
    const cancellationMeta: Record<string, string> = {};
    if (reason) cancellationMeta.reason = reason;
    if (feedback) cancellationMeta.feedback = feedback;

    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        cancel_reason: Object.keys(cancellationMeta).length > 0
          ? JSON.stringify(cancellationMeta)
          : null,
        cancel_at: periodEnd,
      })
      .eq("id", user.id);

    if (updateErr) {
      console.error(
        "[blockid:stripe] cancel: failed to store cancellation reason",
        { error: updateErr, userId: user.id },
      );
      // Non-fatal: the Stripe cancellation already went through.
    }

    // Send retention email with 30% discount offer (best-effort).
    sendCancellationEmail({
      to: user.email,
      activeUntil: periodEnd,
    }).catch((err) => {
      console.error("[blockid:stripe] cancellation email send error", err);
    });

    console.log(
      `[blockid:stripe] subscription ${activeSub.id} scheduled for cancellation at ${periodEnd} for user ${user.id}`,
    );

    return NextResponse.json({
      ok: true,
      activeUntil: periodEnd,
    });
  } catch (err) {
    console.error("[blockid:stripe] cancel failed", err);
    return NextResponse.json(
      { ok: false, reason: "Failed to cancel subscription" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
