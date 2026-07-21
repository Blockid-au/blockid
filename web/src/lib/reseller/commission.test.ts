// Commission truth-table tests. Enforces the invariants in
// docs/plans/reseller-module-plan.md § G.2, § U.15.1 CHECK, § U.15.5.
//
// Run with the project's existing test runner (jest / vitest — check
// package.json). Assertion API kept generic so either works.

import { describe, it, expect } from "vitest";
import { computeCommission, roundHalfEven, effectiveResellerShareBp } from "./commission";

describe("roundHalfEven", () => {
  it("rounds .5 to nearest even", () => {
    expect(roundHalfEven(0.5)).toBe(0);
    expect(roundHalfEven(1.5)).toBe(2);
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
  });
  it("handles negative correctly", () => {
    expect(roundHalfEven(-1.5)).toBe(-2);
  });
  it("integer passthrough", () => {
    expect(roundHalfEven(42)).toBe(42);
    expect(roundHalfEven(0)).toBe(0);
  });
});

describe("computeCommission — retail truth table at A$99 (9900 cents)", () => {
  const list = 9900;
  const cases = [
    // [tier, expected discount, expected commission, expected blockidGross, expected GST]
    [0,  0,    3960, 5940, 900],
    [10, 990,  2970, 5940, 810],
    [20, 1980, 1980, 5940, 720],
    [30, 2970, 990,  5940, 630],
    [40, 3960, 0,    5940, 540],
  ] as const;

  for (const [tier, disc, comm, gross, gst] of cases) {
    it(`tier ${tier}% -> discount=${disc}, commission=${comm}, gross=${gross}, gst=${gst}`, () => {
      const r = computeCommission({
        listPriceAudCents: list,
        discountPct: tier as 0 | 10 | 20 | 30 | 40,
        billingModel: "retail",
      });
      expect(r.discountAudCents).toBe(disc);
      expect(r.commissionAudCents).toBe(comm);
      expect(r.blockidGrossAudCents).toBe(gross);
      expect(r.atoGstAudCents).toBe(gst);
      expect(r.blockidNetAfterGstAudCents).toBe(gross - gst);
    });
  }

  it("BlockID gross invariant: 59.40 constant across all tiers", () => {
    for (const tier of [0, 10, 20, 30, 40] as const) {
      const r = computeCommission({
        listPriceAudCents: list,
        discountPct: tier,
        billingModel: "retail",
      });
      expect(r.blockidGrossAudCents).toBe(5940);
    }
  });

  it("invariant: list − discount − commission = round(0.60 × list) within ±1c", () => {
    for (const tier of [0, 10, 20, 30, 40] as const) {
      const r = computeCommission({
        listPriceAudCents: list,
        discountPct: tier,
        billingModel: "retail",
      });
      const lhs = r.listPriceAudCents - r.discountAudCents - r.commissionAudCents;
      const rhs = Math.round(0.60 * r.listPriceAudCents);
      expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeCommission — wholesale mode", () => {
  it("commission always 0; amount_paid = list − discount", () => {
    for (const tier of [0, 10, 20, 30, 40] as const) {
      const r = computeCommission({
        listPriceAudCents: 9900,
        discountPct: tier,
        billingModel: "wholesale",
      });
      expect(r.commissionAudCents).toBe(0);
      expect(r.amountPaidAudCents).toBe(9900 - r.discountAudCents);
      expect(r.blockidGrossAudCents).toBe(r.amountPaidAudCents);
    }
  });

  it("wholesale @ 20% coupon: reseller pays 79.20; BlockID net-of-GST 72.00", () => {
    const r = computeCommission({
      listPriceAudCents: 9900,
      discountPct: 20,
      billingModel: "wholesale",
    });
    expect(r.amountPaidAudCents).toBe(7920);
    expect(r.atoGstAudCents).toBe(720);
    expect(r.blockidNetAfterGstAudCents).toBe(7200);
  });
});

describe("computeCommission — rounding-edge SKUs", () => {
  // A$19.99 → 1999 cents. 0.60 × 1999 = 1199.4 → half-to-even rounds to 1199.
  const list = 1999;

  it("retail invariant holds at $19.99 across all tiers within ±1c", () => {
    for (const tier of [0, 10, 20, 30, 40] as const) {
      const r = computeCommission({
        listPriceAudCents: list,
        discountPct: tier,
        billingModel: "retail",
      });
      const lhs = r.listPriceAudCents - r.discountAudCents - r.commissionAudCents;
      const rhs = roundHalfEven(0.60 * list);
      expect(Math.abs(lhs - rhs)).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeCommission — input validation", () => {
  it("rejects non-integer list", () => {
    expect(() => computeCommission({
      listPriceAudCents: 99.5 as unknown as number,
      discountPct: 10,
      billingModel: "retail",
    })).toThrow();
  });
  it("rejects negative list", () => {
    expect(() => computeCommission({
      listPriceAudCents: -1,
      discountPct: 0,
      billingModel: "retail",
    })).toThrow();
  });
  it("rejects invalid discount tier", () => {
    expect(() => computeCommission({
      listPriceAudCents: 9900,
      discountPct: 15 as 10,
      billingModel: "retail",
    })).toThrow();
  });
});

describe("effectiveResellerShareBp", () => {
  it("100% at tier 0 retail", () => {
    const r = computeCommission({ listPriceAudCents: 9900, discountPct: 0, billingModel: "retail" });
    expect(effectiveResellerShareBp(r)).toBe(4000); // 40.00%
  });
  it("0% at tier 40 retail", () => {
    const r = computeCommission({ listPriceAudCents: 9900, discountPct: 40, billingModel: "retail" });
    expect(effectiveResellerShareBp(r)).toBe(0);
  });
  it("wholesale always 0", () => {
    for (const tier of [0, 10, 20, 30, 40] as const) {
      const r = computeCommission({ listPriceAudCents: 9900, discountPct: tier, billingModel: "wholesale" });
      expect(effectiveResellerShareBp(r)).toBe(0);
    }
  });
});
