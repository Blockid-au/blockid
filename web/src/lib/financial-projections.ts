// src/lib/financial-projections.ts
//
// Two things live here:
//
//   1. Legacy monthly-projection engine (`generateMonthlyProjection`,
//      `calculateValuationMultiples`, `calculateMarketCapture`,
//      `calculatePaybackPeriod`) — used by clevel-valuation.ts. Kept
//      untouched apart from renaming its internal `ProjectionMonth` type
//      to `MonthlyProjectionRow` so the new 3-year projection tool can
//      claim the shorter name.
//
//   2. T0120 — deterministic 3-year founder-facing projection engine
//      (`generateProjection`, `projectionToCsv`). Given current MRR, burn,
//      headcount, sector and scenario, it emits a 36-month monthly table +
//      YoY summary + an "investor-readiness note" calibrated against AU
//      sector norms (VC_BENCHMARKS from cfo-valuation.ts, which is what
//      cfo-projection-norms.ts uses). RDTI cash-equivalent offsets come
//      from cfo-au-tax-incentives.ts.
//
// Determinism critical for the T0120 engine: no Math.random(), no Date.now().
// Every derived date is a pure function of `input.startDate`. Same inputs →
// identical output.
//
// AFSL: outputs are illustrative projections only, not financial advice.

import { VC_BENCHMARKS, type Sector } from "./agents/cfo-valuation";
import {
  RDTI_REFUNDABLE_PREMIUM,
  RDTI_MIN_SPEND_AUD,
} from "./agents/cfo-au-tax-incentives";

// ═══════════════════════════════════════════════════════════════════════════
// Legacy engine — kept for clevel-valuation.ts compatibility
// ═══════════════════════════════════════════════════════════════════════════

export interface CostStructure {
  fixedMonthly: number;
  variablePercentOfRevenue: number;
  headcount: number;
  avgSalary: number;
  marketingBudget: number;
  infraCost: number;
}

/** Legacy monthly projection row (renamed from `ProjectionMonth`). */
export interface MonthlyProjectionRow {
  month: number;
  label: string;
  revenue: number;
  costs: number;
  profit: number;
  cumulativeRevenue: number;
  cumulativeCosts: number;
  cumulativeProfit: number;
  customers: number;
  mrr: number;
}

export interface ProjectionResult {
  months: MonthlyProjectionRow[];
  breakEvenMonth: number | null;
  paybackMonths: number | null;
  projectedARR12: number;
  projectedARR24: number;
  totalRevenue12: number;
  totalRevenue24: number;
  totalCosts12: number;
  totalCosts24: number;
}

export interface ValuationMultiple {
  method: string;
  multiple: number;
  valuation: number;
  basis: string;
}

export interface MarketCaptureMonth {
  month: number;
  label: string;
  customers: number;
  tamPercent: number;
  samPercent: number;
  somPercent: number;
  revenue: number;
}

export interface MarketCaptureResult {
  months: MarketCaptureMonth[];
  tam: number;
  sam: number;
  som: number;
  somReachedMonth: number | null;
}

// ── Monthly Projection ─────────────────────────────────────────────────

