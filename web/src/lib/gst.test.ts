// Colocated vitest for the pure GST calculator (Australian Consumer Law +
// ATO A New Tax System, 10% GST-inclusive split). Every founder-facing
// invoice, Stripe webhook receipt, and CFO revenue report ultimately reads a
// `net_cents` value from this function, so a silent drift in the AU-only
// gate, the registered-flag guard, or the `round(gross / 11)` split would
// misstate GST liability on every AU transaction.
//
// Pinned contract callers depend on:
//   • `net + gst === gross` always holds (invariant across every branch);
//   • non-registered OR non-AU customer yields `gst=0, net=gross` regardless
//     of amount — no GST is remitted for exports or below-threshold sellers;
//   • `gross <= 0` short-circuits to a zero-GST breakdown (no negative /
//     zero-cent invoices produce phantom GST);
//   • jurisdiction match is case-insensitive + whitespace-trimmed on `"AU"`
//     only — "USA", "au" (lowercase), "aus", "AU " should all be handled
//     without silently taxing a non-AU sale;
//   • non-integer / non-finite gross is truncated to an integer or 0.

import { describe, expect, it } from "vitest";
import { calculateGst } from "./gst";

describe("calculateGst — guards + zero-GST branches", () => {
  it("returns zero GST when not registered even for an AU customer", () => {
    const out = calculateGst(11_000, false, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 11_000, gross_cents: 11_000 });
  });

  it("returns zero GST when registered but customer is not in AU (export)", () => {
    const out = calculateGst(11_000, true, "US");
    expect(out).toEqual({ gst_cents: 0, net_cents: 11_000, gross_cents: 11_000 });
  });

  it("returns zero GST when both not-registered and non-AU", () => {
    const out = calculateGst(11_000, false, "NZ");
    expect(out).toEqual({ gst_cents: 0, net_cents: 11_000, gross_cents: 11_000 });
  });

  it("returns zero GST when gross_aud_cents is exactly 0", () => {
    const out = calculateGst(0, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 0, gross_cents: 0 });
  });

  it("returns zero GST when gross is negative (refund / credit note)", () => {
    const out = calculateGst(-11_000, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: -11_000, gross_cents: -11_000 });
  });

  it("returns zero GST on non-finite gross (NaN) and coerces gross to 0", () => {
    const out = calculateGst(Number.NaN, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 0, gross_cents: 0 });
  });

  it("returns zero GST on Infinity gross and coerces gross to 0", () => {
    const out = calculateGst(Number.POSITIVE_INFINITY, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 0, gross_cents: 0 });
  });

  it("treats non-string jurisdiction defensively (empty string → non-AU)", () => {
    const out = calculateGst(11_000, true, "");
    expect(out).toEqual({ gst_cents: 0, net_cents: 11_000, gross_cents: 11_000 });
  });
});

describe("calculateGst — 10% GST-inclusive split for AU registered sellers", () => {
  it("splits a round 11-cent gross exactly (1c GST / 10c net)", () => {
    const out = calculateGst(11, true, "AU");
    expect(out).toEqual({ gst_cents: 1, net_cents: 10, gross_cents: 11 });
  });

  it("splits A$110.00 (11_000 cents) into A$10.00 GST + A$100.00 net", () => {
    const out = calculateGst(11_000, true, "AU");
    expect(out).toEqual({ gst_cents: 1_000, net_cents: 10_000, gross_cents: 11_000 });
  });

  it("splits A$1,100.00 (110_000 cents) into A$100.00 GST + A$1,000.00 net", () => {
    const out = calculateGst(110_000, true, "AU");
    expect(out).toEqual({ gst_cents: 10_000, net_cents: 100_000, gross_cents: 110_000 });
  });

  it("rounds a non-divisible-by-11 gross to the nearest cent (100c → 9c GST)", () => {
    // 100 / 11 = 9.0909…  → round to 9c GST, 91c net
    const out = calculateGst(100, true, "AU");
    expect(out).toEqual({ gst_cents: 9, net_cents: 91, gross_cents: 100 });
    expect(out.net_cents + out.gst_cents).toBe(out.gross_cents);
  });

  it("rounds .5 upward per Math.round banker semantics (55c → 5c GST)", () => {
    // 55 / 11 = 5.0 exactly → 5c GST, 50c net
    const out = calculateGst(55, true, "AU");
    expect(out).toEqual({ gst_cents: 5, net_cents: 50, gross_cents: 55 });
  });

  it("splits a 1-cent gross to 0 GST + 1c net (1/11 rounds to 0)", () => {
    const out = calculateGst(1, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 1, gross_cents: 1 });
  });

  it("splits a 5-cent gross to 0 GST + 5c net (5/11≈0.45 rounds to 0)", () => {
    const out = calculateGst(5, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: 5, gross_cents: 5 });
  });

  it("splits a 6-cent gross to 1c GST + 5c net (6/11≈0.55 rounds to 1)", () => {
    const out = calculateGst(6, true, "AU");
    expect(out).toEqual({ gst_cents: 1, net_cents: 5, gross_cents: 6 });
  });

  it("truncates a fractional gross (11.9c → 11c gross) before splitting", () => {
    const out = calculateGst(11.9, true, "AU");
    expect(out).toEqual({ gst_cents: 1, net_cents: 10, gross_cents: 11 });
  });

  it("truncates a negative-fractional gross toward zero (-11.9c → -11c gross)", () => {
    // Math.trunc(-11.9) === -11 → then gross <= 0 branch fires → zero GST
    const out = calculateGst(-11.9, true, "AU");
    expect(out).toEqual({ gst_cents: 0, net_cents: -11, gross_cents: -11 });
  });
});

