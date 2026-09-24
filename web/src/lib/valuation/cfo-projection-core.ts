/** P2 deterministic scenario schedules. Amounts use the supplied currency's major
 * unit; rates are fractions. No FX, forecasts, tax rules or financial inputs are
 * inferred. This is a scoped cash/working-capital model, not audited accounts or
 * a complete three-statement model. Evidence admission belongs to P1. */
export const CFO_PROJECTION_VERSION = "cfo-projection-v1" as const;

export class CfoProjectionInputError extends Error {
  constructor(public readonly field: string, reason: string) {
    super(`${field}: ${reason}`);
    this.name = "CfoProjectionInputError";
  }
}

export interface CfoProjectionOpening {
  cash: number;
  debt: number;
  netFixedAssets: number;
  receivables: number;
  inventory: number;
  payables: number;
  taxLossCarryforward: number;
}

export interface CfoProjectionMonthInput {
  revenue: number;
  cogs: number;
  /** Operating expense excluding D&A, interest, taxes and capital expenditure. */
  opex: number;
  depreciation: number;
  capex: number;
  closingReceivables: number;
  closingInventory: number;
  closingPayables: number;
  /** Explicit simplified effective cash tax rate, 0..1. Not a jurisdiction rule. */
  cashTaxRate: number;
  /** Interest is both expensed and paid in this month. No capitalised interest. */
  interestExpense: number;
  debtDraw: number;
  debtRepayment: number;
  equityFunding: number;
  dividends: number;
}

export interface CfoProjectionScenario {
  id: string;
  basis: "management" | "assessed" | "bear" | "bull";
  evidenceSetHash: string;
  /** References to P1 admitted sources or labelled assumptions, not proof of admission. */
  assumptionRefs: string[];
}

export interface CfoProjectionInput {
  currency: string;
  /** First forecast month; all supplied periods are forecasts, never actuals. */
  startMonth: string;
  opening: CfoProjectionOpening;
  months: CfoProjectionMonthInput[];
  scenario: CfoProjectionScenario;
}

export interface CfoProjectionFlows {
  revenue: number;
  cogs: number;
  grossProfit: number;
  opex: number;
  ebitda: number;
  depreciation: number;
  ebit: number;
  interestExpense: number;
  pretaxIncome: number;
  taxableIncome: number;
  taxLossUsed: number;
  taxLossAdded: number;
  cashTaxes: number;
  netIncome: number;
  capex: number;
  changeInWorkingCapital: number;
  cashCollections: number;
  inventoryPurchases: number;
  cashPaidToSuppliers: number;
  operatingCashFlow: number;
  investingCashFlow: number;
  /** Includes paid interest and cash taxes; do NOT treat this as FCFF. */
  cashFlowBeforeFinancing: number;
  debtDraw: number;
  debtRepayment: number;
  equityFunding: number;
  dividends: number;
  financingCashFlow: number;
  netCashFlow: number;
}

export interface CfoProjectionBalances {
  cash: number;
  debt: number;
  netFixedAssets: number;
  receivables: number;
  inventory: number;
  payables: number;
  workingCapital: number;
  taxLossCarryforward: number;
  /** Book equity derived only for the explicitly modelled assets/liabilities. */
  modelledBookEquity: number;
}

export interface CfoProjectionMonth extends CfoProjectionFlows {
  month: string;
  periodKind: "forecast";
  opening: CfoProjectionBalances;
  closing: CfoProjectionBalances;
  /** Negative cash remains visible; this is NOT an automatic debt draw. */
  fundingGap: number;
}

export interface CfoProjectionYear extends CfoProjectionFlows {
  year: number;
  monthCount: number;
  completeYear: boolean;
  opening: CfoProjectionBalances;
  closing: CfoProjectionBalances;
  peakFundingGap: number;
}

export interface CfoProjectionResult {
  version: typeof CFO_PROJECTION_VERSION;
  currency: string;
  scenario: CfoProjectionScenario;
  monthly: CfoProjectionMonth[];
  annual: CfoProjectionYear[];
  fundingGap: { peakRequiredFunding: number; firstMonth: string | null };
  limitations: string[];
}

const FLOW_KEYS = [
  "revenue", "cogs", "grossProfit", "opex", "ebitda", "depreciation", "ebit",
  "interestExpense", "pretaxIncome", "taxableIncome", "taxLossUsed", "taxLossAdded",
  "cashTaxes", "netIncome", "capex", "changeInWorkingCapital", "cashCollections",
  "inventoryPurchases", "cashPaidToSuppliers", "operatingCashFlow", "investingCashFlow",
  "cashFlowBeforeFinancing", "debtDraw", "debtRepayment", "equityFunding", "dividends",
  "financingCashFlow", "netCashFlow",
] as const satisfies readonly (keyof CfoProjectionFlows)[];

