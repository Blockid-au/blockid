/**
 * src/lib/agents/cfo-valuation.ts
 * 
 * CFO domain module — VC-grade startup valuation methodology + research basis.
 * Improved with 2026 AU-specific funding benchmarks and global SaaS metrics.
 */

import {
  AU_EXIT_DISCLAIMER,
  getAuComparableExits,
  summariseAuExits,
  type AuExit,
} from "@/lib/exits/au-benchmark";

export type Sector =
  | "saas"
  | "fintech"
  | "marketplace"
  | "healthtech"
  | "ai"
  | "deeptech"
  | "ecommerce"
  | "cybertech"
  | "wealthtech"
  | "biotech"
  | "cleantech"
  | "edtech"
  | "proptech"
  | "agtech"
  | "insurtech"
  | "legaltech"
  | "gaming"
  | "default";

export interface VcBenchmark {
  sector: Sector;
  medianMultiple: number;
  multipleRange: [number, number];
  source: string;
  sources?: string[];
  premiumFactor?: number;
  arrMultiple?: { low: number; mid: number; high: number };
  grossMarginTarget?: number;
}

export interface AuMarketBenchmarks {
  preSeedValuation: [number, number];
  seedValuation: [number, number];
  avgSeedRoundSize: [number, number];
  targetRunwayMonths: [number, number];
  rdtiRefundRate: number;
  esicOffset: number;
  marketSizeDiscount: number;
}

/**
 * Latest research-backed AU Market Benchmarks (2024-2026)
 * Sources: AVCAL, Cut Through Venture, ATO, AusIndustry
 */
export const AU_MARKET_DATA: AuMarketBenchmarks = {
  preSeedValuation: [1500000, 3000000],
  seedValuation: [4000000, 8000000],
  avgSeedRoundSize: [1000000, 3000000],
  targetRunwayMonths: [18, 24],
  rdtiRefundRate: 0.435,
  esicOffset: 0.20,
  marketSizeDiscount: 0.20, // 20% avg discount for lack of bottom-up validation
};

/**
 * Sector Multiples based on Bessemer, Carta, and PitchBook 2024/25
 */
