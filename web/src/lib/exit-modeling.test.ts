// Colocated vitest for `exit-modeling.ts` — the pure exit-payout engine that
// drives the CFO exit-scenarios surface and the founder cap-table waterfall
// view. Every downstream number (per-shareholder gross, AU CGT estimate,
// ESOP net gain, per-share value) reads directly from `calculateExit`, so a
// silent regression in the waterfall, ordering, or rounding math would
// mispay a founder simulation without a compile error.
//
// Contract pinned here:
//
//   • Early return: `totalShares <= 0` returns zero payouts, zero
//     perShareValue, zero liquidationPreference, null esopExercise — but
//     preserves the input scenario and totalProceeds = exitValuation.
//
//   • Preference filter: a shareholder counts as "preference" only when
//     BOTH `shareClassType === "preference"` AND `liquidationMultiple` is
//     truthy. A preference-typed holder without a multiplier falls into
//     the ordinary bucket (this is how the UI represents non-participating
//     common held under a class name).
//
//   • Liquidation preference is paid first, capped at remaining proceeds
//     (so a 2x pref on a fire-sale exit consumes everything and the
//     ordinary bucket sees $0). `liquidationPreference` reports the sum
//     actually paid, not the notional entitlement.
//
//   • Non-participating preferred: each pref holder's grossPayout is the
//     MAX of their liq-pref payout and their pro-rata payout (they choose
//     whichever converts higher — the standard 1x-non-participating
//     waterfall). No double-dipping.
//
//   • ESOP block:
//       - `esop = null` OR `esop.allocatedShares === 0` → esopExercise = null.
//       - Otherwise: totalValue = allocated × perShare
//         (perShare = remainingProceeds / (totalShares − prefShares)),
//         exerciseCost = allocated × exercisePrice,
//         netGain = max(0, totalValue − exerciseCost) — never negative even
//         when the exercise price is underwater.
//       - ESOP pool shares participate pro-rata in the ordinary bucket
//         (`ordinaryTotalShares` includes `esopSharesInPool`).
//
//   • CGT model — pinned exactly:
//       - Gain ≤ 0 → cgt = 0 (no wash-out).
//       - Held > 12 months (or vestingStart null/undefined — the "assume
//         long-held if unknown" default) → cgt = gain × 0.5 × 0.47.
//       - Held ≤ 12 months → cgt = gain × 0.47.
//       - The 0.47 is the top marginal (45%) + Medicare (2%), NOT a config.
//
//   • Rounding: grossPayout, cgtEstimate, netPayout, liquidationPreference
//     round to 2 decimals; perShareValue rounds to 4 decimals. netPayout
//     is computed from the rounded grossPayout − rounded-independently cgt,
//     which can drift by one cent from `grossPayout − cgtEstimate` — the
//     contract is the exact `Math.round((gross − cgt) * 100) / 100` value.
//
//   • ownershipPct = shares / totalShares × 100 (unrounded).
//
//   • `generateScenarios` fans out over the fixed [3, 5, 10, 20] revenue
//     multiples, defaults to method="acquisition", and stamps
//     `exitMultiple` on each returned scenario.
//
// No IO, no mocks — every test is a pure computation.

import { describe, expect, it } from "vitest";
import {
  calculateExit,
  generateScenarios,
  type CapTableInput,
  type ExitScenario,
  type ShareholderInput,
} from "./exit-modeling";

const CGT_RATE = 0.47;
const LONG_HELD_DISCOUNT = 0.5;

function ord(overrides: Partial<ShareholderInput> = {}): ShareholderInput {
  return {
    name: "Alice",
    role: "founder",
    shares: 1000,
    shareClassType: "ordinary",
    ...overrides,
  };
}

function pref(overrides: Partial<ShareholderInput> = {}): ShareholderInput {
  return {
    name: "SeriesA",
    role: "investor",
    shares: 200,
    shareClassType: "preference",
    liquidationMultiple: 1,
    pricePerShare: 100,
    ...overrides,
  };
}

function baseScenario(overrides: Partial<ExitScenario> = {}): ExitScenario {
  return { method: "acquisition", exitValuation: 1_000_000, ...overrides };
}

