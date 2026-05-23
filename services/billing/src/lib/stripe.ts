// Stripe server-side client for the billing microservice.

import Stripe from "stripe";

let cached: Stripe | null | undefined;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  if (cached !== undefined) return cached;
  if (!isStripeConfigured()) {
    cached = null;
    return null;
  }
  cached = new Stripe(process.env.STRIPE_SECRET_KEY as string, {
    typescript: true,
  });
  return cached;
}

/**
 * Map internal plan IDs to Stripe Price IDs.
 * All values sourced from environment variables.
 */
export const STRIPE_PRICE_MAP: Record<string, string | undefined> = {
  founding50: process.env.STRIPE_PRICE_FOUNDING50,
  founder: process.env.STRIPE_PRICE_FOUNDER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  growth_annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
  growth_499: process.env.STRIPE_PRICE_GROWTH_499,
  pilot: process.env.STRIPE_PRICE_PILOT,
  accelerator: process.env.STRIPE_PRICE_ACCELERATOR,
  svi_analysis: process.env.STRIPE_PRICE_SVI_ANALYSIS,
  svi_analysis_25: process.env.STRIPE_PRICE_SVI_ANALYSIS_25,
  // Credit packs
  credits_5: process.env.STRIPE_PRICE_CREDITS_5,
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,
  credits_100: process.env.STRIPE_PRICE_CREDITS_100,
};
