// Stripe webhook handler.
//
// POST /webhook
// Verifies Stripe signature using raw body, then processes events.
//
// CRITICAL: This route does NOT use X-Internal-Key auth — it relies
// exclusively on Stripe's webhook signature verification.
//
// Fastify v5 does not have a built-in rawBody option. We register this
// route plugin with its own content-type parser that stores the raw
// body as a Buffer on the request for Stripe signature verification.

import type { FastifyInstance, FastifyRequest } from "fastify";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "../lib/stripe.js";
import { getSupabase } from "../lib/supabase.js";
import { grantCredits, PLAN_CREDITS } from "../lib/credits.js";

// Augment the request type to carry the raw body.
declare module "fastify" {
  interface FastifyRequest {
    rawBody?: Buffer;
  }
}

// Set of event IDs we've already processed — simple in-memory idempotency
// guard. In production, use a persistent store (Redis / DB) for multi-instance.
const processedEvents = new Set<string>();
const MAX_PROCESSED_CACHE = 10_000;

function markProcessed(eventId: string): boolean {
  if (processedEvents.has(eventId)) return true; // already processed
  if (processedEvents.size >= MAX_PROCESSED_CACHE) {
    // Evict oldest entries (Set iterates in insertion order).
    const it = processedEvents.values();
    for (let i = 0; i < 1000; i++) {
      const next = it.next();
      if (next.done) break;
      processedEvents.delete(next.value);
    }
  }
  processedEvents.add(eventId);
  return false; // first time
}

export async function webhookRoutes(app: FastifyInstance): Promise<void> {
  // Register a custom content-type parser that captures the raw body
  // for Stripe webhook signature verification. This only applies to
  // routes within this plugin scope.
  app.addContentTypeParser(
    "application/json",
    { parseAs: "buffer" },
    (_req: FastifyRequest, body: Buffer, done: (err: Error | null, result?: unknown) => void) => {
      // Store raw body on request for signature verification.
      _req.rawBody = body;
      try {
        const parsed = JSON.parse(body.toString("utf8"));
        done(null, parsed);
      } catch (err) {
        done(err as Error);
      }
    },
  );

  app.post("/webhook", async (request, reply) => {
    if (!isStripeConfigured()) {
      return reply.code(503).send({ error: "Stripe not configured" });
    }

    const stripe = getStripe()!;
    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ error: "Database not configured" });
    }

    const sig = request.headers["stripe-signature"] as string | undefined;
    if (!sig) {
      return reply.code(400).send({ error: "Missing stripe-signature header" });
    }

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      app.log.error("STRIPE_WEBHOOK_SECRET not set");
      return reply.code(500).send({ error: "Webhook secret not configured" });
    }

    let event: Stripe.Event;
    try {
      const rawBody = request.rawBody;
      if (!rawBody) {
        return reply.code(400).send({ error: "Missing raw body" });
      }
      event = stripe.webhooks.constructEvent(rawBody.toString("utf8"), sig, webhookSecret);
    } catch (err) {
      app.log.error(err, "Webhook signature verification failed");
      return reply.code(400).send({ error: "Invalid signature" });
    }

    // Idempotency check.
    if (markProcessed(event.id)) {
      app.log.info(`Webhook event ${event.id} already processed — skipping`);
      return { received: true, skipped: true };
    }

    // Process the event. Always acknowledge receipt to Stripe (200) after
    // signature verification. Process events best-effort.
    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(app, stripe, supabase, event);
          break;

        case "customer.subscription.deleted":
          await handleSubscriptionDeleted(app, supabase, event);
          break;

        case "customer.subscription.updated":
          await handleSubscriptionUpdated(app, supabase, event);
          break;

        case "invoice.payment_failed":
          await handlePaymentFailed(app, supabase, event);
          break;

        case "invoice.paid":
          await handleInvoicePaid(app, supabase, event);
          break;

        default:
          app.log.info(`Unhandled webhook event type: ${event.type}`);
          break;
      }
    } catch (err) {
      app.log.error(err, `Error processing webhook event ${event.type}`);
      // Remove from processed set so Stripe retry will work.
      processedEvents.delete(event.id);
      return reply.code(500).send({ error: "Processing error" });
    }

    return { received: true };
  });
}

