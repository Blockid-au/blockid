// Vitest coverage for `web/src/lib/cap-table.ts` — the pure priced-round
// dilution engine consumed by (i) `src/lib/term-sheet/analyze.ts` (P10
// term-sheet AI cap-table lens), (ii) `src/app/tools/term-sheet/` (P10
// term-sheet wizard), and (iii) `src/app/tools/cap-table/` (dilution
// calculator). Closes the "no colocated test" gap on a central pure lib
// referenced through the P10 phase-gap matrix — a drift in the pre-money
// ESOP top-up formula, the price derivation, or the founder-dilution
// plain-English selector silently corrupts every founder-facing dilution
// surface, so we pin the branch matrix.

import { describe, expect, it } from "vitest";

import {
  computeDiff,
  demoCapTable,
  type CapTableDiff,
  type Holder,
  type Round,
} from "./cap-table";

const STANDARD_ROUND: Round = {
  preMoneyAud: 10_000_000,
  raiseAud: 2_500_000,
  esopTopUpPct: 12,
  esopTimingPreMoney: true,
  leadInvestorName: "Blackbird",
};

function totalShares(holders: Holder[]): number {
  return holders.reduce((acc, h) => acc + h.shares, 0);
}

function founderShares(holders: Holder[]): number {
  return holders
    .filter((h) => h.isFounder)
    .reduce((acc, h) => acc + h.shares, 0);
}

describe("demoCapTable", () => {
  it("returns the 4-row founder+ESOP+angel fixture", () => {
    const rows = demoCapTable();
    expect(rows).toHaveLength(4);
    expect(rows[0].isFounder).toBe(true);
    expect(rows[1].isFounder).toBe(true);
    expect(rows.find((r) => r.id === "esop")?.shareClass).toBe("esop");
    expect(rows.find((r) => r.id === "angel-1")?.shareClass).toBe("preferred");
  });

  it("totals 10M shares so pct arithmetic reads cleanly in the UI", () => {
    expect(totalShares(demoCapTable())).toBe(10_000_000);
  });
});

describe("computeDiff — standard priced round", () => {
  const diff = computeDiff(demoCapTable(), STANDARD_ROUND);

  it("preserves the before-block share count and holder list", () => {
    expect(diff.before.totalShares).toBe(10_000_000);
    expect(diff.before.holders).toHaveLength(4);
  });

  it("post-money = preMoney + raise (AUD arithmetic)", () => {
    expect(diff.pricing.postMoneyAud).toBe(12_500_000);
  });

  it("emits an investor row and a top-up ESOP delta", () => {
    expect(diff.pricing.investorShares).toBeGreaterThan(0);
    expect(diff.pricing.esopShareesAdded).toBeGreaterThan(0);
    expect(diff.pricing.newSharesIssued).toBe(
      diff.pricing.investorShares + diff.pricing.esopShareesAdded,
    );
  });

  it("investor row appended with leadInvestorName + preferred class", () => {
    const investor = diff.after.holders.find((h) => h.id === "new-investor");
    expect(investor?.name).toBe("Blackbird");
    expect(investor?.shareClass).toBe("preferred");
  });

  it("newSharePrice = preMoney / sharesPostTopUp", () => {
    const currentShares = 10_000_000;
    const sharesPostTopUp = currentShares + diff.pricing.esopShareesAdded;
    expect(diff.pricing.newSharePriceAud).toBeCloseTo(
      10_000_000 / sharesPostTopUp,
      6,
    );
  });

  it("investor lands at ~raise/postMoney % of the post-round cap", () => {
    // 2.5M / 12.5M = 20% invariant of the priced-round math.
    expect(diff.summary.investorPct).toBeGreaterThan(19.5);
    expect(diff.summary.investorPct).toBeLessThan(20.5);
  });

  it("ESOP post-money pct lands within 0.5pp of the 12% target", () => {
    expect(diff.summary.esopAfterPct).toBeGreaterThan(11.5);
    expect(diff.summary.esopAfterPct).toBeLessThan(12.5);
  });

  it("founders dilute (post% < pre%)", () => {
    expect(diff.summary.foundersAfterPct).toBeLessThan(
      diff.summary.foundersBeforePct,
    );
  });

  it("post-round total = pre + esopAdded + investorShares", () => {
    expect(diff.after.totalShares).toBe(
      10_000_000 +
        diff.pricing.esopShareesAdded +
        diff.pricing.investorShares,
    );
  });

  it("preserves isFounder flag on the diffed rows", () => {
    const founderARow = diff.rows.find((r) => r.name === "Founder A");
    expect(founderARow?.isFounder).toBe(true);
  });

  it("flags the new investor row via isNewInvestor", () => {
    const investorRow = diff.rows.find((r) => r.isNewInvestor);
    expect(investorRow?.name).toBe("Blackbird");
    expect(investorRow?.pctBefore).toBe(0);
  });

  it("flags the ESOP row via isEsop", () => {
    const esopRow = diff.rows.find((r) => r.isEsop);
    expect(esopRow?.name).toBe("ESOP pool");
  });

  it("deltaPct = pctAfter - pctBefore across every row", () => {
    for (const row of diff.rows) {
      expect(row.deltaPct).toBeCloseTo(row.pctAfter - row.pctBefore, 6);
    }
  });

  it("post-round pct across all rows sums to ~100", () => {
    const sum = diff.rows.reduce((acc, r) => acc + r.pctAfter, 0);
    expect(sum).toBeGreaterThan(99.9);
    expect(sum).toBeLessThan(100.1);
  });
});

