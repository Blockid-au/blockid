import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { sendCancellationEmail } from "@/lib/email";

// POST /api/stripe/cancel
//
// Body:
//   { reason?, feedback?, save_offer?: {
//       kind: "downgrade_50" | "keep_30" | "pause_30d" | "book_call",
//       coupon?, href?, accepted: boolean
//     } }
//
// When save_offer.accepted is true we DO NOT cancel — instead we apply
// the retention path (coupon, pause, or book-call flow) and record the
// churn_events row with accepted_coupon=true. When declined (or no
// save_offer is present) we schedule the cancellation at period end.

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ ok: false, reason: "Authentication required" }, { status: 401 });
  }

  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ ok: false, reason: "Payments not configured" }, { status: 503 });
  }

  let body: {
    reason?: string;
    feedback?: string;
    save_offer?: {
      kind?: string;
      coupon?: string;
      href?: string;
      accepted?: boolean;
    };
  } = {};
  try {
    body = (await request.json()) ?? {};
  } catch {
    body = {};
  }

  const { reason, feedback, save_offer } = body;

  const supabase = getSupabaseAdmin()!;
  const stripe = getStripe()!;

  const { data: row } = await supabase
    .from("app_users")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .maybeSingle();

  const customerId = row?.stripe_customer_id;
  if (!customerId) {
    return NextResponse.json({ ok: false, reason: "No active subscription found" }, { status: 404 });
  }

  const subscriptions = await stripe.subscriptions.list({
    customer: customerId,
    status: "active",
    limit: 1,
  });
  const activeSub = subscriptions.data[0] ?? null;
  if (!activeSub) {
    return NextResponse.json({ ok: false, reason: "No active subscription found" }, { status: 404 });
  }

  const currentPlan = activeSub.items.data[0]?.price?.lookup_key ?? activeSub.items.data[0]?.price?.id ?? null;

  // ── Save-offer accepted path ───────────────────────────────────────
  if (save_offer?.accepted) {
    try {
      if (save_offer.kind === "downgrade_50" && save_offer.coupon) {
        await stripe.subscriptions.update(activeSub.id, {
          discounts: [{ coupon: save_offer.coupon }],
        });
      } else if (save_offer.kind === "keep_30" && save_offer.coupon) {
        await stripe.subscriptions.update(activeSub.id, {
          discounts: [{ coupon: save_offer.coupon }],
        });
      } else if (save_offer.kind === "pause_30d") {
        const resumesAt = Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000);
        await stripe.subscriptions.update(activeSub.id, {
          pause_collection: { behavior: "keep_as_draft", resumes_at: resumesAt },
        });
      }
    } catch (err) {
      console.error("[blockid:stripe] save-offer application failed", err);
      // fall through: still record churn_events accepted attempt
    }

    await supabase.from("churn_events").insert({
      user_id: user.id,
      from_plan: currentPlan,
      reason: reason ?? null,
      exit_survey: { reason, feedback, save_offer_kind: save_offer.kind },
      offered_coupon: save_offer.coupon ?? null,
      accepted_coupon: true,
      detail: { source: "cancel_flow", accepted: true, kind: save_offer.kind },
    });

    return NextResponse.json({
      ok: true,
      offer_applied: true,
      kind: save_offer.kind,
      href: save_offer.href ?? null,
    });
  }

  // ── Standard cancel-at-period-end path ────────────────────────────
  try {
    const updated = await stripe.subscriptions.update(activeSub.id, {
      cancel_at_period_end: true,
    });
    const periodEndUnix = updated.items.data[0]?.current_period_end ?? Math.floor(Date.now() / 1000);
    const periodEnd = new Date(periodEndUnix * 1000).toISOString();

    const cancellationMeta: Record<string, string> = {};
    if (reason) cancellationMeta.reason = reason;
    if (feedback) cancellationMeta.feedback = feedback;

    const { error: updateErr } = await supabase
      .from("app_users")
      .update({
        cancel_reason: Object.keys(cancellationMeta).length > 0 ? JSON.stringify(cancellationMeta) : null,
        cancel_at: periodEnd,
      })
      .eq("id", user.id);
    if (updateErr) {
      console.error("[blockid:stripe] cancel: failed to store reason", { error: updateErr, userId: user.id });
    }

    await supabase.from("churn_events").insert({
      user_id: user.id,
      from_plan: currentPlan,
      reason: reason ?? null,
      exit_survey: { reason, feedback, save_offer_declined: !!save_offer },
      offered_coupon: save_offer?.coupon ?? null,
      accepted_coupon: false,
      detail: { source: "cancel_flow", accepted: false, active_until: periodEnd },
    });

    sendCancellationEmail({ to: user.email, activeUntil: periodEnd }).catch((err) => {
      console.error("[blockid:stripe] cancellation email send error", err);
    });

    console.log(
      `[blockid:stripe] subscription ${activeSub.id} scheduled for cancellation at ${periodEnd} for user ${user.id}`,
    );

    return NextResponse.json({ ok: true, activeUntil: periodEnd });
  } catch (err) {
    console.error("[blockid:stripe] cancel failed", err);
    return NextResponse.json({ ok: false, reason: "Failed to cancel subscription" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