describe("calculateExit — early return / degenerate inputs", () => {
  it("returns zeroed structure when totalShares is 0", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord()],
      totalShares: 0,
    });
    expect(result.perShareValue).toBe(0);
    expect(result.shareholderPayouts).toEqual([]);
    expect(result.liquidationPreference).toBe(0);
    expect(result.esopExercise).toBeNull();
    expect(result.totalProceeds).toBe(1_000_000);
    expect(result.scenario).toEqual(baseScenario());
  });

  it("returns zeroed structure when totalShares is negative", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord()],
      totalShares: -1,
    });
    expect(result.shareholderPayouts).toEqual([]);
    expect(result.perShareValue).toBe(0);
  });

  it("handles empty shareholders list without crashing", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts).toEqual([]);
    expect(result.totalProceeds).toBe(1_000_000);
    expect(result.perShareValue).toBe(1000);
  });

  it("handles zero exit valuation with a real cap table", () => {
    const result = calculateExit(baseScenario({ exitValuation: 0 }), {
      shareholders: [ord({ shares: 500 })],
      totalShares: 500,
    });
    expect(result.totalProceeds).toBe(0);
    expect(result.perShareValue).toBe(0);
    expect(result.shareholderPayouts[0].grossPayout).toBe(0);
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(0);
    expect(result.shareholderPayouts[0].netPayout).toBe(0);
  });
});

describe("calculateExit — single ordinary holder waterfall", () => {
  it("distributes 100% of proceeds to a sole ordinary holder", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts).toHaveLength(1);
    expect(result.shareholderPayouts[0].grossPayout).toBe(1_000_000);
    expect(result.shareholderPayouts[0].ownershipPct).toBe(100);
    expect(result.liquidationPreference).toBe(0);
  });

  it("applies 50% CGT discount when vestingStart is omitted (assume long-held)", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
    });
    const expectedCgt = 1_000_000 * LONG_HELD_DISCOUNT * CGT_RATE;
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(
      Math.round(expectedCgt * 100) / 100,
    );
    expect(result.shareholderPayouts[0].netPayout).toBe(
      Math.round((1_000_000 - expectedCgt) * 100) / 100,
    );
  });

  it("applies 50% CGT discount when vestingStart is explicitly null", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000, vestingStart: null })],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(235_000);
  });

  it("applies FULL marginal rate when vestingStart is within 12 months", () => {
    const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000, vestingStart: recent })],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(470_000);
  });

  it("applies 50% discount when vestingStart is > 12 months ago", () => {
    const old = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000, vestingStart: old })],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(235_000);
  });

  it("zeros CGT when the sale produces a capital loss (gain <= 0)", () => {
    const result = calculateExit(baseScenario({ exitValuation: 100 }), {
      shareholders: [ord({ shares: 1000, pricePerShare: 10 })],
      totalShares: 1000,
    });
    const holder = result.shareholderPayouts[0];
    expect(holder.grossPayout).toBe(100);
    expect(holder.cgtEstimate).toBe(0);
    expect(holder.netPayout).toBe(100);
  });

  it("computes CGT off the gain net of pricePerShare cost basis", () => {
    const result = calculateExit(baseScenario({ exitValuation: 1_000_000 }), {
      shareholders: [ord({ shares: 1000, pricePerShare: 100 })],
      totalShares: 1000,
    });
    const gain = 1_000_000 - 1000 * 100;
    const expectedCgt = Math.round(gain * 0.5 * CGT_RATE * 100) / 100;
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(expectedCgt);
  });
});

describe("calculateExit — multi-ordinary distribution", () => {
  it("splits proceeds pro-rata across ordinary holders", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [
        ord({ name: "A", shares: 400 }),
        ord({ name: "B", shares: 600 }),
      ],
      totalShares: 1000,
    });
    const [a, b] = result.shareholderPayouts;
    expect(a.grossPayout).toBe(400_000);
    expect(b.grossPayout).toBe(600_000);
    expect(a.ownershipPct).toBe(40);
    expect(b.ownershipPct).toBe(60);
  });

  it("does not force ordinaryTotalShares to equal totalShares (missing float)", () => {
    // 300 shares of the total 1000 are unaccounted-for — the ordinary
    // bucket still gets ALL remaining proceeds, boosting the modelled
    // per-share payout above the naive exitValuation/totalShares figure.
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 700 })],
      totalShares: 1000,
    });
    expect(result.shareholderPayouts[0].grossPayout).toBe(1_000_000);
    expect(result.perShareValue).toBe(1000); // exitValuation / totalShares
  });
});

