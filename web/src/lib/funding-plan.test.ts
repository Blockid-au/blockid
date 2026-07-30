import { describe, it, expect } from "vitest";
import {
  computeFundingPlan,
  type FundingPlanInput,
  type FounderContribution,
} from "./funding-plan";

const baseFounder = (id: string, cash: number, equityPct?: number): FounderContribution => ({
  id,
  name: `Founder ${id}`,
  cashAud: cash,
  equityPct,
});

const baseInput = (overrides: Partial<FundingPlanInput> = {}): FundingPlanInput => ({
  cofounderCount: 2,
  monthlyWageAud: 5000,
  sweatFirstSixMonths: false,
  monthlyToolsAud: 500,
  monthlyMarketingAud: 1000,
  legalOneOffAud: 3000,
  bufferPct: 10,
  runwayMonths: 12,
  founders: [baseFounder("a", 25000), baseFounder("b", 15000)],
  preMoneyAud: 800_000,
  esopPct: 10,
  raiseType: "ff_safe",
  ...overrides,
});

describe("computeFundingPlan — burn breakdown", () => {
  it("computes monthly wage subtotal = cofounderCount * monthlyWageAud", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.monthlyWageSubtotalAud).toBe(2 * 5000);
  });

  it("computes monthly opex subtotal = tools + marketing", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.monthlyOpexSubtotalAud).toBe(500 + 1000);
  });

  it("monthlyBurnAud is wage + opex subtotals", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.monthlyBurnAud).toBe(r.monthlyWageSubtotalAud + r.monthlyOpexSubtotalAud);
  });

  it("burnBeforeBufferAud = wages*runway + opex*runway (no sweat)", () => {
    const r = computeFundingPlan(baseInput({ runwayMonths: 12 }));
    const expected = 2 * 5000 * 12 + (500 + 1000) * 12;
    expect(r.burnBeforeBufferAud).toBe(expected);
  });

  it("sweatFirstSixMonths=true skips the first 6 months of wages", () => {
    const r = computeFundingPlan(baseInput({ sweatFirstSixMonths: true, runwayMonths: 12 }));
    const expectedWages = 2 * 5000 * (12 - 6);
    const expectedOpex = (500 + 1000) * 12;
    expect(r.burnBeforeBufferAud).toBe(expectedWages + expectedOpex);
  });

  it("sweatFirstSixMonths=true with runway<=6 zeroes wages entirely", () => {
    const r = computeFundingPlan(baseInput({ sweatFirstSixMonths: true, runwayMonths: 6 }));
    const expectedOpex = (500 + 1000) * 6;
    expect(r.burnBeforeBufferAud).toBe(expectedOpex);
  });

  it("bufferAud = burnBeforeBuffer * bufferPct/100", () => {
    const r = computeFundingPlan(baseInput({ bufferPct: 20 }));
    expect(r.bufferAud).toBeCloseTo(r.burnBeforeBufferAud * 0.2, 6);
  });

  it("totalNeedAud = burnBeforeBuffer + buffer + legalOneOff", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.totalNeedAud).toBeCloseTo(r.burnBeforeBufferAud + r.bufferAud + 3000, 6);
  });
});

describe("computeFundingPlan — input clamps", () => {
  it("clamps cofounderCount below 1 up to 1", () => {
    const r = computeFundingPlan(baseInput({ cofounderCount: 0 }));
    expect(r.monthlyWageSubtotalAud).toBe(1 * 5000);
  });

  it("clamps cofounderCount above 5 down to 5", () => {
    const r = computeFundingPlan(baseInput({ cofounderCount: 99 }));
    expect(r.monthlyWageSubtotalAud).toBe(5 * 5000);
  });

  it("floors cofounderCount to integer", () => {
    const r = computeFundingPlan(baseInput({ cofounderCount: 2.9 }));
    expect(r.monthlyWageSubtotalAud).toBe(2 * 5000);
  });

  it("clamps bufferPct >100 down to 100", () => {
    const r = computeFundingPlan(baseInput({ bufferPct: 500 }));
    expect(r.bufferAud).toBeCloseTo(r.burnBeforeBufferAud, 6);
  });

  it("clamps bufferPct <0 up to 0", () => {
    const r = computeFundingPlan(baseInput({ bufferPct: -50 }));
    expect(r.bufferAud).toBe(0);
  });

  it("floors runwayMonths and enforces minimum of 1", () => {
    const r = computeFundingPlan(baseInput({ runwayMonths: 0 }));
    expect(r.burnBeforeBufferAud).toBe(2 * 5000 * 1 + (500 + 1000) * 1);
  });

  it("treats Infinity as 0 via safeNum", () => {
    const r = computeFundingPlan(baseInput({ monthlyWageAud: Infinity }));
    expect(r.monthlyWageSubtotalAud).toBe(0);
  });

  it("treats NaN as 0 via safeNum", () => {
    const r = computeFundingPlan(baseInput({ legalOneOffAud: Number.NaN }));
    expect(r.totalNeedAud).toBeCloseTo(r.burnBeforeBufferAud + r.bufferAud, 6);
  });

  it("clamps negative preMoney up to 0 (post-money then equals externalRaise)", () => {
    const r = computeFundingPlan(baseInput({ preMoneyAud: -100_000, esopPct: 0 }));
    expect(r.recommended.preMoneyAud).toBe(0);
    expect(r.postMoneyAud).toBe(r.externalRaiseAud);
  });
});

