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
  // Startup Package — one-off A$149 SKU. Provisions the guided founder flow
  // per web/supabase/migrations/0118_startup_package.sql.
  founder_package: process.env.STRIPE_PRICE_STARTUP_PACKAGE,
  // One-Click Investor Analysis — A$3.00 inc-GST guest paywall
  // (sku_one_click_report_3aud). Populated by scripts/stripe/sync-plans.mjs;
  // consumed by the guest checkout route (Phase 2).
  one_click_report: process.env.STRIPE_PRICE_ONE_CLICK_REPORT,
  // Share Management add-on — per docs/plans/reseller-module-plan.md § F.5 / P8.
  //
  // 2026-09-08: provisioned and sold as the **Equity add-on**, a flat
  // A$59/mo AUD price (tax_behavior=inclusive) on Stripe Product
  // "BlockID Equity". It gates ESOP grant administration, vesting schedules,
  // dividend runs, the shareholder/employee portal, on-chain sync and ATO ESS
  // reporting.
  //
  // Deliberately NOT per-seat: shareholders and employees consume no seats and
  // are unlimited. Every competitor charges per head (Cake +$1–60, Qapita
  // +$40/yr, Eqvista $2/mo), which taxes the founder exactly as the cap table
  // grows and creates an incentive to keep people off the register — fatal
  // when the off-chain register is the legal source of truth under AU
  // corporate law and only has value if it is complete. The gate is
  // company-level capability instead.
  //
  // The `_annual` slot stays unprovisioned (null): the add-on ships
  // monthly-only, and the billing drawer hides its cadence toggle when the
  // annual price id is null.
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
