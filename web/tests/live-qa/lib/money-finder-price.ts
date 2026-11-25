/**
 * Money Finder price detection for the live-QA specs (G35 P5 / D25).
 *
 * payg_enabled OFF (legacy) = A$3 / 3 credits, ON = A$19 / 19 credits. The
 * suite accepts either state but demands the price and the credits agree.
 *
 * G36-B: the old matcher used a `(?![\d,.])` lookahead, so the paywall card's
 * real copy "… timeline — A$3, or free with Founder Radar" (plan rail, where
 * the card headline is the only price on the card) never matched and the spec
 * failed every week from 2026-11-01. A comma / dot only continues the amount
 * when a digit follows it ("A$3,000", "A$3.50"); trailing punctuation does not,
 * and an explicit ".00" ("A$3.00 inc. GST", the legacy guest rail) is the same
 * amount.
 */
export const MONEY_FINDER_PRICES = [
  { price: "A$3", credits: 3 },
  { price: "A$19", credits: 19 },
] as const;

export type MoneyFinderPrice = (typeof MONEY_FINDER_PRICES)[number];

/** The pair whose price appears in `text` as a whole amount ("A$3,000" / "A$3.50" / "A$30" never match "A$3"). */
export function moneyFinderPriceIn(text: string): MoneyFinderPrice | null {
  return (
    [...MONEY_FINDER_PRICES]
      .reverse()
      .find((p) => new RegExp(`${p.price.replace("$", "\\$")}(?:\\.00)?(?!\\d|[,.]\\d)`).test(text)) ?? null
  );
}