describe("computeDiff — pre-money ESOP top-up mechanics", () => {
  it("does not shrink an already-oversized existing ESOP pool", () => {
    // 25% ESOP pre-round vs 12% target — algorithm clamps esopAdded to 0.
    const holders: Holder[] = [
      { id: "founder-1", name: "Founder A", shares: 7_000_000, shareClass: "common", isFounder: true },
      { id: "esop", name: "ESOP pool", shares: 3_000_000, shareClass: "esop" },
    ];
    const diff = computeDiff(holders, STANDARD_ROUND);
    expect(diff.pricing.esopShareesAdded).toBe(0);
    // Founders diluted only by the investor issue, not the top-up.
  });

  it("synthesizes an ESOP row when the founder-only cap table has none", () => {
    const founderOnly: Holder[] = [
      { id: "founder-1", name: "Founder A", shares: 10_000_000, shareClass: "common", isFounder: true },
    ];
    const diff = computeDiff(founderOnly, STANDARD_ROUND);
    const esop = diff.after.holders.find((h) => h.id === "esop");
    expect(esop).toBeDefined();
    expect(esop?.name).toBe("ESOP pool");
    expect(esop?.shares).toBeGreaterThan(0);
  });

  it("existing (non-ESOP) holders keep their raw share counts post-round", () => {
    const diff = computeDiff(demoCapTable(), STANDARD_ROUND);
    const founderAAfter = diff.after.holders.find((h) => h.id === "founder-1");
    expect(founderAAfter?.shares).toBe(4_500_000);
  });

  it("existing ESOP row absorbs the top-up (its share count grows by esopAdded)", () => {
    const diff = computeDiff(demoCapTable(), STANDARD_ROUND);
    const esopAfter = diff.after.holders.find((h) => h.id === "esop");
    expect(esopAfter?.shares).toBe(800_000 + diff.pricing.esopShareesAdded);
  });

  it("esopTopUpPct is clamped to a 60% ceiling (degenerate targets don't blow up)", () => {
    const heavyRound: Round = { ...STANDARD_ROUND, esopTopUpPct: 999 };
    const diff = computeDiff(demoCapTable(), heavyRound);
    // 999% coerced to 60% ceiling; solver still runs and returns a finite
    // positive top-up rather than throwing / returning NaN.
    expect(Number.isFinite(diff.pricing.esopShareesAdded)).toBe(true);
    expect(diff.pricing.esopShareesAdded).toBeGreaterThan(0);
  });

  it("degenerate solver (target * (1+k) >= 1) clamps esopAdded to 0", () => {
    // target=40%, raise=2×preMoney → k=2 → target*(1+k)=1.2 → denom flips
    // negative. Contract: clamp to 0 rather than emit a negative share count.
    const degenerate: Round = {
      preMoneyAud: 1_000_000,
      raiseAud: 2_000_000,
      esopTopUpPct: 40,
      esopTimingPreMoney: true,
      leadInvestorName: "Solo",
    };
    const diff = computeDiff(demoCapTable(), degenerate);
    expect(diff.pricing.esopShareesAdded).toBe(0);
  });

  it("esopTopUpPct = 0 leaves the pool untouched", () => {
    const noPool: Round = { ...STANDARD_ROUND, esopTopUpPct: 0 };
    const diff = computeDiff(demoCapTable(), noPool);
    expect(diff.pricing.esopShareesAdded).toBe(0);
    const esopAfter = diff.after.holders.find((h) => h.id === "esop");
    expect(esopAfter?.shares).toBe(800_000);
  });
});

