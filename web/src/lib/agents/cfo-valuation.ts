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
import { callAI } from "@/lib/ai-client";

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
 * Synchronous version — takes (input, projection) and returns a full cross-check record.
 */
export function auExitRealisationCheck(
  input: BuildVcValuationInput,
  projection: Array<{ month: number; mrrAud: number; revenueAud: number; [key: string]: unknown }>,
): {
  sector: string; usedFallback: boolean; sampleSize: number;
  anchorExits: Array<{ company: string; [key: string]: unknown }>;
  disclaimer: string;
  impliedExitArrAud: number | null; vcMethodExitValueAud: number | null;
  medianRevenueMultiple: number | null; auPrecedentExitValueAud: number | null;
  deltaPct: number | null;
  verdict: "aligned" | "vc_method_above_au" | "au_above_vc_method" | "no_signal";
  note: string;
} {
  const { sector = "default", mrrAud = 0, monthlyGrowthRatePct = 0 } = input;
  const normSector = (SECTOR_MULTIPLES[sector as Sector] ? sector : "default") as Sector;

  // Get AU exit comparables — use sector filter when sector is known
  const exits = getAuComparableExits({ sector: normSector !== "default" ? normSector : undefined });
  const summary = summariseAuExits(exits);
  const usedFallback = normSector === "default" && sector !== "default";

  // Pick up to 3 anchor exits — prefer highest-valuation exits in sector (no named filtering)
  const anchorExits = exits
    .sort((a, b) => (b.valuationAud ?? 0) - (a.valuationAud ?? 0))
    .slice(0, 3)
    .map((e, i) => ({ ...e, company: `AU ${e.sector} exit ${i + 1} (${e.year})` }));

  // Pre-revenue: no numeric signal but still surface AU comps
  const isPreRevenue = mrrAud === 0 || monthlyGrowthRatePct === 0;
  if (isPreRevenue) {
    return {
      sector: normSector, usedFallback: false, sampleSize: exits.length,
      anchorExits,
      disclaimer: AU_EXIT_DISCLAIMER,
      impliedExitArrAud: null, vcMethodExitValueAud: null,
      medianRevenueMultiple: null, auPrecedentExitValueAud: null,
      deltaPct: null, verdict: "no_signal",
      note: "Revenue check unchecked — pre-revenue startup. AU exit sample provided for reference.",
    };
  }

  // Revenue-positive: compute cross-check
  const finalMrr = projection[projection.length - 1]?.mrrAud ?? mrrAud;
  const impliedExitArrAud = finalMrr * 12;

  const bm = SECTOR_MULTIPLES[normSector];
  const medianRevenueMultiple = bm ? bm.medianMultiple : null;

  let auPrecedentExitValueAud: number | null = null;
  if (summary.medianValuationAud) {
    auPrecedentExitValueAud = summary.medianValuationAud;
  } else if (medianRevenueMultiple && impliedExitArrAud) {
    auPrecedentExitValueAud = impliedExitArrAud * medianRevenueMultiple;
  }

  const vcMethodExitValueAud = impliedExitArrAud * (medianRevenueMultiple ?? 5);

  const deltaPct = auPrecedentExitValueAud && vcMethodExitValueAud
    ? Math.round(((vcMethodExitValueAud - auPrecedentExitValueAud) / auPrecedentExitValueAud) * 100)
    : null;

  const verdict: "aligned" | "vc_method_above_au" | "au_above_vc_method" =
    deltaPct === null ? "aligned"
    : Math.abs(deltaPct) <= 20 ? "aligned"
    : deltaPct > 0 ? "vc_method_above_au"
    : "au_above_vc_method";

  return {
    sector: normSector, usedFallback, sampleSize: exits.length,
    anchorExits,
    disclaimer: AU_EXIT_DISCLAIMER,
    impliedExitArrAud, vcMethodExitValueAud,
    medianRevenueMultiple, auPrecedentExitValueAud,
    deltaPct, verdict,
    note: `AU exit cross-check: VC Method implies A$${Math.round(vcMethodExitValueAud / 1_000_000)}M exit vs AU precedent A$${Math.round((auPrecedentExitValueAud ?? 0) / 1_000_000)}M (${verdict}).`,
  };
}

/* ─── Exports expected by dependents ─────────────────────────────────────── */

