// Cancel subscription route — cancels at period end.
//
// POST /cancel
// Body: { userId }

import type { FastifyInstance } from "fastify";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { getSupabase } from "../lib/supabase.js";

export async function cancelRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { userId?: string };
  }>("/cancel", async (request, reply) => {
    const { userId } = request.body ?? {};

    if (!userId) {
      return reply.code(400).send({ ok: false, reason: "userId is required" });
    }

    if (!isStripeConfigured()) {
      return reply.code(503).send({ ok: false, reason: "Stripe not configured" });
    }

    const stripe = getStripe()!;
    const supabase = getSupabase();
    if (!supabase) {
      return reply.code(503).send({ ok: false, reason: "Database not configured" });
    }

    // Look up the user's Stripe customer ID.
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
      // Find active subscriptions for this customer.
      const subscriptions = await stripe.subscriptions.list({
        customer: user.stripe_customer_id,
        status: "active",
        limit: 1,
      });

      if (subscriptions.data.length === 0) {
        return reply.code(404).send({
          ok: false,
          reason: "No active subscription found",
        });
      }

      const subscription = subscriptions.data[0];

      // Cancel at period end (user keeps access until end of billing period).
      const updated = await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });

      // In Stripe SDK v18, current_period_end lives on the subscription item.
      const periodEnd = updated.items?.data?.[0]?.current_period_end;

      app.log.info({
        msg: "Subscription set to cancel at period end",
        userId,
        subscriptionId: subscription.id,
        cancelAt: updated.cancel_at,
        currentPeriodEnd: periodEnd,
      });

      return {
        ok: true,
        cancelAt: updated.cancel_at
          ? new Date(updated.cancel_at * 1000).toISOString()
          : null,
        currentPeriodEnd: periodEnd
          ? new Date(periodEnd * 1000).toISOString()
          : null,
      };
    } catch (err) {
      app.log.error(err, "Failed to cancel subscription");
      return reply.code(500).send({ ok: false, reason: "Failed to cancel subscription" });
    }
  });
}
