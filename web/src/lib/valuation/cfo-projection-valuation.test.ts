import { describe, expect, it } from "vitest";
import { calculateCfoProjection, type CfoProjectionMonthInput } from "./cfo-projection-core";
import { evaluateCfoProjectionValuation, type CfoProjectionValuationInput } from "./cfo-projection-valuation";
import type { CfoEvidence } from "./cfo-methodology-core";

const evidence: CfoEvidence = { id: "forecast", entityId: "business-1", revision: "rev-1", observedAt: "2026-06-30",
  reference: "forecast-workbook", locator: "Monthly!A1:Z25", status: "management_stated" };
function month(overrides: Partial<CfoProjectionMonthInput> = {}): CfoProjectionMonthInput {
  return { revenue: 100, cogs: 0, opex: 0, depreciation: 0, capex: 0,
    closingReceivables: 0, closingInventory: 0, closingPayables: 0, cashTaxRate: 0,
    interestExpense: 0, debtDraw: 0, debtRepayment: 0, equityFunding: 0, dividends: 0, ...overrides };
}
function request(months = Array.from({ length: 24 }, () => month())): CfoProjectionValuationInput {
  return {
    projection: calculateCfoProjection({ currency: "AUD", startMonth: "2026-07",
      opening: { cash: 0, debt: 0, netFixedAssets: 0, receivables: 0, inventory: 0, payables: 0, taxLossCarryforward: 0 },
      months, scenario: { id: "base", basis: "management", evidenceSetHash: "a".repeat(64), assumptionRefs: ["forecast"] } }),
    context: { entityId: "business-1", evidenceRevision: "rev-1", valuationDate: "2026-07-01", currency: "AUD", priceBasis: "nominal" },
    binding: { entityId: "business-1", evidenceRevision: "rev-1", evidenceSetHash: "a".repeat(64), projectionEvidence: { ...evidence } },
    timingConvention: "monthly_cash_flows_aggregated_to_annual_end_period",
    cashFlowPriceBasis: "nominal", ratePriceBasis: "nominal",
    discountRate: { value: 0.1, unit: "annual_decimal", evidence: { ...evidence, id: "cost-of-equity", status: "assumed", rationale: "Explicit fixture rate, not a market benchmark" } },
    terminalPolicy: "finite_life", finiteLifeEvidence: { ...evidence, id: "cessation", rationale: "Fixture ends after contracted operations; no remaining assets or liabilities" },
  };
}

describe("projection to FCFE adapter", () => {
  it("uses rolling 12-month years despite partial calendar-year projection rollups", () => {
    const input = request();
    expect(input.projection.annual.map(y => y.monthCount)).toEqual([6, 12, 6]);
    const result = evaluateCfoProjectionValuation(input);
    expect(result.status).toBe("scenario_only");
    if (result.status !== "scenario_only") return;
    expect(result.annualFlows.map(y => [y.year, y.startMonth, y.endMonth, y.fcfe])).toEqual([
      [1, "2026-07", "2027-06", 1200], [2, "2027-07", "2028-06", 1200],
    ]);
    expect(result.methodResult.values.equityValue).toBeCloseTo(1200 / 1.1 + 1200 / 1.21, 10);
    expect(result.methodResult.values.enterpriseValue).toBeUndefined();
    expect(result.methodInput).not.toHaveProperty("bridge");
    expect(result.methodInput.rateBasis).toBe("cost_of_equity");
  });

  it("adds net borrowing once and excludes equity funding/dividends", () => {
    const months = Array.from({ length: 12 }, () => month({ revenue: 100, interestExpense: 2 }));
    months[0] = month({ revenue: 100, interestExpense: 2, debtDraw: 60, equityFunding: 900, dividends: 500 });
    months[11] = month({ revenue: 100, interestExpense: 2, debtRepayment: 20 });
    const result = evaluateCfoProjectionValuation(request(months));
    expect(result.status).toBe("scenario_only");
    if (result.status !== "scenario_only") return;
    expect(result.annualFlows[0]).toMatchObject({ cashFlowBeforeFinancing: 1176, debtDraw: 60, debtRepayment: 20, fcfe: 1216 });
    expect(result.methodResult.values.equityValue).toBeCloseTo(1216 / 1.1, 10);
    expect(result.reviewReasons.join(" ")).toContain("dilution/rights");
  });

  it("retains an unfunded scenario as scenario-only and recomputes gaps from balances", () => {
    const input = request(Array.from({ length: 12 }, () => month({ revenue: 0, opex: 10 })));
    input.projection.fundingGap = { peakRequiredFunding: 0, firstMonth: null }; // A stale summary must not hide negative cash.
    const result = evaluateCfoProjectionValuation(input);
    expect(result.status).toBe("scenario_only");
    if (result.status !== "scenario_only") return;
    expect(result.fundingGap).toEqual({ peakRequiredFunding: 120, firstMonth: "2026-07" });
    expect(result.reviewReasons.join(" ")).toContain("Unfunded cash gap");
    expect(result.methodResult.values.equityValue).toBeCloseTo(-120 / 1.1, 10);
  });

  it("allows a separately sourced going-concern terminal and leaves its value explicit", () => {
    const input = request(Array.from({ length: 12 }, () => month()));
    input.terminalPolicy = "going_concern";
    delete input.finiteLifeEvidence;
    input.terminal = {
      nextAnnualCashFlow: { value: 1200, unit: "AUD", evidence },
      growthRate: { value: 0, unit: "annual_decimal", evidence },
      steadyStateEvidence: { ...evidence, id: "steady-state" },
    };
    const result = evaluateCfoProjectionValuation(input);
    expect(result.status).toBe("scenario_only");
    if (result.status === "scenario_only") expect(result.methodResult.values.equityValue).toBeCloseTo(12000, 8);
  });

  it("pins derived evidence to the exact projection hash, revision and source months", () => {
    const input = request();
    const before = structuredClone(input);
    const result = evaluateCfoProjectionValuation(input);
    expect(input).toEqual(before);
    if (result.status !== "scenario_only") throw new Error("expected scenario");
    const source = result.methodInput.flows[0].cashFlow.evidence;
    expect(source.status).toBe("derived");
    expect(source.revision).toBe("rev-1");
    expect(source.locator).toContain("2026-07..2027-06");
    expect(source.rationale).toContain("a".repeat(64));
    expect(result.methodResult.requiresAssumptionReview).toBe(true);
  });
});