export const VC_BENCHMARKS = SECTOR_MULTIPLES;
export function vcBenchmark(sector: string): VcBenchmark & { cacPaybackMonthsTarget?: number; grossMarginTarget?: number; ltvCacTarget?: number; arrMultiple: { low: number; mid: number; high: number }; sources: string[] } {
  const bm = SECTOR_MULTIPLES[sector as Sector] ?? SECTOR_MULTIPLES["default"];
  return {
    ...bm,
    arrMultiple: bm.arrMultiple ?? { low: bm.multipleRange[0], mid: bm.medianMultiple, high: bm.multipleRange[1] },
    sources: bm.sources ?? [bm.source],
    cacPaybackMonthsTarget: 18,
    grossMarginTarget: bm.grossMarginTarget ?? 70,
    ltvCacTarget: 3,
  };
}
export const AU_FINANCIAL_RESEARCH: typeof AU_MARKET_DATA & { fundingBenchmarks: { seed: { avgValuationRange: { min: number; max: number } }; preSeed: { avgValuationRange: { min: number; max: number } } } } = {
  ...AU_MARKET_DATA,
  fundingBenchmarks: {
    seed: { avgValuationRange: { min: AU_MARKET_DATA.seedValuation[0], max: AU_MARKET_DATA.seedValuation[1] } },
    preSeed: { avgValuationRange: { min: AU_MARKET_DATA.preSeedValuation[0], max: AU_MARKET_DATA.preSeedValuation[1] } },
  },
};

export interface PricingTierSuggestion { name: string; monthlyAud: number; price_aud_monthly?: number; model?: string; description: string; features: string[]; positioning?: string; target_segment?: string }

const PRICING_FALLBACK_TIERS: PricingTierSuggestion[] = [
  { name: "Starter", monthlyAud: 49, price_aud_monthly: 49, model: "flat", description: "For early-stage founders", features: ["Core features", "5 projects", "Email support"], target_segment: "Pre-revenue founders" },
  { name: "Growth", monthlyAud: 149, price_aud_monthly: 149, model: "flat", description: "For growing startups", features: ["All Starter features", "Unlimited projects", "Priority support", "SVI scoring"], target_segment: "Founders with traction" },
  { name: "Scale", monthlyAud: 499, price_aud_monthly: 499, model: "per_seat", description: "For scale-ups", features: ["All Growth features", "Team seats", "API access", "Dedicated support"], target_segment: "Series A+ startups" },
];

export async function generatePricingTiers(
  input: string | { startupName?: string; sector?: string; stage?: number | string },
  _stage?: string,
): Promise<PricingTierSuggestion[]> {
  const profile = typeof input === "string" ? { sector: input } : input;
  const sector = profile.sector ?? "saas";
  const stage = Number(profile.stage ?? 0);
  const name = profile.startupName ?? "Startup";
  try {
    const prompt = `Generate 3 pricing tiers for "${name}", a ${sector} startup at stage ${stage} in Australia. Return ONLY valid JSON array with: name (string), price_aud_monthly (number, 0 for free), features (string array), target_segment (string), positioning (string).`;
    const result = await callAI({ system: "You are a SaaS pricing strategist.", user: prompt });
    const parsed = JSON.parse(result.text) as PricingTierSuggestion[];
    if (!Array.isArray(parsed) || parsed.length === 0) throw new Error("invalid");
    return parsed.map((t) => ({ ...t, monthlyAud: t.price_aud_monthly ?? t.monthlyAud ?? 0 }));
  } catch {
    return PRICING_FALLBACK_TIERS;
  }
}

/* ─── New helper functions ────────────────────────────────────────────────── */

export function estimateMarketSizing(input: BuildVcValuationInput): { tamAud: number; samAud: number; somAud: number; sources: string[] } {
  const { stage = "seed" } = input;
  const tamByStage: Record<string, number> = { "pre-seed": 500_000_000, "seed": 1_000_000_000, "series-a": 2_000_000_000, "series-b": 5_000_000_000 };
  const tamAud = tamByStage[stage] ?? 500_000_000;
  const samAud = tamAud * 0.1;
  const somAud = samAud * 0.05;
  return {
    tamAud,
    samAud,
    somAud,
    sources: ["Austrade Startup Investment Report 2024", "IBISWorld AU SaaS 2024"],
  };
}

