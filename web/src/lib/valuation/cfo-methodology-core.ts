/** CFO methodology v1: deterministic scenario calculations, not fair-value certification.
 * No I/O, model calls, assumed rates, score-to-money conversion or automatic blending.
 * Callers must qualify projections/comparables and review material assumptions before
 * publication. Source references establish traceability, not independent verification.
 * Amounts are unrounded; presentation/export must apply the same rounding policy.
 */
export const CFO_METHOD_REGISTRY = {
  fcff: { version: "1.0.0", basis: "enterprise_and_equity", requires: "Annual end-period FCFF, WACC, qualified terminal and explicit EV bridge" },
  fcfe: { version: "1.0.0", basis: "equity", requires: "Annual end-period FCFE and cost of equity; no EV bridge" },
  market_multiple: { version: "1.0.0", basis: "enterprise_or_equity", requires: "Positive matching metric, reviewed comparable selection and same multiple basis" },
  venture_capital: { version: "1.0.0", basis: "equity", requires: "Exit equity, annual required return, exit horizon and retained ownership" },
  net_assets: { version: "1.0.0", basis: "equity", requires: "Adjusted asset and liability amounts, including explicit zero liabilities" },
  primary_round: { version: "1.0.0", basis: "transaction_anchor_pre_and_post_money", requires: "Transaction anchor, not independent valuation; simple primary priced equity only; cash and post-round ownership" },
} as const;

export type CfoMethodId = keyof typeof CFO_METHOD_REGISTRY;
export type CfoEvidence = {
  id: string;
  entityId: string;
  revision: string;
  observedAt: string; // ISO calendar date; future forecasts still have an as-of observation date
  reference: string;
  locator: string; // page, cell, statement or assumption memo section
  status: "source_verified" | "management_stated" | "assumed" | "derived" | "missing" | "conflicted";
  rationale?: string;
};
export type CfoContext = {
  entityId: string;
  evidenceRevision: string;
  valuationDate: string;
  currency: string;
  priceBasis: "nominal" | "real";
};
export type CfoSourcedNumber = { value: number; unit: string; evidence: CfoEvidence };
export type CfoOperatingSchedule = {
  ebit: number;
  cashOperatingTaxes: number;
  depreciation: number;
  capex: number;
  changeInOperatingWorkingCapital: number;
};

/** Single-period arithmetic only. Caller must bind same-period/currency schedule
 * provenance to the derived cash-flow input. Negative EBIT does not create a
 * tax refund; cash taxes are explicit, nonnegative amounts from the tax schedule.
 */
