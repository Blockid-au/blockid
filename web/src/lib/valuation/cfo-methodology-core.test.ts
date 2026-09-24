import { describe, expect, it } from "vitest";
import { evaluateCfoMethod, fcffFromOperatingSchedule, type CfoOperatingSchedule, type CfoContext, type CfoEvidence, type CfoMethodInput, type CfoSourcedNumber, type CfoEquityBridge } from "./cfo-methodology-core";

const context: CfoContext = { entityId: "fixture-only", evidenceRevision: "evidence-hash-1", valuationDate: "2026-09-24", currency: "AUD", priceBasis: "nominal" };
const evidence: CfoEvidence = { id: "source-1", entityId: context.entityId, revision: context.evidenceRevision, observedAt: "2026-09-20", reference: "fixture financial memo", locator: "A1", status: "source_verified" };
const n = (value: number, unit = "AUD"): CfoSourcedNumber => ({ value, unit, evidence: { ...evidence } });
const bridge = (): CfoEquityBridge => ({ excessCash: n(200), nonOperatingAssets: n(0), debt: n(300), otherClaims: n(0), excludesOperatingCashFlows: true });
const fcff = (): Extract<CfoMethodInput, { method: "fcff" }> => ({ method: "fcff", context, terminalPolicy: "going_concern", timing: "annual_end_period", cashFlowPriceBasis: "nominal", ratePriceBasis: "nominal", rateBasis: "wacc", flows: [{ year: 1, cashFlow: n(100) }], discountRate: n(0.1, "annual_decimal"), terminal: { nextAnnualCashFlow: n(100), growthRate: n(0, "annual_decimal"), steadyStateEvidence: { ...evidence, id: "steady-state" } }, bridge: bridge() });
const round = (): Extract<CfoMethodInput, { method: "primary_round" }> => ({ method: "primary_round", context, primaryCash: n(1_000_000), investorOwnership: n(0.2, "fraction"), terms: { primaryOnly: true, fees: false, secondary: false, convertibles: false, preferentialRights: false } });
const market = (): Extract<CfoMethodInput, { method: "market_multiple" }> => ({ method: "market_multiple", context, metric: n(100), multiple: n(5, "multiple"), metricName: "EBITDA", comparableMetricName: "EBITDA", metricPeriod: "LTM to 2026-06-30", comparableMetricPeriod: "LTM to 2026-06-30", outputBasis: "enterprise", comparableBasis: "enterprise", selectionEvidence: evidence, bridge: bridge() });

describe("operating schedule to FCFF", () => {
  const schedule = (): CfoOperatingSchedule => ({ ebit: 200, cashOperatingTaxes: 30, depreciation: 20, capex: 70, changeInOperatingWorkingCapital: 20 });
  it("reconciles EBIT, cash taxes, D&A, capex and operating working capital", () => {
    expect(fcffFromOperatingSchedule(schedule())).toBe(100);
    expect(fcffFromOperatingSchedule({ ...schedule(), changeInOperatingWorkingCapital: -20 })).toBe(140);
  });
  it("retains negative EBIT without inventing a tax refund", () => {
    expect(fcffFromOperatingSchedule({ ...schedule(), ebit: -100, cashOperatingTaxes: 0 })).toBe(-170);
    expect(() => fcffFromOperatingSchedule({ ...schedule(), ebit: -100, cashOperatingTaxes: -30 })).toThrow(RangeError);
  });
  it("rejects missing amounts, nonfinite values and negative capital expenditure/depreciation", () => {
    for (const field of Object.keys(schedule()) as (keyof CfoOperatingSchedule)[]) {
      for (const value of [undefined, NaN, Infinity]) expect(() => fcffFromOperatingSchedule({ ...schedule(), [field]: value } as CfoOperatingSchedule)).toThrow(RangeError);
    }
    for (const field of ["capex", "depreciation"] as const) expect(() => fcffFromOperatingSchedule({ ...schedule(), [field]: -1 })).toThrow(RangeError);
  });
});

