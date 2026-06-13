/**
 * C-Level Startup Valuation Template — BlockID Startup Index™ (BSI-AU)
 *
 * Professional blended valuation engine applying 5 methods:
 *   1. Berkus Method (AU-adjusted, A$750K per pillar)
 *   2. Scorecard Method (AU stage medians, SVI-adjusted)
 *   3. DCF — 5-year horizon, 35% WACC (AU early-stage benchmark)
 *   4. VC Method (10x return target, 8x ARR exit multiple)
 *   5. SVI-Based (BlockID Startup Index™ proprietary)
 *
 * Used by C-level AI agents to auto-value any startup profile in the system.
 * Weights: Berkus 15% | Scorecard 25% | DCF 10% | VC 25% | SVI 25%
 */

import { computeValuation, type ValuationInput } from "./valuation";
import { generateMonthlyProjection, type CostStructure } from "./financial-projections";

// ─── Stage mappings ────────────────────────────────────────────────────────
const STAGE_BASE_AUD: Record<number, number> = {
  0: 300_000,
  1: 750_000,
  2: 2_000_000,
  3: 3_500_000,
  4: 6_000_000,
  5: 10_000_000,
  6: 20_000_000,
  7: 50_000_000,
};

const STAGE_TO_SCORECARD_KEY: Record<number, string> = {
  0: "idea", 1: "idea", 2: "mvp", 3: "mvp", 4: "growth", 5: "growth",
  6: "growth", 7: "growth",
};

// ─── Types ────────────────────────────────────────────────────────────────
export interface CLevelValuationInput {
  /** Startup display name */
  name: string;
  /** Founder email (maps to svi_accounts) */
  email: string;
  /** SVI numeric score (0–200+) */
  sviScore: number;
  /** Stage index 0–7 */
  stage: number;
  /** SVI dimension scores (0–100 each) */
  dimensions?: ValuationInput["dimensions"];
  /** Current MRR in AUD (0 if pre-revenue) */
  mrrAud?: number;
  /** Monthly revenue growth rate as decimal (e.g. 0.15 = 15%) */
  monthlyGrowthRate?: number;
  /** Monthly churn rate as decimal */
  churnRate?: number;
  /** Average revenue per user in AUD */
  arpu?: number;
  /** Monthly burn rate in AUD */
  burnRateAud?: number;
  /** Runway months remaining */
  runwayMonths?: number;
  /** Total Addressable Market in AUD */
  tamAud?: number;
  /** Serviceable Addressable Market in AUD */
  samAud?: number;
  /** Sector (e.g. SaaS, FinTech) */
  sector?: string;
  /** Team headcount */
  teamSize?: number;
  /** Current paying customer count */
  customers?: number;
}

export interface MethodResult {
  method: string;
  lowAud: number;
  midAud: number;
  highAud: number;
  weight: number;
  confidence: "Low" | "Medium" | "High";
  notes: string;
}

export interface CLevelValuationResult {
  input: CLevelValuationInput;
  methods: MethodResult[];
  blended: {
    lowAud: number;
    midAud: number;
    highAud: number;
  };
  /** Qualitative band */
  band: string;
  /** Growth projections */
  projections: {
    arrMonth12: number;
    arrMonth24: number;
    arrMonth36: number;
    breakEvenMonth: number | null;
    grossMarginEst: number;
  };
  /** Action plan derived from valuation gaps */
  actionPlan: string[];
  generatedAt: string;
}

// ─── DCF helper ──────────────────────────────────────────────────────────────
function dcfValuation(input: CLevelValuationInput): number {
  const WACC = 0.35;
  const terminalGrowth = 0.03;
  const ebitMargins = [-0.6, -0.2, 0.05, 0.18, 0.28];

  // Estimate Year 1 revenue from MRR projection
  const mrr0 = input.mrrAud ?? 0;
  const growth = input.monthlyGrowthRate ?? 0.10;
  let totalPV = 0;
  let terminalFCF = 0;

  for (let yr = 1; yr <= 5; yr++) {
    // Compound MRR growth over 12 months each year
    const mrrEoY = mrr0 * Math.pow(1 + growth, yr * 12);
    const annualRevenue = mrrEoY * 12;
    const ebit = annualRevenue * ebitMargins[yr - 1]!;
    const fcf = ebit * 0.85;
    const pv = fcf / Math.pow(1 + WACC, yr);
    totalPV += pv;
    if (yr === 5) terminalFCF = fcf;
  }

  const terminalValue = (terminalFCF * (1 + terminalGrowth)) /
    (WACC - terminalGrowth) / Math.pow(1 + WACC, 5);

  return Math.max(0, Math.round(totalPV + terminalValue));
}