// ---------------------------------------------------------------------------
// checkout.session.completed
// ---------------------------------------------------------------------------

type SupabaseClient = NonNullable<ReturnType<typeof getSupabase>>;

async function handleCheckoutCompleted(
  app: FastifyInstance,
  _stripe: Stripe,
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const session = event.data.object as Stripe.Checkout.Session;

  // ── Per-analysis payment (no auth required) ─────────────────────────
  if (session.metadata?.blockid_type === "svi_analysis") {
    const email = session.metadata.blockid_email?.toLowerCase().trim();
    if (email) {
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

      // Also credit svi_analysis_usage.
      const { data: existingUsage } = await supabase
        .from("svi_analysis_usage")
        .select("credits_remaining")
        .eq("email", email)
        .maybeSingle();

      if (existingUsage) {
        await supabase
          .from("svi_analysis_usage")
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

      app.log.info(`Analysis credit added for ${email}`);
    }
    return;
  }

  // ── Credit pack purchase (one-off credit top-up) ─────────────────────
  if (session.metadata?.type === "credit_purchase") {
    const creditUserId = session.metadata.blockid_user_id;
    const creditAmount = parseInt(session.metadata.blockid_credits ?? "0", 10);
    if (creditUserId && creditAmount > 0) {
      const grantResult = await grantCredits(creditUserId, creditAmount, "credit_pack_purchase", {
        credits: creditAmount,
        session_id: session.id,
      });
      if (grantResult.ok) {
        app.log.info(`Granted ${creditAmount} credits to user ${creditUserId}`);
      } else {
        app.log.error(`Failed to grant ${creditAmount} credits to user ${creditUserId}`);
      }
    } else {
      app.log.warn({
        msg: "credit_purchase missing user_id or invalid credit amount",
        userId: creditUserId,
        creditAmount,
        sessionId: session.id,
      });
    }
    return;
  }

  // ── Plan checkout ────────────────────────────────────────────────────
  let userId = session.metadata?.blockid_user_id;
  const planId = session.metadata?.blockid_plan;

  // Fallback: look up user by email when user_id is absent.
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
        app.log.info(`Resolved user by email ${lookupEmail} -> ${userId}`);
      } else {
        app.log.warn({
          msg: "checkout.session.completed: no user found for email",
          email: lookupEmail,
          planId,
          sessionId: session.id,
        });
      }
    }
  }

  if (!userId || !planId) {
    app.log.warn({
      msg: "checkout.session.completed missing metadata",
      userId,
      planId,
      sessionId: session.id,
    });
    return;
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
    app.log.error({
      msg: "User plan update failed",
      error: updateErr,
      userId,
      planId,
      sessionId: session.id,
    });
    throw new Error("Database error: user plan update failed");
  }

  app.log.info(`Activated plan "${planId}" for user ${userId}`);

  // Grant credits for the plan.
  const planCredits = PLAN_CREDITS[planId];
  if (planCredits && userId) {
    const grantResult = await grantCredits(userId, planCredits.amount, "plan_grant", {
      plan: planId,
    });
    if (grantResult.ok) {
      app.log.info(`Granted ${planCredits.amount} credits to user ${userId} for plan "${planId}"`);
    } else {
      app.log.error(`Failed to grant credits to user ${userId} for plan "${planId}"`);
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
        app.log.error({
          msg: "svi_accounts upsert failed",
          error: sviErr,
          email,
          planId,
        });
      }
    }
  }
}

// ---------------------------------------------------------------------------
// customer.subscription.deleted — downgrade to free
// ---------------------------------------------------------------------------

async function handleSubscriptionDeleted(
  app: FastifyInstance,
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;

  if (!customerId) {
    app.log.warn({
      msg: "subscription.deleted: no customer ID",
      subscriptionId: subscription.id,
    });
    return;
  }

  const { error } = await supabase
    .from("app_users")
    .update({ plan: "free", plan_started_at: null })
    .eq("stripe_customer_id", customerId);

  if (error) {
    app.log.error({
      msg: "Subscription cancel downgrade failed",
      error,
      customerId,
      subscriptionId: subscription.id,
    });
    throw new Error("Database error: subscription cancel downgrade failed");
  }

  app.log.info(`Downgraded customer ${customerId} to free`);
}

