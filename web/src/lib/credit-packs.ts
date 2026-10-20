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
// STRIPE_PRICE_CREDITS_5/10/25/50/100 env vars. Now MONOTONIC on both total
// price AND per-credit rate: a larger bundle is always more expensive in
// dollars and never more expensive per credit. Prior launch-offer 50-pack
// at A$15 was intentionally cheaper than the 25-pack — retired
// 2026-09-07 (Workstream B8) so the ladder reads honestly on
// /workspace/billing#credits.
export const CREDIT_PACKS: readonly CreditPack[] = [
  pack(5,   500,  null),         // A$5   = A$1.00/credit
  pack(10,  900,  "Save 10%"),   // A$9   = A$0.90/credit
  pack(25,  2000, "Save 20%"),   // A$20  = A$0.80/credit
  pack(50,  3500, "Save 30%"),   // A$35  = A$0.70/credit
  pack(100, 6000, "Save 40%"),   // A$60  = A$0.60/credit
] as const;

// ─── Pricing v5 D27 (G35 P5, founder-approved 2026-10-20) ───────────────────
//
// D27 drops the 5-credit pack from sale once `platform_config.payg_enabled`
// flips (one A$ per credit is the last visible "A$1"). The pack stays in
// CREDIT_PACKS so a receipt, a transaction-history row or a late webhook for
// a session minted before the cut-over still resolves it — only the LISTINGS
// (billing, credit gates, rails, e-mails) and the purchase entry points
// (POST /api/credits, /checkout/review) consult the helpers below.
// Flag OFF → every helper returns exactly today's ladder.

/** Pack sizes no longer offered for sale when Pricing v5 PAYG is on (D27). */
export const PAYG_RETIRED_PACK_CREDITS: readonly number[] = Object.freeze([5]);

/** Is this pack size on sale right now? Unknown sizes are never on sale. */
export function isCreditPackForSale(credits: number, paygEnabled: boolean): boolean {
  if (!CREDIT_PACKS.some((p) => p.credits === credits)) return false;
  return !(paygEnabled && PAYG_RETIRED_PACK_CREDITS.includes(credits));
}

/** The ladder a listing shows (flag OFF → CREDIT_PACKS unchanged). */
export function creditPacksForSale(paygEnabled: boolean): readonly CreditPack[] {
  return paygEnabled ? CREDIT_PACKS.filter((p) => isCreditPackForSale(p.credits, true)) : CREDIT_PACKS;
}

/** The smallest pack on sale — "buy credit packs from A$…" lines. */
export function smallestCreditPackForSale(paygEnabled: boolean): CreditPack {
  return creditPacksForSale(paygEnabled)[0] ?? CREDIT_PACKS[0]!;
}

/** Resolve ANY pack, retired or not — receipts, history, webhook lookups. */
export function findCreditPack(credits: number): CreditPack | undefined {
  return CREDIT_PACKS.find((p) => p.credits === credits);
}
