import { describe, it, expect } from "vitest";
import {
  calculateRound,
  type CapTableData,
  type FundraiseRound,
  type ShareholderRow,
} from "./fundraise";

// Colocated vitest for the pure priced-round / SAFE / convertible-note
// dilution engine. Pairs with the P5 cap-table + equity-split lib tests
// already shipped under docs/plans/atlassian-standard-mapping-goal.md; the
// fundraise engine drives the founder-facing dilution modelling on the
// investor-readiness surfaces the atlassian showcase walks through
// (Phase 6+ round modelling / term-sheet analyze co-consumer).

function holder(
  id: string,
  name: string,
  shares: number,
  role: string = "Founder",
): ShareholderRow {
  return { id, name, email: null, role, shares_held: shares };
}

const FOUNDERS: ShareholderRow[] = [
  holder("f1", "Alice", 600_000),
  holder("f2", "Bob", 400_000),
];

const CAP_NO_ESOP: CapTableData = {
  shareholders: FOUNDERS,
  esopPool: null,
};

const CAP_WITH_ESOP: CapTableData = {
  shareholders: FOUNDERS,
  esopPool: { total_pool_shares: 100_000, allocated_shares: 20_000 },
};

const PRICED_SEED: FundraiseRound = {
  roundName: "Seed",
  targetAmount: 1_000_000,
  preMoneyValuation: 4_000_000,
  instrumentType: "priced",
};

describe("calculateRound — priced round basics", () => {
  it("computes share price as pre-money ÷ fully-diluted-before (no ESOP)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    // 4,000,000 / 1,000,000 = 4.0000 per share
    expect(r.sharePrice).toBe(4);
  });

  it("issues new shares = round.targetAmount ÷ effective share price (rounded)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    // 1,000,000 / 4 = 250,000 new shares
    expect(r.newShares).toBe(250_000);
  });

  it("dilutionPct = newShares ÷ totalSharesAfter × 100 (2dp)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    // 250,000 / 1,250,000 = 20.00
    expect(r.dilutionPct).toBe(20);
  });

  it("post-money valuation = effectivePreMoney + targetAmount", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.postMoneyValuation).toBe(5_000_000);
  });

  it("totalSharesAfter = fullyDilutedBefore + newShares", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.newCapTable.totalSharesAfter).toBe(1_250_000);
  });

  it("existing shareholders keep their absolute share count (sharesAfter === sharesBefore)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    for (const row of r.dilutionTable) {
      expect(row.sharesAfter).toBe(row.sharesBefore);
    }
  });

  it("each holder's pctBefore matches ownership fraction before the round", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    // Alice 600k / 1M = 60.00, Bob 400k / 1M = 40.00
    expect(r.dilutionTable[0].pctBefore).toBe(60);
    expect(r.dilutionTable[1].pctBefore).toBe(40);
  });

  it("each holder's pctAfter reflects post-round dilution", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    // 600k / 1.25M = 48.00, 400k / 1.25M = 32.00
    expect(r.dilutionTable[0].pctAfter).toBe(48);
    expect(r.dilutionTable[1].pctAfter).toBe(32);
  });

  it("dilutionPct per holder = pctBefore − pctAfter (2dp)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.dilutionTable[0].dilutionPct).toBe(12);
    expect(r.dilutionTable[1].dilutionPct).toBe(8);
  });

  it("dilutionTable preserves shareholder order", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.dilutionTable.map((d) => d.name)).toEqual(["Alice", "Bob"]);
  });
});

describe("calculateRound — newInvestorBlock", () => {
  it("uses the round name in the block label", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.newCapTable.newInvestorBlock.name).toBe("Seed Investors");
  });

  it("newInvestorBlock.shares === newShares", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.newCapTable.newInvestorBlock.shares).toBe(r.newShares);
  });

  it("newInvestorBlock.pct === round dilutionPct", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.newCapTable.newInvestorBlock.pct).toBe(r.dilutionPct);
  });
});

