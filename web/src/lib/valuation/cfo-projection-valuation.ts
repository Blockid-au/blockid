import { evaluateCfoMethod, type CfoContext, type CfoEvidence, type CfoMethodInput,
  type CfoMethodResult, type CfoSourcedNumber } from "./cfo-methodology-core";
import { CFO_PROJECTION_VERSION, type CfoProjectionResult } from "./cfo-projection-core";

export type CfoProjectionFcfeInput = Extract<CfoMethodInput, { method: "fcfe" }>;

export interface CfoProjectionValuationInput {
  projection: CfoProjectionResult;
  context: CfoContext;
  /** Persist this binding alongside the projection; it is an explicit caller
   * attestation, not source verification performed by this arithmetic adapter. */
  binding: {
    entityId: string;
    evidenceRevision: string;
    evidenceSetHash: string;
    projectionEvidence: CfoEvidence;
  };
  timingConvention: "monthly_cash_flows_aggregated_to_annual_end_period";
  cashFlowPriceBasis: "nominal" | "real";
  ratePriceBasis: "nominal" | "real";
  discountRate: CfoSourcedNumber;
  terminalPolicy: CfoProjectionFcfeInput["terminalPolicy"];
  terminal?: CfoProjectionFcfeInput["terminal"];
  finiteLifeEvidence?: CfoEvidence;
}

export interface CfoProjectionFcfeYear {
  year: number;
  startMonth: string;
  endMonth: string;
  cashFlowBeforeFinancing: number;
  debtDraw: number;
  debtRepayment: number;
  fcfe: number;
}

export type CfoProjectionValuationResult =
  | { status: "not_estimable"; issues: string[] }
  | {
    /** Eligibility for arithmetic is never acceptance of a business valuation. */
    status: "scenario_only";
    methodInput: CfoProjectionFcfeInput;
    methodResult: Extract<CfoMethodResult, { status: "eligible" }>;
    annualFlows: CfoProjectionFcfeYear[];
    fundingGap: { peakRequiredFunding: number; firstMonth: string | null };
    reviewReasons: string[];
    limitations: string[];
  };

const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const close = (a: number, b: number): boolean => Math.abs(a - b) <= 1e-8 * Math.max(1, Math.abs(a), Math.abs(b));

/** Convert 12-month rolling blocks to annual end-period FCFE. This approximation
 * must be explicitly selected: monthly dates are not individually discounted.
 * FCFE = operating cash after interest/tax - capex + net borrowing. Equity
 * injections and distributions are excluded; neither is operating performance.
 * Calendar annual rollups are intentionally ignored, including partial years. */