// ─── VC Method ───────────────────────────────────────────────────────────────
function vcValuation(input: CLevelValuationInput): number {
  const mrr0 = input.mrrAud ?? 0;
  const growth = input.monthlyGrowthRate ?? 0.10;
  const arrY5 = mrr0 * Math.pow(1 + growth, 60) * 12;
  const exitMultiple = 8; // 8x ARR at exit (AU SaaS median)
  const exitVal = arrY5 * exitMultiple;
  const targetReturn = 10;
  const postMoney = exitVal / targetReturn;
  return Math.max(0, Math.round(postMoney - 500_000));
}

// ─── SVI-based valuation ──────────────────────────────────────────────────────
function sviValuation(input: CLevelValuationInput): { low: number; mid: number; high: number } {
  const base = STAGE_BASE_AUD[input.stage] ?? STAGE_BASE_AUD[2]!;
  const premium = Math.max(0, (input.sviScore - 100) / 100);
  return {
    low:  Math.round(base * (1 + premium * 0.7)),
    mid:  Math.round(base * (1 + premium)),
    high: Math.round(base * (1 + premium * 1.4)),
  };
}

// ─── Band label ───────────────────────────────────────────────────────────────
function valuationBand(mid: number): string {
  if (mid >= 50_000_000) return "Unicorn Track (A$50M+)";
  if (mid >= 20_000_000) return "Series A Ready (A$20M–$50M)";
  if (mid >= 7_500_000)  return "Seed Stage (A$7.5M–$20M)";
  if (mid >= 3_000_000)  return "Pre-Seed / Seed (A$3M–$7.5M)";
  if (mid >= 1_000_000)  return "Idea-Stage / Pre-Seed (A$1M–$3M)";
  return "Concept Stage (<A$1M)";
}

// ─── Action plan generator ────────────────────────────────────────────────────
function deriveActionPlan(input: CLevelValuationInput, methods: MethodResult[]): string[] {
  const plan: string[] = [];
  const d = input.dimensions;

  if (!d) return ["Run a full SVI analysis to unlock dimension-specific recommendations."];

  if ((d.ftv ?? 0) < 60) {
    plan.push("FTV gap: Add a co-founder or formalise an advisory board — increases team score and valuation by 10–20%.");
  }
  if ((d.tre ?? 0) < 55) {
    plan.push("TRE gap: Activate Stripe and confirm first paying customer — revenue evidence is the single highest-impact SVI lever.");
  }
  if ((d.cgh ?? 0) < 50) {
    plan.push("CGH gap: Pursue a small angel round or accelerator (Startmate, Antler) — any external capital dramatically improves CGH.");
  }
  if ((d.lco ?? 0) < 65) {
    plan.push("LCO gap: Register trademark via IP Australia (~A$250) and ensure ASIC compliance — quick wins for legal credibility.");
  }
  if ((d.mpc ?? 0) < 70) {
    plan.push("MPC gap: Document TAM/SAM/SOM with third-party data (IBIS, Statista AU) — evidence-backed market sizing lifts MPC.");
  }
  if ((input.mrrAud ?? 0) === 0) {
    plan.push("Revenue: Activate at least one paid plan immediately — even A$1 in MRR moves the platform to Stage 4 evaluation.");
  }
  if ((input.runwayMonths ?? 24) < 12) {
    plan.push("Runway critical: <12 months — prioritise fundraising or revenue acceleration now.");
  }

  // Always include strategic items
  plan.push("Product Hunt launch: A single successful launch can add 200–500 users and significant social proof in 48 hours.");
  plan.push("Investor update: Send a monthly 5-bullet update to your svi_accounts investor list — keeps deal flow warm.");

  return plan.slice(0, 6); // cap at 6 items
}

// ─── MAIN FUNCTION ────────────────────────────────────────────────────────────