function fail(field: string, reason: string): never {
  throw new CfoProjectionInputError(field, reason);
}
function record(value: unknown, field: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail(field, "object required");
}
function amount(value: unknown, field: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    fail(field, "explicit finite nonnegative number required");
  }
}
function rate(value: unknown, field: string): asserts value is number {
  amount(value, field);
  if (value > 1) fail(field, "fraction must be between 0 and 1");
}
function nonempty(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) fail(field, "nonempty string required");
}
function finiteOutputs(value: Record<string, number>, field: string): void {
  for (const [key, n] of Object.entries(value)) {
    if (!Number.isFinite(n)) fail(`${field}.${key}`, "calculation overflow");
  }
}
function balances(o: CfoProjectionOpening, modelledBookEquity?: number): CfoProjectionBalances {
  const workingCapital = o.receivables + o.inventory - o.payables;
  const result = { ...o, workingCapital, modelledBookEquity: modelledBookEquity ??
    o.cash + o.netFixedAssets + workingCapital - o.debt };
  finiteOutputs(result, "balances");
  return result;
}

/** No rounding inside calculations: exports/UI must round at presentation only.
 * Annual rows sum monthly flows and carry opening/closing balances, never sum
 * stock variables or annualise partial years. All scenarios use this same API. */
export function calculateCfoProjection(input: CfoProjectionInput): CfoProjectionResult {
  record(input, "input");
  if (typeof input.currency !== "string" || !/^[A-Z]{3}$/.test(input.currency)) fail("currency", "explicit three-letter currency code required");
  if (typeof input.startMonth !== "string" || !/^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(input.startMonth)) fail("startMonth", "YYYY-MM required");
  record(input.scenario, "scenario");
  nonempty(input.scenario.id, "scenario.id");
  if (!["management", "assessed", "bear", "bull"].includes(input.scenario.basis)) fail("scenario.basis", "unsupported basis");
  if (typeof input.scenario.evidenceSetHash !== "string" || !/^[a-f0-9]{64}$/i.test(input.scenario.evidenceSetHash)) fail("scenario.evidenceSetHash", "SHA-256 required");
  if (!Array.isArray(input.scenario.assumptionRefs) || !input.scenario.assumptionRefs.length) fail("scenario.assumptionRefs", "source/assumption references required");
  input.scenario.assumptionRefs.forEach((ref, i) => nonempty(ref, `scenario.assumptionRefs[${i}]`));
  record(input.opening, "opening");
  for (const key of ["cash", "debt", "netFixedAssets", "receivables", "inventory", "payables", "taxLossCarryforward"] as const) amount(input.opening[key], `opening.${key}`);
  if (!Array.isArray(input.months) || input.months.length === 0) fail("months", "at least one explicitly supplied forecast month required");
  const [startYear, startMonth] = input.startMonth.split("-").map(Number);
  if (startYear + Math.floor((startMonth - 1 + input.months.length - 1) / 12) > 9999) fail("months", "forecast exceeds supported calendar");
  let prior = balances({ ...input.opening });
  const monthly = input.months.map((m, i): CfoProjectionMonth => {
    const path = `months[${i}]`;
    record(m, path);
    for (const key of ["revenue", "cogs", "opex", "depreciation", "capex", "closingReceivables", "closingInventory", "closingPayables", "interestExpense", "debtDraw", "debtRepayment", "equityFunding", "dividends"] as const) amount(m[key], `${path}.${key}`);
    rate(m.cashTaxRate, `${path}.cashTaxRate`);
    if (m.debtRepayment > prior.debt + m.debtDraw) fail(`${path}.debtRepayment`, "exceeds available debt");
    if (m.depreciation > prior.netFixedAssets + m.capex) fail(`${path}.depreciation`, "exceeds depreciable modelled assets");
    const cashCollections = m.revenue + prior.receivables - m.closingReceivables;
    const inventoryPurchases = m.cogs + m.closingInventory - prior.inventory;
    const cashPaidToSuppliers = inventoryPurchases + prior.payables - m.closingPayables;
    if (cashCollections < 0) fail(`${path}.closingReceivables`, "implies negative collections; non-sales receivable movements are unsupported");
    if (inventoryPurchases < 0) fail(`${path}.closingInventory`, "implies negative purchases; inventory write-offs/returns need a separate model");
    if (cashPaidToSuppliers < 0) fail(`${path}.closingPayables`, "implies negative supplier payments; non-trade payables are unsupported");
    const grossProfit = m.revenue - m.cogs;
    const ebitda = grossProfit - m.opex;
    const ebit = ebitda - m.depreciation;
    const pretaxIncome = ebit - m.interestExpense;
    const taxLossUsed = Math.min(Math.max(0, pretaxIncome), prior.taxLossCarryforward);
    const taxLossAdded = Math.max(0, -pretaxIncome);
    const taxableIncome = Math.max(0, pretaxIncome) - taxLossUsed;
    const cashTaxes = taxableIncome * m.cashTaxRate;
    const netIncome = pretaxIncome - cashTaxes;
    const workingCapital = m.closingReceivables + m.closingInventory - m.closingPayables;
    const changeInWorkingCapital = workingCapital - prior.workingCapital;
    const operatingCashFlow = netIncome + m.depreciation - changeInWorkingCapital;
    const investingCashFlow = -m.capex;
    const cashFlowBeforeFinancing = operatingCashFlow + investingCashFlow;
    const financingCashFlow = m.debtDraw - m.debtRepayment + m.equityFunding - m.dividends;
    const netCashFlow = cashFlowBeforeFinancing + financingCashFlow;
    const flows: CfoProjectionFlows = {
      revenue: m.revenue, cogs: m.cogs, grossProfit, opex: m.opex, ebitda,
      depreciation: m.depreciation, ebit, interestExpense: m.interestExpense,
      pretaxIncome, taxableIncome, taxLossUsed, taxLossAdded, cashTaxes, netIncome,
      capex: m.capex, changeInWorkingCapital, cashCollections, inventoryPurchases,
      cashPaidToSuppliers, operatingCashFlow, investingCashFlow, cashFlowBeforeFinancing,
      debtDraw: m.debtDraw, debtRepayment: m.debtRepayment, equityFunding: m.equityFunding,
      dividends: m.dividends, financingCashFlow, netCashFlow,
    };
    finiteOutputs({ ...flows }, path);
    const closing = balances({
      cash: prior.cash + netCashFlow, debt: prior.debt + m.debtDraw - m.debtRepayment,
      netFixedAssets: prior.netFixedAssets + m.capex - m.depreciation,
      receivables: m.closingReceivables, inventory: m.closingInventory, payables: m.closingPayables,
      taxLossCarryforward: prior.taxLossCarryforward - taxLossUsed + taxLossAdded,
    }, prior.modelledBookEquity + netIncome + m.equityFunding - m.dividends);
    const ordinalMonth = startMonth - 1 + i;
    const month = `${startYear + Math.floor(ordinalMonth / 12)}-${String(ordinalMonth % 12 + 1).padStart(2, "0")}`;
    const row: CfoProjectionMonth = { ...flows, month, periodKind: "forecast", opening: { ...prior }, closing, fundingGap: Math.max(0, -closing.cash) };
    prior = closing;
    return row;
  });
  const annual: CfoProjectionYear[] = [];
  for (const month of monthly) {
    const year = Number(month.month.slice(0, 4));
    let row = annual.at(-1);
    if (!row || row.year !== year) {
      const flows = Object.fromEntries(FLOW_KEYS.map(key => [key, 0])) as unknown as CfoProjectionFlows;
      row = { ...flows, year, monthCount: 0, completeYear: false, opening: { ...month.opening }, closing: { ...month.closing }, peakFundingGap: 0 };
      annual.push(row);
    }
    for (const key of FLOW_KEYS) row[key] += month[key];
    finiteOutputs(Object.fromEntries(FLOW_KEYS.map(key => [key, row[key]])), `annual.${year}`);
    row.monthCount++;
    row.completeYear = row.monthCount === 12;
    row.closing = { ...month.closing };
    row.peakFundingGap = Math.max(row.peakFundingGap, month.fundingGap);
  }
  return {
    version: CFO_PROJECTION_VERSION, currency: input.currency,
    scenario: { ...input.scenario, assumptionRefs: [...input.scenario.assumptionRefs] }, monthly, annual,
    fundingGap: { peakRequiredFunding: monthly.reduce((peak, m) => Math.max(peak, m.fundingGap), 0), firstMonth: monthly.find(m => m.fundingGap > 0)?.month ?? null },
    limitations: [
      "Scenario only: input references are preserved, not evidence-verified by this calculator.",
      "Scoped model, not fully integrated three statements: excludes leases, deferred revenue/tax, provisions, asset disposals, FX and other unmodelled balances.",
      "Effective cash tax is paid monthly after unrestricted loss carryforward; jurisdictional limits, timing and interest deductibility require a reviewed separate schedule.",
      "Interest and opex are paid when expensed; trade payables fund inventory/COGS only. No financing interest is inferred.",
      "Funding gaps are month-end minima, not intramonth liquidity requirements. Negative cash is an unfunded scenario, not an overdraft or permission to continue operations.",
      "Cash flow before financing includes interest; it is not FCFF. No steady-state or terminal value is inferred.",
    ],
  };
}