export function fcffFromOperatingSchedule(schedule: CfoOperatingSchedule): number {
  if (!schedule || typeof schedule !== "object") throw new RangeError("Operating schedule required");
  const fields: (keyof CfoOperatingSchedule)[] = ["ebit", "cashOperatingTaxes", "depreciation", "capex", "changeInOperatingWorkingCapital"];
  for (const field of fields) {
    if (!Number.isFinite(schedule[field])) throw new RangeError(`${field}: explicit finite amount required`);
  }
  for (const field of ["cashOperatingTaxes", "depreciation", "capex"] as const) {
    if (schedule[field] < 0) throw new RangeError(`${field}: nonnegative amount required`);
  }
  const fcff = schedule.ebit - schedule.cashOperatingTaxes + schedule.depreciation - schedule.capex - schedule.changeInOperatingWorkingCapital;
  if (!Number.isFinite(fcff)) throw new RangeError("FCFF arithmetic overflow");
  return fcff;
}
export type CfoEquityBridge = {
  excessCash: CfoSourcedNumber;
  nonOperatingAssets: CfoSourcedNumber;
  debt: CfoSourcedNumber;
  otherClaims: CfoSourcedNumber;
  excludesOperatingCashFlows: true;
};
type Base = { context: CfoContext };
type Discounted = Base & {
  terminalPolicy: "going_concern" | "finite_life";
  finiteLifeEvidence?: CfoEvidence;
  timing: "annual_end_period";
  cashFlowPriceBasis: "nominal" | "real";
  ratePriceBasis: "nominal" | "real";
  flows: { year: number; cashFlow: CfoSourcedNumber }[];
  discountRate: CfoSourcedNumber; // annual decimal, not percent points
  terminal?: { nextAnnualCashFlow: CfoSourcedNumber; growthRate: CfoSourcedNumber; steadyStateEvidence: CfoEvidence };
};
export type CfoMethodInput =
  | (Discounted & { method: "fcff"; rateBasis: "wacc"; bridge: CfoEquityBridge })
  | (Discounted & { method: "fcfe"; rateBasis: "cost_of_equity" })
  | (Base & { method: "market_multiple"; metric: CfoSourcedNumber; multiple: CfoSourcedNumber; metricName: string; comparableMetricName: string; metricPeriod: string; comparableMetricPeriod: string; outputBasis: "enterprise" | "equity"; comparableBasis: "enterprise" | "equity"; selectionEvidence: CfoEvidence; bridge?: CfoEquityBridge })
  | (Base & { method: "venture_capital"; exitEquity: CfoSourcedNumber; annualRequiredReturn: CfoSourcedNumber; yearsToExit: CfoSourcedNumber; retainedOwnership: CfoSourcedNumber })
  | (Base & { method: "net_assets"; adjustedAssets: CfoSourcedNumber; adjustedLiabilities: CfoSourcedNumber })
  | (Base & { method: "primary_round"; primaryCash: CfoSourcedNumber; investorOwnership: CfoSourcedNumber; terms: { primaryOnly: true; fees: false; secondary: false; convertibles: false; preferentialRights: false } });