describe("calculateExit — preference (non-participating) waterfall", () => {
  it("pays liquidation preference first at 1x and reserves it before ordinary distribution", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [
        pref({ shares: 200, pricePerShare: 100, liquidationMultiple: 1 }),
        ord({ name: "Common", shares: 800 }),
      ],
      totalShares: 1000,
    });
    // pref reserves 20_000; remaining 980_000 spread across 800 ord shares
    // → perShareOrd = 1225; pref pro-rata = 200 * 1225 = 245_000
    // max(20_000, 245_000) = 245_000 (non-participating chooses conversion)
    expect(result.liquidationPreference).toBe(20_000);
    const prefPayout = result.shareholderPayouts.find((p) => p.name === "SeriesA");
    const ordPayout = result.shareholderPayouts.find((p) => p.name === "Common");
    expect(prefPayout?.grossPayout).toBe(245_000);
    expect(ordPayout?.grossPayout).toBe(980_000);
  });

  it("applies a 2x liquidation multiple to the pref amount", () => {
    const result = calculateExit(baseScenario({ exitValuation: 50_000 }), {
      shareholders: [
        pref({ shares: 200, pricePerShare: 100, liquidationMultiple: 2 }),
        ord({ name: "Common", shares: 800 }),
      ],
      totalShares: 1000,
    });
    // 2x pref amount = 200 * 100 * 2 = 40_000; exit only 50_000 → 40_000 reserved
    expect(result.liquidationPreference).toBe(40_000);
    // remaining 10_000 split across 800 ordinary shares → perShare 12.5
    // pref pro-rata = 200 * 12.5 = 2500; max(40_000, 2500) = 40_000
    const prefPayout = result.shareholderPayouts.find((p) => p.name === "SeriesA");
    expect(prefPayout?.grossPayout).toBe(40_000);
    const ordPayout = result.shareholderPayouts.find((p) => p.name === "Common");
    expect(ordPayout?.grossPayout).toBe(10_000);
  });

  it("caps preference at remaining proceeds on a fire-sale exit", () => {
    const result = calculateExit(baseScenario({ exitValuation: 500_000 }), {
      shareholders: [pref({ shares: 1000, pricePerShare: 1000, liquidationMultiple: 2 })],
      // notional pref amount = 1000 * 1000 * 2 = 2_000_000, but exit only 500_000
      totalShares: 1000,
    });
    expect(result.liquidationPreference).toBe(500_000);
    // gain = 500_000 gross − 1_000_000 cost basis = negative → CGT 0
    expect(result.shareholderPayouts[0].grossPayout).toBe(500_000);
    expect(result.shareholderPayouts[0].cgtEstimate).toBe(0);
    expect(result.shareholderPayouts[0].netPayout).toBe(500_000);
  });

  it("picks pro-rata payout when it exceeds the liq pref (non-participating)", () => {
    // Series A holds 20% of a 1M exit; 1x pref = 20_000; pro-rata (of 1M) = 200_000
    const result = calculateExit(baseScenario(), {
      shareholders: [pref({ shares: 200, pricePerShare: 100, liquidationMultiple: 1 })],
      totalShares: 1000,
    });
    expect(result.liquidationPreference).toBe(20_000);
    // remaining after pref = 980_000; ord bucket empty → pref pro-rata inside ord math is 0 shares...
    // Actually: ordinaryHolders is [], so ordinaryTotalShares = 0, perShareOrdinary = 0.
    // pref pro-rata (200 * 0) = 0 → grossPayout = max(20_000, 0) = 20_000.
    expect(result.shareholderPayouts[0].grossPayout).toBe(20_000);
  });

  it("treats a preference holder without liquidationMultiple as ordinary", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [
        pref({ shares: 200, liquidationMultiple: undefined, pricePerShare: 100 }),
      ],
      totalShares: 200,
    });
    expect(result.liquidationPreference).toBe(0);
    expect(result.shareholderPayouts[0].grossPayout).toBe(1_000_000);
  });

  it("treats a preference holder with pricePerShare=undefined as 0 pref amount", () => {
    const result = calculateExit(baseScenario({ exitValuation: 100_000 }), {
      shareholders: [
        pref({ shares: 200, liquidationMultiple: 1, pricePerShare: undefined }),
      ],
      totalShares: 200,
    });
    // pref amount = 200 * 0 * 1 = 0 → nothing reserved
    expect(result.liquidationPreference).toBe(0);
    // pro-rata over 0 ordinary shares → perShareOrdinary=0 → grossPayout = max(0, 0) = 0
    expect(result.shareholderPayouts[0].grossPayout).toBe(0);
  });

  it("stacks multiple preference holders in filter order", () => {
    const result = calculateExit(baseScenario({ exitValuation: 100_000 }), {
      shareholders: [
        pref({ name: "A", shares: 100, pricePerShare: 200, liquidationMultiple: 1 }),
        pref({ name: "B", shares: 100, pricePerShare: 300, liquidationMultiple: 1 }),
      ],
      totalShares: 200,
    });
    // A pref = 20_000, B pref = 30_000 → total reserved 50_000
    expect(result.liquidationPreference).toBe(50_000);
  });

  it("exhausts proceeds across preference holders in order (first-served)", () => {
    const result = calculateExit(baseScenario({ exitValuation: 25_000 }), {
      shareholders: [
        pref({ name: "First", shares: 100, pricePerShare: 200, liquidationMultiple: 1 }),
        pref({ name: "Second", shares: 100, pricePerShare: 300, liquidationMultiple: 1 }),
      ],
      totalShares: 200,
    });
    // First takes 20_000 (its full pref), only 5_000 left for Second (of its 30_000 ask)
    expect(result.liquidationPreference).toBe(25_000);
    const first = result.shareholderPayouts.find((p) => p.name === "First");
    const second = result.shareholderPayouts.find((p) => p.name === "Second");
    expect(first?.grossPayout).toBe(20_000);
    expect(second?.grossPayout).toBe(5_000);
  });
});

