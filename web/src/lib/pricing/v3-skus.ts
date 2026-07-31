/**
 * V3 SKU catalogue — canonical source of truth for the Master Upgrade Plan
 * §8.5 Stripe products + prices. This file is what `scripts/stripe/sync-plans.mjs`
 * (Batch 5) reads to upsert Products and Prices in Stripe.
 *
 * Design principles:
 *   - GST-inclusive display per Australian Consumer Law (§14bis D1).
 *     unit_amount is stored in cents AUD tax-INCLUSIVE and the Stripe
 *     Product is created with `tax_behavior: "inclusive"`.
 *   - Every SKU carries `sku` metadata so the sync script can idempotently
 *     upsert Products by metadata.sku (Stripe object ids are opaque).
 *   - Legacy Prices are never deleted (`stripe.prices.del` forbidden by
 *     policy) — existing subscribers keep their locked Price id valid.
 *   - Credit allowances feed the credit-wallet grant when a subscription
 *     renews. 1 credit ≈ A$0.025 per §10.1 (200 credits = A$5 report).
 */

export type SkuId =
  | "sku_trust_report_5aud"
  | "sku_starter"
  | "sku_growth_monthly"
  | "sku_growth_annual"
  | "sku_professional_monthly"
  | "sku_professional_annual"
  | "sku_programme_annual"
  | "sku_enterprise_custom";

export type Cadence = "one_off" | "month" | "year" | "quarter" | "free";

export interface V3Sku {
  /** Stable identifier used as Stripe Product `metadata.sku`. */
  id: SkuId;
  /** Marketing name shown on `/pricing` and Stripe dashboard. */
  name: string;
  /** Which tier ladder this SKU belongs to. Drives entitlement lookups. */
  tier:
    | "trust_report"
    | "starter"
    | "growth"
    | "professional"
    | "programme"
    | "enterprise";
  /** Total price in cents AUD, GST-INCLUSIVE. `null` = invoiced offline. */
  unit_amount_incl_gst_cents: number | null;
  /** Cadence. `one_off` for the Trust Report, `free` for Starter. */
  cadence: Cadence;
  /** Monthly credit grant. Applied on renewal for subs, zero for one-off. */
  credits_per_cycle: number;
  /** Whether the SKU is created in Stripe. Enterprise SKU is invoice-only. */
  stripe_managed: boolean;
  /** Short human blurb surfaced on the confirm-before-charge modal. */
  description: string;
  /** Public listed price rendered on the site (for GST-inclusive display). */
  display_price_label: string;
}

/**
 * The A$5.50 inc-GST one-off SKU that unlocks a full Trust Business Report
 * for one business, one time. Ships in Phase 1 as the paywall entry point.
 * §14bis D1: advertise A$5.50 (GST-inclusive) — Stripe booking splits into
 * A$5.00 net + A$0.50 GST via automatic_tax.
 */
export const TRUST_REPORT_5AUD: V3Sku = {
  id: "sku_trust_report_5aud",
  name: "Trust Business Report — one-off",
  tier: "trust_report",
  unit_amount_incl_gst_cents: 550,
  cadence: "one_off",
  credits_per_cycle: 0,
  stripe_managed: true,
  description:
    "Full 13-area Trust Business Report for one business, valid 90 days. Includes evidence citations, 30/60/90-day plan, PDF+DOCX export, share link with trust badge.",
  display_price_label: "A$5.50 inc-GST",
};

export const STARTER: V3Sku = {
  id: "sku_starter",
  name: "Starter — Free",
  tier: "starter",
  unit_amount_incl_gst_cents: 0,
  cadence: "free",
  credits_per_cycle: 2,
  stripe_managed: false,
  description:
    "Free profile creation and login, verification level L1, 10-page preview report. No full analysis, no PDF export, no share package.",
  display_price_label: "Free",
};

export const GROWTH_MONTHLY: V3Sku = {
  id: "sku_growth_monthly",
  name: "Growth — monthly",
  tier: "growth",
  unit_amount_incl_gst_cents: 5390,
  cadence: "month",
  credits_per_cycle: 400,
  stripe_managed: true,
  description:
    "3 seats, 2 businesses, 25 assessments/month, ~2 full reports/month via 400 credits. Verification L2, shared data-room.",
  display_price_label: "A$53.90 inc-GST / month",
};

