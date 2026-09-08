// Shared pricing display data — single source of truth for all pricing UIs.
//
// Both `src/components/landing/pricing.tsx` and `src/app/pricing/page.tsx`
// import from here so credit counts, plan names, and prices never diverge.
//
// Underlying plan IDs, cent-prices, and billing helpers live in `@/lib/plans`.
//
// TRIAL MODEL (2026-07-24, founder decision):
//   Every new signup starts a 7-day trial with a card required upfront.
//   BlockID no longer offers an indefinite $0 tier. Grandfathered legacy
//   `free`-plan users keep access; the marketing "Free" row below is
//   preserved for legacy referrers but hidden by NEW_SIGNUP_TIER_IDS
//   from every user-facing surface. Trial + billing copy MUST come from
//   TRIAL_COPY in `@/lib/plans/trial-copy`.

import { TRIAL_COPY, TRIAL_DAYS } from "./plans/trial-copy";

/**
 * Plan IDs offered to *new* signups. Free tier deliberately excluded.
 *
 * `founding50` was removed on 2026-09-07 (Phase 3b) after the Founding-100
 * promo window closed on 2026-09-01 (see `founding-promo.ts`). The Stripe
 * SKU id `founding50` is retained in `plans.ts` + `stripe.ts` so
 * grandfathered subscribers still renew, but no new signup can select it.
 */
export const NEW_SIGNUP_TIER_IDS: readonly string[] = [
  "growth",
  "growth_annual",
];

/**
 * Filter PRICING_TIERS down to the plans a new signup may pick. Post the
 * 2026-09-01 Founding-100 sunset, this is a plain allow-list filter — the
 * previous `isFoundingPromoActive()` toggle collapsed once `founding50`
 * left the allow-list.
 */
export function tiersForNewSignup(tiers: PricingTier[]): PricingTier[] {
  return tiers.filter((t) => NEW_SIGNUP_TIER_IDS.includes(t.id));
}

// ---------------------------------------------------------------------------
// Plan tiers
// ---------------------------------------------------------------------------

export interface PricingTier {
  id: string;
  name: string;
  /** Display price string (e.g. "$0", "A$49"). */
  price: string;
  /** Numeric price in AUD dollars (for coupon math). undefined = free. */
  numericPrice?: number;
  /** Human-readable billing cadence shown next to price. */
  cadence?: string;
  /** Secondary note beneath the price. */
  subtitle?: string;
  /** Short credits tagline (e.g. "2 credits", "100 credits included"). */
  credits: string;
  /** Who this plan is for (one-liner). */
  audience: string;
  /** Bullet-point feature list. */
  features: string[];
  /** Primary CTA. */
  cta: { label: string; href: string };
  /** Visual style hint — only one tier should be highlighted at a time. */
  highlight?: boolean;
  /** Badge label (e.g. "Best Value", "Early Bird"). */
  badge?: string;
  /** Urgency / scarcity text beneath CTA. */
  urgency?: string;
  /** Button style hint for the dedicated pricing page. */
  ctaStyle: "primary" | "secondary";
}

// Build pricing tiers from config. Used by server components; falls back to PRICING_TIERS for client components.
//
// The `founding_*` cfg fields are retained for backward compatibility with
// admin panel + docs consumers (the `founding50` Stripe SKU is still live for
// grandfathered renewals) but the founding50 tier branch was deleted on
// 2026-09-07 alongside the /founding-50 route (Phase 3b).
export function buildPricingTiers(cfg: {
  founding_plan_name?: string;
  founding_spots_total?: number;
  founding_price_cents?: number;
  founding_credits?: number;
  free_credits_on_signup: number;
  growth_price_monthly_cents: number;
  growth_price_yearly_cents: number;
}): PricingTier[] {
  const growthMonthly = `A$${(cfg.growth_price_monthly_cents / 100).toFixed(0)}`;
  const growthYearly = `A$${(cfg.growth_price_yearly_cents / 100).toFixed(0)}`;

  return PRICING_TIERS.map((tier) => {
    if (tier.id === "free") {
      return {
        ...tier,
        credits: `${cfg.free_credits_on_signup} credits`,
      };
    }
    if (tier.id === "growth") {
      return { ...tier, price: growthMonthly, numericPrice: cfg.growth_price_monthly_cents / 100 };
    }
    if (tier.id === "growth_annual") {
      return { ...tier, price: growthYearly, numericPrice: cfg.growth_price_yearly_cents / 100 };
    }
    return tier;
  });
}

