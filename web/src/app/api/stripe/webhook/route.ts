import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";
import {
  sendPaymentConfirmation,
  sendPaymentFailed,
  sendPaymentReceipt,
} from "@/lib/email";

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

  // Always acknowledge receipt to Stripe (200) after signature verification.
  // Process events best-effort — if the DB write fails, log and let Stripe
  // retry via its automatic retry mechanism rather than returning 500.

  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      const userId = session.metadata?.blockid_user_id;
      const planId = session.metadata?.blockid_plan;

      if (!userId || !planId) {
        console.warn("[blockid:stripe] checkout.session.completed missing metadata", {
          userId,
          planId,
          sessionId: session.id,
        });
        break;
      }

      const customerId =
        typeof session.customer === "string" ? session.customer : null;

      // Activate the plan for the user.
      const { error: updateErr } = await supabase
        .from("app_users")
        .update({
          plan: planId,
          plan_started_at: new Date().toISOString(),
          stripe_customer_id: customerId,
        })
        .eq("id", userId);

      if (updateErr) {
        console.error("[blockid:stripe] user plan update failed", {
          error: updateErr,
          userId,
          planId,
          sessionId: session.id,
        });
        // Return 500 so Stripe retries this webhook delivery.
        return NextResponse.json(
          { error: "Database error" },
          { status: 500 },
        );
      }

      console.log(
        `[blockid:stripe] activated plan "${planId}" for user ${userId}`,
      );

      // Find or create svi_accounts row for this user's email.
      const email = session.customer_email ?? session.metadata?.blockid_email;
      if (email) {
        const { data: existingAccount } = await supabase
          .from("svi_accounts")
          .select("id")
          .eq("email", email)
          .maybeSingle();

        if (existingAccount) {
          await supabase
            .from("svi_accounts")
            .update({ plan: planId })
            .eq("id", existingAccount.id);
        } else {
          const { error: sviErr } = await supabase
            .from("svi_accounts")
            .insert({
              email,
              plan: planId,
              last_active_at: new Date().toISOString(),
            });
          if (sviErr) {
            console.error("[blockid:stripe] svi_accounts upsert failed", {
              error: sviErr,
              email,
              planId,
            });
          }
        }

        // Send payment confirmation email (best-effort).
        const planDef = getPlan(planId);
        const planName = planDef?.name ?? planId;
        sendPaymentConfirmation({ to: email, planName }).catch((err) => {
          console.error("[blockid:stripe] payment confirmation email failed", err);
        });
      }

      break;
    }

    case "customer.subscription.deleted": {
      // When a subscription is cancelled, downgrade to free.
      const subscription = event.data.object;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : null;

      if (!customerId) {
        console.warn("[blockid:stripe] subscription.deleted: no customer ID", {
          subscriptionId: subscription.id,
        });
        break;
      }

      const { error } = await supabase
        .from("app_users")
        .update({ plan: "free", plan_started_at: null })
        .eq("stripe_customer_id", customerId);

      if (error) {
        console.error("[blockid:stripe] subscription cancel downgrade failed", {
          error,
          customerId,
          subscriptionId: subscription.id,
        });
        return NextResponse.json(
          { error: "Database error" },
          { status: 500 },
        );
      }

      console.log(
        `[blockid:stripe] downgraded customer ${customerId} to free`,
      );
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object;
      const customerId =
        typeof invoice.customer === "string" ? invoice.customer : null;

      if (!customerId) {
        console.warn("[blockid:stripe] invoice.payment_failed: no customer ID", {
          invoiceId: invoice.id,
        });
        break;
      }

      const { data: failedUser } = await supabase
        .from("app_users")
        .select("email")
        .eq("stripe_customer_id", customerId)
        .maybeSingle();

      if (failedUser?.email) {
        sendPaymentFailed({ to: failedUser.email }).catch((err) => {
          console.error("[blockid:stripe] payment failed email send error", err);
        });
      } else {
        console.warn(
          "[blockid:stripe] invoice.payment_failed: user not found for customer",
          { customerId },
        );
      }

      console.log(
        `[blockid:stripe] payment failed for customer ${customerId}`,
      );
      break;
    }

    case "customer.subscription.updated": {
      const subscription = event.data.object;
      const previousAttributes = event.data.previous_attributes as
        | Record<string, unknown>
        | undefined;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : null;

      if (!customerId) {
        console.warn(
          "[blockid:stripe] subscription.updated: no customer ID",
          { subscriptionId: subscription.id },
        );
        break;
      }

      // Check if the price (plan) changed by inspecting previous_attributes.
      const items = subscription.items?.data;
      const currentPriceId = items?.[0]?.price?.id ?? null;

      // previous_attributes.items indicates a plan change occurred.
      const hadItemsChange = previousAttributes?.items !== undefined;

      if (hadItemsChange && currentPriceId) {
        // Reverse-map the Stripe price ID to our internal plan ID.
        const { STRIPE_PRICE_MAP } = await import("@/lib/stripe");
        const newPlanId = Object.entries(STRIPE_PRICE_MAP).find(
          ([, priceId]) => priceId === currentPriceId,
        )?.[0];

        if (newPlanId) {
          const { error: updateErr } = await supabase
            .from("app_users")
            .update({
              plan: newPlanId,
              plan_started_at: new Date().toISOString(),
            })
            .eq("stripe_customer_id", customerId);

          if (updateErr) {
            console.error(
              "[blockid:stripe] subscription.updated plan change DB update failed",
              { error: updateErr, customerId, newPlanId },
            );
            return NextResponse.json(
              { error: "Database error" },
              { status: 500 },
            );
          }

          console.log(
            `[blockid:stripe] plan changed to "${newPlanId}" for customer ${customerId}`,
          );
        } else {
          console.warn(
            "[blockid:stripe] subscription.updated: unknown price ID",
            { currentPriceId, customerId },
          );
        }
      } else {
        console.log(
          `[blockid:stripe] subscription.updated (non-plan change) for customer ${customerId}`,
        );
      }
      break;
    }

    case "invoice.paid": {
      const paidInvoice = event.data.object;
      const paidCustomerId =
        typeof paidInvoice.customer === "string"
          ? paidInvoice.customer
          : null;

      // Only send receipt for recurring subscription invoices (not one-off checkouts).
      // In Stripe SDK v22, `subscription` is no longer a top-level Invoice field;
      // use `billing_reason` to detect subscription-related invoices.
      const billingReason = paidInvoice.billing_reason;
      const isSubscriptionInvoice =
        billingReason === "subscription_cycle" ||
        billingReason === "subscription_update" ||
        billingReason === "subscription_create";

      if (!paidCustomerId || !isSubscriptionInvoice) {
        break;
      }

      const { data: paidUser } = await supabase
        .from("app_users")
        .select("email")
        .eq("stripe_customer_id", paidCustomerId)
        .maybeSingle();

      if (paidUser?.email) {
        const amountCents = paidInvoice.amount_paid ?? 0;
        const currency = paidInvoice.currency ?? "aud";
        sendPaymentReceipt({
          to: paidUser.email,
          amountCents,
          currency,
        }).catch((err) => {
          console.error("[blockid:stripe] payment receipt email send error", err);
        });
      }

      console.log(
        `[blockid:stripe] invoice paid for customer ${paidCustomerId}, amount: ${paidInvoice.amount_paid}`,
      );
      break;
    }

    default:
      // Unhandled event type — acknowledge receipt.
      break;
  }

  return NextResponse.json({ received: true });
}

export const dynamic = "force-dynamic";
