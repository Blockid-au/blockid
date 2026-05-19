import { NextResponse } from "next/server";
import { getStripe, isStripeConfigured } from "@/lib/stripe";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { getPlan } from "@/lib/plans";
import {
  sendPaymentConfirmation,
  sendPaymentFailed,
  sendPaymentReceipt,
} from "@/lib/email";
import { grantCredits, PLAN_CREDITS } from "@/lib/credits";

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

      // ── Per-analysis payment (no auth required) ─────────────────────
      if (session.metadata?.blockid_type === "svi_analysis") {
        const email = session.metadata.blockid_email?.toLowerCase().trim();
        if (email) {
          // Grant one analysis credit by incrementing svi_analysis_credits.
          const { data: existingAccount } = await supabase
            .from("svi_accounts")
            .select("id, svi_analysis_credits")
            .eq("email", email)
            .maybeSingle();

          if (existingAccount) {
            await supabase
              .from("svi_accounts")
              .update({
                svi_analysis_credits: (existingAccount.svi_analysis_credits ?? 0) + 1,
              })
              .eq("id", existingAccount.id);
          } else {
            await supabase.from("svi_accounts").insert({
              email,
              svi_analysis_credits: 1,
              last_active_at: new Date().toISOString(),
            });
          }

          // Also credit svi_analysis_usage (server-side gate table)
          const { data: existingUsage } = await supabase
            .from("svi_analysis_usage")
            .select("credits_remaining")
            .eq("email", email)
            .maybeSingle();

          if (existingUsage) {
            await supabase.from("svi_analysis_usage")
              .update({ credits_remaining: (existingUsage.credits_remaining ?? 0) + 1 })
              .eq("email", email);
          } else {
            await supabase.from("svi_analysis_usage").insert({
              email,
              free_used: true,
              credits_remaining: 1,
              total_analyses: 0,
            });
          }

          console.log(
            `[blockid:stripe] analysis credit added for ${email}`,
          );

          // Send analysis purchase confirmation email (best-effort).
          const { sendAnalysisPurchaseConfirmation } = await import("@/lib/email");
          sendAnalysisPurchaseConfirmation({ to: email }).catch((err) => {
            console.error("[blockid:stripe] analysis purchase confirmation email failed", err);
          });
        }
        break;
      }

      // ── Credit pack purchase (one-off credit top-up) ─────────────────
      if (session.metadata?.type === "credit_purchase") {
        const creditUserId = session.metadata.blockid_user_id;
        const creditAmount = parseInt(session.metadata.blockid_credits ?? "0", 10);
        if (creditUserId && creditAmount > 0) {
          const grantResult = await grantCredits(creditUserId, creditAmount, "credit_pack_purchase", {
            credits: creditAmount,
            session_id: session.id,
          });
          if (grantResult.ok) {
            console.log(`[blockid:stripe] granted ${creditAmount} credits to user ${creditUserId}`);
          } else {
            console.error(`[blockid:stripe] failed to grant ${creditAmount} credits to user ${creditUserId}`);
          }
        } else {
          console.warn("[blockid:stripe] credit_purchase missing user_id or invalid credit amount", {
            userId: creditUserId,
            creditAmount,
            sessionId: session.id,
          });
        }
        break;
      }

      let userId = session.metadata?.blockid_user_id;
      const planId = session.metadata?.blockid_plan;

      // ── Fallback: look up user by email when user_id is absent ──────
      // This handles the lead/founding50 flow where the user may not have
      // signed up yet at checkout time, so blockid_user_id is not set.
      if (!userId && planId) {
        const lookupEmail = (
          session.customer_email ?? session.metadata?.blockid_email
        )?.toLowerCase().trim();

        if (lookupEmail) {
          const { data: userByEmail } = await supabase
            .from("app_users")
            .select("id")
            .eq("email", lookupEmail)
            .maybeSingle();

          if (userByEmail) {
            userId = userByEmail.id;
            console.log(
              `[blockid:stripe] resolved user by email ${lookupEmail} → ${userId}`,
            );
          } else {
            console.warn(
              "[blockid:stripe] checkout.session.completed: no user found for email",
              { email: lookupEmail, planId, sessionId: session.id },
            );
          }
        }
      }

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

      // ── Grant credits for the plan ──────────────────────────────────
      const planCredits = PLAN_CREDITS[planId];
      if (planCredits && userId) {
        const grantResult = await grantCredits(userId, planCredits.amount, "plan_grant", {
          plan: planId,
        });
        if (grantResult.ok) {
          console.log(
            `[blockid:stripe] granted ${planCredits.amount} credits to user ${userId} for plan "${planId}"`,
          );
        } else {
          console.error(
            `[blockid:stripe] failed to grant credits to user ${userId} for plan "${planId}"`,
          );
        }
      }

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
