// G35 D25 — Money Finder paywall price: legacy A$3 / 3 credits while PAYG is
// off (or the display price cannot be read), A$19 / 19 credits (report_funding)
// when on; pay buttons stay disabled while the price loads.

import { describe, expect, it } from "vitest";
import { LEGACY_FUNDING_PRICE, fundingRailPrice } from "./funding-paywall";

describe("fundingRailPrice", () => {
  it("loading → legacy copy, flagged loading (buttons disabled)", () => {
    expect(fundingRailPrice({ status: "loading" })).toEqual({ ...LEGACY_FUNDING_PRICE, loading: true });
  });

  it("off / error → the A$3 copy exactly as before", () => {
    expect(fundingRailPrice({ status: "ready", pricing: { enabled: false } })).toEqual(LEGACY_FUNDING_PRICE);
    expect(fundingRailPrice({ status: "error" })).toEqual(LEGACY_FUNDING_PRICE);
    expect(LEGACY_FUNDING_PRICE).toMatchObject({ label: "A$3", credits: 3, creditFeature: "grant_match" });
  });

  it("on → report_funding price + credits, no A$ conversion of credits", () => {
    const p = fundingRailPrice({ status: "ready", pricing: { enabled: true, funding: { sku: "report_funding", amountCents: 1900, priceLabel: "A$19", credits: 19 } } });
    expect(p).toEqual({ label: "A$19", note: " inc. GST · one-off", credits: 19, creditFeature: "report_funding", v5: true, loading: false });
  });
});