export function generateMonthlyProjection(input: {
  currentMRR: number;
  monthlyGrowthRate: number;
  projectionMonths?: number;
  costs: CostStructure;
  currentCustomers?: number;
  arpu?: number;
  churnRate?: number;
}): ProjectionResult {
  const months = input.projectionMonths ?? 24;
  const growthRate = input.monthlyGrowthRate / 100;
  const churnRate = (input.churnRate ?? 5) / 100;
  const arpu = input.arpu ?? (input.currentCustomers && input.currentCustomers > 0
    ? input.currentMRR / input.currentCustomers
    : 50);

  const projections: MonthlyProjectionRow[] = [];
  let mrr = input.currentMRR;
  let customers = input.currentCustomers ?? Math.max(1, Math.round(mrr / arpu));
  let cumulativeRevenue = 0;
  let cumulativeCosts = 0;

  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    // Growth + churn
    const newCustomers = Math.round(customers * growthRate);
    const churned = Math.round(customers * churnRate);
    customers = Math.max(0, customers + newCustomers - churned);
    mrr = customers * arpu;

    const revenue = mrr;
    const variableCosts = revenue * (input.costs.variablePercentOfRevenue / 100);
    const personnelCosts = input.costs.headcount * input.costs.avgSalary / 12;
    const totalCosts = input.costs.fixedMonthly + variableCosts + personnelCosts + input.costs.marketingBudget + input.costs.infraCost;

    cumulativeRevenue += revenue;
    cumulativeCosts += totalCosts;

    projections.push({
      month: i + 1,
      label,
      revenue: Math.round(revenue),
      costs: Math.round(totalCosts),
      profit: Math.round(revenue - totalCosts),
      cumulativeRevenue: Math.round(cumulativeRevenue),
      cumulativeCosts: Math.round(cumulativeCosts),
      cumulativeProfit: Math.round(cumulativeRevenue - cumulativeCosts),
      customers,
      mrr: Math.round(mrr),
    });
  }

  const breakEvenMonth = projections.find((p) => p.profit >= 0)?.month ?? null;
  const paybackMonth = projections.find((p) => p.cumulativeProfit >= 0)?.month ?? null;

  return {
    months: projections,
    breakEvenMonth,
    paybackMonths: paybackMonth,
    projectedARR12: projections.length >= 12 ? projections[11].mrr * 12 : projections[projections.length - 1].mrr * 12,
    projectedARR24: projections.length >= 24 ? projections[23].mrr * 12 : projections[projections.length - 1].mrr * 12,
    totalRevenue12: projections.slice(0, 12).reduce((s, p) => s + p.revenue, 0),
    totalRevenue24: projections.reduce((s, p) => s + p.revenue, 0),
    totalCosts12: projections.slice(0, 12).reduce((s, p) => s + p.costs, 0),
    totalCosts24: projections.reduce((s, p) => s + p.costs, 0),
  };
}

// ── Revenue Multiple Valuation ─────────────────────────────────────────

const SECTOR_MULTIPLES: Record<string, { low: number; mid: number; high: number }> = {
  saas: { low: 10, mid: 20, high: 40 },
  fintech: { low: 8, mid: 15, high: 30 },
  marketplace: { low: 3, mid: 6, high: 12 },
  healthtech: { low: 8, mid: 15, high: 25 },
  edtech: { low: 5, mid: 10, high: 20 },
  ecommerce: { low: 2, mid: 4, high: 8 },
  deeptech: { low: 15, mid: 25, high: 50 },
  default: { low: 5, mid: 12, high: 25 },
};

export function calculateValuationMultiples(input: {
  projectedARR: number;
  sector: string;
  stage: number;
  monthlyGrowthRate: number;
}): ValuationMultiple[] {
  const multiples = SECTOR_MULTIPLES[input.sector.toLowerCase()] ?? SECTOR_MULTIPLES.default;

  // Growth premium: +1x per 10% monthly growth rate
  const growthPremium = Math.max(0, input.monthlyGrowthRate / 10);

  // Stage premium: later stages get higher multiples
  const stagePremium = input.stage >= 5 ? 2 : input.stage >= 3 ? 1 : 0;

  return [
    {
      method: "Conservative",
      multiple: Math.round((multiples.low + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.low + growthPremium + stagePremium)),
      basis: `${multiples.low + growthPremium + stagePremium}x ARR (${input.sector} low + growth)`,
    },
    {
      method: "Base Case",
      multiple: Math.round((multiples.mid + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.mid + growthPremium + stagePremium)),
      basis: `${multiples.mid + growthPremium + stagePremium}x ARR (${input.sector} mid + growth)`,
    },
    {
      method: "Optimistic",
      multiple: Math.round((multiples.high + growthPremium + stagePremium) * 10) / 10,
      valuation: Math.round(input.projectedARR * (multiples.high + growthPremium + stagePremium)),
      basis: `${multiples.high + growthPremium + stagePremium}x ARR (${input.sector} high + growth)`,
    },
  ];
}

// ── Market Capture ─────────────────────────────────────────────────────

