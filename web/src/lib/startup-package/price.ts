// startup-package/price — the ONE place the Startup Package's A$ figure is
// read from (G20-F3, 2026-09-20).
//
// The amount lives on the plans.csv row `founder_package` (plans.generated,
// `STRIPE_PRICE_STARTUP_PACKAGE`), which is what /api/stripe/checkout books.
// The landing page, its CTA, the workspace nav tooltip and the docs read
// these helpers — never a literal "A$149" — so a re-price happens in the csv
// and nowhere else. `lib/pricing/purchase-surfaces.test.ts` pins the figure
// to the Stripe catalogue.
//
// Pure and isomorphic (no I/O), safe in "use client" modules.

import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import { STARTUP_PACKAGE_MONEY_FINDER_LINE, formatAud, withGst } from "@/lib/plans-v2";

/** The plan id the CTA posts to `/api/stripe/checkout` and the webhook recognises. */
export const STARTUP_PACKAGE_PLAN_ID = "founder_package" as const;

const ROW = GENERATED_PLANS_BY_ID[STARTUP_PACKAGE_PLAN_ID];

/** One-off price in cents, GST-inclusive (14900 for A$149). */
export const STARTUP_PACKAGE_AMOUNT_CENTS: number = ROW?.price_aud_cents ?? 0;

/** One-off price in whole AUD (149). */
export const STARTUP_PACKAGE_PRICE_AUD: number = STARTUP_PACKAGE_AMOUNT_CENTS / 100;

/** Seed credits the package grants (25). */
export const STARTUP_PACKAGE_CREDITS: number = ROW?.usage_limits?.monthly_credits ?? 0;

/** "A$149" — the label every surface renders. */
export const STARTUP_PACKAGE_PRICE_LABEL: string = formatAud(STARTUP_PACKAGE_PRICE_AUD);

/** "A$149 inc. GST" — the long form for the confirm step. */
export function startupPackagePriceLabelLong(): string {
  return withGst(STARTUP_PACKAGE_PRICE_LABEL);
}

/**
 * What the one-off package includes — the bullets the review step
 * (`/checkout/review?sku=founder_package`) lists above the Pay button. The
 * credit figure reads the csv row; the Money Finder / Radar line is the one
 * plans-v2 renders on the Growth rung and the landing page.
 */
export const STARTUP_PACKAGE_INCLUDED: readonly string[] = [
  "Guided interview — 8 questions, answers feed the analysis",
  "C-Level AI analysis across every business dimension",
  "Real-time Startup Value Index as you answer",
  "Day-0 dataroom — pitch deck, one-pager, founder pack, valuation memo",
  `${STARTUP_PACKAGE_CREDITS} credits included`,
  STARTUP_PACKAGE_MONEY_FINDER_LINE,
];