describe("calculateRound — ESOP handling", () => {
  it("includes total ESOP pool shares in the fully-diluted-before denominator", () => {
    const r = calculateRound(PRICED_SEED, CAP_WITH_ESOP);
    // fully diluted before = 1M founders + 100k ESOP pool = 1.1M
    // share price = 4M / 1.1M = 3.6364
    expect(r.sharePrice).toBeCloseTo(3.6364, 3);
  });

  it("emits an esop entry when a pool exists", () => {
    const r = calculateRound(PRICED_SEED, CAP_WITH_ESOP);
    expect(r.newCapTable.esop).not.toBeNull();
    expect(r.newCapTable.esop!.shares).toBe(100_000);
  });

  it("null esopPool ⇒ newCapTable.esop === null (no invented pool)", () => {
    const r = calculateRound(PRICED_SEED, CAP_NO_ESOP);
    expect(r.newCapTable.esop).toBeNull();
  });

  it("esop pct dilutes across the round (pctAfter < pctBefore)", () => {
    const r = calculateRound(PRICED_SEED, CAP_WITH_ESOP);
    const esop = r.newCapTable.esop!;
    expect(esop.pctAfter).toBeLessThan(esop.pctBefore);
  });

  it("uses TOTAL pool shares (not allocated) for dilution math — matches fully-diluted convention", () => {
    // If the engine used allocated_shares (20k) the denominator would be
    // 1.02M, share price 3.9216. Using total_pool_shares (100k) yields 3.6364.
    const r = calculateRound(PRICED_SEED, CAP_WITH_ESOP);
    expect(r.sharePrice).toBeCloseTo(3.6364, 3);
    expect(r.sharePrice).not.toBeCloseTo(3.9216, 3);
  });
});

describe("calculateRound — SAFE with cap", () => {
  it("uses min(preMoney, cap) as the effective pre-money when cap is set", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 500_000,
      preMoneyValuation: 8_000_000,
      instrumentType: "safe",
      safeCap: 5_000_000,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // effective pre-money = min(8M, 5M) = 5M → share price = 5M / 1M = 5
    expect(r.sharePrice).toBe(5);
    // post-money uses effective pre-money too
    expect(r.postMoneyValuation).toBe(5_500_000);
  });

  it("uses preMoney unchanged when cap > preMoney", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 500_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "safe",
      safeCap: 10_000_000,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(4);
    expect(r.postMoneyValuation).toBe(4_500_000);
  });

  it("ignores cap when instrument type is priced (priced rounds don't have caps)", () => {
    const round: FundraiseRound = {
      roundName: "Seed",
      targetAmount: 500_000,
      preMoneyValuation: 8_000_000,
      instrumentType: "priced",
      safeCap: 5_000_000, // should be ignored
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(8); // 8M / 1M
  });
});

describe("calculateRound — SAFE / convertible discount", () => {
  it("applies discount to the share price (investor gets cheaper shares → more shares)", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 1_000_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "safe",
      safeDiscount: 20,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // base share price = 4M / 1M = 4; effective = 4 * (1 - 0.20) = 3.2
    expect(r.sharePrice).toBe(3.2);
    // new shares = 1M / 3.2 = 312,500
    expect(r.newShares).toBe(312_500);
  });

  it("does NOT apply discount for a priced round even if safeDiscount is set", () => {
    const round: FundraiseRound = {
      roundName: "Seed",
      targetAmount: 1_000_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "priced",
      safeDiscount: 20, // should be ignored for priced
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(4);
    expect(r.newShares).toBe(250_000);
  });

  it("safeDiscount === 0 ⇒ no discount applied (uses base share price)", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 1_000_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "safe",
      safeDiscount: 0,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(4);
  });

  it("undefined safeDiscount ⇒ no discount applied", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 1_000_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "safe",
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(4);
  });

  it("cap + discount compose: cap trims pre-money first, then discount trims share price", () => {
    const round: FundraiseRound = {
      roundName: "SAFE",
      targetAmount: 500_000,
      preMoneyValuation: 8_000_000,
      instrumentType: "safe",
      safeCap: 5_000_000,
      safeDiscount: 20,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // effective pre-money = 5M → base price = 5; discounted = 4
    expect(r.sharePrice).toBe(4);
    expect(r.newShares).toBe(125_000);
  });
});