export function calculateMarketCapture(input: {
  tam: number;
  sam: number;
  som: number;
  currentCustomers: number;
  monthlyGrowthRate: number;
  arpu: number;
  months?: number;
}): MarketCaptureResult {
  const months = input.months ?? 24;
  const growthRate = input.monthlyGrowthRate / 100;
  const projections: MarketCaptureMonth[] = [];

  let customers = input.currentCustomers;
  let somReachedMonth: number | null = null;
  const somCustomers = input.som / (input.arpu * 12);

  const now = new Date();

  for (let i = 0; i < months; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const label = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

    customers = Math.round(customers * (1 + growthRate));
    const annualRevenue = customers * input.arpu * 12;

    projections.push({
      month: i + 1,
      label,
      customers,
      tamPercent: Math.round((annualRevenue / input.tam) * 10000) / 100,
      samPercent: Math.round((annualRevenue / input.sam) * 10000) / 100,
      somPercent: Math.round((annualRevenue / input.som) * 10000) / 100,
      revenue: Math.round(annualRevenue),
    });

    if (!somReachedMonth && customers >= somCustomers) {
      somReachedMonth = i + 1;
    }
  }

  return {
    months: projections,
    tam: input.tam,
    sam: input.sam,
    som: input.som,
    somReachedMonth,
  };
}

// ── Break-even & Payback helpers ───────────────────────────────────────