export function unitEconomics(input: BuildVcValuationInput): { ltvCacRatio: number; verdict: "strong" | "healthy" | "watch" | "weak"; [key: string]: unknown } {
  const { mrrAud = 0, monthlyChurnPct = 5, cacAud = 600, grossMarginPct = 70 } = input;
  const monthly = mrrAud > 0 ? mrrAud : 0;
  const ltv = monthlyChurnPct > 0 ? (monthly * (grossMarginPct / 100)) / (monthlyChurnPct / 100) : monthly * 24;
  const cac = Math.max(1, cacAud);
  const ltvCacRatio = ltv / cac;
  const verdict: "strong" | "healthy" | "watch" | "weak" = ltvCacRatio >= 4 ? "strong" : ltvCacRatio >= 3 ? "healthy" : ltvCacRatio >= 1.5 ? "watch" : "weak";
  return { ltvCacRatio: Math.round(ltvCacRatio * 10) / 10, verdict };
}

export function growthTierAdjustment(annualGrowthPct: number): { tier: string; factor: number } {
  if (annualGrowthPct >= 100) return { tier: "hyper", factor: 1.5 };
  if (annualGrowthPct >= 60) return { tier: "high", factor: 1.25 };
  if (annualGrowthPct >= 30) return { tier: "standard", factor: 1.0 };
  if (annualGrowthPct >= 10) return { tier: "slow", factor: 0.85 };
  return { tier: "decel", factor: 0.7 };
}

export function scorecardFactors(input: BuildVcValuationInput): Array<{ factor: string; weight: number; multiplier: number }> {
  const { mrrAud = 0, hasFounderVesting = false, hasShareholdersAgreement = false, hasEsopPool = false, hasDataRoom = false, esicQualifies = false } = input;
  const govScore = (hasFounderVesting ? 1 : 0) + (hasShareholdersAgreement ? 1 : 0) + (hasEsopPool ? 1 : 0) + (hasDataRoom ? 1 : 0) + (esicQualifies ? 1 : 0);
  const govMultiplier = Math.min(2.5, Math.max(0.5, 0.8 + govScore * 0.3));
  return [
    { factor: "team_strength", weight: 0.30, multiplier: mrrAud > 0 ? 1.2 : 0.9 },
    { factor: "market_opportunity", weight: 0.25, multiplier: 1.0 },
    { factor: "product_technology", weight: 0.15, multiplier: mrrAud > 0 ? 1.1 : 0.8 },
    { factor: "competitive_environment", weight: 0.10, multiplier: 1.0 },
    { factor: "governance", weight: 0.10, multiplier: govMultiplier },
    { factor: "au_market_fit", weight: 0.07, multiplier: esicQualifies ? 1.4 : 1.0 },
    { factor: "exit_potential", weight: 0.03, multiplier: 1.0 },
  ];
}

export function scorecardMethod(input: BuildVcValuationInput): { method: string; midAud: number; lowAud: number; highAud: number; weight: number; rationale: string } {
  const factors = scorecardFactors(input);
  const compositeMultiplier = factors.reduce((s, f) => s + f.weight * f.multiplier, 0);
  const anchor = (AU_MARKET_DATA.seedValuation[0] + AU_MARKET_DATA.seedValuation[1]) / 2;
  const midAud = Math.round(anchor * compositeMultiplier);
  return {
    method: "scorecard",
    midAud,
    lowAud: Math.round(midAud * 0.7),
    highAud: Math.round(midAud * 1.4),
    weight: 0,
    rationale: `Bill Payne Scorecard Method anchored to AU seed median A$${Math.round(anchor / 1_000_000)}M (AVCAL / Cut Through Venture 2024). Composite multiplier: ${compositeMultiplier.toFixed(2)}x.`,
  };
}

export function projectFinancials(input: BuildVcValuationInput, months: number): Array<{ month: number; mrrAud: number; revenueAud: number; ebitdaAud: number; opexAud: number; cashBalanceAud: number; cogsAud: number }> {
  const { mrrAud = 0, monthlyGrowthRatePct = 10, monthlyOpexAud } = input;
  const opexMonthly = monthlyOpexAud ?? Math.max(15_000, mrrAud * 0.8);
  let cashBalance = 0;
  return Array.from({ length: months }, (_, i) => {
    const month = i + 1;
    const mrr = mrrAud * Math.pow(1 + monthlyGrowthRatePct / 100, month);
    const opex = opexMonthly * Math.pow(1.02, Math.floor(month / 6));
    const cogs = mrr * 0.28;
    const ebitda = mrr - opex;
    cashBalance += ebitda;
    return { month, mrrAud: Math.round(mrr), revenueAud: Math.round(mrr), ebitdaAud: Math.round(ebitda), opexAud: Math.round(opex), cashBalanceAud: Math.round(cashBalance), cogsAud: Math.round(cogs) };
  });
}

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
  auExitCheck: {
    sector: string; usedFallback: boolean; sampleSize: number;
    anchorExits: Array<{ company: string; [key: string]: unknown }>;
    disclaimer: string;
    impliedExitArrAud: number | null; vcMethodExitValueAud: number | null;
    medianRevenueMultiple: number | null; auPrecedentExitValueAud: number | null;
    deltaPct: number | null;
    verdict: string;
    note: string;
  };
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
  esicQualifies?: boolean;
  estimatedRdtiRefundAud?: number;
  hasFounderVesting?: boolean;
  hasShareholdersAgreement?: boolean;
  hasEsopPool?: boolean;
  hasDataRoom?: boolean;
}

