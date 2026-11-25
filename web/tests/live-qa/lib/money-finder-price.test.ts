// G36-B — the live /funding spec failed weekly (2026-11-01 … 11-22) because the
// price matcher rejected "A$3," in the real paywall card copy.
import { describe, expect, it } from "vitest";
import { moneyFinderPriceIn } from "./money-finder-price";

describe("moneyFinderPriceIn", () => {
  it("matches the live plan-rail card copy (A$3 followed by a comma)", () => {
    const live =
      "UNLOCK THE FULL REPORT\n\nUnlock the full ranked list, eligibility checklist, A$ estimate and 12-month timeline — A$3, or free with Founder Radar (7-day trial).\n" +
      "A grants consultant charges A$500–2,000 for this scan.\nFounder Radar (Starter, A$29/mo) includes this report";
    expect(moneyFinderPriceIn(live)).toEqual({ price: "A$3", credits: 3 });
  });

  it("matches either price with trailing punctuation, a space or an explicit .00", () => {
    expect(moneyFinderPriceIn("timeline — A$19, or free")).toEqual({ price: "A$19", credits: 19 });
    expect(moneyFinderPriceIn("Pay A$19 & unlock")).toEqual({ price: "A$19", credits: 19 });
    expect(moneyFinderPriceIn("costs A$3.")).toEqual({ price: "A$3", credits: 3 });
    expect(moneyFinderPriceIn("A$3.00 inc. GST · one-off")).toEqual({ price: "A$3", credits: 3 });
  });

  it("never mistakes a longer amount for the Money Finder price", () => {
    expect(moneyFinderPriceIn("A grants consultant charges A$500–2,000 for this scan.")).toBeNull();
    expect(moneyFinderPriceIn("Founder Radar (Starter, A$29/mo)")).toBeNull();
    expect(moneyFinderPriceIn("A$3,000 grant")).toBeNull();
    expect(moneyFinderPriceIn("A$3.50 fee")).toBeNull();
    expect(moneyFinderPriceIn("A$30 off")).toBeNull();
    expect(moneyFinderPriceIn("A$190")).toBeNull();
  });
});