// ---------------------------------------------------------------------------
// PRICING_TIERS — legacy 4-plan render array. RETIRED 2026-09-07.
// ---------------------------------------------------------------------------
//
// @deprecated Retired as part of the Universal 3-rung ladder consolidation
// (Workstream B3). The 4-plan legacy render
// (free / founding50 / growth / growth_annual) is superseded by the
// DB-backed catalogue in `src/lib/plans-v2.ts` + `src/config/pricing/plans.csv`
// which the live `<PricingMatrix />` component reads.
//
// The remaining consumers of this file are:
//   - `src/components/landing/pricing.tsx` — dead landing component
//     already superseded by <PricingMatrix /> on every pricing surface.
//     Renders an empty grid now; scheduled for deletion in Phase 3 tail.
//   - `src/app/api/auth/register-with-card/route.ts` — imports the
//     `NEW_SIGNUP_TIER_IDS` allow-list only. Legacy string list still valid.
//
// TODO: remove after Phase 3 tail — the /founding-50 route was deleted on
// 2026-09-07 (Phase 3b) along with the founding50 tier row, so once the
// legacy landing/pricing.tsx render is deleted, drop this stub, the
// `discountablePrices` map, and `buildPricingTiers()` outright.
export const PRICING_TIERS: PricingTier[] = [];

// Prior canonical fixture kept below as commented-out reference so
// grandfathered flows and one-off restores can be re-hydrated by hand
// without spelunking git history. Do NOT re-enable without also killing
// the plans-v2.ts render path first — parallel data paths are the exact
// drift that this consolidation exists to end.
//
// const _LEGACY_PRICING_TIERS: PricingTier[] = [
//   {
//     id: "free",
//     name: "Free",
//     price: "$0",
//     cadence: "forever",
//     credits: "5 credits",
//     audience: "Get your startup valuation score instantly — no card needed",
//     features: [
//       "Full SVI analysis (instant score)",
//       "Investor-Ready Score + AI valuation (AUD)",
//       "Equity dilution calculator",
//       "Shareable score link",
//     ],
//     cta: { label: "Get My Free Valuation Score", href: "/#svi" },
//     ctaStyle: "secondary",
//   },
//   {
//     id: "founding50",
//     name: "Founding 100",
//     price: "A$5",
//     numericPrice: 5,
//     cadence: "one-off",
//     subtitle: `A$5 until ${PROMO_END_LABEL} \u00b7 reverts to A$99 \u00b7 lifetime access`,
//     credits: "50 credits (never expires)",
//     audience: "Everything from idea to investor-ready — pay once, own it forever",
//     features: [
//       "50 SVI analyses (lifetime)",
//       "PDF investor-ready report",
//       "Evidence Vault & document storage",
//       "Cap table & ESOP calculator",
//       "Term Sheet AI analysis",
//       "30-day SVI growth action plan",
//       "Referral credits (earn free analyses)",
//       "Priority support",
//     ],
//     cta: { label: "Get Founding 100 \u2014 A$5", href: "/founding-50" },
//     highlight: true,
//     badge: "Founders Only",
//     urgency: `A$5 promo until ${PROMO_END_LABEL} — then A$99`,
//     ctaStyle: "primary",
//   },
//   {
//     id: "growth",
//     name: "Growth",
//     price: "A$99",
//     numericPrice: 99,
//     cadence: "/mo (early-bird)",
//     subtitle: "Early-bird \u2014 normally $499/mo",
//     credits: "100 credits/mo",
//     audience: "For active fundraise \u00b7 Seed to Series A",
//     features: [
//       "100 SVI analyses/mo",
//       "Everything in Founding 100",
//       "Multi-entity cap table",
//       "Investor data room",
//       "Term Sheet AI (unlimited)",
//       "Custom branding",
//       "Dedicated account manager",
//       "30-day money back",
//     ],
//     cta: { label: "Start Growth \u2014 A$99/mo", href: "/auth/login?plan=growth" },
//     badge: "Early Bird",
//     urgency: "Early-bird until Dec 31, 2026",
//     ctaStyle: "primary",
//   },
//   {
//     id: "growth_annual",
//     name: "Growth",
//     price: "A$950",
//     numericPrice: 950,
//     cadence: "/year",
//     subtitle: "Save A$238/year (20% off monthly)",
//     credits: "100 credits/mo",
//     audience: "For active fundraise \u00b7 Seed to Series A",
//     features: [
//       "100 SVI analyses/mo",
//       "Everything in Founding 100",
//       "Multi-entity cap table",
//       "Investor data room",
//       "Term Sheet AI (unlimited)",
//       "Custom branding",
//       "Dedicated account manager",
//       "30-day money back",
//     ],
//     cta: { label: "Start Growth \u2014 A$950/yr", href: "/auth/login?plan=growth_annual" },
//     badge: "Save 20%",
//     urgency: "Early-bird until Dec 31, 2026",
//     ctaStyle: "primary",
//   },
// ];