export function evaluateCfoProjectionValuation(input: CfoProjectionValuationInput): CfoProjectionValuationResult {
  const issues: string[] = [];
  const invalid = (message: string): CfoProjectionValuationResult => ({ status: "not_estimable", issues: [message] });
  if (!object(input) || !object(input.projection) || !object(input.context) || !object(input.binding)) return invalid("input: projection, context and explicit binding required");
  const { projection, context, binding } = input;
  if (projection.version !== CFO_PROJECTION_VERSION) issues.push("projection: unsupported methodology version");
  if (!object(projection.scenario) || typeof projection.scenario.evidenceSetHash !== "string") return invalid("projection: scenario evidence hash required");
  if (projection.currency !== context.currency) issues.push("projection: currency mismatch");
  if (binding.entityId !== context.entityId || binding.evidenceRevision !== context.evidenceRevision) issues.push("projection: entity/revision binding mismatch");
  if (!/^[a-f0-9]{64}$/i.test(binding.evidenceSetHash) || binding.evidenceSetHash !== projection.scenario.evidenceSetHash) issues.push("projection: evidence hash mismatch");
  const source = binding.projectionEvidence;
  if (!object(source)) return invalid("projection: source evidence required");
  if (source.entityId !== context.entityId || source.revision !== context.evidenceRevision) issues.push("projection: source entity/revision mismatch");
  if (!["source_verified", "management_stated", "assumed", "derived"].includes(source.status)) issues.push("projection: source missing/conflicted or unsupported");
  if (![source.id, source.reference, source.locator].every(v => typeof v === "string" && v.trim())) issues.push("projection: source id/reference/locator required");
  if ((source.status === "assumed" || source.status === "derived") && !(typeof source.rationale === "string" && source.rationale.trim())) issues.push("projection: source assumption/derivation rationale required");
  if (input.timingConvention !== "monthly_cash_flows_aggregated_to_annual_end_period") issues.push("timing: explicit annual end-period aggregation convention required");
  if (!Array.isArray(projection.monthly) || !projection.monthly.length || projection.monthly.length % 12 !== 0) return invalid("projection: complete 12-month rolling valuation years required; partial years are not annualised or dropped");
  const first = projection.monthly[0];
  if (!object(first) || typeof first.month !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(first.month)) return invalid("projection: valid first forecast month required");
  if (context.valuationDate !== `${first.month}-01`) issues.push("valuationDate: must equal first forecast month start (YYYY-MM-01)");
  const [year, month] = first.month.split("-").map(Number);
  let peakRequiredFunding = 0;
  let firstFundingMonth: string | null = null;
  for (let i = 0; i < projection.monthly.length; i++) {
    const row = projection.monthly[i];
    if (!object(row) || !object(row.opening) || !object(row.closing)) return invalid(`months[${i}]: cash/debt balances required`);
    const ordinal = month - 1 + i;
    const expected = `${year + Math.floor(ordinal / 12)}-${String(ordinal % 12 + 1).padStart(2, "0")}`;
    if (row.month !== expected || row.periodKind !== "forecast") issues.push(`months[${i}]: contiguous forecast month required`);
    const values = [row.cashFlowBeforeFinancing, row.operatingCashFlow, row.investingCashFlow, row.capex,
      row.debtDraw, row.debtRepayment, row.equityFunding, row.dividends, row.financingCashFlow, row.netCashFlow,
      row.opening.cash, row.closing.cash, row.opening.debt, row.closing.debt];
    if (!values.every(finite)) return invalid(`months[${i}]: finite cash-flow and balance inputs required`);
    if ([row.capex, row.debtDraw, row.debtRepayment, row.equityFunding, row.dividends, row.opening.debt, row.closing.debt].some(v => v < 0)) issues.push(`months[${i}]: negative funding/capex/debt input`);
    if (!close(row.investingCashFlow, -row.capex) || !close(row.cashFlowBeforeFinancing, row.operatingCashFlow + row.investingCashFlow)) issues.push(`months[${i}]: operating/investing reconciliation failed`);
    if (!close(row.financingCashFlow, row.debtDraw - row.debtRepayment + row.equityFunding - row.dividends)
      || !close(row.netCashFlow, row.cashFlowBeforeFinancing + row.financingCashFlow)
      || !close(row.closing.cash, row.opening.cash + row.netCashFlow)
      || !close(row.closing.debt, row.opening.debt + row.debtDraw - row.debtRepayment)) issues.push(`months[${i}]: cash/debt roll-forward failed`);
    if (i > 0 && (!close(row.opening.cash, projection.monthly[i - 1].closing.cash)
      || !close(row.opening.debt, projection.monthly[i - 1].closing.debt))) issues.push(`months[${i}]: opening balance discontinuity`);
    const gap = Math.max(0, -row.closing.cash, -row.opening.cash);
    peakRequiredFunding = Math.max(peakRequiredFunding, gap);
    if (gap > 0 && firstFundingMonth === null) firstFundingMonth = row.month;
  }
  if (issues.length) return { status: "not_estimable", issues };

  const annualFlows: CfoProjectionFcfeYear[] = [];
  for (let i = 0; i < projection.monthly.length; i += 12) {
    const block = projection.monthly.slice(i, i + 12);
    const sum = (key: "cashFlowBeforeFinancing" | "debtDraw" | "debtRepayment") => block.reduce((total, row) => total + row[key], 0);
    const cashFlowBeforeFinancing = sum("cashFlowBeforeFinancing");
    const debtDraw = sum("debtDraw");
    const debtRepayment = sum("debtRepayment");
    const fcfe = cashFlowBeforeFinancing + debtDraw - debtRepayment;
    if (![cashFlowBeforeFinancing, debtDraw, debtRepayment, fcfe].every(finite)) return invalid("projection: rolling annual cash-flow overflow");
    annualFlows.push({ year: i / 12 + 1, startMonth: block[0].month, endMonth: block[11].month,
      cashFlowBeforeFinancing, debtDraw, debtRepayment, fcfe });
  }
  const methodInput: CfoProjectionFcfeInput = {
    method: "fcfe", context: { ...context }, rateBasis: "cost_of_equity",
    timing: "annual_end_period", cashFlowPriceBasis: input.cashFlowPriceBasis, ratePriceBasis: input.ratePriceBasis,
    discountRate: input.discountRate, terminalPolicy: input.terminalPolicy,
    ...(input.terminal ? { terminal: input.terminal } : {}),
    ...(input.finiteLifeEvidence ? { finiteLifeEvidence: input.finiteLifeEvidence } : {}),
    flows: annualFlows.map(row => ({ year: row.year, cashFlow: {
      value: row.fcfe, unit: context.currency,
      evidence: { ...source, id: `${source.id}:fcfe-year-${row.year}`, status: "derived",
        locator: `${source.locator}; rolling months ${row.startMonth}..${row.endMonth}`,
        rationale: `Derived from ${source.id}; ${projection.version}; evidence set ${binding.evidenceSetHash}; FCFE = cash flow before financing + debt draw - debt repayment; equity funding and dividends excluded. ${source.rationale ?? ""}`.trim() },
    } })),
  };
  const methodResult = evaluateCfoMethod(methodInput);
  if (methodResult.status === "not_estimable") return { status: "not_estimable", issues: methodResult.issues };
  return {
    status: "scenario_only", methodInput, methodResult, annualFlows,
    fundingGap: { peakRequiredFunding, firstMonth: firstFundingMonth },
    reviewReasons: [
      "Projection, forecast assumptions and terminal policy require independent review before any accepted valuation.",
      ...(peakRequiredFunding > 0 ? ["Unfunded cash gap: projected operations require financing not supplied in the scenario."] : []),
      ...(projection.monthly.some(row => row.equityFunding > 0) ? ["Future equity financing supports the forecast but investor dilution/rights are not modelled; not an existing-holder value."] : []),
    ],
    limitations: [
      ...(Array.isArray(projection.limitations) ? projection.limitations : []),
      "Annual end-period convention aggregates 12 monthly cash flows before discounting; it is not monthly or mid-year discounting.",
      "FCFE is equity cash flow after net borrowing, not FCFF; no EV cash/debt bridge is applied and opening excess cash is not automatically added.",
      "Finite-life disposal proceeds/residual claims must be supported in the source model; absence of terminal value does not establish a complete liquidation model.",
      "Evidence/revision binding is supplied by the caller; this adapter checks consistency, not authenticity or independent verification.",
    ],
  };
}
