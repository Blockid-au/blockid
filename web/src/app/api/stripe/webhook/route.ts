import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";

// POST /api/stripe/webhook
// Stripe sends webhook events here. Verifies the signature, then processes
// checkout.session.completed to activate user plans.

export async function POST(request: Request) {
  if (!isStripeConfigured() || !isSupabaseConfigured()) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const stripe = getStripe()!;
  const supabase = getSupabaseAdmin()!;
  const sig = request.headers.get("stripe-signature");

  if (!sig) {
    return NextResponse.json(
      { error: "Missing stripe-signature header" },
      { status: 400 },
    );
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[blockid:stripe] STRIPE_WEBHOOK_SECRET not set");
    return NextResponse.json(
      { error: "Webhook secret not configured" },
      { status: 500 },
    );
  }

  let event;
  try {
    const rawBody = await request.text();
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error("[blockid:stripe] webhook signature verification failed", err);
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.blockid_user_id;
      const planId = session.metadata?.blockid_plan;

      if (!userId || !planId) {
        console.warn("[blockid:stripe] checkout.session.completed missing metadata", {
          userId,
          planId,
        });
        break;
      }

      // Activate the plan for the user.
      const { error: updateErr } = await supabase
        .from("app_users")
        .update({
          plan: planId,
          plan_started_at: new Date().toISOString(),
          stripe_customer_id: session.customer as string | null,
        })
        .eq("id", userId);

      if (updateErr) {
        console.error("[blockid:stripe] user plan update failed", updateErr);
        return NextResponse.json(
          { error: "Database error" },
          { status: 500 },
        );
      }

      console.log(
        `[blockid:stripe] activated plan "${planId}" for user ${userId}`,
      );
      break;
    }

    case "customer.subscription.deleted": {
      // When a subscription is cancelled, downgrade to free.
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer;

      if (customerId) {
        const { error } = await supabase
          .from("app_users")
          .update({ plan: "free", plan_started_at: null })
          .eq("stripe_customer_id", customerId);

        if (error) {
          console.error("[blockid:stripe] subscription cancel downgrade failed", error);
        } else {
          console.log(
            `[blockid:stripe] downgraded customer ${customerId} to free`,
          );
        }
      }
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt.
      break;
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