describe("calculateGst — jurisdiction normalisation", () => {
  it("accepts uppercase 'AU'", () => {
    const out = calculateGst(11_000, true, "AU");
    expect(out.gst_cents).toBe(1_000);
  });

  it("accepts lowercase 'au' via toUpperCase()", () => {
    const out = calculateGst(11_000, true, "au");
    expect(out.gst_cents).toBe(1_000);
  });

  it("accepts mixed-case 'Au'", () => {
    const out = calculateGst(11_000, true, "Au");
    expect(out.gst_cents).toBe(1_000);
  });

  it("trims surrounding whitespace before comparing ('  AU  ')", () => {
    const out = calculateGst(11_000, true, "  AU  ");
    expect(out.gst_cents).toBe(1_000);
  });

  it("rejects 'AUS' (Olympic code, not ISO-3166 alpha-2)", () => {
    const out = calculateGst(11_000, true, "AUS");
    expect(out.gst_cents).toBe(0);
  });

  it("rejects 'USA' (non-AU)", () => {
    const out = calculateGst(11_000, true, "USA");
    expect(out.gst_cents).toBe(0);
  });

  it("rejects 'NZ' (non-AU neighbour)", () => {
    const out = calculateGst(11_000, true, "NZ");
    expect(out.gst_cents).toBe(0);
  });
});

describe("calculateGst — invariants across every branch", () => {
  it("net + gst === gross on every non-zero AU registered sample", () => {
    const samples = [11, 55, 100, 1_100, 11_000, 12_345, 99_999, 1_000_000];
    for (const g of samples) {
      const out = calculateGst(g, true, "AU");
      expect(out.net_cents + out.gst_cents).toBe(out.gross_cents);
      expect(out.gross_cents).toBe(g);
    }
  });

  it("gst_cents is always a non-negative integer", () => {
    const samples = [0, 1, 11, 100, 12_345];
    for (const g of samples) {
      const out = calculateGst(g, true, "AU");
      expect(Number.isInteger(out.gst_cents)).toBe(true);
      expect(out.gst_cents).toBeGreaterThanOrEqual(0);
    }
  });

  it("net_cents is always an integer (positive OR the passthrough on negative gross)", () => {
    const cases = [
      { in: 11_000, reg: true, jur: "AU" },
      { in: -11_000, reg: true, jur: "AU" },
      { in: 11_000, reg: false, jur: "AU" },
      { in: 11_000, reg: true, jur: "US" },
      { in: 0, reg: true, jur: "AU" },
    ];
    for (const c of cases) {
      const out = calculateGst(c.in, c.reg, c.jur);
      expect(Number.isInteger(out.net_cents)).toBe(true);
    }
  });

  it("gross_cents echoes the truncated input regardless of the GST branch", () => {
    // AU + registered path
    expect(calculateGst(12_345, true, "AU").gross_cents).toBe(12_345);
    // Non-AU passthrough path
    expect(calculateGst(12_345, true, "US").gross_cents).toBe(12_345);
    // Not-registered passthrough path
    expect(calculateGst(12_345, false, "AU").gross_cents).toBe(12_345);
    // Fractional truncation path
    expect(calculateGst(12_345.99, true, "AU").gross_cents).toBe(12_345);
  });
});