describe("CFO methodology core numerical oracles", () => {
  it("discounts perpetual annual 100 at 10% to EV 1000; cash 200 less debt 300 yields equity 900", () => {
    const result = evaluateCfoMethod(fcff());
    expect(result.status).toBe("eligible");
    if (result.status !== "eligible") throw new Error(result.issues.join(","));
    expect(result.values.enterpriseValue).toBeCloseTo(1000, 10);
    expect(result.values.equityValue).toBeCloseTo(900, 10);
    expect(result.evidenceIds).toEqual(["source-1", "steady-state"]);
  });

  it("discounts FCFE directly without subtracting debt twice", () => {
    const { bridge: _bridge, ...base } = fcff();
    const result = evaluateCfoMethod({ ...base, method: "fcfe", rateBasis: "cost_of_equity" });
    expect(result.status).toBe("eligible");
    if (result.status === "eligible") {
      expect(result.values.equityValue).toBeCloseTo(1000);
      expect(result.values.enterpriseValue).toBeUndefined();
    }
  });

  it("retains negative interim FCF and discounts each period once", () => {
    const input = fcff();
    delete input.terminal;
    input.terminalPolicy = "finite_life";
    input.finiteLifeEvidence = { ...evidence, rationale: "Contract expires after year two; final cash flow includes disposal and all closure obligations." };
    input.flows = [{ year: 1, cashFlow: n(-110) }, { year: 2, cashFlow: n(242) }];
    const result = evaluateCfoMethod(input);
    expect(result.status).toBe("eligible");
    if (result.status === "eligible") expect(result.values.enterpriseValue).toBeCloseTo(100);
  });

  it("separates simple priced primary round pre-money from post-money", () => {
    expect(evaluateCfoMethod(round())).toMatchObject({ status: "eligible", values: { postMoney: 5_000_000, preMoney: 4_000_000 } });
  });

  it("uses matching market metric × multiple, followed by one explicit bridge", () => {
    expect(evaluateCfoMethod(market())).toMatchObject({ status: "eligible", values: { enterpriseValue: 500, equityValue: 400 } });
  });

  it("discounts VC exit equity and explicit future dilution", () => {
    const result = evaluateCfoMethod({ method: "venture_capital", context, exitEquity: n(1210), annualRequiredReturn: n(0.1, "annual_decimal"), yearsToExit: n(2, "years"), retainedOwnership: n(0.5, "fraction") });
    expect(result.status).toBe("eligible");
    if (result.status === "eligible") expect(result.values.equityValue).toBeCloseTo(500, 10);
  });

  it("allows negative net asset equity rather than inventing a floor", () => {
    expect(evaluateCfoMethod({ method: "net_assets", context, adjustedAssets: n(100), adjustedLiabilities: n(150) })).toMatchObject({ status: "eligible", values: { equityValue: -50 } });
  });
});

