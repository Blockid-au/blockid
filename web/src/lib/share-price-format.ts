// Client-safe formatting for the share price card (S26-B). Kept apart from
// lib/share-price.ts, whose import chain (cfo-valuation → ai-client) must
// stay out of client bundles.

export interface SharePriceRangeLike {
  lowAud: number;
  midAud: number;
  highAud: number;
}

/** "A$0.0125" — 4 dp for prices ≥ 1c, 6 dp below; "A$0.00" for nothing. */
export function formatSharePrice(aud: number): string {
  if (!Number.isFinite(aud) || aud <= 0) return "A$0.00";
  return `A$${aud >= 0.01 ? aud.toFixed(4) : aud.toFixed(6)}`;
}

/** "A$0.0100 – A$0.0200" */
export function formatSharePriceRange(r: SharePriceRangeLike): string {
  return `${formatSharePrice(r.lowAud)} – ${formatSharePrice(r.highAud)}`;
}
