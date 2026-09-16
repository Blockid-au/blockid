// Billing interval carried from a pricing surface to the charge.
//
// 2026-09-16 pricing audit: /pricing's Monthly ↔ Annual toggle showed
// A$290/yr (Save 17%) but every CTA dropped the interval, so signup and
// checkout always created the MONTHLY subscription. The interval now rides
// the URL (`?interval=annual`) through /signup, /onboarding and
// /workspace/billing, and the charge picks `stripe_price_id_annual` when
// the plan row has one — falling back to monthly (and saying so) when it
// does not, so a customer is never shown one price and billed another.
//
// Dependency-free so client components, RSC pages and route handlers can
// all import it.

export type BillingInterval = "monthly" | "annual";

/** `annual` only for the exact spellings the URL / body may carry. */
export function parseBillingInterval(
  v: string | string[] | null | undefined,
): BillingInterval {
  const raw = Array.isArray(v) ? v[0] : v;
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return s === "annual" || s === "yearly" || s === "year" ? "annual" : "monthly";
}

/** Append `&interval=annual` to an href only when the interval is annual. */
export function withInterval(href: string, interval: BillingInterval): string {
  if (interval !== "annual") return href;
  return `${href}${href.includes("?") ? "&" : "?"}interval=annual`;
}

/**
 * Which Stripe Price the charge should use for the requested interval.
 * `effective` is what will actually be billed — `annual` only when the plan
 * has an annual SKU; the caller shows the matching price/label.
 */
export function resolveIntervalPrice(
  plan: {
    stripe_price_id?: string | null;
    stripe_price_id_annual?: string | null;
    price_aud_cents?: number | null;
    annual_price_aud_cents?: number | null;
  },
  requested: BillingInterval,
): { effective: BillingInterval; priceId: string | null; cents: number } {
  const annualId = plan.stripe_price_id_annual ?? null;
  const annualCents = plan.annual_price_aud_cents ?? 0;
  if (requested === "annual" && annualId && annualCents > 0) {
    return { effective: "annual", priceId: annualId, cents: annualCents };
  }
  return {
    effective: "monthly",
    priceId: plan.stripe_price_id ?? null,
    cents: plan.price_aud_cents ?? 0,
  };
}
