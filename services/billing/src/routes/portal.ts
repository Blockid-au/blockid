// Billing portal route — creates a Stripe billing portal session.
//
// POST /portal
// Body: { userId }

import type { FastifyInstance } from "fastify";
import { getStripe, isStripeConfigured } from "../lib/stripe.js";
import { getSupabase } from "../lib/supabase.js";

export async function portalRoutes(app: FastifyInstance): Promise<void> {
  app.post<{
    Body: { userId?: string; returnUrl?: string };
  }>("/portal", async (request, reply) => {
    const { userId, returnUrl } = request.body ?? {};

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
      .select("stripe_customer_id")
      .eq("id", userId)
      .maybeSingle();

    if (!user?.stripe_customer_id) {
      return reply.code(404).send({
        ok: false,
        reason: "No Stripe customer found for this user. Purchase a plan first.",
      });
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://blockid.au";

    try {
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: returnUrl || `${siteUrl}/workspace/billing`,
      });

      return { ok: true, url: session.url };
    } catch (err) {
      app.log.error(err, "Failed to create billing portal session");
      return reply.code(500).send({ ok: false, reason: "Failed to create billing portal session" });
    }
  });
}