describe("computeFundingPlan — cap stack + split", () => {
  it("founderCapitalPooledAud sums positive cash values", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.founderCapitalPooledAud).toBe(25000 + 15000);
  });

  it("clamps negative founder cash to 0 when pooling", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", -5000), baseFounder("b", 10000)],
      }),
    );
    expect(r.founderCapitalPooledAud).toBe(10000);
  });

  it("externalRaiseAud = totalNeed - founderPool, clamped at 0", () => {
    const r = computeFundingPlan(baseInput());
    const expected = Math.max(0, r.totalNeedAud - r.founderCapitalPooledAud);
    expect(r.externalRaiseAud).toBe(expected);
  });

  it("externalRaiseAud is 0 when founder pool exceeds total need", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", 5_000_000)],
        cofounderCount: 1,
      }),
    );
    expect(r.externalRaiseAud).toBe(0);
  });

  it("postMoneyAud = preMoney + externalRaise", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.postMoneyAud).toBeCloseTo(800_000 + r.externalRaiseAud, 4);
  });

  it("investor%, esop% and founder% sum to 100 on a live raise", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.investorPct + r.esopPct + r.founderPctAfter).toBeCloseTo(100, 4);
  });

  it("post-money=0 fallback yields founder% = 100 - esop%", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [],
        cofounderCount: 1,
        monthlyWageAud: 0,
        monthlyToolsAud: 0,
        monthlyMarketingAud: 0,
        legalOneOffAud: 0,
        bufferPct: 0,
        preMoneyAud: 0,
        esopPct: 12,
      }),
    );
    expect(r.postMoneyAud).toBe(0);
    expect(r.investorPct).toBe(0);
    expect(r.esopPct).toBe(12);
    expect(r.founderPctAfter).toBe(88);
  });

  it("investorPct is scaled down by (1 - esopFraction)", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [],
        preMoneyAud: 900_000,
        esopPct: 10,
      }),
    );
    const raise = r.externalRaiseAud;
    const expectedInvestor = ((raise / (900_000 + raise)) * (1 - 0.1)) * 100;
    expect(r.investorPct).toBeCloseTo(expectedInvestor, 4);
  });

  it("clamps esopPct target above 100 down to 100", () => {
    const r = computeFundingPlan(baseInput({ esopPct: 250, founders: [] }));
    expect(r.esopPct).toBe(100);
    expect(r.founderPctAfter).toBe(0);
  });
});

describe("computeFundingPlan — per-founder dilution", () => {
  it("splits equity equally when no equityPct provided", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.founderRows.every((row) => row.equityBeforePct === 50)).toBe(true);
  });

  it("uses weighted equityPct when provided (normalised to sum)", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", 25000, 70), baseFounder("b", 15000, 30)],
      }),
    );
    const [a, b] = r.founderRows;
    expect(a.equityBeforePct).toBeCloseTo(70, 4);
    expect(b.equityBeforePct).toBeCloseTo(30, 4);
  });

  it("normalises equityPct rows whose sum != 100", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", 0, 20), baseFounder("b", 0, 20)],
      }),
    );
    // 20/40 = 50% each
    expect(r.founderRows[0].equityBeforePct).toBeCloseTo(50, 4);
    expect(r.founderRows[1].equityBeforePct).toBeCloseTo(50, 4);
  });

  it("equityAfterPct = (before/100) * founderPctAfter", () => {
    const r = computeFundingPlan(baseInput());
    for (const row of r.founderRows) {
      expect(row.equityAfterPct).toBeCloseTo(
        (row.equityBeforePct / 100) * r.founderPctAfter,
        4,
      );
    }
  });

  it("diluted = before - after and is non-negative on a real raise", () => {
    const r = computeFundingPlan(baseInput());
    for (const row of r.founderRows) {
      expect(row.diluted).toBeCloseTo(row.equityBeforePct - row.equityAfterPct, 4);
      expect(row.diluted).toBeGreaterThanOrEqual(0);
    }
  });

  it("carries the founder's cashAud onto the dilution row", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.founderRows.map((f) => f.cashAud)).toEqual([25000, 15000]);
  });
});

