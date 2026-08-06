// Single source of truth for credit-pack bundles.
//
// Isomorphic — safe to import from both server (checkout API, webhook, admin
// dashboards) and client (landing pricing, workspace billing). Do NOT add
// `import "server-only"` here.
//
// Rationale for centralising: Aug 2026 the /pricing landing page advertised
// bundle sizes (5/15/35/100) that didn't exist in the backend (5/10/25/50/100)
// — a paying founder (Zenya) received 10 credits after being shown "35 for A$9"
// on the marketing page. All consumers now import from this file so a drift
// like that becomes a compile error, not a silent revenue-integrity bug.

export interface CreditPack {
  /** Credits granted on purchase. */
  credits: number;
  /** Price in AUD cents (integer, matches Stripe convention). */
  priceAudCents: number;
  /** Price in AUD dollars (convenience — derived from priceAudCents). */
  price: number;
  /** Savings badge string, or null. */
  savings: string | null;
  /** Display label used in UI. */
  label: string;
  /** Purchase entrypoint. */
  href: string;
}

const HREF = "/workspace/billing#credits";

function pack(
  credits: number,
  priceAudCents: number,
  savings: string | null,
): CreditPack {
  return {
    credits,
    priceAudCents,
    price: priceAudCents / 100,
    savings,
    label: `${credits} Credits`,
    href: HREF,
  };
}

// NOTE — 5-tier ladder that must match the active Stripe prices referenced by
// STRIPE_PRICE_CREDITS_5/10/25/50/100 env vars. The 50-credit pack (A$15) is
// intentionally aggressive: Q3 2026 launch offer to drive founder-tier
// adoption; it makes the per-credit rate non-monotonic (25c pack costs A$0.80
// each, 50c pack A$0.30 each). If we ever want to normalise, either archive
// the Stripe price for `credits_50` OR raise A$15 → A$40 to restore monotonic.
export const CREDIT_PACKS: readonly CreditPack[] = [
  pack(5,   500,  null),         // A$5   = A$1.00/credit
  pack(10,  900,  "Save 10%"),   // A$9   = A$0.90/credit
  pack(25,  2000, "Save 20%"),   // A$20  = A$0.80/credit
  pack(50,  1500, "Save 70%"),   // A$15  = A$0.30/credit — launch offer (non-monotonic)
  pack(100, 2500, "Save 75%"),   // A$25  = A$0.25/credit
] as const;