describe("FCFE adapter eligibility gates", () => {
  it.each([0, 11, 13, 23, 25])("rejects %i months rather than invent/drop partial years", length => {
    const input = request();
    input.projection.monthly = input.projection.monthly.slice(0, length);
    if (length === 25) input.projection.monthly.push(input.projection.monthly[23]);
    expect(evaluateCfoProjectionValuation(input).status).toBe("not_estimable");
  });
  it.each([
    ["currency", (i: CfoProjectionValuationInput) => { i.context.currency = "USD"; }],
    ["hash", (i: CfoProjectionValuationInput) => { i.binding.evidenceSetHash = "b".repeat(64); }],
    ["revision", (i: CfoProjectionValuationInput) => { i.binding.evidenceRevision = "rev-2"; }],
    ["entity", (i: CfoProjectionValuationInput) => { i.binding.projectionEvidence.entityId = "other"; }],
    ["start boundary", (i: CfoProjectionValuationInput) => { i.context.valuationDate = "2026-07-02"; }],
    ["month gap", (i: CfoProjectionValuationInput) => { i.projection.monthly[1].month = "2026-09"; }],
    ["actual overlap", (i: CfoProjectionValuationInput) => { i.projection.monthly[0].periodKind = "actual" as "forecast"; }],
    ["reconciliation", (i: CfoProjectionValuationInput) => { i.projection.monthly[0].cashFlowBeforeFinancing += 1; }],
    ["missing source", (i: CfoProjectionValuationInput) => { i.binding.projectionEvidence.status = "missing"; }],
    ["conflicting source", (i: CfoProjectionValuationInput) => { i.binding.projectionEvidence.status = "conflicted"; }],
    ["lookahead", (i: CfoProjectionValuationInput) => { i.binding.projectionEvidence.observedAt = "2026-08-01"; }],
    ["rate basis", (i: CfoProjectionValuationInput) => { i.ratePriceBasis = "real"; }],
    ["rate unit", (i: CfoProjectionValuationInput) => { i.discountRate.unit = "percent"; }],
    ["finite-life evidence", (i: CfoProjectionValuationInput) => { delete i.finiteLifeEvidence; }],
    ["unsupported terminal", (i: CfoProjectionValuationInput) => { i.terminalPolicy = "going_concern"; }],
  ])("rejects %s mismatch", (_label, mutate) => {
    const input = request();
    mutate(input);
    expect(evaluateCfoProjectionValuation(input).status).toBe("not_estimable");
  });
});
