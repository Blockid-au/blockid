// Stripe server-side client (server-only).
//
// Uses the secret key from STRIPE_SECRET_KEY env var. If missing, helper
// returns null so the app degrades gracefully (same pattern as supabase.ts).

import "server-only";
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
 *
 * Set these in your Stripe Dashboard → Products → Prices, then paste the
 * price_xxx IDs here or (better) load them from env vars.
 */
export const STRIPE_PRICE_MAP: Record<string, string | undefined> = {
  founding50: process.env.STRIPE_PRICE_FOUNDING50,
  growth: process.env.STRIPE_PRICE_GROWTH,
  pilot: process.env.STRIPE_PRICE_PILOT,
  accelerator: process.env.STRIPE_PRICE_ACCELERATOR,
  svi_analysis: process.env.STRIPE_PRICE_SVI_ANALYSIS,
  credits_5: process.env.STRIPE_PRICE_CREDITS_5,
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,
};
