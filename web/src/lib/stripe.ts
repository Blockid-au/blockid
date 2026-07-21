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
  founder: process.env.STRIPE_PRICE_FOUNDER,
  growth: process.env.STRIPE_PRICE_GROWTH,
  growth_annual: process.env.STRIPE_PRICE_GROWTH_ANNUAL,
  growth_499: process.env.STRIPE_PRICE_GROWTH_499,
  pilot: process.env.STRIPE_PRICE_PILOT,
  accelerator: process.env.STRIPE_PRICE_ACCELERATOR,
  svi_analysis: process.env.STRIPE_PRICE_SVI_ANALYSIS,
  svi_analysis_25: process.env.STRIPE_PRICE_SVI_ANALYSIS_25,
  // Credit packs (prices match Stripe Dashboard — Stripe is source of truth)
  credits_5: process.env.STRIPE_PRICE_CREDITS_5,     // A$5  = 5 credits
  credits_10: process.env.STRIPE_PRICE_CREDITS_10,   // A$9  = 10 credits
  credits_25: process.env.STRIPE_PRICE_CREDITS_25,   // A$20 = 25 credits
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,   // A$15 = 50 credits
  credits_100: process.env.STRIPE_PRICE_CREDITS_100,  // A$25 = 100 credits
  // Share Management add-on — per docs/plans/reseller-module-plan.md § F.5 / P8.
  // Env vars minted by Stripe account owner (P8.5, human-blocked until then).
  addon_share_mgmt_monthly: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY,
  addon_share_mgmt_annual: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL,
};

/**
 * Add-on price-ids resolved at import time. Used by change-plan + billing UI
 * to identify subscription items that represent an add-on (vs the base plan).
 * A missing env var yields `null` so callers can detect "not-yet-provisioned"
 * without a runtime crash.
 */
export const ADDON_PRICE_IDS: Record<string, string | null> = {
  share_management_monthly: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY ?? null,
  share_management_annual: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL ?? null,
};

export function getShareMgmtAddonPrice(cadence: "monthly" | "annual"): string | null {
  return cadence === "annual"
    ? ADDON_PRICE_IDS.share_management_annual
    : ADDON_PRICE_IDS.share_management_monthly;
}

export function isShareMgmtAddonPrice(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return (
    priceId === ADDON_PRICE_IDS.share_management_monthly ||
    priceId === ADDON_PRICE_IDS.share_management_annual
  );
}