describe("computeDiff — defensive input handling", () => {
  it("preMoney = 0 zeroes investorShares but keeps math consistent", () => {
    const zeroPre: Round = { ...STANDARD_ROUND, preMoneyAud: 0 };
    const diff = computeDiff(demoCapTable(), zeroPre);
    expect(diff.pricing.investorShares).toBe(0);
    expect(diff.pricing.newSharePriceAud).toBe(0);
    expect(diff.pricing.postMoneyAud).toBe(STANDARD_ROUND.raiseAud);
  });

  it("negative / non-finite share counts get floored to 0 before math", () => {
    const junk: Holder[] = [
      { id: "founder-1", name: "Founder A", shares: -500, shareClass: "common", isFounder: true },
      { id: "founder-2", name: "Founder B", shares: Number.NaN, shareClass: "common", isFounder: true },
      { id: "founder-3", name: "Founder C", shares: 5_000_000, shareClass: "common", isFounder: true },
    ];
    const diff = computeDiff(junk, STANDARD_ROUND);
    expect(diff.before.holders[0].shares).toBe(0);
    expect(diff.before.holders[1].shares).toBe(0);
    expect(diff.before.holders[2].shares).toBe(5_000_000);
  });

  it("fractional share counts round DOWN via Math.floor", () => {
    const frac: Holder[] = [
      { id: "founder-1", name: "Founder A", shares: 1_000_000.9, shareClass: "common", isFounder: true },
    ];
    const diff = computeDiff(frac, STANDARD_ROUND);
    expect(diff.before.holders[0].shares).toBe(1_000_000);
  });

  it("empty leadInvestorName defaults to 'New investor'", () => {
    const round: Round = { ...STANDARD_ROUND, leadInvestorName: "   " };
    const diff = computeDiff(demoCapTable(), round);
    const investor = diff.after.holders.find((h) => h.id === "new-investor");
    expect(investor?.name).toBe("New investor");
  });

  it("empty cap table divides safely (currentShares floor of 1 guards pct math)", () => {
    // Contract: an empty holder list must not crash and must not emit NaN
    // share counts. investorShares = floor(raise / (preMoney / 1)) so a
    // preMoney of 10M against a 2.5M raise floors to 0 shares.
    const diff = computeDiff([], STANDARD_ROUND);
    expect(diff.pricing.investorShares).toBe(0);
    // before.totalShares reflects the guard floor of 1 so pct-math never
    // divides by zero.
    expect(diff.before.totalShares).toBe(1);
    expect(Number.isFinite(diff.after.totalShares)).toBe(true);
    expect(Number.isFinite(diff.summary.foundersAfterPct)).toBe(true);
  });
});

