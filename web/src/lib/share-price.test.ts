// Colocated suite for the SVI + ARR-multiple share price (S26-B).
//
//   - SVI only (no revenue) → method "svi", price = SVI valuation ÷ FD shares
//   - connected ARR → 40/60 blend with the sector multiple range, label
//     carries "from Stripe, 3 Sep"
//   - zero / negative / NaN share counts → ok:false no_shares, zero price,
//     never NaN / Infinity
//   - no SVI + no ARR → no_valuation; no SVI + ARR → ARR leg alone (0/100)
//   - a supplied SVI range short-circuits computeValuation
//   - low ≤ mid ≤ high always; unknown sector → "default" multiples

import { describe, expect, it } from "vitest";
import { computeSharePrice, formatSharePrice, revenueSourceLabel, SHARE_PRICE_WEIGHTS, sviValuationRange } from "./share-price";
import { computeValuation } from "./valuation";
import { vcBenchmark } from "./agents/cfo-valuation";

const FD = 10_000_000;

function finiteRange(r: { lowAud: number; midAud: number; highAud: number }) {
  for (const v of [r.lowAud, r.midAud, r.highAud]) expect(Number.isFinite(v)).toBe(true);
  expect(r.lowAud).toBeLessThanOrEqual(r.midAud);
  expect(r.midAud).toBeLessThanOrEqual(r.highAud);
}

describe("computeSharePrice", () => {
  it("SVI only: price = SVI valuation ÷ fully diluted shares, method svi, 100/0 weights", () => {
    const r = computeSharePrice({ svi: 120, stage: "validation", fullyDilutedShares: FD });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("svi");
    expect(r.weights).toEqual({ svi: 1, arr: 0 });
    expect(r.arrValuation).toBeNull();
    expect(r.multiple).toBeNull();
    const v = computeValuation({ sviScore: 120, stage: "validation" });
    expect(r.valuation.midAud).toBe(Math.round(v.midAud));
    expect(r.pricePerShare.midAud).toBeCloseTo(v.midAud / FD, 6);
    expect(r.sourceLabel).toBe("SVI score only");
    expect(r.methodNote).toContain("no connected revenue");
    finiteRange(r.valuation);
    finiteRange(r.pricePerShare);
  });

  it("connected ARR: 40 % SVI + 60 % ARR × sector multiples, label from Stripe with the date", () => {
    const arr = 240_000;
    const r = computeSharePrice({ svi: 120, stage: "validation", sector: "saas", arrAud: arr, fullyDilutedShares: FD, revenueSource: { kind: "stripe", takenAt: "2026-09-03T02:00:00Z" } });
    expect(r.ok).toBe(true);
    expect(r.method).toBe("svi+arr_multiple");
    expect(r.weights).toEqual({ svi: SHARE_PRICE_WEIGHTS.svi, arr: SHARE_PRICE_WEIGHTS.arr });
    const bm = vcBenchmark("saas");
    expect(r.multiple).toEqual({ sector: "saas", low: bm.arrMultiple.low, mid: bm.arrMultiple.mid, high: bm.arrMultiple.high, source: bm.source, sourceLabel: bm.sourceLabel, multiplesSource: "static" });
    expect(r.arrValuation).toEqual({ lowAud: Math.round(arr * bm.arrMultiple.low), midAud: Math.round(arr * bm.arrMultiple.mid), highAud: Math.round(arr * bm.arrMultiple.high) });
    const svi = computeValuation({ sviScore: 120, stage: "validation", sector: "saas" });
    const expectedMid = Math.round(0.4 * svi.midAud + 0.6 * arr * bm.arrMultiple.mid);
    expect(r.valuation.midAud).toBe(expectedMid);
    expect(r.pricePerShare.midAud).toBeCloseTo(expectedMid / FD, 6);
    expect(r.sourceLabel).toBe("SVI + ARR multiple (from Stripe, 3 Sep)");
    expect(r.methodNote).toContain("40% SVI valuation + 60% ARR");
    expect(r.methodNote).toContain("10,000,000 fully diluted shares");
    finiteRange(r.valuation);
    finiteRange(r.pricePerShare);
  });

  it("zero, negative and NaN share counts → no_shares with a zero price and no NaN/Infinity anywhere", () => {
    for (const shares of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = computeSharePrice({ svi: 110, arrAud: 120_000, sector: "fintech", fullyDilutedShares: shares });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe("no_shares");
      expect(r.pricePerShare).toEqual({ lowAud: 0, midAud: 0, highAud: 0 });
      expect(r.fullyDilutedShares).toBe(0);
      finiteRange(r.valuation);
      expect(JSON.stringify(r)).not.toMatch(/NaN|Infinity/);
    }
  });

  it("no SVI and no ARR → no_valuation; no SVI with ARR → the ARR leg alone (0/100)", () => {
    const none = computeSharePrice({ svi: null, fullyDilutedShares: FD });
    expect(none.ok).toBe(false);
    expect(none.reason).toBe("no_valuation");
    expect(none.valuation).toEqual({ lowAud: 0, midAud: 0, highAud: 0 });

    const arrOnly = computeSharePrice({ svi: null, arrAud: 100_000, sector: "marketplace", fullyDilutedShares: 1_000_000 });
    expect(arrOnly.ok).toBe(true);
    expect(arrOnly.method).toBe("svi+arr_multiple");
    expect(arrOnly.weights).toEqual({ svi: 0, arr: 1 });
    expect(arrOnly.sviValuation).toBeNull();
    expect(arrOnly.valuation).toEqual(arrOnly.arrValuation);
    expect(arrOnly.methodNote).toContain("no SVI score yet");
  });

  it("non-positive / non-finite ARR is treated as absent (SVI-only) and an unknown sector falls back to default multiples", () => {
    for (const arr of [0, -1, Number.NaN, null, undefined]) {
      const r = computeSharePrice({ svi: 100, arrAud: arr, fullyDilutedShares: FD });
      expect(r.method).toBe("svi");
      expect(r.arrAud).toBeNull();
    }
    const r = computeSharePrice({ svi: 100, arrAud: 50_000, sector: "underwater-basket-weaving", fullyDilutedShares: FD });
    expect(r.multiple?.sector).toBe("default");
  });

  it("a supplied SVI range is used verbatim (rounded, ordered) instead of computeValuation", () => {
    const r = computeSharePrice({ svi: 999, sviValuation: { lowAud: 2_000_000.4, midAud: 3_000_000, highAud: 1_000_000 }, fullyDilutedShares: 2_000_000 });
    expect(r.sviValuation).toEqual({ lowAud: 2_000_000, midAud: 2_000_000, highAud: 2_000_000 });
    expect(r.pricePerShare.midAud).toBe(1);
    expect(sviValuationRange({ svi: null, sviValuation: null })).toBeNull();
  });

  it("labels and formatting", () => {
    expect(revenueSourceLabel({ kind: "xero", takenAt: "2026-09-03T02:00:00Z" })).toBe("from Xero, 3 Sep");
    expect(revenueSourceLabel({ kind: "stripe_connect", takenAt: null })).toBe("from Stripe");
    expect(revenueSourceLabel(null)).toBeNull();
    expect(formatSharePrice(0.0125)).toBe("A$0.0125");
    expect(formatSharePrice(0.000123)).toBe("A$0.000123");
    expect(formatSharePrice(Number.NaN)).toBe("A$0.00");
  });
});