describe("method eligibility and provenance", () => {
  it.each([null, undefined, {}, { method: "fcff" }, { method: "toString", context }, { method: "fcff", context: null }, { method: "fcff", context, flows: null }, { method: "fcff", context, flows: [null] }])("fails closed on malformed API input %j", raw => {
    expect(evaluateCfoMethod(raw)).toMatchObject({ status: "not_estimable" });
  });
  it("requires explicit terminal policy and a source-backed finite-life rationale", () => {
    const input = fcff(); delete input.terminal;
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    input.terminalPolicy = "finite_life";
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    input.finiteLifeEvidence = { ...evidence };
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    input.finiteLifeEvidence.rationale = "One-year finite project; cash flow includes closure/disposal.";
    expect(evaluateCfoMethod(input).status).toBe("eligible");
  });
  it.each([NaN, Infinity, -Infinity])("rejects non-finite input %s", value => {
    const input = fcff(); input.flows[0].cashFlow.value = value;
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
  });
  it.each([0.1, 0.2, -1])("rejects invalid Gordon growth %s", growth => {
    const input = fcff(); input.terminal!.growthRate.value = growth;
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
  });
  it("rejects mixed currency, wrong units, missing bridges and period gaps", () => {
    for (const mutate of [
      (x: ReturnType<typeof fcff>) => { x.flows[0].cashFlow.unit = "USD"; },
      (x: ReturnType<typeof fcff>) => { x.discountRate.unit = "percent"; },
      (x: ReturnType<typeof fcff>) => { x.flows[0].year = 2; },
      (x: ReturnType<typeof fcff>) => { x.ratePriceBasis = "real"; },
      (x: ReturnType<typeof fcff>) => { delete (x as Partial<typeof x>).bridge; },
    ]) {
      const input = fcff(); mutate(input);
      expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    }
  });
  it("rejects wrong-entity/revision, future and conflicted evidence", () => {
    for (const patch of [{ entityId: "other" }, { revision: "stale" }, { observedAt: "2026-09-25" }, { observedAt: "2026-02-30" }, { status: "conflicted" as const }, { locator: "" }]) {
      const input = fcff(); Object.assign(input.discountRate.evidence, patch);
      expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    }
  });
  it("rejects unsupported timing, WACC on FCFE and a second debt bridge", () => {
    const base = fcff();
    expect(evaluateCfoMethod({ ...base, timing: "monthly" } as unknown as CfoMethodInput).status).toBe("not_estimable");
    const { bridge: _bridge, ...cashFlows } = base;
    expect(evaluateCfoMethod({ ...cashFlows, method: "fcfe" } as unknown as CfoMethodInput).status).toBe("not_estimable");
    expect(evaluateCfoMethod({ ...base, method: "fcfe", rateBasis: "cost_of_equity" } as unknown as CfoMethodInput).status).toBe("not_estimable");
  });
  it("accepts explicitly documented assumptions only with review flag", () => {
    const input = fcff(); input.discountRate.evidence.status = "assumed";
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    input.discountRate.evidence.rationale = "CFO scenario memo; rate subject to review";
    expect(evaluateCfoMethod(input)).toMatchObject({ status: "eligible", requiresAssumptionReview: true });
  });
  it("rejects mismatched market basis or metric and loss-making EBITDA", () => {
    for (const patch of [{ comparableMetricName: "revenue" }, { comparableMetricPeriod: "FY2025" }, { comparableBasis: "equity" as const }, { metric: n(-1) }]) {
      expect(evaluateCfoMethod({ ...market(), ...patch }).status).toBe("not_estimable");
    }
  });
  it("does not apply simplified round math to fees, convertibles or preferred rights", () => {
    for (const key of ["fees", "secondary", "convertibles", "preferentialRights"] as const) {
      const input = round(); (input.terms as Record<string, boolean>)[key] = true;
      expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    }
  });
  it("rejects fraction as percent points and missing evidence; zero liabilities remain valid", () => {
    const input = round(); input.investorOwnership.value = 20;
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    const assets = n(100); delete (assets as Partial<CfoSourcedNumber>).evidence;
    expect(evaluateCfoMethod({ method: "net_assets", context, adjustedAssets: assets, adjustedLiabilities: n(0) }).status).toBe("not_estimable");
    expect(evaluateCfoMethod({ method: "net_assets", context, adjustedAssets: n(100), adjustedLiabilities: n(0) })).toMatchObject({ status: "eligible", values: { equityValue: 100 } });
  });
  it("does not mutate caller inputs or make one method's failure disable another", () => {
    const input = fcff(); const before = JSON.stringify(input);
    evaluateCfoMethod(input); expect(JSON.stringify(input)).toBe(before);
    input.terminal!.growthRate.value = 1;
    expect(evaluateCfoMethod(input).status).toBe("not_estimable");
    expect(evaluateCfoMethod(round()).status).toBe("eligible");
  });
});