describe("computeDiff — plainEnglish narrative selector", () => {
  function narrativeFor(round: Round, holders: Holder[] = demoCapTable()): CapTableDiff {
    return computeDiff(holders, round);
  }

  it("standard AU seed→A dilution (15-25pp) picks the market-range closer", () => {
    const diff = narrativeFor({
      preMoneyAud: 8_000_000,
      raiseAud: 2_500_000,
      esopTopUpPct: 12,
      esopTimingPreMoney: true,
      leadInvestorName: "Airtree",
    });
    const founderDelta =
      diff.summary.foundersBeforePct - diff.summary.foundersAfterPct;
    if (founderDelta > 15 && founderDelta <= 25) {
      expect(diff.plainEnglish).toContain("Standard AU seed-to-Series-A dilution");
    }
  });

  it("heavy dilution (>25pp founder drop) picks the negotiate closer", () => {
    // Big pool + small pre-money = heavy founder dilution.
    const diff = narrativeFor({
      preMoneyAud: 3_000_000,
      raiseAud: 3_000_000,
      esopTopUpPct: 20,
      esopTimingPreMoney: true,
      leadInvestorName: "Square Peg",
    });
    const founderDelta =
      diff.summary.foundersBeforePct - diff.summary.foundersAfterPct;
    expect(founderDelta).toBeGreaterThan(25);
    expect(diff.plainEnglish).toContain("Heavy round for the founder team");
  });

  it("light dilution (<=15pp founder drop) picks the strong-pre-money closer", () => {
    const diff = narrativeFor({
      preMoneyAud: 40_000_000,
      raiseAud: 3_000_000,
      esopTopUpPct: 8,
      esopTimingPreMoney: true,
      leadInvestorName: "Blackbird",
    });
    const founderDelta =
      diff.summary.foundersBeforePct - diff.summary.foundersAfterPct;
    expect(founderDelta).toBeLessThanOrEqual(15);
    expect(diff.plainEnglish).toContain("Light dilution for this raise");
  });

  it("narrative quotes the AUD headline in $M form + pct in single-decimal form", () => {
    const diff = narrativeFor(STANDARD_ROUND);
    expect(diff.plainEnglish).toContain("$10.0M pre-money");
    expect(diff.plainEnglish).toContain("$2.5M");
    expect(diff.plainEnglish).toContain("%");
  });
});

describe("computeDiff — cross-consistency invariants", () => {
  it("founder share counts do not change from before to after (only pct does)", () => {
    const diff = computeDiff(demoCapTable(), STANDARD_ROUND);
    expect(founderShares(diff.after.holders)).toBe(
      founderShares(diff.before.holders),
    );
  });

  it("every after-holder id has a matching before row EXCEPT new-investor", () => {
    const diff = computeDiff(demoCapTable(), STANDARD_ROUND);
    const beforeIds = new Set(diff.before.holders.map((h) => h.id));
    for (const after of diff.after.holders) {
      if (after.id === "new-investor") continue;
      expect(beforeIds.has(after.id)).toBe(true);
    }
  });

  it("post-round % founders + investor + esop + angel = 100 (no leakage)", () => {
    const diff = computeDiff(demoCapTable(), STANDARD_ROUND);
    const sum =
      diff.summary.foundersAfterPct +
      diff.summary.investorPct +
      diff.summary.esopAfterPct +
      // Angel row = the remaining preferred rowe.
      (diff.rows.find((r) => r.name === "Angel — Pre-seed")?.pctAfter ?? 0);
    expect(sum).toBeGreaterThan(99.9);
    expect(sum).toBeLessThan(100.1);
  });

  it("larger raise vs same preMoney increases investorPct", () => {
    const small = computeDiff(demoCapTable(), { ...STANDARD_ROUND, raiseAud: 1_000_000 });
    const large = computeDiff(demoCapTable(), { ...STANDARD_ROUND, raiseAud: 5_000_000 });
    expect(large.summary.investorPct).toBeGreaterThan(small.summary.investorPct);
  });

  it("larger preMoney vs same raise reduces investorPct (better founder outcome)", () => {
    const cheap = computeDiff(demoCapTable(), { ...STANDARD_ROUND, preMoneyAud: 5_000_000 });
    const rich = computeDiff(demoCapTable(), { ...STANDARD_ROUND, preMoneyAud: 20_000_000 });
    expect(rich.summary.investorPct).toBeLessThan(cheap.summary.investorPct);
  });
});