export function computeCLevelValuation(
  input: CLevelValuationInput,
): CLevelValuationResult {
  // 1. Berkus + Scorecard via existing valuation engine
  const baseInput: ValuationInput = {
    sviScore: input.sviScore,
    stage: STAGE_TO_SCORECARD_KEY[input.stage] ?? "mvp",
    mrrAud: input.mrrAud,
    arrAud: (input.mrrAud ?? 0) * 12,
    revenueGrowthPct: (input.monthlyGrowthRate ?? 0) * 100,
    monthlyChurnPct: (input.churnRate ?? 0.05) * 100,
    burnRateAud: input.burnRateAud,
    runwayMonths: input.runwayMonths,
    sector: input.sector,
    teamSize: input.teamSize,
    dimensions: input.dimensions,
  };
  const base = computeValuation(baseInput);

  // 2. DCF
  const dcf = dcfValuation(input);
  const dcfRange = { low: Math.round(dcf * 0.6), mid: dcf, high: Math.round(dcf * 1.5) };

  // 3. VC Method
  const vc = vcValuation(input);
  const vcRange = { low: Math.round(vc * 0.7), mid: vc, high: Math.round(vc * 1.4) };

  // 4. SVI-based
  const svi = sviValuation(input);

  // 5. Assemble methods
  const methods: MethodResult[] = [
    {
      method: "Berkus Method (AU-Adjusted)",
      lowAud: base.breakdown.berkus.value * 0.7 | 0,
      midAud: base.breakdown.berkus.value,
      highAud: base.breakdown.berkus.value * 1.3 | 0,
      weight: 0.15,
      confidence: "Medium",
      notes: "Based on 5 SVI dimension pillars × A$750K max each",
    },
    {
      method: "Scorecard Method (AU Stage Median)",
      lowAud: base.breakdown.scorecard.value * 0.8 | 0,
      midAud: base.breakdown.scorecard.value,
      highAud: base.breakdown.scorecard.value * 1.25 | 0,
      weight: 0.25,
      confidence: "Medium",
      notes: "Stage base × SVI dimension adjustments (AVCAL 2025 medians)",
    },
    {
      method: "DCF — 5yr, 35% WACC",
      lowAud: dcfRange.low,
      midAud: dcfRange.mid,
      highAud: dcfRange.high,
      weight: 0.10,
      confidence: (input.mrrAud ?? 0) > 0 ? "Medium" : "Low",
      notes: "Only reliable with revenue data; 35% WACC = AU early-stage benchmark",
    },
    {
      method: "VC Method (10x return, 8x ARR exit)",
      lowAud: vcRange.low,
      midAud: vcRange.mid,
      highAud: vcRange.high,
      weight: 0.25,
      confidence: "Medium",
      notes: "AU SaaS exit: 8x ARR | VC target: 10x return in 5 years",
    },
    {
      method: "BlockID SVI-Based (BSI-AU Proprietary)",
      lowAud: svi.low,
      midAud: svi.mid,
      highAud: svi.high,
      weight: 0.25,
      confidence: "High",
      notes: `SVI ${input.sviScore} | Stage ${input.stage} base A$${(STAGE_BASE_AUD[input.stage]??0).toLocaleString()}`,
    },
  ];

  // 6. Blended (weighted average)
  const blendedLow  = Math.round(methods.reduce((s, m) => s + m.lowAud  * m.weight, 0));
  const blendedMid  = Math.round(methods.reduce((s, m) => s + m.midAud  * m.weight, 0));
  const blendedHigh = Math.round(methods.reduce((s, m) => s + m.highAud * m.weight, 0));

  // 7. Revenue projections
  const costs: CostStructure = {
    fixedMonthly: input.burnRateAud ?? 1057,
    variablePercentOfRevenue: 0.22,
    headcount: input.teamSize ?? 1,
    avgSalary: 0,
    marketingBudget: 500,
    infraCost: 400,
  };
  const proj = generateMonthlyProjection({
    currentMRR: input.mrrAud ?? 0,
    monthlyGrowthRate: (input.monthlyGrowthRate ?? 0.10) * 100,
    projectionMonths: 36,
    costs,
    currentCustomers: input.customers ?? 0,
    arpu: input.arpu ?? 75,
    churnRate: (input.churnRate ?? 0.05) * 100,
  });

  const arrMonth12 = (proj.months[11]?.mrr ?? 0) * 12;
  const arrMonth24 = (proj.months[23]?.mrr ?? 0) * 12;
  const arrMonth36 = (proj.months[35]?.mrr ?? 0) * 12;

  return {
    input,
    methods,
    blended: { lowAud: blendedLow, midAud: blendedMid, highAud: blendedHigh },
    band: valuationBand(blendedMid),
    projections: {
      arrMonth12,
      arrMonth24,
      arrMonth36,
      breakEvenMonth: proj.breakEvenMonth,
      grossMarginEst: 0.78,
    },
    actionPlan: deriveActionPlan(input, methods),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Self-analysis: BlockID.au profile ───────────────────────────────────────
export const BLOCKID_SELF_PROFILE: CLevelValuationInput = {
  name: "BlockID.au",
  email: "admin@blockid.au",
  sviScore: 156,
  stage: 3,
  dimensions: {
    ftv: 68, mpc: 82, ptd: 91, tre: 52,
    cgh: 45, iri: 78, lco: 63, svm: 74,
  },
  mrrAud: 0,           // Update when Stripe goes live
  monthlyGrowthRate: 0.15,
  churnRate: 0.05,
  arpu: 75,
  burnRateAud: 1057,
  runwayMonths: 24,    // Bootstrapped, low burn
  tamAud: 4_000_000_000,
  samAud: 400_000_000,
  sector: "SaaS",
  teamSize: 1,
  customers: 0,        // Update from Supabase svi_accounts count
};