export type CfoMethodResult = {
  method: CfoMethodId;
  methodVersion: string;
  context: CfoContext;
  evidenceIds: string[];
  requiresAssumptionReview: boolean;
} & ({ status: "not_estimable"; issues: string[] } | {
  status: "eligible";
  issues: [];
  values: { enterpriseValue?: number; equityValue?: number; preMoney?: number; postMoney?: number };
});

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/** Eligibility is method-local: failure here must not disable other methods. */
export function evaluateCfoMethod(input: CfoMethodInput): CfoMethodResult;
export function evaluateCfoMethod(input: unknown): CfoMethodResult | { status: "not_estimable"; issues: string[] };
export function evaluateCfoMethod(raw: unknown): CfoMethodResult | { status: "not_estimable"; issues: string[] } {
  const object = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
  if (!object(raw) || typeof raw.method !== "string" || !Object.prototype.hasOwnProperty.call(CFO_METHOD_REGISTRY, raw.method) || !object(raw.context)) {
    return { status: "not_estimable", issues: ["input: supported method and context object required"] };
  }
  if (!["entityId", "evidenceRevision", "valuationDate", "currency", "priceBasis"].every(key => typeof (raw.context as Record<string, unknown>)[key] === "string")) {
    return { status: "not_estimable", issues: ["context: explicit string fields required"] };
  }
  if ((raw.method === "fcff" || raw.method === "fcfe") && (!Array.isArray(raw.flows) || !raw.flows.every(flow => object(flow) && typeof flow.year === "number"))) {
    return { status: "not_estimable", issues: ["flows: annual cash-flow objects required"] };
  }
  const input = raw as unknown as CfoMethodInput;
  const { context: ctx, method } = input;
  const issues: string[] = [];
  const evidenceIds = new Set<string>();
  let requiresAssumptionReview = false;
  const issue = (message: string) => { issues.push(message); };
  if (!ctx.entityId?.trim() || !ctx.evidenceRevision?.trim()) issue("context: entity and evidence revision required");
  if (!validDate(ctx.valuationDate)) issue("context: invalid valuation date");
  if (!/^[A-Z]{3}$/.test(ctx.currency)) issue("context: currency must be explicit ISO-style code");
  if (ctx.priceBasis !== "nominal" && ctx.priceBasis !== "real") issue("context: price basis required");
  function evidence(e: CfoEvidence | undefined, field: string) {
    if (!e) { issue(`${field}: evidence required`); return; }
    if (![e.id, e.reference, e.locator].every(value => typeof value === "string" && value.trim())) issue(`${field}: evidence id, reference and locator required`);
    if (e.entityId !== ctx.entityId || e.revision !== ctx.evidenceRevision) issue(`${field}: evidence entity/revision mismatch`);
    if (!validDate(e.observedAt) || e.observedAt > ctx.valuationDate) issue(`${field}: evidence observation after valuation date or invalid`);
    if (!["source_verified", "management_stated", "assumed", "derived"].includes(e.status)) issue(`${field}: missing or conflicted evidence`);
    if (e.status !== "source_verified") requiresAssumptionReview = true;
    if ((e.status === "assumed" || e.status === "derived") && !(typeof e.rationale === "string" && e.rationale.trim())) issue(`${field}: assumption/derivation rationale required`);
    if (typeof e.id === "string" && e.id) evidenceIds.add(e.id);
  }
  function number(n: CfoSourcedNumber | undefined, unit: string, field: string, min = -Infinity, max = Infinity): number {
    if (!n) { issue(`${field}: explicit input required (missing is not zero)`); return NaN; }
    evidence(n.evidence, field);
    if (n.unit !== unit) issue(`${field}: expected unit ${unit}`);
    if (!Number.isFinite(n.value)) { issue(`${field}: finite value in [${min}, ${max}] required`); return NaN; }
    if (n.value < min || n.value > max) issue(`${field}: finite value in [${min}, ${max}] required`);
    return n.value;
  }
  function bridge(ev: number, b: CfoEquityBridge | undefined): number {
    if (!b) { issue("bridge: explicit cash/assets/debt/claims required"); return NaN; }
    if (b.excludesOperatingCashFlows !== true) issue("bridge: cash/assets must exclude operating cash flows");
    return ev + number(b.excessCash, ctx.currency, "excessCash", 0)
      + number(b.nonOperatingAssets, ctx.currency, "nonOperatingAssets", 0)
      - number(b.debt, ctx.currency, "debt", 0) - number(b.otherClaims, ctx.currency, "otherClaims", 0);
  }
  let values: Extract<CfoMethodResult, { status: "eligible" }>["values"] = {};
  switch (input.method) {
    case "fcff":
    case "fcfe": {
      if (input.timing !== "annual_end_period") issue("timing: only annual end-period is supported");
      if (input.cashFlowPriceBasis !== ctx.priceBasis || input.ratePriceBasis !== ctx.priceBasis) issue("discount: nominal/real basis mismatch");
      if (input.rateBasis !== (input.method === "fcff" ? "wacc" : "cost_of_equity")) issue("discount: cash flow/rate basis mismatch");
      if (input.terminalPolicy === "finite_life") {
        evidence(input.finiteLifeEvidence, "finiteLife");
        if (!input.finiteLifeEvidence || typeof input.finiteLifeEvidence.rationale !== "string" || !input.finiteLifeEvidence.rationale.trim()) issue("finiteLife: documented cessation/liquidation rationale required");
        if (input.terminal) issue("finiteLife: terminal must not be added; include final disposal cash flows explicitly");
      } else if (input.terminalPolicy !== "going_concern" || !input.terminal) issue("terminal: going concern requires qualified terminal value; otherwise document finite life");
      const rate = number(input.discountRate, "annual_decimal", "discountRate", 0);
      if (rate <= 0) issue("discountRate: positive annual rate required");
      if (!input.flows.length) issue("flows: at least one explicit annual period required");
      let pv = 0;
      input.flows.forEach((flow, index) => {
        if (flow.year !== index + 1) issue("flows: contiguous years starting at 1 required");
        pv += number(flow.cashFlow, ctx.currency, `cashFlow[${index}]`) / (1 + rate) ** flow.year;
      });
      if (input.terminal) {
        evidence(input.terminal.steadyStateEvidence, "steadyState");
        const growth = number(input.terminal.growthRate, "annual_decimal", "terminalGrowth", -1);
        const next = number(input.terminal.nextAnnualCashFlow, ctx.currency, "terminalCashFlow", 0);
        if (growth <= -1 || growth >= rate) issue("terminal: -1 < growth < discount rate required");
        pv += next / (rate - growth) / (1 + rate) ** input.flows.length;
      }
      if (input.method === "fcff") values = { enterpriseValue: pv, equityValue: bridge(pv, input.bridge) };
      else {
        if ("bridge" in input) issue("fcfe: equity cash flows must not receive an EV bridge");
        values = { equityValue: pv };
      }
      break;
    }
    case "market_multiple": {
      evidence(input.selectionEvidence, "comparableSelection");
      if (typeof input.metricName !== "string" || !input.metricName.trim() || input.metricName !== input.comparableMetricName) issue("market: comparable metric mismatch");
      if (typeof input.metricPeriod !== "string" || !input.metricPeriod.trim() || input.metricPeriod !== input.comparableMetricPeriod) issue("market: comparable metric period mismatch");
      if (!["enterprise", "equity"].includes(input.outputBasis) || input.outputBasis !== input.comparableBasis) issue("market: comparable value basis mismatch");
      const metric = number(input.metric, ctx.currency, "metric", 0);
      const multiple = number(input.multiple, "multiple", "multiple", 0);
      if (metric <= 0 || multiple <= 0) issue("market: positive metric and multiple required");
      const value = metric * multiple;
      if (input.outputBasis === "enterprise") values = { enterpriseValue: value, equityValue: bridge(value, input.bridge) };
      else {
        if (input.bridge) issue("market: equity multiple must not receive an EV bridge");
        values = { equityValue: value };
      }
      break;
    }
    case "venture_capital": {
      const exit = number(input.exitEquity, ctx.currency, "exitEquity", 0);
      const rate = number(input.annualRequiredReturn, "annual_decimal", "requiredReturn", 0);
      const years = number(input.yearsToExit, "years", "yearsToExit", 0);
      const retained = number(input.retainedOwnership, "fraction", "retainedOwnership", 0, 1);
      if (years <= 0 || retained <= 0) issue("venture: positive horizon and retained ownership required");
      values = { equityValue: exit * retained / (1 + rate) ** years };
      break;
    }
    case "net_assets":
      values = { equityValue: number(input.adjustedAssets, ctx.currency, "assets", 0) - number(input.adjustedLiabilities, ctx.currency, "liabilities", 0) };
      break;
    case "primary_round": {
      const cash = number(input.primaryCash, ctx.currency, "primaryCash", 0);
      const ownership = number(input.investorOwnership, "fraction", "investorOwnership", 0, 1);
      if (cash <= 0 || ownership <= 0) issue("round: positive primary cash and ownership required");
      const t = input.terms;
      if (!t || t.primaryOnly !== true || t.fees !== false || t.secondary !== false || t.convertibles !== false || t.preferentialRights !== false) issue("round: complex terms require a cap-table/rights model");
      const postMoney = cash / ownership;
      values = { postMoney, preMoney: postMoney - cash };
      break;
    }
    default: issue("method: unsupported");
  }
  if (Object.values(values).some(value => !Number.isFinite(value))) issue("result: non-finite calculation");
  const common = { method, methodVersion: CFO_METHOD_REGISTRY[method]?.version ?? "unsupported", context: { ...ctx }, evidenceIds: [...evidenceIds].sort(), requiresAssumptionReview };
  return issues.length ? { ...common, status: "not_estimable", issues: [...new Set(issues)] } : { ...common, status: "eligible", issues: [], values };
}
