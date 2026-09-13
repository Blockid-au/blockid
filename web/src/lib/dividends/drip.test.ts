// DRIP allocation maths (S28-A): floor to whole shares, residual in cash,
// 0 % / 100 % participation, zero-price guard, election price resolution.

import { describe, expect, it } from "vitest";
import { clampParticipation, computeDripAllocation, dripSkipLabel, electionPrice, formatSharePriceAud, usablePrice } from "./drip";

describe("computeDripAllocation", () => {
  it("floors to whole shares and pays the residual in cash", () => {
    const a = computeDripAllocation({ netCashAud: 30_000, participationPct: 50, priceAud: 1.37 });
    expect(a.ok).toBe(true);
    expect(a.reinvestableAud).toBe(15_000);
    expect(a.shares).toBe(10_948); // floor(15000 / 1.37)
    expect(a.reinvestedAud).toBe(14_998.76);
    expect(a.residualAud).toBe(1.24);
    expect(a.cashPaidAud).toBe(15_001.24);
    // parts re-add
    expect(Math.round((a.reinvestedAud + a.cashPaidAud) * 100) / 100).toBe(30_000);
  });

  it("100 % participation reinvests everything but the sub-share residual", () => {
    const a = computeDripAllocation({ netCashAud: 1_000, participationPct: 100, priceAud: 3 });
    expect(a.shares).toBe(333);
    expect(a.reinvestedAud).toBe(999);
    expect(a.residualAud).toBe(1);
    expect(a.cashPaidAud).toBe(1);
  });

  it("0 % participation allocates nothing and pays the full net cash", () => {
    const a = computeDripAllocation({ netCashAud: 1_000, participationPct: 0, priceAud: 3 });
    expect(a).toMatchObject({ ok: false, reason: "zero_participation", shares: 0, reinvestedAud: 0, cashPaidAud: 1_000 });
  });

  it("zero / negative / missing / NaN price → cash only, never divides by zero", () => {
    for (const price of [0, -1, null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      const a = computeDripAllocation({ netCashAud: 1_000, participationPct: 100, priceAud: price });
      expect(a).toMatchObject({ ok: false, reason: "no_price", shares: 0, reinvestedAud: 0, residualAud: 0, cashPaidAud: 1_000 });
      expect(Number.isFinite(a.priceAud)).toBe(true);
    }
  });

  it("no net cash → no_cash; below one share → the reinvestable amount is paid back as residual", () => {
    expect(computeDripAllocation({ netCashAud: 0, participationPct: 100, priceAud: 2 })).toMatchObject({ ok: false, reason: "no_cash", cashPaidAud: 0 });
    const tiny = computeDripAllocation({ netCashAud: 5, participationPct: 50, priceAud: 10 });
    expect(tiny).toMatchObject({ ok: false, reason: "below_one_share", shares: 0, reinvestableAud: 2.5, residualAud: 2.5, cashPaidAud: 5 });
  });

  it("clamps participation to 0–100 and 2 dp; binary-float boundaries land on the exact share count", () => {
    expect(clampParticipation(150)).toBe(100);
    expect(clampParticipation(-5)).toBe(0);
    expect(clampParticipation("33.333")).toBe(33.33);
    expect(clampParticipation("x")).toBe(0);
    // 0.30 / 0.10 = 2.9999999999999996 in IEEE-754 — must still be 3 shares.
    expect(computeDripAllocation({ netCashAud: 0.3, participationPct: 100, priceAud: 0.1 }).shares).toBe(3);
  });

  it("resolves the election price: manual wins over the market mid; missing → null", () => {
    expect(electionPrice({ priceBasis: "manual", manualPriceAud: 2.5 }, 1.1)).toBe(2.5);
    expect(electionPrice({ priceBasis: "share_price_mid", manualPriceAud: 2.5 }, 1.1)).toBe(1.1);
    expect(electionPrice({ priceBasis: "share_price_mid", manualPriceAud: null }, 0)).toBeNull();
    expect(electionPrice({ priceBasis: "manual", manualPriceAud: null }, 1.1)).toBeNull();
    expect(usablePrice("1.5")).toBe(1.5);
    expect(usablePrice("-1")).toBeNull();
  });

  it("formats share prices and skip reasons", () => {
    expect(formatSharePriceAud(1.25)).toBe("A$1.25");
    expect(formatSharePriceAud(0.0125)).toBe("A$0.0125");
    expect(formatSharePriceAud(0.5)).toBe("A$0.50");
    expect(dripSkipLabel("no_price")).toContain("paid in cash");
    expect(dripSkipLabel(null)).toBeNull();
  });
});