describe("computeFundingPlan — SAFE suggestion", () => {
  it("ff_safe returns 20% discount and 1.5x cap", () => {
    const r = computeFundingPlan(baseInput({ raiseType: "ff_safe" }));
    expect(r.safe.discountPct).toBe(20);
    expect(r.safe.capAud).toBe(800_000 * 1.5);
  });

  it("preseed_vc tightens to 15% discount and 1.25x cap", () => {
    const r = computeFundingPlan(baseInput({ raiseType: "preseed_vc" }));
    expect(r.safe.discountPct).toBe(15);
    expect(r.safe.capAud).toBe(800_000 * 1.25);
  });

  it("angel uses 20% discount and 1.4x cap", () => {
    const r = computeFundingPlan(baseInput({ raiseType: "angel" }));
    expect(r.safe.discountPct).toBe(20);
    expect(r.safe.capAud).toBeCloseTo(800_000 * 1.4, 6);
  });
});

describe("computeFundingPlan — scenarios", () => {
  it("emits 4 scenarios in canonical order", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.scenarios.map((s) => s.label)).toEqual([
      "Smaller raise (60%)",
      "Recommended",
      "Bigger raise (140%)",
      "Full bootstrap",
    ]);
  });

  it("Smaller raise scenario = 60% of recommended raise", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.scenarios[0].externalRaiseAud).toBeCloseTo(r.externalRaiseAud * 0.6, 4);
  });

  it("Bigger raise scenario = 140% of recommended raise", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.scenarios[2].externalRaiseAud).toBeCloseTo(r.externalRaiseAud * 1.4, 4);
  });

  it("Full bootstrap scenario has zero external raise", () => {
    const r = computeFundingPlan(baseInput());
    const bootstrap = r.scenarios[3];
    expect(bootstrap.externalRaiseAud).toBe(0);
    expect(bootstrap.investorPct).toBe(0);
  });

  it("Recommended scenario echoes the top-level externalRaiseAud", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.scenarios[1].externalRaiseAud).toBe(r.externalRaiseAud);
    expect(r.scenarios[1].postMoneyAud).toBe(r.postMoneyAud);
  });
});

describe("computeFundingPlan — risk flags", () => {
  it("warns when total need exceeds A$500k", () => {
    const r = computeFundingPlan(
      baseInput({
        monthlyWageAud: 20_000,
        runwayMonths: 24,
      }),
    );
    expect(r.flags.some((f) => f.level === "warn" && f.message.includes("$500k"))).toBe(true);
  });

  it("does not fire the 500k warn on a modest plan", () => {
    const r = computeFundingPlan(
      baseInput({
        monthlyWageAud: 1000,
        monthlyToolsAud: 0,
        monthlyMarketingAud: 0,
        legalOneOffAud: 0,
        runwayMonths: 6,
      }),
    );
    expect(r.flags.find((f) => f.message.includes("$500k"))).toBeUndefined();
  });

  it("warns when one of >1 founders contributes >50% of pooled cash", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", 90_000), baseFounder("b", 10_000)],
      }),
    );
    expect(r.flags.some((f) => f.message.includes("more than 50%"))).toBe(true);
  });

  it("does not fire the >50% cash warn for a single-founder plan", () => {
    const r = computeFundingPlan(
      baseInput({
        cofounderCount: 1,
        founders: [baseFounder("a", 90_000)],
      }),
    );
    expect(r.flags.find((f) => f.message.includes("more than 50%"))).toBeUndefined();
  });

  it("warns when ESOP target is below 8%", () => {
    const r = computeFundingPlan(baseInput({ esopPct: 5 }));
    expect(r.flags.some((f) => f.message.includes("ESOP pool below 8%"))).toBe(true);
  });

  it("does not fire the ESOP<8% warn when target is exactly 8%", () => {
    const r = computeFundingPlan(baseInput({ esopPct: 8 }));
    expect(r.flags.find((f) => f.message.includes("ESOP pool below 8%"))).toBeUndefined();
  });

  it("emits an info flag when founders cover full runway (no external raise, non-zero need)", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [baseFounder("a", 1_000_000)],
        cofounderCount: 1,
      }),
    );
    expect(r.externalRaiseAud).toBe(0);
    expect(r.flags.some((f) => f.level === "info" && f.message.includes("Founders cover full runway"))).toBe(
      true,
    );
  });

  it("does not emit the bootstrap info flag when total need is 0", () => {
    const r = computeFundingPlan(
      baseInput({
        founders: [],
        cofounderCount: 1,
        monthlyWageAud: 0,
        monthlyToolsAud: 0,
        monthlyMarketingAud: 0,
        legalOneOffAud: 0,
        bufferPct: 0,
      }),
    );
    expect(r.flags.find((f) => f.message.includes("Founders cover full runway"))).toBeUndefined();
  });
});

describe("computeFundingPlan — recommended headline", () => {
  it("echoes preMoney and raise, and reports dilution = investor% + esop%", () => {
    const r = computeFundingPlan(baseInput());
    expect(r.recommended.raiseAud).toBe(r.externalRaiseAud);
    expect(r.recommended.preMoneyAud).toBe(800_000);
    expect(r.recommended.dilutionPct).toBeCloseTo(r.investorPct + r.esopPct, 4);
  });
});