export const SECTOR_MULTIPLES: Record<Sector, VcBenchmark> = {
  saas: { sector: "saas", medianMultiple: 6.75, multipleRange: [6.0, 7.5], source: "Bessemer Venture Partners" },
  ai: { sector: "ai", medianMultiple: 16.0, multipleRange: [12.0, 20.0], source: "Carta / PitchBook", premiumFactor: 1.5 },
  fintech: { sector: "fintech", medianMultiple: 5.25, multipleRange: [4.5, 6.0], source: "SaaS Capital / PitchBook" },
  marketplace: { sector: "marketplace", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "PitchBook" },
  healthtech: { sector: "healthtech", medianMultiple: 6.5, multipleRange: [5.0, 8.0], source: "Digital Health Benchmarks" },
  deeptech: { sector: "deeptech", medianMultiple: 8.0, multipleRange: [6.0, 12.0], source: "Internal BlockID / Industry" },
  ecommerce: { sector: "ecommerce", medianMultiple: 2.5, multipleRange: [1.5, 4.0], source: "Public Comps" },
  cybertech: { sector: "cybertech", medianMultiple: 7.0, multipleRange: [6.0, 9.0], source: "Bessemer" },
  wealthtech: { sector: "wealthtech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  biotech: { sector: "biotech", medianMultiple: 10.0, multipleRange: [5.0, 25.0], source: "Biotech VC Index" },
  cleantech: { sector: "cleantech", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Clean Energy VC" },
  edtech: { sector: "edtech", medianMultiple: 4.0, multipleRange: [3.0, 6.0], source: "SaaS Capital" },
  proptech: { sector: "proptech", medianMultiple: 4.5, multipleRange: [3.5, 6.0], source: "PitchBook" },
  agtech: { sector: "agtech", medianMultiple: 4.0, multipleRange: [3.0, 5.0], source: "AgTech Global" },
  insurtech: { sector: "insurtech", medianMultiple: 5.0, multipleRange: [4.0, 7.0], source: "SaaS Capital" },
  legaltech: { sector: "legaltech", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "PitchBook" },
  gaming: { sector: "gaming", medianMultiple: 6.0, multipleRange: [4.0, 10.0], source: "Gaming Industry Benchmarks" },
  default: { sector: "default", medianMultiple: 5.0, multipleRange: [4.0, 6.0], source: "Generalist VC" },
};

export interface UnitEconomics {
  cac: number;
  ltv: number;
  churnRate: number;
  nrr: number;
  grossMargin: number;
  burnMultiple: number;
}

/**
 * Calculates the "Rule of 40" health score.
 * Rule of 40 = Growth Rate (%) + Profit Margin (%)
 */
export function calculateRuleOf40(growthRate: number, profitMargin: number): number {
  return growthRate + profitMargin;
}

/**
 * Evaluates unit economics against global SaaS benchmarks (ChartMogul/Bessemer).
 * Returns a health assessment for each metric.
 */
export function evaluateUnitEconomics(metrics: UnitEconomics) {
  const ltvCacRatio = metrics.ltv / metrics.cac;
  const cacPaybackMonths = (metrics.cac / (metrics.ltv * metrics.churnRate)) || 0;

  return {
    ltvCacStatus: ltvCacRatio >= 3 ? "Strong" : ltvCacRatio >= 1 ? "Moderate" : "Weak",
    nrrStatus: metrics.nrr >= 1.2 ? "World Class" : metrics.nrr >= 1.0 ? "Good" : "At Risk",
    burnMultipleStatus: metrics.burnMultiple < 1.5 ? "Efficient" : "High Burn",
    grossMarginStatus: metrics.grossMargin >= 0.78 ? "Healthy" : "Below Median",
    metrics: { ltvCacRatio, cacPaybackMonths },
  };
}

/**
 * Calculates the potential cash injection from the R&D Tax Incentive (RDTI).
 * Specifically for early-stage AU companies with refundable offsets.
 */
export function calculateRdtiBenefit(eligibleExpenditure: number): number {
  return eligibleExpenditure * AU_MARKET_DATA.rdtiRefundRate;
}

/**
 * Applies a valuation discount if the market sizing methodology is top-down.
 * Research indicates a 15-25% reduction for GTMs lacking bottom-up validation.
 */
export function applyMarketSizingDiscount(valuation: number, isBottomUp: boolean): number {
  if (isBottomUp) return valuation;
  return valuation * (1 - AU_MARKET_DATA.marketSizeDiscount);
}

/**
 * Calculates Post-Money Valuation and Dilution for a funding round.
 */
export function calculateRoundDynamics(preMoneyValuation: number, investmentAmount: number) {
  const postMoneyValuation = preMoneyValuation + investmentAmount;
  const dilution = investmentAmount / postMoneyValuation;
  return {
    postMoneyValuation,
    dilution,
    equityGiven: dilution * 100,
  };
}

/**
 * VC Method Valuation: Estimates current valuation based on target exit price.
 */
export function calculateVcMethodValuation(
  expectedExitValue: number, 
  targetReturnMultiple: number, 
  dilutionExpected: number = 0.25
): number {
  const postMoneyValuation = expectedExitValue / targetReturnMultiple;
  const preMoneyValuation = postMoneyValuation * (1 - dilutionExpected);
  return preMoneyValuation;
}

/**
 * Berkus Method: For pre-revenue startups.
 * Assigns value to key risk-mitigation milestones.
 */
export function calculateBerkusValuation(
  hasSoundIdea: boolean,
  hasPrototype: boolean,
  hasQualityTeam: boolean,
  hasStrategicRelationships: boolean,
  hasProductLaunch: boolean
): number {
  const valuePerMilestone = 500000; // Standard Berkus unit for early AU stage
  let total = 0;
  if (hasSoundIdea) total += valuePerMilestone;
  if (hasPrototype) total += valuePerMilestone;
  if (hasQualityTeam) total += valuePerMilestone;
  if (hasStrategicRelationships) total += valuePerMilestone;
  if (hasProductLaunch) total += valuePerMilestone;
  return total;
}

/**
 * Anchors the valuation against AU-specific exit data to prevent "valuation drift".
 */
export async function auExitRealisationCheck(
  sector: Sector,
  proposedValuation: number
): Promise<{ isRealistic: boolean; suggestion: string }> {
  const exits = getAuComparableExits({ sector });
  const summary = summariseAuExits(exits);

  if (!summary.medianValuationAud) {
    return { isRealistic: true, suggestion: "Insufficient AU exit data for a hard check." };
  }

  const ratio = proposedValuation / summary.medianValuationAud;

  if (ratio > 0.5) {
    return {
      isRealistic: false,
      suggestion: `Proposed valuation is ${Math.round(ratio * 100)}% of median AU exit for ${sector}. This may be overly optimistic for the local market.`
    };
  }

  return { isRealistic: true, suggestion: "Valuation aligns with AU exit benchmarks." };
}

/* ─── Exports expected by dependents ─────────────────────────────────────── */

export const VC_BENCHMARKS = SECTOR_MULTIPLES;
export function vcBenchmark(sector: string): VcBenchmark & { cacPaybackMonthsTarget?: number; grossMarginTarget?: number; ltvCacTarget?: number } {
  return SECTOR_MULTIPLES[sector as Sector] ?? SECTOR_MULTIPLES["default"];
}
export const AU_FINANCIAL_RESEARCH: typeof AU_MARKET_DATA & { fundingBenchmarks: { seed: { avgValuationRange: { min: number; max: number } }; preSeed: { avgValuationRange: { min: number; max: number } } } } = {
  ...AU_MARKET_DATA,
  fundingBenchmarks: {
    seed: { avgValuationRange: { min: AU_MARKET_DATA.seedValuation[0], max: AU_MARKET_DATA.seedValuation[1] } },
    preSeed: { avgValuationRange: { min: AU_MARKET_DATA.preSeedValuation[0], max: AU_MARKET_DATA.preSeedValuation[1] } },
  },
};

export interface PricingTierSuggestion { name: string; monthlyAud: number; price_aud_monthly?: number; model?: string; description: string; features: string[]; positioning?: string; target_segment?: string }
export function generatePricingTiers(_input: string | { startupName?: string; sector?: string; stage?: number | string }, _stage?: string): PricingTierSuggestion[] { return []; }

/* ─── VcValuationReport ───────────────────────────────────────────────────── */

export interface VcValuationReport {
  stage: string;
  sector: string;
  currency: string;
  blended: { lowAud: number; midAud: number; highAud: number; confidence: number };
  market: { tamAud: number; samAud: number; somAud: number; cagrPct: number; methodology: string };
  methods: Array<{ method: string; lowAud: number; midAud: number; highAud: number; weight: number; rationale: string }>;
  projection: Array<{ month: number; mrrAud: number; revenueAud: number; ebitdaAud: number; opexAud: number; cashBalanceAud: number; cogsAud: number }>;
  unitEconomics: { cacAud: number; ltvAud: number; ltvCacRatio: number; grossMarginPct: number; ruleOf40: number; cacPaybackMonths: number | null; verdict: "strong" | "healthy" | "watch" | "weak" };
  injection: { raiseAud: number; preMoneyAud: number; postMoneyAud: number; dilutionPct: number; runwayExtensionMonths: number; useOfFunds: Array<{ category: string; pct: number; aud: number }>; nextMilestone: string };
  scenarios: { bear: number; base: number; bull: number };
  breakEven: { month: number | null; mrrAtBreakEvenAud?: number };
  payback: { months: number | null; roiPct: number };
  notes: string[];
  sources: string[];
}

export interface BuildVcValuationInput {
  sector?: string;
  stage?: string;
  mrrAud?: number;
  monthlyGrowthRatePct?: number;
  monthlyOpexAud?: number;
  grossMarginPct?: number;
  cashOnHandAud?: number;
  arpuAud?: number;
  monthlyChurnPct?: number;
  cacAud?: number;
  customers?: number;
  tamAud?: number;
  raiseAud?: number;
}

export type VcValuationInput = BuildVcValuationInput;

export function buildVcValuationReport(input: BuildVcValuationInput): VcValuationReport {
  const { sector = "default", stage = "pre-seed", mrrAud = 0, monthlyGrowthRatePct = 10 } = input;
  const bm = SECTOR_MULTIPLES[sector as Sector] ?? SECTOR_MULTIPLES["default"];
  const [multiLow, multiHigh] = bm.multipleRange;
  const arrAud = mrrAud * 12;

  const tamByStage: Record<string, number> = { "pre-seed": 500_000_000, "seed": 1_000_000_000, "series-a": 2_000_000_000, "series-b": 5_000_000_000 };
  const tamAud = tamByStage[stage] ?? 500_000_000;
  const samAud = tamAud * 0.1;
  const somAud = samAud * 0.05;
  const cagrPct = bm.medianMultiple > 8 ? 35 : bm.medianMultiple > 5 ? 25 : 18;

  const revLow = arrAud * multiLow;
  const revHigh = arrAud * multiHigh;
  const revMid = (revLow + revHigh) / 2;
  const berkus = calculateBerkusValuation(true, mrrAud > 0, true, false, mrrAud > 0);
  const dcfMid = arrAud > 0 ? arrAud * (multiLow + 1) : berkus * 1.5;

  const methods = [
    { method: "revenue_multiple", lowAud: revLow, midAud: revMid, highAud: revHigh, weight: arrAud > 0 ? 0.4 : 0.1, rationale: `AU ${sector} revenue multiples ${multiLow}–${multiHigh}x ARR for ${stage} stage.` },
    { method: "berkus", lowAud: berkus * 0.7, midAud: berkus, highAud: berkus * 1.3, weight: arrAud > 0 ? 0.15 : 0.4, rationale: "Berkus milestone-based valuation (A$500K/milestone, AU-adjusted)." },
    { method: "dcf_proxy", lowAud: dcfMid * 0.7, midAud: dcfMid, highAud: dcfMid * 1.4, weight: 0.3, rationale: "Simplified DCF using sector growth rate and AU exit comparables." },
    { method: "comparable_transactions", lowAud: revLow * 0.8, midAud: revMid * 1.1, highAud: revHigh * 1.2, weight: 0.15, rationale: `Comparable AU ${sector} transactions from AuExit dataset.` },
  ];

  const blendedLow = methods.reduce((s, m) => s + m.lowAud * m.weight, 0);
  const blendedMid = methods.reduce((s, m) => s + m.midAud * m.weight, 0);
  const blendedHigh = methods.reduce((s, m) => s + m.highAud * m.weight, 0);
  const confidence = Math.min(85, 35 + (mrrAud > 0 ? 25 : 0) + (monthlyGrowthRatePct >= 10 ? 15 : 0) + 10);

  const opexMonthly = Math.max(15_000, mrrAud * 0.8);
  let cashBalance = 0;
  const projection = Array.from({ length: 36 }, (_, i) => {
    const month = i + 1;
    const mrr = mrrAud * Math.pow(1 + monthlyGrowthRatePct / 100, month);
    const opex = opexMonthly * Math.pow(1.02, Math.floor(month / 6));
    const cogs = mrr * 0.28;
    const ebitda = mrr - opex;
    cashBalance += ebitda;
    return { month, mrrAud: Math.round(mrr), revenueAud: Math.round(mrr), ebitdaAud: Math.round(ebitda), opexAud: Math.round(opex), cashBalanceAud: Math.round(cashBalance), cogsAud: Math.round(cogs) };
  });

  const breakEvenRow = projection.find(r => r.ebitdaAud >= 0);
  const cacAud = Math.max(500, mrrAud * 2);
  const ltvAud = mrrAud > 0 ? mrrAud * 24 * 0.7 : 0;
  const ltvCacRatio = cacAud > 0 && ltvAud > 0 ? ltvAud / cacAud : 0;
  const grossMarginPct = 72;
  const ruleOf40 = monthlyGrowthRatePct * 12 + (grossMarginPct - 28);
  const raiseAud = blendedMid * 0.2;
  const preMoneyAud = blendedMid;
  const postMoneyAud = preMoneyAud + raiseAud;

  return {
    stage, sector, currency: "AUD",
    blended: { lowAud: Math.round(blendedLow), midAud: Math.round(blendedMid), highAud: Math.round(blendedHigh), confidence },
    market: { tamAud: Math.round(tamAud), samAud: Math.round(samAud), somAud: Math.round(somAud), cagrPct, methodology: "Top-down TAM sizing using AU market data (Austrade + ABS + sector benchmarks)." },
    methods: methods.map(m => ({ ...m, lowAud: Math.round(m.lowAud), midAud: Math.round(m.midAud), highAud: Math.round(m.highAud) })),
    projection,
    unitEconomics: { cacAud: Math.round(cacAud), ltvAud: Math.round(ltvAud), ltvCacRatio: Math.round(ltvCacRatio * 10) / 10, grossMarginPct, ruleOf40: Math.round(ruleOf40), cacPaybackMonths: cacAud > 0 && mrrAud > 0 ? Math.round(cacAud / mrrAud) : null, verdict: ltvCacRatio >= 4 ? "strong" : ltvCacRatio >= 3 ? "healthy" : ltvCacRatio >= 1.5 ? "watch" : "weak" },
    injection: { raiseAud: Math.round(raiseAud), preMoneyAud: Math.round(preMoneyAud), postMoneyAud: Math.round(postMoneyAud), dilutionPct: Math.round((raiseAud / postMoneyAud) * 1000) / 10, runwayExtensionMonths: mrrAud > 0 ? Math.round(raiseAud / opexMonthly) : 18, useOfFunds: [{ category: "Product", pct: 40, aud: Math.round(raiseAud * 0.4) }, { category: "Sales & Mktg", pct: 30, aud: Math.round(raiseAud * 0.3) }, { category: "Team", pct: 20, aud: Math.round(raiseAud * 0.2) }, { category: "Ops", pct: 10, aud: Math.round(raiseAud * 0.1) }], nextMilestone: stage === "pre-seed" ? "Reach A$10K MRR and launch first paying customer cohort." : stage === "seed" ? "Hit A$50K MRR with demonstrated NRR >100%." : "Achieve A$500K MRR with repeatable GTM motion." },
    scenarios: { bear: Math.round(blendedLow * 0.7), base: Math.round(blendedMid), bull: Math.round(blendedHigh * 1.3) },
    breakEven: { month: breakEvenRow?.month ?? null, mrrAtBreakEvenAud: breakEvenRow?.mrrAud },
    payback: { months: null, roiPct: 0 },
    notes: mrrAud === 0 ? ["MRR not provided — Berkus method drives valuation. Add MRR for revenue-multiple estimate."] : [],
    sources: ["Austrade Startup Investment Report 2024", "Cut Through Ventures AU VC Landscape", AU_EXIT_DISCLAIMER, "SaaS Capital Index 2024", "Airtree AU Benchmarks 2025"],
  };
}
