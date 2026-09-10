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
  credits_50: process.env.STRIPE_PRICE_CREDITS_50,   // A$35 = 50 credits
  credits_100: process.env.STRIPE_PRICE_CREDITS_100,  // A$60 = 100 credits
  // Startup Package — one-off A$149 SKU. Provisions the guided founder flow
  // per web/supabase/migrations/0118_startup_package.sql.
  founder_package: process.env.STRIPE_PRICE_STARTUP_PACKAGE,
  // One-Click Investor Analysis — A$3.00 inc-GST guest paywall
  // (sku_one_click_report_3aud). Populated by scripts/stripe/sync-plans.mjs;
  // consumed by the guest checkout route (Phase 2).
  one_click_report: process.env.STRIPE_PRICE_ONE_CLICK_REPORT,
  // Money Finder report — A$3.00 inc-GST guest paywall on /funding
  // (sku_funding_report_3aud, T0242). Mint with scripts/sync-stripe-pricing.mjs;
  // consumed by POST /api/funding/checkout.
  funding_report: process.env.STRIPE_PRICE_FUNDING_REPORT,
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
// SAFETY GATE — opened 2026-09-09.
//
// This was false from 2026-09-08 because buying the A$59 Equity add-on granted
// nothing: `getEntitlements()` took a plan id and could not see a per-user
// add-on subscription, and the webhook had no branch for
// `isShareMgmtAddonPrice`. Charging a founder A$59/month for that would have
// been indefensible, so the purchase path was closed while recognition stayed
// open.
//
// All three legs now exist and were proven end to end against production
// before this flipped:
//
//   resolution  `getEntitlements(planId, userId)` unions the plan's flags with
//               the user's rows in `entitlements`
//               (src/lib/entitlements/user-grants.ts, migration 0306).
//               `can()` passes the user id, so every gate is add-on-aware.
//   purchase    the Stripe webhook reconciles the add-on from the subscription
//               on customer.subscription.updated / .deleted,
//               invoice.payment_failed and invoice.paid
//               (src/lib/stripe/addon-entitlements.ts).
//   revocation  cancellation, lapse and non-payment all delete the grant; a
//               failed lookup resolves to no entitlement, never to access.
//
// Recognition was always open and stays that way: ADDON_PRICE_IDS is what the
// billing drawer may OFFER, while isShareMgmtAddonPrice reads the raw env so an
// add-on subscription that exists is identified even when selling is shut. Keep
// that asymmetry — closing the gate again must never orphan a live subscriber.
//
// To suspend selling again: set this to false and update the pins in
// stripe.test.ts. Existing subscribers keep their entitlements.
const ADDON_ENTITLEMENTS_WIRED = true;

/** Raw env values — used for *recognising* an existing add-on subscription. */
const ADDON_PRICE_IDS_RAW: Record<string, string | null> = {
  share_management_monthly: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_MONTHLY ?? null,
  share_management_annual: process.env.STRIPE_PRICE_ADDON_SHARE_MGMT_ANNUAL ?? null,
};

/** What the billing UI may offer for purchase. Null while the gate is closed. */
export const ADDON_PRICE_IDS: Record<string, string | null> = {
  share_management_monthly: ADDON_ENTITLEMENTS_WIRED
    ? ADDON_PRICE_IDS_RAW.share_management_monthly
    : null,
  share_management_annual: ADDON_ENTITLEMENTS_WIRED
    ? ADDON_PRICE_IDS_RAW.share_management_annual
    : null,
};

export function getShareMgmtAddonPrice(cadence: "monthly" | "annual"): string | null {
  return cadence === "annual"
    ? ADDON_PRICE_IDS.share_management_annual
    : ADDON_PRICE_IDS.share_management_monthly;
}

export function isShareMgmtAddonPrice(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return (
    priceId === ADDON_PRICE_IDS_RAW.share_management_monthly ||
    priceId === ADDON_PRICE_IDS_RAW.share_management_annual
  );
}
