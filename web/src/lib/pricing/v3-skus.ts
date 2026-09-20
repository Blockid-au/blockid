/**
 * One-off report SKUs — the three A$3 GST-inclusive products sold outside a
 * subscription (Trusted Business Report, One-Click Investor Analysis,
 * Money Finder report). `STRIPE_PRICE_ONE_CLICK_REPORT` /
 * `STRIPE_PRICE_FUNDING_REPORT` / the report checkout read their amounts
 * and labels from here.
 *
 * Pricing v4 (2026-09-16, plan §3.1): the Master Upgrade Plan §8.5
 * subscription ladder that used to live in this file (Starter / Growth /
 * Professional / Programme / Enterprise at prices never charged)
 * was a dead spec — nothing imported it, no Stripe Product carried those
 * ids, and its sub-cent credit rule contradicted `lib/credits.ts`
 * (1 credit = A$1 list; packs discount to A$0.60). It was deleted rather
 * than kept "for reference". Subscriptions live in
 * `web/src/config/pricing/plans.csv` → `plans.generated.ts` → `plans-v2.ts`.
 *
 * Design principles (unchanged):
 *   - GST-inclusive display per Australian Consumer Law (§14bis D1).
 *     unit_amount is stored in cents AUD tax-INCLUSIVE and the Stripe
 *     Price is created with `tax_behavior: "inclusive"`.
 *   - Every SKU carries `sku` metadata so a sync script can idempotently
 *     upsert Products by metadata.sku (Stripe object ids are opaque).
 *   - Legacy Prices are never deleted (`stripe.prices.del` forbidden by
 *     policy) — existing buyers keep their locked Price id valid.
 */

export type SkuId =
  | "sku_trust_report_5aud"
  | "sku_one_click_report_3aud"
  | "sku_funding_report_3aud";

export type Cadence = "one_off";

export interface V3Sku {
  /** Stable identifier used as Stripe Product `metadata.sku`. */
  id: SkuId;
  /** Marketing name shown on `/pricing` and Stripe dashboard. */
  name: string;
  /** Which report product this SKU is. Drives `revenue_events.kind` / order rows. */
  tier: "trust_report" | "one_click_report" | "funding_report";
  /** Total price in cents AUD, GST-INCLUSIVE. */
  unit_amount_incl_gst_cents: number | null;
  /** Cadence — every report SKU is a one-off charge. */
  cadence: Cadence;
  /** Credit grant on purchase — zero for a one-off report. */
  credits_per_cycle: number;
  /** Whether the SKU is created in Stripe (all three are). */
  stripe_managed: boolean;
  /** Short human blurb surfaced on the confirm-before-charge modal. */
  description: string;
  /** Public listed price rendered on the site (for GST-inclusive display). */
  display_price_label: string;
}

/**
 * The A$3.00 inc. GST one-off SKU that unlocks a full Trusted Business Report for one
 * business, one time. Ships in Phase 1 as the paywall entry point.
 *
 * Re-priced in place 2026-09-10 (founder decision D3 / Q-C, G12 §3a): one
 * price, one story — "A$3 = the full Trusted Business Report" everywhere. The SKU id
 * `sku_trust_report_5aud`, the `revenue_events.kind = "trust_report_5aud"`
 * and the `report_orders.product_sku` CHECK (migration 0270) are historical
 * identifiers and MUST NOT be renamed — only the amount, name and labels
 * changed. Stripe automatic_tax splits A$3.00 into A$2.73 net + A$0.27 GST.
 */
export const TRUST_REPORT_5AUD: V3Sku = {
  id: "sku_trust_report_5aud",
  name: "Trusted Business Report",
  tier: "trust_report",
  unit_amount_incl_gst_cents: 300,
  cadence: "one_off",
  credits_per_cycle: 0,
  stripe_managed: true,
  description:
    "Full 13-area Trusted Business Report for one business, valid 90 days. 8-dimension SVI score, AUD valuation range with methods, evidence citations, 30/60/90-day plan, PDF+DOCX export, share link with trust badge.",
  display_price_label: "A$3.00 inc. GST",
};

/**
 * The A$3.00 inc. GST one-off SKU that fuels the guest-onboarding funnel:
 * a visitor uploads a pitch deck OR pastes a website URL, pays A$3, and
 * receives a full SVI valuation + Trusted Biz Report by email — no signup
 * required. Rows land in `guest_analyses` (migration 20260825_guest_analysis)
 * keyed by Stripe session id.
 * §14bis D1: advertise A$3.00 (GST-inclusive) — Stripe automatic_tax splits
 * into A$2.73 net + A$0.27 GST via `tax_behavior: "inclusive"` on the Product.
 */
export const ONE_CLICK_REPORT_3AUD: V3Sku = {
  id: "sku_one_click_report_3aud",
  name: "One-Click Investor Analysis — guest",
  tier: "one_click_report",
  unit_amount_incl_gst_cents: 300,
  cadence: "one_off",
  credits_per_cycle: 0,
  stripe_managed: true,
  description:
    "Full SVI valuation from your pitch deck or website — 8-dimension investor scorecard, comparable valuation range (AUD low/mid/high), instant email delivery. No signup required.",
  display_price_label: "A$3.00 inc. GST",
};

/**
 * The A$3.00 inc. GST one-off Money Finder report (G11 T0242, plan §4e/§4g).
 * A guest answers the 3-question /funding intake, sees the free preview, and
 * pays A$3 for the analysis: ranked grants + programs against their profile,
 * eligibility checklist, A$ estimates (R&DTI / ESIC) and a 12-month timeline.
 * Rows land in `funding_reports` (migration 0311 + 0315) keyed by Stripe
 * session id; signed-in founders pay 3 credits or get it with Starter.
 * Grant information itself is free (business.gov.au) — this sells analysis.
 */
export const FUNDING_REPORT_3AUD: V3Sku = {
  id: "sku_funding_report_3aud",
  name: "Money Finder report — grants & programs",
  tier: "funding_report",
  unit_amount_incl_gst_cents: 300,
  cadence: "one_off",
  credits_per_cycle: 0,
  stripe_managed: true,
  description:
    "Ranked Australian grants and programs for one startup profile — eligibility checklist, A$ estimates, 12-month timeline and next actions, emailed as a private link. No signup required.",
  display_price_label: "A$3.00 inc. GST",
};

/** Ordered listing of the report SKUs (checkout + paywall copy). */
export const REPORT_SKUS: readonly V3Sku[] = [
  TRUST_REPORT_5AUD,
  ONE_CLICK_REPORT_3AUD,
  FUNDING_REPORT_3AUD,
] as const;

/** Look up a SKU by id. Throws on unknown id — SKU ids come from a fixed union. */
export function skuById(id: SkuId): V3Sku {
  const found = REPORT_SKUS.find((s) => s.id === id);
  if (!found) throw new Error(`Unknown V3 SKU: ${id}`);
  return found;
}
