import { describe, expect, it } from "vitest";
import { parseBillingInterval, resolveIntervalPrice, withInterval } from "./billing-interval";

// 2026-09-16 pricing audit: /pricing showed A$290/yr under the Annual toggle
// while every CTA dropped the interval and signup billed A$29/mo.

describe("parseBillingInterval", () => {
  it("only the explicit yearly spellings are annual", () => {
    expect(parseBillingInterval("annual")).toBe("annual");
    expect(parseBillingInterval(" Yearly ")).toBe("annual");
    expect(parseBillingInterval("year")).toBe("annual");
    expect(parseBillingInterval(["annual", "monthly"])).toBe("annual");
    for (const v of ["monthly", "month", "", undefined, null, "1", "true"]) {
      expect(parseBillingInterval(v)).toBe("monthly");
    }
  });
});

describe("withInterval", () => {
  it("appends interval=annual with the right separator and never for monthly", () => {
    expect(withInterval("/signup?plan=x", "annual")).toBe("/signup?plan=x&interval=annual");
    expect(withInterval("/workspace/billing", "annual")).toBe("/workspace/billing?interval=annual");
    expect(withInterval("/signup?plan=x", "monthly")).toBe("/signup?plan=x");
  });
});

describe("resolveIntervalPrice", () => {
  const provisioned = {
    stripe_price_id: "price_m",
    stripe_price_id_annual: "price_y",
    price_aud_cents: 7900,
    annual_price_aud_cents: 79000,
  };
  it("annual → the annual Price + cents when the plan has one", () => {
    expect(resolveIntervalPrice(provisioned, "annual")).toEqual({
      effective: "annual",
      priceId: "price_y",
      cents: 79000,
    });
  });
  it("monthly → the monthly Price even when annual exists", () => {
    expect(resolveIntervalPrice(provisioned, "monthly")).toEqual({
      effective: "monthly",
      priceId: "price_m",
      cents: 7900,
    });
  });
  it("annual on a rung with no annual Price (or A$0 annual) falls back to monthly", () => {
    expect(resolveIntervalPrice({ ...provisioned, stripe_price_id_annual: null }, "annual")).toEqual({
      effective: "monthly",
      priceId: "price_m",
      cents: 7900,
    });
    expect(resolveIntervalPrice({ ...provisioned, annual_price_aud_cents: 0 }, "annual").effective).toBe(
      "monthly",
    );
  });
});