// ---------------------------------------------------------------------------
// Credit packs — re-exported from the isomorphic single source of truth at
// lib/credit-packs.ts so marketing (this file, /pricing SSR) and workspace
// billing (billing-client.tsx) can never drift again. See that file for the
// ladder rationale and the Aug 2026 Zenya incident that motivated centralising.
// ---------------------------------------------------------------------------

export { CREDIT_PACKS } from "./credit-packs";
export type { CreditPack } from "./credit-packs";

// ---------------------------------------------------------------------------
// Feature comparison (used by /pricing page)
// ---------------------------------------------------------------------------

export interface ComparisonRow {
  feature: string;
  free: string;
  founding: string;
  growth: string;
}

export const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: "SVI Analyses", free: "5 free (instant)", founding: "50 (lifetime)", growth: "Unlimited" },
  { feature: "PDF Export", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Evidence Vault", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Term Sheet AI", free: "-", founding: "Yes", growth: "Unlimited" },
  { feature: "Referral credits", free: "-", founding: "Yes", growth: "Yes" },
  { feature: "Priority support", free: "-", founding: "-", growth: "Yes" },
];

// ---------------------------------------------------------------------------
// FAQ (used by /pricing page)
// ---------------------------------------------------------------------------

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQ_ITEMS: FaqItem[] = [
  {
    q: "What is a credit?",
    a: "Credits are the currency used across BlockID features. A standard SVI analysis costs 0.50 credits, while advanced features like Term Sheet AI cost 1 credit. Free features like evidence upload and investor score cost 0 credits.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes. You can upgrade from Free to Growth at any time. Your existing credits and data carry over. Grandfathered Founding-100 members (signed up before the 2026-09-01 sunset) keep priority upgrade pricing.",
  },
  {
    q: "Is there a free trial?",
    a: `Yes — every new signup starts with a ${TRIAL_DAYS}-day free trial of the plan you choose. ${TRIAL_COPY.card_required_reason} We email you ${TRIAL_COPY.fine_print.match(/(\d+)h/)?.[1] ?? "48"}h before we charge so you can cancel if it's not right.`,
  },
  {
    q: "How does billing work?",
    a: "Growth is available monthly at A$69/mo or annually at A$690/year (save 17%). Credit packs are one-off purchases. All prices are in AUD and GST-inclusive — the price you see is the price you pay, and every charge produces an ATO tax invoice. Payments are processed securely via Stripe.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Growth plan subscriptions can be cancelled at any time from your billing page. Your credits remain available until the end of the billing period.",
  },
  {
    q: "Do you offer refunds?",
    a: "Growth plan includes a 30-day money-back guarantee. Credit packs are non-refundable once used.",
  },
  {
    q: "Do you have a permanent free plan?",
    a: TRIAL_COPY.no_free_forever + " " + TRIAL_COPY.legacy_free_grandfathered,
  },
  {
    q: "Is my data secure?",
    a: "Yes. All data is encrypted in transit (TLS 1.3) and at rest. We use Supabase with row-level security so your company data is strictly isolated from other users. Payments are handled by Stripe — we never store card details.",
  },
  {
    q: "Where is my data stored?",
    a: "Your data is stored on servers in Australia (Sydney region). We do not transfer your data outside AU/NZ. This ensures compliance with the Australian Privacy Act 1988 and GDPR where applicable.",
  },
  {
    q: "Do I need technical knowledge?",
    a: "No. BlockID is built for founders, not engineers. You can run a full SVI analysis by pasting a company description — no integrations required. OAuth connectors (Stripe, Xero, Google Analytics) are optional and take under 2 minutes to set up.",
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Prices that can be discounted, keyed by plan display name. Uses id-based dedup so Growth monthly & annual don't collide. */
export const discountablePrices: Record<string, number> = Object.fromEntries(
  PRICING_TIERS
    .filter((t) => t.numericPrice !== undefined && t.id !== "growth_annual")
    .map((t) => [t.name, t.numericPrice!]),
);
