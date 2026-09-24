import { describe, expect, it } from "vitest";
import {
  calculateCfoProjection, calculateCfoRevenue, CfoProjectionInputError,
  type CfoProjectionInput, type CfoProjectionMonthInput, type CfoRevenueDrivers,
} from "./cfo-projection-core";

function month(overrides: Partial<CfoProjectionMonthInput> = {}): CfoProjectionMonthInput {
  return { revenue: 0, cogs: 0, opex: 0, depreciation: 0, capex: 0,
    closingReceivables: 0, closingInventory: 0, closingPayables: 0,
    cashTaxRate: 0, interestExpense: 0, debtDraw: 0, debtRepayment: 0,
    equityFunding: 0, dividends: 0, ...overrides };
}
function input(months = [month()]): CfoProjectionInput {
  return { currency: "AUD", startMonth: "2026-01", months,
    opening: { cash: 0, debt: 0, netFixedAssets: 0, receivables: 0, inventory: 0, payables: 0, taxLossCarryforward: 0 },
    scenario: { id: "fixture", basis: "management", evidenceSetHash: "a".repeat(64), assumptionRefs: ["fixture-assumptions"] } };
}

describe("CFO projection cash and accrual schedules", () => {
  it("reconciles a hand-calculated financing, working capital and tax oracle", () => {
    const request = input([month({ revenue: 1000, cogs: 300, opex: 200,
      depreciation: 40, capex: 100, closingReceivables: 150, closingInventory: 100,
      closingPayables: 80, cashTaxRate: 0.25, interestExpense: 20,
      debtDraw: 100, debtRepayment: 50, equityFunding: 200, dividends: 10 })]);
    request.opening = { cash: 500, debt: 200, netFixedAssets: 400,
      receivables: 100, inventory: 80, payables: 50, taxLossCarryforward: 100 };
    const result = calculateCfoProjection(request);
    const m = result.monthly[0];
    // Net sales cash 950; suppliers 290; opex 200; interest 20; tax 85.
    expect(m.cashCollections).toBe(950);
    expect(m.inventoryPurchases).toBe(320);
    expect(m.cashPaidToSuppliers).toBe(290);
    expect(m.ebitda).toBe(500);
    expect(m.ebit).toBe(460);
    expect(m.pretaxIncome).toBe(440);
    expect(m.taxableIncome).toBe(340);
    expect(m.cashTaxes).toBe(85);
    expect(m.netIncome).toBe(355);
    expect(m.changeInWorkingCapital).toBe(40);
    expect(m.operatingCashFlow).toBe(355);
    expect(m.cashFlowBeforeFinancing).toBe(255);
    expect(m.financingCashFlow).toBe(240);
    expect(m.closing.cash).toBe(995);
    expect(m.closing.debt).toBe(250);
    expect(m.closing.netFixedAssets).toBe(460);
    expect(m.closing.taxLossCarryforward).toBe(0);
    expect(m.closing.modelledBookEquity).toBe(1375);
    expect(m.closing.cash + m.closing.netFixedAssets + m.closing.workingCapital - m.closing.debt).toBe(m.closing.modelledBookEquity);
    expect(result.fundingGap).toEqual({ peakRequiredFunding: 0, firstMonth: null });
  });

  it("does not refund taxes on losses and uses explicitly carried losses in later profit", () => {
    const result = calculateCfoProjection(input([
      month({ opex: 100, cashTaxRate: 0.3 }),
      month({ revenue: 60, cashTaxRate: 0.3 }),
      month({ revenue: 80, cashTaxRate: 0.3 }),
    ]));
    expect(result.monthly.map(m => m.cashTaxes)).toEqual([0, 0, 12]);
    expect(result.monthly.map(m => m.closing.taxLossCarryforward)).toEqual([100, 40, 0]);
    expect(result.monthly.map(m => m.closing.cash)).toEqual([-100, -40, 28]);
    expect(result.fundingGap).toEqual({ peakRequiredFunding: 100, firstMonth: "2026-01" });
    expect(result.annual[0].peakFundingGap).toBe(100); // A positive year-end does not hide a gap.
  });

  it("exposes unfunded cash and never invents a balancing loan", () => {
    const result = calculateCfoProjection(input([month({ capex: 90 }), month({ opex: 40 }), month({ equityFunding: 200 })]));
    expect(result.monthly.map(m => m.closing.cash)).toEqual([-90, -130, 70]);
    expect(result.monthly.map(m => m.closing.debt)).toEqual([0, 0, 0]);
    expect(result.fundingGap.peakRequiredFunding).toBe(130);
    expect(result.monthly[2].revenue).toBe(0); // Fundraising is financing, not revenue.
  });

  it("rolls monthly flows into calendar years without summing balances or annualising partial years", () => {
    const request = input(Array.from({ length: 14 }, () => month({ revenue: 10 })));
    request.startMonth = "2026-12";
    request.opening.cash = 7;
    const result = calculateCfoProjection(request);
    expect(result.annual.map(y => [y.year, y.monthCount, y.completeYear, y.revenue])).toEqual([
      [2026, 1, false, 10], [2027, 12, true, 120], [2028, 1, false, 10],
    ]);
    expect(result.annual.map(y => [y.opening.cash, y.closing.cash])).toEqual([[7, 17], [17, 137], [137, 147]]);
    for (const row of result.monthly) {
      expect(row.closing.cash - row.opening.cash).toBeCloseTo(row.netCashFlow, 10);
      expect(row.closing.modelledBookEquity).toBeCloseTo(row.closing.cash + row.closing.netFixedAssets + row.closing.workingCapital - row.closing.debt, 10);
    }
  });

  it("supports 60 explicit months for valuation rollups without making a terminal forecast", () => {
    const result = calculateCfoProjection(input(Array.from({ length: 60 }, () => month({ revenue: 100 }))));
    expect(result.annual).toHaveLength(5);
    expect(result.annual.map(y => y.revenue)).toEqual([1200, 1200, 1200, 1200, 1200]);
    expect(result).not.toHaveProperty("terminalValue");
  });

  it("preserves explicit zero and scenario provenance without mutating inputs", () => {
    const request = input();
    const before = structuredClone(request);
    expect(calculateCfoProjection(request).monthly[0].closing.cash).toBe(0);
    const result = calculateCfoProjection(request);
    result.scenario.assumptionRefs.push("changed-output");
    expect(request).toEqual(before);
    expect(result.limitations.join(" ")).toContain("not fully integrated three statements");
    expect(result.limitations.join(" ")).toContain("not FCFF");
  });

  it("keeps separate driver scenarios on the same deterministic engine", () => {
    const run = (basis: "bear" | "assessed" | "bull", revenue: number) => {
      const request = input([month({ revenue, opex: 100 })]);
      request.scenario.basis = basis;
      return calculateCfoProjection(request);
    };
    expect([run("bear", 50), run("assessed", 100), run("bull", 150)].map(r => r.monthly[0].closing.cash)).toEqual([-50, 0, 50]);
    expect(calculateCfoProjection(input())).toEqual(calculateCfoProjection(input()));
  });
});