describe("calculateRound — convertible note parity with SAFE", () => {
  it("convertible_note honours cap identically to safe", () => {
    const round: FundraiseRound = {
      roundName: "Note",
      targetAmount: 500_000,
      preMoneyValuation: 8_000_000,
      instrumentType: "convertible_note",
      safeCap: 5_000_000,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(r.sharePrice).toBe(5);
  });

  it("convertible_note honours discount identically to safe", () => {
    const round: FundraiseRound = {
      roundName: "Note",
      targetAmount: 1_000_000,
      preMoneyValuation: 4_000_000,
      instrumentType: "convertible_note",
      safeDiscount: 25,
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // 4 * (1 - 0.25) = 3
    expect(r.sharePrice).toBe(3);
  });
});

describe("calculateRound — guards & rounding", () => {
  it("throws when the fully-diluted-before total is zero (no founders + no ESOP)", () => {
    const empty: CapTableData = { shareholders: [], esopPool: null };
    expect(() => calculateRound(PRICED_SEED, empty)).toThrow(
      /zero existing shares/,
    );
  });

  it("throws when founder shares are zero AND esopPool is null", () => {
    const empty: CapTableData = {
      shareholders: [holder("x", "Zero", 0)],
      esopPool: null,
    };
    expect(() => calculateRound(PRICED_SEED, empty)).toThrow();
  });

  it("does NOT throw when founder shares are zero but ESOP pool exists", () => {
    const zeroFounders: CapTableData = {
      shareholders: [holder("x", "Zero", 0)],
      esopPool: { total_pool_shares: 100_000, allocated_shares: 0 },
    };
    expect(() => calculateRound(PRICED_SEED, zeroFounders)).not.toThrow();
  });

  it("sharePrice rounds to 4 decimal places", () => {
    // Force a repeating decimal
    const round: FundraiseRound = {
      roundName: "Seed",
      targetAmount: 100_000,
      preMoneyValuation: 3_333_333,
      instrumentType: "priced",
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // 3,333,333 / 1,000,000 = 3.333333 → rounds to 3.3333
    expect(r.sharePrice).toBe(3.3333);
  });

  it("dilutionPct rounds to 2 decimal places", () => {
    const round: FundraiseRound = {
      roundName: "Odd",
      targetAmount: 111_111,
      preMoneyValuation: 4_000_000,
      instrumentType: "priced",
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    // 27,778 / 1,027,778 ≈ 2.7027 → 2.7
    expect(Number.isFinite(r.dilutionPct)).toBe(true);
    // Check 2dp: no more than 2 decimals present
    expect(r.dilutionPct.toString()).toMatch(/^\d+(\.\d{1,2})?$/);
  });

  it("newShares rounds to a whole integer (no fractional shares)", () => {
    const round: FundraiseRound = {
      roundName: "Odd",
      targetAmount: 100_001,
      preMoneyValuation: 3_000_000,
      instrumentType: "priced",
    };
    const r = calculateRound(round, CAP_NO_ESOP);
    expect(Number.isInteger(r.newShares)).toBe(true);
  });
});

describe("calculateRound — invariants across scenarios", () => {
  const scenarios: Array<{ label: string; round: FundraiseRound; cap: CapTableData }> = [
    { label: "priced no-esop", round: PRICED_SEED, cap: CAP_NO_ESOP },
    { label: "priced with-esop", round: PRICED_SEED, cap: CAP_WITH_ESOP },
    {
      label: "SAFE cap+discount",
      round: {
        roundName: "SAFE",
        targetAmount: 500_000,
        preMoneyValuation: 8_000_000,
        instrumentType: "safe",
        safeCap: 5_000_000,
        safeDiscount: 20,
      },
      cap: CAP_WITH_ESOP,
    },
  ];

  for (const { label, round, cap } of scenarios) {
    it(`[${label}] every dilution row has sharesAfter === sharesBefore`, () => {
      const r = calculateRound(round, cap);
      for (const row of r.dilutionTable) {
        expect(row.sharesAfter).toBe(row.sharesBefore);
      }
    });

    it(`[${label}] every holder is at least as diluted after (pctAfter ≤ pctBefore)`, () => {
      const r = calculateRound(round, cap);
      for (const row of r.dilutionTable) {
        expect(row.pctAfter).toBeLessThanOrEqual(row.pctBefore);
      }
    });

    it(`[${label}] totalSharesAfter equals sum of holders + esop + newShares`, () => {
      const r = calculateRound(round, cap);
      const holderSum = cap.shareholders.reduce(
        (s, h) => s + Number(h.shares_held),
        0,
      );
      const esopSum = cap.esopPool
        ? Number(cap.esopPool.total_pool_shares)
        : 0;
      expect(r.newCapTable.totalSharesAfter).toBe(
        holderSum + esopSum + r.newShares,
      );
    });

    it(`[${label}] newCapTable.shareholders is the same array as dilutionTable`, () => {
      const r = calculateRound(round, cap);
      expect(r.newCapTable.shareholders).toBe(r.dilutionTable);
    });
  }
});
