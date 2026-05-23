// Change plan route — upgrade or downgrade a subscription.
//
// POST /change-plan
// Body: { userId, newPlan }

import type { FastifyInstance } from "fastify";
import { getStripe, isStripeConfigured, STRIPE_PRICE_MAP } from "../lib/stripe.js";
import { getSupabase } from "../lib/supabase.js";
import { getPlan, isGrowthEarlyBird } from "../lib/plans.js";

export async function changePlanRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { userId?: string; newPlan?: string };
  }>("/change-plan", async (request, reply) => {
    const { userId, newPlan } = request.body ?? {};

    if (!userId || !newPlan) {
      return reply.code(400).send({ ok: false, reason: "userId and newPlan are required" });
    }

    if (!isStripeConfigured()) {
      return reply.code(503).send({ ok: false, reason: "Stripe not configured" });
    }

    const plan = getPlan(newPlan);
    if (!plan) {
      return reply.code(400).send({ ok: false, reason: `Unknown plan: ${newPlan}` });
    }

    // Only recurring plans can be changed via subscription update.
    if (plan.cadence !== "monthly" && plan.cadence !== "yearly") {
      return reply.code(400).send({
        ok: false,
        reason: "Only recurring plans (monthly/yearly) can be changed. Use checkout for one-off plans.",
      });
    }

    let priceId = STRIPE_PRICE_MAP[newPlan];
    if (newPlan === "growth" && !isGrowthEarlyBird()) {
      priceId = process.env.STRIPE_PRICE_GROWTH_499 ?? priceId;
    }

    if (!priceId) {
      return reply.code(400).send({
        ok: false,
        reason: `Stripe price not configured for plan "${newPlan}"`,
      });
    }

    const stripe = getStripe()!;
    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, reason: "Database not configured" });
    }

    // Look up user's Stripe customer ID.
    const { data: user } = await supabase
      .from("app_users")
      .select("stripe_customer_id, plan")
      .eq("id", userId)
      .maybeSingle();

    if (!user?.stripe_customer_id) {
      return reply.code(404).send({
        ok: false,
        reason: "No Stripe customer found for this user",
      });
    }

    try {
      // Find the active subscription.
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return reply.code(404).send({
          ok: false,
          reason: "No active subscription found. Use checkout to start a new subscription.",
        });
      }

      const subscription = subscriptions.data[0];
      const itemId = subscription.items.data[0]?.id;

      if (!itemId) {
        return reply.code(500).send({ ok: false, reason: "Subscription has no items" });
      }

      // Update the subscription to the new price (proration by default).
      const updated = await stripe.subscriptions.update(subscription.id, {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: "create_prorations",
        // If the subscription was set to cancel, undo it.
        cancel_at_period_end: false,
      });

      app.log.info({
        msg: "Subscription plan changed",
        userId,
        oldPlan: user.plan,
        newPlan,
        subscriptionId: subscription.id,
      });

      // In Stripe SDK v18, current_period_end lives on the subscription item.
      const periodEnd = updated.items?.data?.[0]?.current_period_end;

      return {
        ok: true,
        plan: newPlan,
        subscriptionId: updated.id,
        currentPeriodEnd: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
      };
    } catch (err) {
      app.log.error(err, "Failed to change subscription plan");
      return reply.code(500).send({ ok: false, reason: "Failed to change subscription plan" });
    }
  });
}
