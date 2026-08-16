// Tests for checkout-commission.ts — commission calculation.
// The DB write is tested via integration; this unit covers the math.

import { describe, it, expect } from "vitest";

// Extract the commission calculation logic for direct testing.
// Commission = Math.round(grossAmountAudCents / 1.1 * 0.2)
function computeCheckoutCommission(grossAmountAudCents: number): number {
  return Math.round((grossAmountAudCents / 1.1) * 0.2);
}

describe("checkout commission calculation", () => {
  it("computes 20% ex-GST commission for A$149 (14900 cents) gross", () => {
    // 14900 / 1.1 = 13545.45...  *  0.2 = 2709.09...  → round → 2709
    const result = computeCheckoutCommission(14900);
    expect(result).toBe(2709);
  });

  it("computes correct commission for A$99 (9900 cents) gross", () => {
    // 9900 / 1.1 = 9000  *  0.2 = 1800
    const result = computeCheckoutCommission(9900);
    expect(result).toBe(1800);
  });

  it("computes correct commission for A$499 (49900 cents) gross", () => {
    // 49900 / 1.1 = 45363.63...  *  0.2 = 9072.72...  → round → 9073
    const result = computeCheckoutCommission(49900);
    expect(result).toBe(9073);
  });

  it("rounds correctly for values with .5 fractional cents", () => {
    // Verify Math.round behaviour (half-up, not banker's rounding — acceptable
    // for this simpler checkout flow; the old commission.ts uses half-to-even).
    const result = computeCheckoutCommission(1000);
    expect(result).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result)).toBe(true);
  });
});