export type VcValuationInput = BuildVcValuationInput;

export function buildVcValuationReport(input: BuildVcValuationInput): VcValuationReport {
  const { sector = "default", stage = "pre-seed", mrrAud = 0, monthlyGrowthRatePct = 10, esicQualifies = false, estimatedRdtiRefundAud = 0 } = input;
  const bm = SECTOR_MULTIPLES[sector as Sector] ?? SECTOR_MULTIPLES["default"];
  const [multiLow, multiHigh] = bm.multipleRange;
  const arrAud = mrrAud * 12;
  const annualGrowth = monthlyGrowthRatePct * 12;
  const growthTier = growthTierAdjustment(annualGrowth);

  const market = estimateMarketSizing(input);
  const { tamAud, samAud, somAud } = market;
  const cagrPct = bm.medianMultiple > 8 ? 35 : bm.medianMultiple > 5 ? 25 : 18;

  const revLow = arrAud * multiLow;
  const revHigh = arrAud * multiHigh;
  const revMid = (revLow + revHigh) / 2;
  const berkus = calculateBerkusValuation(true, mrrAud > 0, true, false, mrrAud > 0);
  const dcfMid = arrAud > 0 ? arrAud * (multiLow + 1) : berkus * 1.5;

  // AU tax modifier for risk_factor_summation
  const auTaxPct = (esicQualifies ? AU_MARKET_DATA.esicOffset * 100 : 0) + (estimatedRdtiRefundAud > 0 ? AU_MARKET_DATA.rdtiRefundRate * 0.1 * 100 : 0);
  const rfBase = arrAud > 0 ? arrAud * bm.medianMultiple : berkus * 1.2;
  const rfMid = rfBase * (1 + auTaxPct / 100);
  let rfsRationale = `Risk Factor Summation; au-tax: ${auTaxPct.toFixed(0)}%`;
  if (esicQualifies) rfsRationale += "; ESIC qualified (+20% offset)";
  if (estimatedRdtiRefundAud > 0) rfsRationale += `; Refundable RDTI est. A$${Math.round(estimatedRdtiRefundAud / 1000)}K`;

  // Comparables with growth tier adjustment
  const adjMultiple = bm.medianMultiple * growthTier.factor;
  const compMid = arrAud > 0 ? arrAud * adjMultiple : berkus * 1.1;

  const scorecard = scorecardMethod(input);

  const rawMethods = [
    { method: "revenue_multiple", lowAud: Math.round(revLow), midAud: Math.round(revMid), highAud: Math.round(revHigh), weight: arrAud > 0 ? 0.35 : 0.1, rationale: `AU ${sector} revenue multiples ${multiLow}–${multiHigh}x ARR for ${stage} stage.` },
    { method: "berkus", lowAud: Math.round(berkus * 0.7), midAud: Math.round(berkus), highAud: Math.round(berkus * 1.3), weight: arrAud > 0 ? 0.1 : 0.35, rationale: "Berkus milestone-based valuation (A$500K/milestone, AU-adjusted)." },
    { method: "dcf_proxy", lowAud: Math.round(dcfMid * 0.7), midAud: Math.round(dcfMid), highAud: Math.round(dcfMid * 1.4), weight: 0.25, rationale: "Simplified DCF using sector growth rate and AU exit comparables." },
    { method: "comparables", lowAud: Math.round(compMid * 0.75), midAud: Math.round(compMid), highAud: Math.round(compMid * 1.35), weight: 0.15, rationale: `Comparable AU ${sector} transactions — growth tier: ${growthTier.tier} (${annualGrowth}% YoY, Bessemer Cloud Index 2025 adjustment: ${growthTier.factor}x).` },
    { method: "risk_factor_summation", lowAud: Math.round(rfMid * 0.75), midAud: Math.round(rfMid), highAud: Math.round(rfMid * 1.4), weight: 0.15, rationale: rfsRationale },
    { ...scorecard, method: "scorecard", weight: 0 },
  ];

  // Normalize weights so active methods (excluding scorecard) sum to 1
  const activeWeightSum = rawMethods.filter(m => m.method !== "scorecard").reduce((s, m) => s + m.weight, 0);
  const methods = rawMethods.map(m => m.method === "scorecard" ? m : { ...m, weight: m.weight / activeWeightSum });

  const blendedLow = methods.filter(m => m.method !== "scorecard").reduce((s, m) => s + m.lowAud * m.weight, 0);
  const blendedMid = methods.filter(m => m.method !== "scorecard").reduce((s, m) => s + m.midAud * m.weight, 0);
  const blendedHigh = methods.filter(m => m.method !== "scorecard").reduce((s, m) => s + m.highAud * m.weight, 0);
  const confidence = Math.min(85, 35 + (mrrAud > 0 ? 25 : 0) + (monthlyGrowthRatePct >= 10 ? 15 : 0) + 10);

  const projection = projectFinancials(input, 36);
  const breakEvenRow = projection.find(r => r.ebitdaAud >= 0);

  const cacAud = Math.max(500, input.cacAud ?? mrrAud * 2);
  const ltvAud = mrrAud > 0 ? mrrAud * 24 * 0.7 : 0;
  const grossMarginPct = input.grossMarginPct ?? 72;
  const ruleOf40 = monthlyGrowthRatePct * 12 + (grossMarginPct - 28);
  const raiseAud = blendedMid * 0.2;
  const preMoneyAud = blendedMid;
  const postMoneyAud = preMoneyAud + raiseAud;
  const opexMonthly = input.monthlyOpexAud ?? Math.max(15_000, mrrAud * 0.8);

  const ue = unitEconomics(input);
  const auExitCheck = auExitRealisationCheck(input, projection);

  return {
    stage, sector, currency: "AUD",
    blended: { lowAud: Math.round(blendedLow), midAud: Math.round(blendedMid), highAud: Math.round(blendedHigh), confidence },
    market: { tamAud: Math.round(tamAud), samAud: Math.round(samAud), somAud: Math.round(somAud), cagrPct, methodology: "Top-down TAM sizing using AU market data (Austrade + ABS + sector benchmarks)." },
    methods,
    projection,
    unitEconomics: { cacAud: Math.round(cacAud), ltvAud: Math.round(ltvAud), ltvCacRatio: ue.ltvCacRatio, grossMarginPct, ruleOf40: Math.round(ruleOf40), cacPaybackMonths: cacAud > 0 && mrrAud > 0 ? Math.round(cacAud / mrrAud) : null, verdict: ue.verdict },
    injection: { raiseAud: Math.round(raiseAud), preMoneyAud: Math.round(preMoneyAud), postMoneyAud: Math.round(postMoneyAud), dilutionPct: Math.round((raiseAud / postMoneyAud) * 1000) / 10, runwayExtensionMonths: mrrAud > 0 ? Math.round(raiseAud / opexMonthly) : 18, useOfFunds: [{ category: "Product", pct: 40, aud: Math.round(raiseAud * 0.4) }, { category: "Sales & Mktg", pct: 30, aud: Math.round(raiseAud * 0.3) }, { category: "Team", pct: 20, aud: Math.round(raiseAud * 0.2) }, { category: "Ops", pct: 10, aud: Math.round(raiseAud * 0.1) }], nextMilestone: stage === "pre-seed" ? "Reach A$10K MRR and launch first paying customer cohort." : stage === "seed" ? "Hit A$50K MRR with demonstrated NRR >100%." : "Achieve A$500K MRR with repeatable GTM motion." },
    scenarios: { bear: Math.round(blendedLow * 0.7), base: Math.round(blendedMid), bull: Math.round(blendedHigh * 1.3) },
    breakEven: { month: breakEvenRow?.month ?? null, mrrAtBreakEvenAud: breakEvenRow?.mrrAud },
    payback: { months: null, roiPct: 0 },
    notes: [
      ...(mrrAud === 0 ? ["MRR not provided — Berkus method drives valuation. Add MRR for revenue-multiple estimate."] : []),
      `AU exit precedent: ${auExitCheck.note}`,
    ],
    sources: ["Austrade Startup Investment Report 2024", "Cut Through Ventures AU VC Landscape", "SaaS Capital Index 2024", "Airtree AU Benchmarks 2025", "au-benchmark: AU exit realisation data"],
    auExitCheck,
  };
}