export function calculatePaybackPeriod(
  investmentAmount: number,
  projection: ProjectionResult,
): { months: number | null; roi: number } {
  let cumProfit = 0;
  for (const m of projection.months) {
    cumProfit += m.profit;
    if (cumProfit >= investmentAmount) {
      return { months: m.month, roi: Math.round((cumProfit / investmentAmount) * 100) };
    }
  }
  return {
    months: null,
    roi: Math.round((cumProfit / Math.max(1, investmentAmount)) * 100),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T0120 — 3-year founder-facing financial projection engine
// ═══════════════════════════════════════════════════════════════════════════

export type ProjectionScenario = "aggressive" | "moderate" | "conservative";

export interface ProjectionInput {
  /** Sector key (matches VC_BENCHMARKS). Case-insensitive; unknown → "default". */
  sector: string;
  /** Monthly recurring revenue at month 0, AUD. Must be >= 0. */
  startingMrrAud: number;
  /** Monthly cash burn at month 0, AUD. Positive number. */
  startingBurnAud: number;
  /** Number of founders on the team. */
  founderCount: number;
  /** ISO date (YYYY-MM-DD) marking month 0 of the projection. */
  startDate: string;
  /** Growth scenario. */
  scenario: ProjectionScenario;
  /** If true, apply the RDTI premium as a cash-equivalent monthly offset. */
  includeTaxIncentives: boolean;
}

export interface ProjectionMonth {
  /** 1-indexed month (1..36). */
  month: number;
  /** ISO date for the first day of the month (YYYY-MM-DD). */
  date: string;
  revenueAud: number;
  grossMarginAud: number;
  opexAud: number;
  ebitdaAud: number;
  /** Cash out for the month (0 if cash-positive), AUD. */
  cashOutflowAud: number;
  /** Cumulative cash outflow to-date, AUD. */
  cumCashAud: number;
  headcount: number;
  /** Cash-equivalent RDTI/ESIC offset applied this month, AUD. */
  taxOffsetAud: number;
}

export interface ProjectionSummary {
  revenueYear1: number;
  revenueYear2: number;
  revenueYear3: number;
  burnYear1: number;
  ebitdaYear3: number;
  /** First month where EBITDA is non-negative, else null. */
  runwayMonths: number | null;
  peakBurnAud: number;
  scenarioNote: string;
  investorReadinessNote: string;
}

export interface SectorNormsUsed {
  sector: Sector;
  baseMonthlyGrowthPct: number;
  grossMarginPct: number;
  rdIntensityPct: number;
  arrMultipleMidYr3: number;
}

export interface Projection {
  input: ProjectionInput;
  months: ProjectionMonth[];
  summary: ProjectionSummary;
  sectorNormsUsed: SectorNormsUsed;
  generatedAt: string;
  disclaimer: string;
}

// ── Sector calibration (derived from VC_BENCHMARKS + AU norms) ──────────
// Company-level baseline monthly growth (not market CAGR). Multiplied by
// scenario factor, then decayed via an S-curve toward a 2% floor.
const SECTOR_BASE_GROWTH_PCT: Record<Sector, number> = {
  ai: 12,
  saas: 8,
  fintech: 7,
  healthtech: 6,
  deeptech: 5,
  marketplace: 7,
  ecommerce: 6,
  default: 6,
};

// AusIndustry / ATO sector-typical R&D intensity as % of monthly opex.
const SECTOR_RD_INTENSITY_PCT: Record<Sector, number> = {
  deeptech: 40,
  healthtech: 30,
  ai: 30,
  saas: 20,
  fintech: 20,
  marketplace: 15,
  ecommerce: 10,
  default: 10,
};

const SCENARIO_MULTIPLIER: Record<ProjectionScenario, number> = {
  aggressive: 1.4,
  moderate: 1.0,
  conservative: 0.7,
};

const DISCLAIMER =
  "General information only. Not financial advice. Projections are illustrative estimates based on AU sector benchmarks and may differ materially from actual outcomes.";

// ── Helpers ─────────────────────────────────────────────────────────────

function normaliseSector(input: string): Sector {
  const key = (input ?? "").trim().toLowerCase();
  return (key in VC_BENCHMARKS ? (key as Sector) : "default");
}

function round0(v: number): number {
  return Number.isFinite(v) ? Math.round(v) : 0;
}

/**
 * Add `months` calendar months to an ISO YYYY-MM-DD date, deterministic.
 * Always returns the first-of-month string (YYYY-MM-01).
 */
function addMonths(startDate: string, monthsToAdd: number): string {
  const parsed = startDate.length >= 10 ? startDate.slice(0, 10) : startDate;
  const parts = parsed.split("-");
  const y = Number.parseInt(parts[0] ?? "1970", 10);
  const m = Number.parseInt(parts[1] ?? "1", 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return "1970-01-01";
  const total = y * 12 + (m - 1) + monthsToAdd;
  const newYear = Math.floor(total / 12);
  const newMonth = (total % 12) + 1;
  const mm = String(newMonth).padStart(2, "0");
  return `${newYear}-${mm}-01`;
}

/**
 * S-curve growth decay: peaks in the first months and tapers.
 * Returns the monthly growth rate for month t (0-indexed) as a decimal.
 * Reduces by 1% (absolute) every 6 months, floored at 2%.
 */
function monthlyGrowthAt(baseGrowthPct: number, t: number): number {
  const decayed = baseGrowthPct - (t / 6) * 1.0;
  const floored = Math.max(2, decayed);
  return floored / 100;
}

/** Headcount schedule — founders at t=0, +1 hire every N months by scenario. */
function headcountAt(
  founderCount: number,
  scenario: ProjectionScenario,
  t: number,
): number {
  const monthsPerHire = scenario === "aggressive" ? 2 : scenario === "moderate" ? 4 : 6;
  return Math.max(1, founderCount) + Math.floor(t / monthsPerHire);
}

// ── Validation ──────────────────────────────────────────────────────────

export const ALLOWED_SCENARIOS: readonly ProjectionScenario[] = [
  "aggressive",
  "moderate",
  "conservative",
];

export function isProjectionScenario(v: unknown): v is ProjectionScenario {
  return typeof v === "string" && (ALLOWED_SCENARIOS as readonly string[]).includes(v);
}

// ── Core: generateProjection ────────────────────────────────────────────

export function generateProjection(input: ProjectionInput): Projection {
  const sector = normaliseSector(input.sector);
  const bm = VC_BENCHMARKS[sector];
  const baseGrowth = SECTOR_BASE_GROWTH_PCT[sector] ?? SECTOR_BASE_GROWTH_PCT.default;
  const scenarioMult = SCENARIO_MULTIPLIER[input.scenario] ?? 1;
  const effectiveBaseGrowthPct = baseGrowth * scenarioMult;

  const grossMarginPct = Math.max(20, Math.min(95, bm.grossMarginTarget));
  const rdIntensityPct = SECTOR_RD_INTENSITY_PCT[sector] ?? SECTOR_RD_INTENSITY_PCT.default;

  const startingMrr = Math.max(0, input.startingMrrAud);
  const startingBurn = Math.max(0, input.startingBurnAud);
  const founders = Math.max(1, Math.floor(input.founderCount));

  // Opex escalation per month by scenario (aggressive = more hires, faster ramp)
  const opexMonthlyGrowthPct =
    input.scenario === "aggressive" ? 3.5
      : input.scenario === "moderate" ? 2.0
        : 1.0;

  const months: ProjectionMonth[] = [];
  let mrr = startingMrr;
  let opex = startingBurn;
  let cumCash = 0;
  let peakBurn = 0;

  for (let t = 0; t < 36; t++) {
    if (t > 0) {
      const g = monthlyGrowthAt(effectiveBaseGrowthPct, t);
      mrr = mrr * (1 + g);
      opex = opex * (1 + opexMonthlyGrowthPct / 100);
    }

    const revenue = mrr;
    const grossMargin = revenue * (grossMarginPct / 100);
    const ebitda = grossMargin - opex;

    // Tax offset — cash-equivalent RDTI premium above corp tax rate.
    // Applied monthly for smoother modelling; only kicks in when annualised
    // R&D spend clears the A$20k minimum threshold.
    let taxOffset = 0;
    if (input.includeTaxIncentives) {
      const monthlyRdSpend = opex * (rdIntensityPct / 100);
      const annualisedRdSpend = monthlyRdSpend * 12;
      if (annualisedRdSpend >= RDTI_MIN_SPEND_AUD) {
        taxOffset = monthlyRdSpend * RDTI_REFUNDABLE_PREMIUM;
      }
    }

    // Cash outflow = opex minus gross margin minus tax offset, floored at 0.
    const preOffset = opex - grossMargin;
    const cashOutflow = Math.max(0, preOffset - taxOffset);
    cumCash += cashOutflow;
    if (cashOutflow > peakBurn) peakBurn = cashOutflow;

    months.push({
      month: t + 1,
      date: addMonths(input.startDate, t),
      revenueAud: round0(revenue),
      grossMarginAud: round0(grossMargin),
      opexAud: round0(opex),
      ebitdaAud: round0(ebitda),
      cashOutflowAud: round0(cashOutflow),
      cumCashAud: round0(cumCash),
      headcount: headcountAt(founders, input.scenario, t),
      taxOffsetAud: round0(taxOffset),
    });
  }

  const sumRange = (
    from: number,
    to: number,
    pick: (m: ProjectionMonth) => number,
  ): number => months.slice(from, to).reduce((s, m) => s + pick(m), 0);

  const revenueYear1 = round0(sumRange(0, 12, (m) => m.revenueAud));
  const revenueYear2 = round0(sumRange(12, 24, (m) => m.revenueAud));
  const revenueYear3 = round0(sumRange(24, 36, (m) => m.revenueAud));
  const burnYear1 = round0(sumRange(0, 12, (m) => m.cashOutflowAud));
  const ebitdaYear3 = round0(sumRange(24, 36, (m) => m.ebitdaAud));

  // Break-even = first month with EBITDA >= 0.
  const breakEvenIdx = months.findIndex((m) => m.ebitdaAud >= 0);
  const runwayMonths: number | null = breakEvenIdx >= 0 ? breakEvenIdx + 1 : null;

  const scenarioNote =
    input.scenario === "aggressive"
      ? "Aggressive: 1.4x sector-baseline growth, 3.5%/mo opex ramp, hire every 2 months."
      : input.scenario === "moderate"
        ? "Moderate: sector-baseline growth, 2.0%/mo opex ramp, hire every 4 months."
        : "Conservative: 0.7x sector-baseline growth, 1.0%/mo opex ramp, hire every 6 months.";

  const arrY3Ending = (months[35]?.revenueAud ?? 0) * 12;
  const impliedValuationMid = arrY3Ending * bm.arrMultiple.mid;

  const investorReadinessNote = buildInvestorReadinessNote({
    sector,
    scenario: input.scenario,
    baseGrowthPct: effectiveBaseGrowthPct,
    grossMarginPct,
    ebitdaYear3,
    revenueYear3,
    runwayMonths,
    impliedValuationMid,
    arrMultipleMid: bm.arrMultiple.mid,
    includeTaxIncentives: input.includeTaxIncentives,
  });

  const summary: ProjectionSummary = {
    revenueYear1,
    revenueYear2,
    revenueYear3,
    burnYear1,
    ebitdaYear3,
    runwayMonths,
    peakBurnAud: round0(peakBurn),
    scenarioNote,
    investorReadinessNote,
  };

  const sectorNormsUsed: SectorNormsUsed = {
    sector,
    baseMonthlyGrowthPct: effectiveBaseGrowthPct,
    grossMarginPct,
    rdIntensityPct,
    arrMultipleMidYr3: bm.arrMultiple.mid,
  };

  return {
    input,
    months,
    summary,
    sectorNormsUsed,
    generatedAt: input.startDate,
    disclaimer: DISCLAIMER,
  };
}

interface InvestorReadinessArgs {
  sector: Sector;
  scenario: ProjectionScenario;
  baseGrowthPct: number;
  grossMarginPct: number;
  ebitdaYear3: number;
  revenueYear3: number;
  runwayMonths: number | null;
  impliedValuationMid: number;
  arrMultipleMid: number;
  includeTaxIncentives: boolean;
}

function buildInvestorReadinessNote(a: InvestorReadinessArgs): string {
  const parts: string[] = [];
  parts.push(
    `Sector "${a.sector}" — AU norm: ${a.grossMarginPct}% gross margin, ~${a.arrMultipleMid}x forward ARR multiple.`,
  );
  parts.push(
    `${a.scenario} scenario projects ~${a.baseGrowthPct.toFixed(1)}%/mo growth (baseline, decays over time).`,
  );
  if (a.revenueYear3 > 0) {
    parts.push(
      `Year-3 exit ARR implies a comparables valuation mid-point of A$${a.impliedValuationMid.toLocaleString("en-AU", { maximumFractionDigits: 0 })} (${a.arrMultipleMid}x).`,
    );
  }
  if (a.ebitdaYear3 >= 0) {
    parts.push("EBITDA positive by end of year 3 — investor-friendly path to sustainability.");
  } else {
    parts.push(
      `EBITDA still negative in year 3 (A$${a.ebitdaYear3.toLocaleString("en-AU", { maximumFractionDigits: 0 })}). Model a Series A raise or trim opex to shorten the path.`,
    );
  }
  if (a.runwayMonths !== null) {
    parts.push(`Model shows cash-positive by month ${a.runwayMonths}.`);
  } else {
    parts.push("Model does not reach cash-positive within 36 months — plan a raise.");
  }
  if (a.includeTaxIncentives) {
    parts.push("RDTI premium (18.5% above tax) applied as a monthly cash-equivalent offset.");
  } else {
    parts.push("Tax incentives excluded — enable to see the R&D / ESIC cash-flow uplift.");
  }
  return parts.join(" ");
}

// ── CSV export ──────────────────────────────────────────────────────────

/** CSV-safe cell — doubles internal quotes, wraps in quotes when needed. */
function csvCell(v: string | number): string {
  const s = typeof v === "number" ? String(v) : v;
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvRow(cells: Array<string | number>): string {
  return cells.map(csvCell).join(",");
}

/**
 * Serialise a projection to CSV: header + 36 monthly rows + blank spacer +
 * 3 YoY summary rows (Year 1 / Year 2 / Year 3).
 */
export function projectionToCsv(projection: Projection): string {
  const header = csvRow([
    "period",
    "month",
    "date",
    "revenue_aud",
    "gross_margin_aud",
    "opex_aud",
    "ebitda_aud",
    "cash_outflow_aud",
    "cum_cash_aud",
    "headcount",
    "tax_offset_aud",
  ]);

  const monthlyRows = projection.months.map((m) =>
    csvRow([
      "monthly",
      m.month,
      m.date,
      m.revenueAud,
      m.grossMarginAud,
      m.opexAud,
      m.ebitdaAud,
      m.cashOutflowAud,
      m.cumCashAud,
      m.headcount,
      m.taxOffsetAud,
    ]),
  );

  const years: Array<[string, number, number]> = [
    ["yoy_year_1", 0, 12],
    ["yoy_year_2", 12, 24],
    ["yoy_year_3", 24, 36],
  ];
  const yearRows: string[] = years.map(([label, from, to]) => {
    const slice = projection.months.slice(from, to);
    const revenue = round0(slice.reduce((s, m) => s + m.revenueAud, 0));
    const grossMargin = round0(slice.reduce((s, m) => s + m.grossMarginAud, 0));
    const opex = round0(slice.reduce((s, m) => s + m.opexAud, 0));
    const ebitda = round0(slice.reduce((s, m) => s + m.ebitdaAud, 0));
    const cashOutflow = round0(slice.reduce((s, m) => s + m.cashOutflowAud, 0));
    const taxOffset = round0(slice.reduce((s, m) => s + m.taxOffsetAud, 0));
    const endRow = slice[slice.length - 1];
    return csvRow([
      label,
      "",
      endRow?.date ?? "",
      revenue,
      grossMargin,
      opex,
      ebitda,
      cashOutflow,
      endRow?.cumCashAud ?? 0,
      endRow?.headcount ?? 0,
      taxOffset,
    ]);
  });

  return [header, ...monthlyRows, "", ...yearRows].join("\n") + "\n";
}
