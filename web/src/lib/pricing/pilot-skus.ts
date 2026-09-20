// pilot-skus — the paid BlockID Cohort Validation Pilot SKUs (G21 P0-C, 2026-09-20).
//
// The commercial wedge of G21 is ONE paid cohort pilot: a program brings a
// real intake (or an existing cohort), BlockID scores it on the SVI rubric,
// hands back the evaluator table, the top gaps and a final cohort report,
// and the program decides on Cohort 25 / Cohort 100 afterwards. Two sizes,
// both one-off, both GST-inclusive, both minted by the founder in Stripe
// (docs/ops/pricing-truth.md § 2); until the env var is set the buy button
// falls back to `/contact?topic=pilot` — never a broken checkout.
//
// This module is the ONE place the amounts, caps and env var NAMES live.
// Pages format the price through `formatPilotPrice()`, the checkout route
// resolves the Stripe price through `STRIPE_PRICE_MAP[sku]` (lib/stripe.ts,
// which reads the env var named here), and the webhook grants the
// entitlement for `entitlementDays`. No literal "A$1,500" anywhere else —
// `pilot-skus.test.ts` and `stripe-map.test.ts` pin the figures against the
// catalogue.
//
// Pure and isomorphic except `isPilotSkuConfigured()`, which reads
// `process.env` by NAME only (never logs the value) and is server-only by
// convention — on the client it always answers false.

import { formatAud, withGst } from "@/lib/plans-v2";

export type PilotSkuId = "cohort_pilot_25" | "cohort_pilot_50";

export interface PilotSku {
  id: PilotSkuId;
  /** Stripe product / invoice line name. */
  name: string;
  /** One-off price in cents, GST-inclusive. */
  amountInclGstCents: number;
  /** Applicants the pilot covers (one real intake or an existing cohort). */
  applicantsCap: number;
  /** The `STRIPE_PRICE_*` env var the founder sets once the price is minted. */
  envVar: string;
  /** Days of Cohort-tier workspace access the purchase grants. */
  entitlementDays: number;
  /**
   * The plans.csv tier the webhook grants for `entitlementDays` — the
   * Cohort rung whose `profiles` limit covers `applicantsCap` (Cohort 25
   * holds 25 startups, Cohort 100 holds 100), so the pilot never 402s on
   * its own applicant count.
   */
  planTier: "accelerator_starter" | "accelerator_growth";
}

export const PILOT_ENTITLEMENT_DAYS = 90;

export const PILOT_SKUS: Readonly<Record<PilotSkuId, PilotSku>> = {
  cohort_pilot_25: {
    id: "cohort_pilot_25",
    name: "BlockID Cohort Validation Pilot (up to 25 applicants)",
    amountInclGstCents: 150000,
    applicantsCap: 25,
    envVar: "STRIPE_PRICE_COHORT_PILOT_25",
    entitlementDays: PILOT_ENTITLEMENT_DAYS,
    planTier: "accelerator_starter",
  },
  cohort_pilot_50: {
    id: "cohort_pilot_50",
    name: "BlockID Cohort Validation Pilot (up to 50 applicants)",
    amountInclGstCents: 250000,
    applicantsCap: 50,
    envVar: "STRIPE_PRICE_COHORT_PILOT_50",
    entitlementDays: PILOT_ENTITLEMENT_DAYS,
    planTier: "accelerator_growth",
  },
};

export const PILOT_SKU_IDS: readonly PilotSkuId[] = ["cohort_pilot_25", "cohort_pilot_50"];

/** Where a buy button lands when the SKU has no Stripe price yet. */
export const PILOT_CONTACT_FALLBACK = "/contact?topic=pilot";

/** Where Stripe returns the buyer after payment / on cancel. */
export const PILOT_SUCCESS_PATH = "/workspace/accelerator?pilot=paid";
export const PILOT_CANCEL_PATH = "/solutions/accelerator#pilot";

export function isPilotSkuId(value: unknown): value is PilotSkuId {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(PILOT_SKUS, value);
}

export function getPilotSku(id: PilotSkuId): PilotSku {
  return PILOT_SKUS[id];
}

/** "A$1,500" — the figure every surface renders (formatAud, never a literal). */
export function formatPilotPrice(id: PilotSkuId): string {
  return formatAud(PILOT_SKUS[id].amountInclGstCents / 100);
}

/** "A$1,500 inc. GST" — the quote line shown before checkout (transparent-pricing rule). */
export function formatPilotPriceLong(id: PilotSkuId): string {
  return withGst(formatPilotPrice(id));
}

/**
 * True when the founder has set the SKU's `STRIPE_PRICE_*` env var. Reads
 * the variable by name and returns only a boolean — the value is never
 * returned, logged or compared. Always false in the browser.
 */
export function isPilotSkuConfigured(id: PilotSkuId): boolean {
  if (typeof process === "undefined" || !process.env) return false;
  const value = process.env[PILOT_SKUS[id].envVar];
  return typeof value === "string" && value.trim().length > 0;
}

/** What each pilot includes — one list, both sizes (the FI offer, § 9). */
export const PILOT_INCLUDES: readonly string[] = [
  "Application or existing-cohort setup with your intake link",
  "Startup Value Index assessment for every applicant on one rubric",
  "Evidence confidence level per startup",
  "Cohort comparison table your committee can sort",
  "Top gaps across the cohort",
  "Evaluator table with decision and conviction per startup",
  "Final cohort report for the program and its sponsors",
  "Feedback workshop with your review team",
];

/** Success metrics the program and BlockID measure together during the pilot. */
export const PILOT_SUCCESS_METRICS: readonly string[] = [
  "Review time per startup",
  "Evaluator consistency across reviewers",
  "Startups processed through the pilot",
  "Share of founders completing their evidence",
  "Program and founder satisfaction",
  "Repeat or renewal intent after the pilot",
];
