// Checkout route — creates Stripe checkout sessions.
//
// POST /checkout
// Body: { userId, plan, email, successUrl?, cancelUrl?, couponCode? }

import type { FastifyInstance } from "fastify";
import type Stripe from "stripe";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "../lib/stripe.js";
import { getPlan, isGrowthEarlyBird } from "../lib/plans.js";
import { CREDIT_PACKS } from "../lib/credits.js";
import { getSupabase } from "../lib/supabase.js";

export async function checkoutRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: {
      userId?: string;
      plan?: string;
      email?: string;
      successUrl?: string;
      cancelUrl?: string;
      couponCode?: string;
      // Credit pack purchase fields
      creditPackAmount?: number;
    };
  }>("/checkout", async (request, reply) => {
    const { userId, plan: planId, email, successUrl, cancelUrl, couponCode, creditPackAmount } =
      request.body ?? {};

    if (!userId) {
      return reply.code(400).send({ ok: false, reason: "userId is required" });
    }

    if (!isStripeConfigured()) {
      return reply.code(503).send({ ok: false, reason: "Stripe not configured" });
    }

    const stripe = getStripe()!;
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

    // ── Credit pack purchase ─────────────────────────────────────────────
    if (creditPackAmount) {
      const validPack = CREDIT_PACKS.find((p) => p.credits === creditPackAmount);
      if (!validPack) {
        return reply.code(400).send({
          ok: false,
          reason: `Invalid credit pack. Choose one of: ${CREDIT_PACKS.map((p) => p.credits).join(", ")}`,
        });
      }

      const creditsPriceId = STRIPE_PRICE_MAP[`credits_${creditPackAmount}`];
      if (!creditsPriceId) {
        return reply.code(400).send({
          ok: false,
          reason: `Stripe price not configured for credits_${creditPackAmount}`,
        });
      }

      try {
        // Look up or create Stripe customer.
        const customerId = await resolveStripeCustomer(stripe, userId, email);

        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer: customerId ?? undefined,
          customer_email: customerId ? undefined : email,
          line_items: [{ price: creditsPriceId, quantity: 1 }],
          success_url: successUrl || `${siteUrl}/workspace/billing?credits_purchased=${creditPackAmount}#credits`,
          cancel_url: cancelUrl || `${siteUrl}/workspace/billing#credits`,
          metadata: {
            blockid_user_id: userId,
            blockid_credits: String(creditPackAmount),
            type: "credit_purchase",
          },
        });

        return { ok: true, url: session.url };
      } catch (err) {
        app.log.error(err, "Stripe credit pack checkout creation failed");
        return reply.code(500).send({ ok: false, reason: "Failed to create checkout session" });
      }
    }

    // ── Plan checkout ────────────────────────────────────────────────────
    if (!planId) {
      return reply.code(400).send({ ok: false, reason: "plan is required" });
    }

    const plan = getPlan(planId);
    if (!plan || plan.cadence === "free") {
      return reply.code(400).send({ ok: false, reason: "Invalid or free plan" });
    }

    let priceId = STRIPE_PRICE_MAP[planId];

    // After the Growth early-bird deadline, switch to the standard $499/mo price.
    if (planId === "growth" && !isGrowthEarlyBird()) {
      priceId = process.env.STRIPE_PRICE_GROWTH_499 ?? priceId;
    }

    if (!priceId) {
      return reply.code(400).send({
        ok: false,
        reason: `Stripe price not configured for plan "${planId}"`,
      });
    }

    const isRecurring = plan.cadence === "monthly" || plan.cadence === "yearly";

    try {
      // Look up or create Stripe customer.
      const customerId = await resolveStripeCustomer(stripe, userId, email);

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: isRecurring ? "subscription" : "payment",
        customer: customerId ?? undefined,
        customer_email: customerId ? undefined : email,
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: successUrl || `${siteUrl}/checkout/success?plan=${planId}`,
        cancel_url: cancelUrl || `${siteUrl}/#pricing`,
        metadata: {
          blockid_user_id: userId,
          blockid_plan: planId,
          blockid_email: email || "",
        },
        allow_promotion_codes: true,
      };

      // Apply a Stripe coupon if provided.
      if (couponCode && typeof couponCode === "string") {
        sessionParams.discounts = [{ coupon: couponCode }];
        delete sessionParams.allow_promotion_codes;
      }

      const session = await stripe.checkout.sessions.create(sessionParams);
      return { ok: true, url: session.url };
    } catch (err) {
      app.log.error(err, "Stripe checkout session creation failed");
      return reply.code(500).send({ ok: false, reason: "Failed to create checkout session" });
    }
  });
}

// ---------------------------------------------------------------------------
// Helper: resolve or create Stripe customer from app_users
// ---------------------------------------------------------------------------

async function resolveStripeCustomer(
  stripe: Stripe,
  userId: string,
  email?: string,
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Check if user already has a Stripe customer ID.
  const { data: user } = await supabase
    .from("app_users")
    .select("stripe_customer_id, email")
    .eq("id", userId)
    .maybeSingle();

  if (user?.stripe_customer_id) {
    return user.stripe_customer_id;
  }

  // Create a new Stripe customer.
  const customerEmail = email || user?.email;
  if (!customerEmail) return null;

  try {
    const customer = await stripe.customers.create({
      email: customerEmail,
      metadata: { blockid_user_id: userId },
    });

    // Store the customer ID back in app_users.
    await supabase
      .from("app_users")
      .update({ stripe_customer_id: customer.id })
      .eq("id", userId);

    return customer.id;
  } catch (err) {
    console.error("[billing:checkout] Failed to create Stripe customer", err);
    return null;
  }
}