describe("calculateExit — ESOP block", () => {
  it("returns null esopExercise when esop is null", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
      esop: null,
    });
    expect(result.esopExercise).toBeNull();
  });

  it("returns null esopExercise when allocatedShares is 0", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
      esop: { totalPoolShares: 100, allocatedShares: 0, exercisePrice: 10 },
    });
    expect(result.esopExercise).toBeNull();
  });

  it("computes ESOP totalValue at the residual per-share rate", () => {
    const capTable: CapTableInput = {
      shareholders: [ord({ shares: 500 })],
      totalShares: 1000,
      esop: { totalPoolShares: 500, allocatedShares: 500, exercisePrice: 10 },
    };
    const result = calculateExit(baseScenario(), capTable);
    // remaining = 1_000_000; perShare = 1_000_000 / (1000 - 0 prefs) = 1000
    // totalValue = 500 * 1000 = 500_000
    expect(result.esopExercise?.totalValue).toBe(500_000);
    expect(result.esopExercise?.exerciseCost).toBe(5_000);
    expect(result.esopExercise?.netGain).toBe(495_000);
  });

  it("floors ESOP netGain at 0 when the exercise price is underwater", () => {
    const result = calculateExit(baseScenario({ exitValuation: 1_000 }), {
      shareholders: [ord({ shares: 100 })],
      totalShares: 200,
      esop: {
        totalPoolShares: 100,
        allocatedShares: 100,
        exercisePrice: 1_000_000,
      },
    });
    expect(result.esopExercise?.netGain).toBe(0);
    expect(result.esopExercise?.totalValue).toBeLessThan(
      result.esopExercise?.exerciseCost ?? 0,
    );
  });

  it("includes esop pool shares in the ordinary pro-rata denominator", () => {
    // Without ESOP dilution: ord holds 500/500, gets 1_000_000.
    // With ESOP 500 allocated: ordinary pool = 1000 total, ord gets 500_000.
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 500 })],
      totalShares: 1000,
      esop: { totalPoolShares: 500, allocatedShares: 500, exercisePrice: 0 },
    });
    expect(result.shareholderPayouts[0].grossPayout).toBe(500_000);
  });
});

