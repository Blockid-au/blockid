import { describe, expect, it } from "vitest";
import { calculateCfoScenario, cfoScenarioCsv } from "./cfo-scenario";
import type { CfoMethodInput, CfoSourcedNumber } from "./cfo-methodology-core";
const context = { entityId: "project", evidenceRevision: "rev1", valuationDate: "2026-09-24", currency: "AUD", priceBasis: "nominal" as const };
const number = (value: number, unit = "AUD"): CfoSourcedNumber => ({ value, unit, evidence: { id: "memo", entityId: "project", revision: "rev1", observedAt: "2026-09-24", reference: "management memo", locator: "section 1", status: "management_stated" } });
const method = (): CfoMethodInput => ({ method: "primary_round", context: { ...context }, primaryCash: number(1_000_000), investorOwnership: number(.2, "fraction"), terms: { primaryOnly: true, fees: false, secondary: false, convertibles: false, preferentialRights: false } });
describe("CFO scenario snapshot", () => {
  it("preserves pre/post identity and labels scenario rather than accepted valuation", () => {
    const result = calculateCfoScenario({ methods: [method()] });
    expect(result.status).toBe("scenario_only");
    expect(result.methods[0]).toMatchObject({ status: "eligible", values: { preMoney: 4_000_000, postMoney: 5_000_000 } });
    expect(cfoScenarioCsv(result)).toContain(result.resultHash);
    expect(cfoScenarioCsv(result)).toContain('"4000000","5000000"');
  });
  it("is stable under key ordering and changes when source assumptions change", () => {
    const a = method(), b = { ...a, context: { currency: "AUD", valuationDate: "2026-09-24", evidenceRevision: "rev1", entityId: "project", priceBasis: "nominal" as const } };
    expect(calculateCfoScenario({ methods: [a] }).resultHash).toBe(calculateCfoScenario({ methods: [b] }).resultHash);
    b.primaryCash = number(2_000_000);
    expect(calculateCfoScenario({ methods: [a] }).resultHash).not.toBe(calculateCfoScenario({ methods: [b] }).resultHash);
  });
  it("rejects different revisions or entities instead of blending", () => {
    const other = method(); other.context.evidenceRevision = "rev2";
    expect(() => calculateCfoScenario({ methods: [method(), other] })).toThrow("same entity");
  });
  it("computes a linked projection FCFE from schedules and includes it in export", () => {
    const revision = "a".repeat(64);
    const context = { entityId: "project", evidenceRevision: revision, valuationDate: "2026-01-01", currency: "AUD", priceBasis: "nominal" as const };
    const evidence = { id: "memo", entityId: "project", revision, observedAt: "2026-01-01", reference: "fixture memo", locator: "budget", status: "assumed" as const, rationale: "finite operation ends after year one; no residual assets" };
    const source = (value: number, unit = "AUD") => ({ value, unit, evidence });
    const result = calculateCfoScenario({
      methods: [{ method: "net_assets", context, adjustedAssets: source(0), adjustedLiabilities: source(0) }],
      projection: { currency: "AUD", startMonth: "2026-01", scenario: { id: "base", basis: "management", evidenceSetHash: revision, assumptionRefs: ["memo"] },
        opening: { cash: 0, debt: 0, netFixedAssets: 0, receivables: 0, inventory: 0, payables: 0, taxLossCarryforward: 0 },
        months: Array.from({ length: 12 }, () => ({ revenue: 100, cogs: 0, opex: 0, depreciation: 0, capex: 0, closingReceivables: 0, closingInventory: 0, closingPayables: 0, cashTaxRate: 0, interestExpense: 0, debtDraw: 0, debtRepayment: 0, equityFunding: 0, dividends: 0 })) },
      projectionValuation: { binding: { entityId: "project", evidenceRevision: revision, evidenceSetHash: revision, projectionEvidence: evidence }, timingConvention: "monthly_cash_flows_aggregated_to_annual_end_period", cashFlowPriceBasis: "nominal", ratePriceBasis: "nominal", discountRate: source(.1, "annual_decimal"), terminalPolicy: "finite_life", finiteLifeEvidence: evidence },
    });
    expect(result.linkedProjectionValuation?.status).toBe("scenario_only");
    if (result.linkedProjectionValuation?.status === "scenario_only") {
      expect(result.linkedProjectionValuation.methodResult.values.equityValue).toBeCloseTo(1200 / 1.1, 8);
    }
    expect(cfoScenarioCsv(result)).toContain('"fcfe"');
    expect(result.status).toBe("scenario_only");
  });
  it("does not mutate inputs or turn method-local rejection into a fabricated value", () => {
    const input = method(); input.investorOwnership.value = 0;
    const before = JSON.stringify(input);
    const result = calculateCfoScenario({ methods: [input] });
    expect(result.methods[0].status).toBe("not_estimable");
    expect(JSON.stringify(input)).toBe(before);
  });
});