/** Standalone monthly revenue templates. Explicit inputs are reviewed upstream;
 * no automatic cross-month growth, probabilities, TAM capture or sector defaults. */
export type CfoRevenueDrivers =
  | { model: "subscription"; recognition: "month_start"; openingMrr: number; newMrr: number; expansionMrr: number; churnMrr: number; contractionMrr: number }
  | { model: "marketplace"; grossMerchandiseValue: number; refundRate: number; takeRate: number }
  | { model: "services"; headcount: number; workingHoursPerPerson: number; utilisation: number; hourlyRate: number }
  | { model: "commerce"; units: number; capacityUnits: number; unitPrice: number; discountRate: number; returnRate: number }
  | { model: "pre_revenue"; revenue: 0; milestoneRefs: string[] }
  | { model: "custom_reviewed"; revenue: number; reviewReference: string };

export function calculateCfoRevenue(drivers: CfoRevenueDrivers): { revenue: number; model: CfoRevenueDrivers["model"] } {
  record(drivers, "drivers");
  let revenue: number;
  switch (drivers.model) {
    case "subscription": {
      if (drivers.recognition !== "month_start") fail("drivers.recognition", "month_start required; intra-month proration needs a custom model");
      for (const key of ["openingMrr", "newMrr", "expansionMrr", "churnMrr", "contractionMrr"] as const) amount(drivers[key], `drivers.${key}`);
      if (drivers.churnMrr + drivers.contractionMrr > drivers.openingMrr) fail("drivers.churnMrr", "losses exceed opening recurring revenue; cohort modelling required");
      revenue = drivers.openingMrr + drivers.newMrr + drivers.expansionMrr - drivers.churnMrr - drivers.contractionMrr;
      break;
    }
    case "marketplace":
      amount(drivers.grossMerchandiseValue, "drivers.grossMerchandiseValue");
      rate(drivers.refundRate, "drivers.refundRate");
      rate(drivers.takeRate, "drivers.takeRate");
      revenue = drivers.grossMerchandiseValue * (1 - drivers.refundRate) * drivers.takeRate;
      break;
    case "services":
      for (const key of ["headcount", "workingHoursPerPerson", "hourlyRate"] as const) amount(drivers[key], `drivers.${key}`);
      rate(drivers.utilisation, "drivers.utilisation");
      revenue = drivers.headcount * drivers.workingHoursPerPerson * drivers.utilisation * drivers.hourlyRate;
      break;
    case "commerce":
      for (const key of ["units", "capacityUnits", "unitPrice"] as const) amount(drivers[key], `drivers.${key}`);
      rate(drivers.discountRate, "drivers.discountRate");
      rate(drivers.returnRate, "drivers.returnRate");
      if (drivers.units > drivers.capacityUnits) fail("drivers.units", "exceeds explicit capacity");
      revenue = drivers.units * drivers.unitPrice * (1 - drivers.discountRate) * (1 - drivers.returnRate);
      break;
    case "pre_revenue":
      if (drivers.revenue !== 0) fail("drivers.revenue", "pre-revenue must explicitly be zero; post-launch ramp requires another reviewed template");
      if (!Array.isArray(drivers.milestoneRefs) || !drivers.milestoneRefs.length) fail("drivers.milestoneRefs", "milestone references required");
      drivers.milestoneRefs.forEach((ref, i) => nonempty(ref, `drivers.milestoneRefs[${i}]`));
      revenue = 0;
      break;
    case "custom_reviewed":
      amount(drivers.revenue, "drivers.revenue");
      nonempty(drivers.reviewReference, "drivers.reviewReference");
      revenue = drivers.revenue;
      break;
    default:
      fail("drivers.model", "unsupported model; supply an explicitly reviewed custom template");
  }
  finiteOutputs({ revenue }, "drivers");
  return { revenue, model: drivers.model };
}