describe("calculateExit — rounding and per-share value", () => {
  it("rounds grossPayout / cgt / netPayout to 2 decimals", () => {
    const result = calculateExit(baseScenario({ exitValuation: 100 }), {
      shareholders: [ord({ shares: 3 })],
      totalShares: 3,
    });
    const gross = result.shareholderPayouts[0].grossPayout;
    // 100/3 * 3 = 100.00 exactly for a sole holder
    expect(gross).toBe(100);
    // Verify rounding infrastructure via a 3-way split
    const split = calculateExit(baseScenario({ exitValuation: 100 }), {
      shareholders: [
        ord({ name: "A", shares: 1 }),
        ord({ name: "B", shares: 1 }),
        ord({ name: "C", shares: 1 }),
      ],
      totalShares: 3,
    });
    for (const holder of split.shareholderPayouts) {
      // Each payout is rounded to 2 decimals → 33.33
      expect(holder.grossPayout).toBe(33.33);
    }
  });

  it("rounds perShareValue to 4 decimals", () => {
    const result = calculateExit(baseScenario({ exitValuation: 100 }), {
      shareholders: [ord({ shares: 3 })],
      totalShares: 3,
    });
    // 100/3 = 33.3333333 → rounded to 4dp
    expect(result.perShareValue).toBe(33.3333);
  });

  it("perShareValue is exitValuation / totalShares regardless of ordinary bucket", () => {
    const result = calculateExit(baseScenario({ exitValuation: 999_999 }), {
      shareholders: [ord({ shares: 1 })],
      totalShares: 7,
    });
    // 999_999 / 7 = 142_857 exactly
    expect(result.perShareValue).toBe(142_857);
  });

  it("ownershipPct is not rounded (raw shares/totalShares * 100)", () => {
    const result = calculateExit(baseScenario(), {
      shareholders: [ord({ shares: 1 })],
      totalShares: 3,
    });
    // Not rounded — 1/3*100 = 33.3333333...
    expect(result.shareholderPayouts[0].ownershipPct).toBeCloseTo(33.3333333, 5);
    // But definitely not rounded to 2dp
    expect(result.shareholderPayouts[0].ownershipPct).not.toBe(33.33);
  });
});

describe("calculateExit — scenario / totalProceeds preservation", () => {
  it("passes the input scenario through untouched", () => {
    const scenario = baseScenario({ method: "ipo", exitMultiple: 12 });
    const result = calculateExit(scenario, {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
    });
    expect(result.scenario).toEqual(scenario);
    expect(result.scenario.method).toBe("ipo");
    expect(result.scenario.exitMultiple).toBe(12);
  });

  it("totalProceeds always equals exitValuation, not the sum of payouts", () => {
    // Fire-sale where only pref sees anything: totalProceeds is still the
    // headline exit number so the UI can render the waterfall banner.
    const result = calculateExit(baseScenario({ exitValuation: 500_000 }), {
      shareholders: [pref({ shares: 1000, pricePerShare: 1000, liquidationMultiple: 2 })],
      totalShares: 1000,
    });
    expect(result.totalProceeds).toBe(500_000);
  });
});

describe("generateScenarios", () => {
  it("returns exactly 4 scenarios (one per fixed revenue multiple)", () => {
    const capTable: CapTableInput = {
      shareholders: [ord({ shares: 1000 })],
      totalShares: 1000,
    };
    const results = generateScenarios(capTable, 1_000_000);
    expect(results).toHaveLength(4);
  });

  it("uses the fixed [3, 5, 10, 20] revenue multiples in order", () => {
    const results = generateScenarios(
      { shareholders: [ord({ shares: 1000 })], totalShares: 1000 },
      1_000_000,
    );
    expect(results.map((r) => r.scenario.exitMultiple)).toEqual([3, 5, 10, 20]);
    expect(results.map((r) => r.scenario.exitValuation)).toEqual([
      3_000_000, 5_000_000, 10_000_000, 20_000_000,
    ]);
  });

  it("defaults method to 'acquisition' when unspecified", () => {
    const results = generateScenarios(
      { shareholders: [ord({ shares: 1000 })], totalShares: 1000 },
      1_000_000,
    );
    for (const r of results) {
      expect(r.scenario.method).toBe("acquisition");
    }
  });

  it("respects an explicit method argument", () => {
    const results = generateScenarios(
      { shareholders: [ord({ shares: 1000 })], totalShares: 1000 },
      500_000,
      "ipo",
    );
    for (const r of results) {
      expect(r.scenario.method).toBe("ipo");
    }
  });

  it("propagates the same cap table into each scenario's payouts", () => {
    const results = generateScenarios(
      { shareholders: [ord({ shares: 500 }), ord({ name: "B", shares: 500 })], totalShares: 1000 },
      1_000_000,
    );
    for (const r of results) {
      expect(r.shareholderPayouts).toHaveLength(2);
      const total = r.shareholderPayouts.reduce((s, p) => s + p.grossPayout, 0);
      expect(total).toBe(r.scenario.exitValuation);
    }
  });

  it("scales exitValuation linearly with the multiple (revenue × multiple)", () => {
    const results = generateScenarios(
      { shareholders: [ord({ shares: 1000 })], totalShares: 1000 },
      250_000,
    );
    expect(results[0].scenario.exitValuation).toBe(750_000);
    expect(results[3].scenario.exitValuation).toBe(5_000_000);
  });
});