// ---------------------------------------------------------------------------
// customer.subscription.updated — update plan if price changed
// ---------------------------------------------------------------------------

async function handleSubscriptionUpdated(
  app: FastifyInstance,
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const subscription = event.data.object as Stripe.Subscription;
  const previousAttributes = event.data.previous_attributes as
    | Record<string, unknown>
    | undefined;
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : null;

  if (!customerId) {
    app.log.warn({
      msg: "subscription.updated: no customer ID",
      subscriptionId: subscription.id,
    });
    return;
  }

  // Check if the price (plan) changed by inspecting previous_attributes.
  const items = subscription.items?.data;
  const currentPriceId = items?.[0]?.price?.id ?? null;
  const hadItemsChange = previousAttributes?.items !== undefined;

  if (hadItemsChange && currentPriceId) {
    // Reverse-map the Stripe price ID to our internal plan ID.
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
        app.log.error({
          msg: "subscription.updated plan change DB update failed",
          error: updateErr,
          customerId,
          newPlanId,
        });
        throw new Error("Database error: subscription update failed");
      }

      app.log.info(`Plan changed to "${newPlanId}" for customer ${customerId}`);
    } else {
      app.log.warn({
        msg: "subscription.updated: unknown price ID",
        currentPriceId,
        customerId,
      });
    }
  } else {
    app.log.info(`subscription.updated (non-plan change) for customer ${customerId}`);
  }
}

// ---------------------------------------------------------------------------
// invoice.payment_failed — log the failure
// ---------------------------------------------------------------------------

async function handlePaymentFailed(
  app: FastifyInstance,
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;

  if (!customerId) {
    app.log.warn({
      msg: "invoice.payment_failed: no customer ID",
      invoiceId: invoice.id,
    });
    return;
  }

  const { data: failedUser } = await supabase
    .from("app_users")
    .select("email")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  // Phase 2: Send payment failed email via email service.
  app.log.warn({
    msg: "Payment failed",
    customerId,
    email: failedUser?.email ?? "unknown",
    invoiceId: invoice.id,
  });
}

// ---------------------------------------------------------------------------
// invoice.paid — grant recurring credits for subscription invoices
// ---------------------------------------------------------------------------

async function handleInvoicePaid(
  app: FastifyInstance,
  supabase: SupabaseClient,
  event: Stripe.Event,
): Promise<void> {
  const invoice = event.data.object as Stripe.Invoice;
  const customerId =
    typeof invoice.customer === "string" ? invoice.customer : null;

  // Only process recurring subscription invoices, not one-off checkouts.
  const billingReason = invoice.billing_reason;
  const isRecurringCycle = billingReason === "subscription_cycle";

  if (!customerId || !isRecurringCycle) {
    return;
  }

  // Look up the user and their plan.
  const { data: paidUser } = await supabase
    .from("app_users")
    .select("id, email, plan")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (!paidUser) {
    app.log.warn({
      msg: "invoice.paid: user not found for customer",
      customerId,
    });
    return;
  }

  // Grant recurring credits if the plan has them.
  const planCredits = PLAN_CREDITS[paidUser.plan ?? ""];
  if (planCredits?.recurring && paidUser.id) {
    const grantResult = await grantCredits(
      paidUser.id,
      planCredits.amount,
      "recurring_grant",
      {
        plan: paidUser.plan,
        invoice_id: invoice.id,
        billing_reason: billingReason,
      },
    );
    if (grantResult.ok) {
      app.log.info(
        `Granted ${planCredits.amount} recurring credits to user ${paidUser.id} for plan "${paidUser.plan}"`,
      );
    } else {
      app.log.error(
        `Failed to grant recurring credits to user ${paidUser.id}`,
      );
    }
  }

  app.log.info({
    msg: "Invoice paid",
    customerId,
    email: paidUser.email,
    amount: invoice.amount_paid,
  });
}