export const GROWTH_ANNUAL: V3Sku = {
  id: "sku_growth_annual",
  name: "Growth — annual",
  tier: "growth",
  unit_amount_incl_gst_cents: 53900,
  cadence: "year",
  credits_per_cycle: 5400,
  stripe_managed: true,
  description:
    "Growth tier billed annually — 2 months free. 5,400 credits/year rollover 90 days.",
  display_price_label: "A$539.00 inc-GST / year",
};

/**
 * Professional monthly at A$149 mirrors the legacy startup_package/Investor
 * Advisor price point so grandfathered customers auto-migrate to this SKU
 * per §14bis D2 (auto-migrate, same price, more credits: 1,500 vs 25).
 */
export const PROFESSIONAL_MONTHLY: V3Sku = {
  id: "sku_professional_monthly",
  name: "Professional — monthly",
  tier: "professional",
  unit_amount_incl_gst_cents: 16390,
  cadence: "month",
  credits_per_cycle: 1500,
  stripe_managed: true,
  description:
    "10 seats, 5 businesses, verification L3 continuous, VC export, 1,500 credits/month. Legacy A$149 customers auto-migrate here at same price (D2).",
  display_price_label: "A$163.90 inc-GST / month",
};

export const PROFESSIONAL_ANNUAL: V3Sku = {
  id: "sku_professional_annual",
  name: "Professional — annual",
  tier: "professional",
  unit_amount_incl_gst_cents: 163900,
  cadence: "year",
  credits_per_cycle: 18000,
  stripe_managed: true,
  description:
    "Professional tier billed annually — 2 months free. 18,000 credits/year rollover 90 days.",
  display_price_label: "A$1,639.00 inc-GST / year",
};

export const PROGRAMME_ANNUAL: V3Sku = {
  id: "sku_programme_annual",
  name: "Programme — annual",
  tier: "programme",
  unit_amount_incl_gst_cents: 538900,
  cadence: "year",
  credits_per_cycle: 60000,
  stripe_managed: true,
  description:
    "Accelerator / university cohort tier. 50 seats × 25 businesses, custom rubric, mentor pool, white-label data-room, 60,000 credits/year.",
  display_price_label: "A$5,389.00 inc-GST / year",
};

export const ENTERPRISE_CUSTOM: V3Sku = {
  id: "sku_enterprise_custom",
  name: "Enterprise / Government",
  tier: "enterprise",
  unit_amount_incl_gst_cents: null,
  cadence: "quarter",
  credits_per_cycle: 10000,
  stripe_managed: false,
  description:
    "Custom SSO, dedicated SLA, multi-tenant, DPA, negotiated credits ≥ 10,000/quarter. Invoiced quarterly ex-GST + 10% line — not managed by Stripe.",
  display_price_label: "From A$5,499 ex-GST / quarter — contact sales",
};

/** Ordered listing consumed by pricing UI and the Stripe sync script. */
export const V3_SKUS: readonly V3Sku[] = [
  TRUST_REPORT_5AUD,
  STARTER,
  GROWTH_MONTHLY,
  GROWTH_ANNUAL,
  PROFESSIONAL_MONTHLY,
  PROFESSIONAL_ANNUAL,
  PROGRAMME_ANNUAL,
  ENTERPRISE_CUSTOM,
] as const;

/** Look up a SKU by id. Throws on unknown id — SKU ids come from a fixed union. */
export function skuById(id: SkuId): V3Sku {
  const found = V3_SKUS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown V3 SKU: ${id}`);
  return found;
}

/**
 * Every stripe_managed SKU with a concrete unit_amount. Enterprise (invoice-
 * only) and Starter (free) are excluded — Stripe sync script iterates this
 * subset when upserting Products + Prices.
 */
export const STRIPE_MANAGED_SKUS: readonly V3Sku[] = V3_SKUS.filter(
  (s) => s.stripe_managed && s.unit_amount_incl_gst_cents !== null,
);