describe("projection input gates", () => {
  it.each([undefined, null, NaN, Infinity, -1, "0"])("rejects missing/invalid revenue %s instead of substituting zero", value => {
    const request = input();
    request.months[0].revenue = value as number;
    expect(() => calculateCfoProjection(request)).toThrow(CfoProjectionInputError);
  });
  it.each(["2026-00", "2026-13", "26-01", "2026-01-01", "0000-01"])("rejects invalid start month %s", startMonth => {
    expect(() => calculateCfoProjection({ ...input(), startMonth })).toThrow("startMonth");
  });
  it("rejects missing schedules and provenance", () => {
    expect(() => calculateCfoProjection(input([]))).toThrow("months");
    const request = input();
    request.scenario.assumptionRefs = [];
    expect(() => calculateCfoProjection(request)).toThrow("assumptionRefs");
    request.scenario.assumptionRefs = ["source"];
    request.scenario.evidenceSetHash = "unbound";
    expect(() => calculateCfoProjection(request)).toThrow("evidenceSetHash");
  });
  it.each([
    [{ cashTaxRate: 30 }, "cashTaxRate"],
    [{ debtRepayment: 1 }, "debtRepayment"],
    [{ depreciation: 1 }, "depreciation"],
    [{ closingReceivables: 1 }, "closingReceivables"],
    [{ closingPayables: 1 }, "closingPayables"],
  ] as const)("rejects impossible schedule %j", (overrides, field) => {
    expect(() => calculateCfoProjection(input([month(overrides)]))).toThrow(field);
  });
  it("rejects unexplained inventory depletion", () => {
    const request = input();
    request.opening.inventory = 100;
    expect(() => calculateCfoProjection(request)).toThrow("closingInventory");
  });
  it("rejects overflow instead of persisting infinite amounts", () => {
    const request = input([month({ revenue: Number.MAX_VALUE, equityFunding: Number.MAX_VALUE })]);
    expect(() => calculateCfoProjection(request)).toThrow("overflow");
  });
});

describe("explicit revenue templates", () => {
  it.each([
    [{ model: "subscription", recognition: "month_start", openingMrr: 100, newMrr: 20, expansionMrr: 10, churnMrr: 5, contractionMrr: 2 }, 123],
    [{ model: "marketplace", grossMerchandiseValue: 1000, refundRate: 0.1, takeRate: 0.2 }, 180],
    [{ model: "services", headcount: 2, workingHoursPerPerson: 160, utilisation: 0.75, hourlyRate: 100 }, 24000],
    [{ model: "commerce", units: 100, capacityUnits: 120, unitPrice: 10, discountRate: 0.1, returnRate: 0.1 }, 810],
    [{ model: "pre_revenue", revenue: 0, milestoneRefs: ["launch-plan"] }, 0],
    [{ model: "custom_reviewed", revenue: 321, reviewReference: "review-1" }, 321],
  ] satisfies [CfoRevenueDrivers, number][])("calculates %j with a numeric oracle", (drivers, expected) => {
    expect(calculateCfoRevenue(drivers).revenue).toBeCloseTo(expected, 10);
  });
  it("rejects impossible capacity, loss rates, missing drivers and unsupported models", () => {
    expect(() => calculateCfoRevenue({ model: "commerce", units: 2, capacityUnits: 1, unitPrice: 10, discountRate: 0, returnRate: 0 })).toThrow("capacity");
    expect(() => calculateCfoRevenue({ model: "subscription", recognition: "month_start", openingMrr: 100, newMrr: 200, expansionMrr: 0, churnMrr: 101, contractionMrr: 0 })).toThrow("opening recurring revenue");
    expect(() => calculateCfoRevenue({ model: "marketplace", grossMerchandiseValue: 100, refundRate: 0, takeRate: 2 })).toThrow("fraction");
    expect(() => calculateCfoRevenue({ model: "services" } as CfoRevenueDrivers)).toThrow("headcount");
    expect(() => calculateCfoRevenue({ model: "TAM_percent" } as unknown as CfoRevenueDrivers)).toThrow("unsupported model");
  });
});
