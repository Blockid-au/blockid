// Colocated render test for the share price card (S26-B): the mid price
// with low / high, the source label ("from Stripe, 3 Sep" pattern), the
// method note with the documented weights, and the no-valuation / no-shares
// reasons instead of a fabricated number.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SharePriceCard, type SharePriceCardData } from "./share-price-card";

const BLENDED: SharePriceCardData = {
  ok: true,
  reason: null,
  method: "svi+arr_multiple",
  weights: { svi: 0.4, arr: 0.6 },
  fullyDilutedShares: 10_000_000,
  valuation: { lowAud: 1_800_000, midAud: 2_600_000, highAud: 3_900_000 },
  pricePerShare: { lowAud: 0.18, midAud: 0.26, highAud: 0.39 },
  sourceLabel: "SVI + ARR multiple (from Stripe, 3 Sep)",
  methodNote: "Blended 40% SVI valuation + 60% ARR × 6–7.5× saas multiple (Bessemer Venture Partners), divided by 10,000,000 fully diluted shares.",
  arrAud: 240_000,
};

describe("SharePriceCard", () => {
  it("prints mid / low / high, the source label and the method note", () => {
    const html = renderToStaticMarkup(<SharePriceCard initial={BLENDED} />);
    expect(html).toContain('data-method="svi+arr_multiple"');
    expect(html).toContain("A$0.2600");
    expect(html).toContain("A$0.1800 low");
    expect(html).toContain("A$0.3900 high");
    expect(html).toContain("SVI + ARR multiple (from Stripe, 3 Sep)");
    expect(html).toContain("Blended 40% SVI valuation + 60% ARR");
    expect(html).toContain("10,000,000 fully diluted shares");
    expect(html).toContain("A$1.80M – A$3.90M");
    expect(html).toContain("General information only");
    expect(html).not.toMatch(/NaN|Infinity/);
  });

  it("no valuation / no shares → the reason, never a number", () => {
    const html = renderToStaticMarkup(
      <SharePriceCard initial={{ ...BLENDED, ok: false, reason: "no_shares", method: "svi", pricePerShare: { lowAud: 0, midAud: 0, highAud: 0 }, sourceLabel: "SVI score only", methodNote: "Add issued shares (and an ESOP pool) to the cap table to price a share — the divisor is the fully diluted count." }} />,
    );
    expect(html).toContain('data-testid="share-price-reason"');
    expect(html).toContain("Add issued shares");
    expect(html).toContain("SVI score only");
    expect(html).not.toContain('data-testid="share-price-mid"');
  });

  it("compact mode hides the method paragraph", () => {
    const html = renderToStaticMarkup(<SharePriceCard initial={BLENDED} compact />);
    expect(html).not.toContain('data-testid="share-price-method"');
    expect(html).toContain("A$0.2600");
  });
});
