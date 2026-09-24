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
import { SECTOR_MULTIPLES, type Sector, type VcBenchmark } from "@/lib/valuation/sector-multiples-static";
import { getSectorMultiples, type MultiplesSource } from "@/lib/valuation/sector-multiples";
import { VALUATION_BASELINES_AUD } from "@/lib/valuation";

// S27-C: the static table now lives in lib/valuation/sector-multiples-static.ts
// (re-exported here so every existing import keeps working) and every
// multiple read below goes through `getSectorMultiples()` — the latest
// admin-approved `sector_multiples_overrides` row wins, else the static row.
export { SECTOR_MULTIPLES, type Sector, type VcBenchmark };

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

  const bm = getSectorMultiples(normSector);
  const medianRevenueMultiple = bm ? bm.mid : null;

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

export interface VcBenchmarkResolved extends VcBenchmark {
  cacPaybackMonthsTarget?: number;
  grossMarginTarget?: number;
  ltvCacTarget?: number;
  arrMultiple: { low: number; mid: number; high: number };
  sources: string[];
  /** S27-C — "static" (table above) or "override" (admin-approved cited row). */
  multiplesSource: MultiplesSource;
  /** S27-C — label for method notes: "BlockID static table (2026-06) · …" or "<title>, <date>". */
  sourceLabel: string;
}

/**
 * Sector benchmark every consumer reads. S27-C: the ARR multiple band
 * (`arrMultiple`, `medianMultiple`, `multipleRange`) comes from
 * `getSectorMultiples()` — an admin-approved override when one is effective
 * at `at` (default today), else the static row — and `source` becomes the
 * override's citation in that case so the existing "(source)" notes stay honest.
 */
export function vcBenchmark(sector: string, at?: Date | string): VcBenchmarkResolved {
  const key = (SECTOR_MULTIPLES[sector as Sector] ? sector : "default") as Sector;
  const bm = SECTOR_MULTIPLES[key];
  const r = getSectorMultiples(key, at);
  const isOverride = r.sourceKind === "override";
  return {
    ...bm,
    source: isOverride ? r.sourceLabel : bm.source,
    medianMultiple: r.mid,
    multipleRange: [r.low, r.high],
    arrMultiple: { low: r.low, mid: r.mid, high: r.high },
    sources: isOverride ? [r.sourceLabel, ...(r.override?.sourceUrl ? [r.override.sourceUrl] : [])] : bm.sources ?? [bm.source],
    multiplesSource: r.sourceKind,
    sourceLabel: r.sourceLabel,
    cacPaybackMonthsTarget: 18,
    grossMarginTarget: bm.grossMarginTarget ?? 70,
    ltvCacTarget: 3,
  };
}
/**
 * T0167 — Sector-Specific Revenue Multiple Library
 *
 * Bessemer "State of the Cloud" and PitchBook publish revenue multiples by
 * growth cohort, not a single sector-wide median. High-growth SaaS trades
 * ~3× the multiple of low-growth SaaS at the same ARR. This helper returns a
 * growth-adjusted {low, mid, high} band that comparables/VC-method callers
 * can use instead of the flat `SECTOR_MULTIPLES[sector].medianMultiple`.
 *
 * Growth cohorts (monthly growth-rate → implied YoY):
 *   - high  ≥ 4% MoM (~60% YoY) — top-quartile
 *   - mid   1.5%-4% MoM (~20-60% YoY) — median
 *   - low   < 1.5% MoM (~<20% YoY) — bottom-quartile
 *
 * Sources: Bessemer State of the Cloud 2025, PitchBook Q2 2025 SaaS Report,
 * Carta AI Startup Benchmarks 2025.
 */
export type GrowthBand = "high" | "mid" | "low";

interface GrowthMultipleRow { low: number; mid: number; high: number }

const GROWTH_MULTIPLES: Partial<Record<Sector, Record<GrowthBand, GrowthMultipleRow>>> = {
  saas: {
    high: { low: 9.0, mid: 12.0, high: 15.0 },
    mid:  { low: 5.5, mid: 7.0,  high: 8.5 },
    low:  { low: 2.5, mid: 3.5,  high: 4.5 },
  },
  fintech: {
    high: { low: 7.0, mid: 9.0,  high: 11.0 },
    mid:  { low: 4.0, mid: 5.25, high: 6.5 },
    low:  { low: 1.8, mid: 2.5,  high: 3.2 },
  },
  ai: {
    high: { low: 20.0, mid: 25.0, high: 32.0 },
    mid:  { low: 12.0, mid: 16.0, high: 20.0 },
    low:  { low: 6.0,  mid: 8.0,  high: 11.0 },
  },
  // Digital Health Benchmarks 2025 — sticky contracts but longer sales cycles
  // hold the top band below pure-play SaaS.
  healthtech: {
    high: { low: 6.5, mid: 9.0,  high: 12.0 },
    mid:  { low: 4.0, mid: 5.5,  high: 7.5 },
    low:  { low: 2.0, mid: 3.0,  high: 4.0 },
  },
  // Bessemer Cyber Index 2025 — high NRR and long-term deferred revenue
  // support a premium over generalist SaaS at the top of the growth band.
  cybertech: {
    high: { low: 7.5, mid: 10.0, high: 13.0 },
    mid:  { low: 5.0, mid: 6.5,  high: 8.5 },
    low:  { low: 2.5, mid: 3.5,  high: 4.8 },
  },
  // PitchBook Marketplace Report 2025 — take-rate + GMV compress the range
  // below SaaS at every growth cohort.
  marketplace: {
    high: { low: 5.0, mid: 6.5,  high: 8.0 },
    mid:  { low: 2.5, mid: 3.5,  high: 5.0 },
    low:  { low: 1.2, mid: 2.0,  high: 2.8 },
  },
  // Public retail comps 2025 — margin-thin category; even top-quartile
  // ecommerce trades well below software.
  ecommerce: {
    high: { low: 3.0, mid: 4.5,  high: 6.0 },
    mid:  { low: 1.8, mid: 2.5,  high: 3.5 },
    low:  { low: 0.8, mid: 1.3,  high: 2.0 },
  },
};

export function classifyGrowthBand(monthlyGrowthRatePct: number): GrowthBand {
  if (!Number.isFinite(monthlyGrowthRatePct) || monthlyGrowthRatePct <= 0) return "low";
  if (monthlyGrowthRatePct >= 4) return "high";
  if (monthlyGrowthRatePct >= 1.5) return "mid";
  return "low";
}

export function growthAdjustedSectorMultiple(
  sector: string,
  monthlyGrowthRatePct: number,
): { low: number; mid: number; high: number; band: GrowthBand; sector: Sector; source: string } {
  const band = classifyGrowthBand(monthlyGrowthRatePct);
  const key = (SECTOR_MULTIPLES[sector as Sector] ? sector : "default") as Sector;
  const resolved = getSectorMultiples(key);
  const row = GROWTH_MULTIPLES[key]?.[band];
  // S27-C: the growth-band table is calibrated against the static row; once an
  // admin-approved override is effective the band is scaled off the override
  // instead so the cited number is what moves the valuation.
  if (row && resolved.sourceKind === "static") {
    return { ...row, band, sector: key, source: SECTOR_MULTIPLES[key].source };
  }
  // Sector without a growth-band table (or an override in force): scale the
  // flat range by a cohort factor so callers still get a growth-sensitive number.
  const factor = band === "high" ? 1.4 : band === "mid" ? 1.0 : 0.55;
  return {
    low: Number((resolved.low * factor).toFixed(2)),
    mid: Number((resolved.mid * factor).toFixed(2)),
    high: Number((resolved.high * factor).toFixed(2)),
    band,
    sector: key,
    source: resolved.sourceKind === "override" ? resolved.sourceLabel : SECTOR_MULTIPLES[key].source,
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
    const result = await callAI({ system: "You are a SaaS pricing strategist.", user: prompt, providerPolicy: "deepinfra-only" });
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

/**
 * Monthly revenue per customer for LTV / payback: stated ARPU, else MRR ÷
 * customers, else (single-customer assumption) the whole MRR. G19-S42: the
 * block is now rendered, so a 120-customer MRR must not be priced as one LTV.
 */
export function monthlyRevenuePerCustomer(input: Pick<BuildVcValuationInput, "mrrAud" | "arpuAud" | "customers">): number {
  const mrr = input.mrrAud ?? 0;
  if (mrr <= 0) return 0;
  if (typeof input.arpuAud === "number" && input.arpuAud > 0) return input.arpuAud;
  if (typeof input.customers === "number" && input.customers > 0) return mrr / input.customers;
  return mrr;
}

export function unitEconomics(input: BuildVcValuationInput): { ltvCacRatio: number; verdict: "strong" | "healthy" | "watch" | "weak"; [key: string]: unknown } {
  const { monthlyChurnPct = 5, cacAud = 600, grossMarginPct = 70 } = input;
  const monthly = monthlyRevenuePerCustomer(input);
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

/**
 * G19-S42 — every method the report can carry. `stage_baseline` is the AU
 * pre-money baseline for the SVI stage (`lib/valuation.ts
 * VALUATION_BASELINES_AUD`), the third leg of the pre-revenue band.
 */
export type VcValuationMethodKey =
  | "revenue_multiple"
  | "berkus"
  | "dcf_proxy"
  | "comparables"
  | "risk_factor_summation"
  | "scorecard"
  | "stage_baseline";

/** Where the revenue figure came from — decides which methods may run and how much they weigh. */
export type ValuationRevenueSource = "connector" | "document" | "founder_stated" | "none";

export interface BerkusPillars {
  soundIdea: boolean;
  prototype: boolean;
  qualityTeam: boolean;
  strategicRelationships: boolean;
  productRollout: boolean;
}

/** The inputs the model actually ran on — rendered as "Inputs & assumptions" (G19-S42). */
export interface ValuationInputsRecord {
  mrrAud: number;
  arrAud: number;
  revenueSource: ValuationRevenueSource;
  /** Observed monthly growth; absent when nothing observed it. */
  monthlyGrowthRatePct?: number;
  /** true when a growth-dependent method ran on the sector median instead of an observed rate. */
  growthAssumed: boolean;
  /** The sector-median monthly growth used when `growthAssumed`. */
  assumedGrowthRatePct?: number;
  esicQualifies: boolean;
  rdtiRefundAud: number;
  berkusPillars: BerkusPillars;
  stage: string;
  /** SVI stage 0–7 behind `stage_baseline` (mapped from `stage` when the caller gave none). */
  sviStage: number;
  sector: string;
  sectorMultipleLow: number;
  sectorMultipleHigh: number;
  sectorMultipleMedian: number;
  sectorMultipleSource: string;
  /** true only when the founder stated a raise — the model never invents one. */
  raiseStated: boolean;
  raiseAud?: number;
}

export interface VcValuationMethodRow {
  method: VcValuationMethodKey;
  lowAud: number;
  midAud: number;
  highAud: number;
  weight: number;
  rationale: string;
  applicable: boolean;
}

export interface VcValuationReport {
  stage: string;
  sector: string;
  currency: string;
  blended: { lowAud: number; midAud: number; highAud: number; confidence: number };
  market: { tamAud: number; samAud: number; somAud: number; cagrPct: number; methodology: string };
  methods: VcValuationMethodRow[];
  /** G19-S42: what the model ran on. */
  inputs: ValuationInputsRecord;
  /** G19-S42: one line per method saying how its mid was derived ("ARR A$1.2M × 6.0–7.5 (sector p25–p75)"). */
  derivation: Partial<Record<VcValuationMethodKey, string>>;
  /** G19-S42: the AU stage baseline the band is cross-checked against. */
  stageBaseline: { sviStage: number; stageLabel: string; lowAud: number; midAud: number; highAud: number; source: string };
  projection: Array<{ month: number; mrrAud: number; revenueAud: number; ebitdaAud: number; opexAud: number; cashBalanceAud: number; cogsAud: number }>;
  unitEconomics: { cacAud: number; ltvAud: number; ltvCacRatio: number; grossMarginPct: number; ruleOf40: number; cacPaybackMonths: number | null; verdict: "strong" | "healthy" | "watch" | "weak" };
  injection: {
    /** 0 unless the founder stated a raise (`raiseStated`). */
    raiseAud: number;
    raiseStated: boolean;
    preMoneyAud: number;
    postMoneyAud: number;
    dilutionPct: number;
    runwayExtensionMonths: number;
    useOfFunds: Array<{ category: string; pct: number; aud: number }>;
    nextMilestone: string;
  };
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
  /** SVI stage 0–7 when the caller has it (report pipeline) — picks the exact `stage_baseline` row. */
  sviStage?: number;
  mrrAud?: number;
  /** Observed monthly growth. Leave undefined when nothing observed it — the model then says "assumed". */
  monthlyGrowthRatePct?: number;
  monthlyOpexAud?: number;
  grossMarginPct?: number;
  cashOnHandAud?: number;
  arpuAud?: number;
  monthlyChurnPct?: number;
  cacAud?: number;
  customers?: number;
  tamAud?: number;
  /** Founder-stated raise. Absent → no ask is invented. */
  raiseAud?: number;
  esicQualifies?: boolean;
  estimatedRdtiRefundAud?: number;
  hasFounderVesting?: boolean;
  hasShareholdersAgreement?: boolean;
  hasEsopPool?: boolean;
  hasDataRoom?: boolean;
  /**
   * Provenance of `mrrAud`: a connector label ("stripe (last sync …)", "xero"),
   * "document", "founder-stated", or a `ValuationRevenueSource`. Absent with
   * MRR > 0 is treated as founder-stated (unverified).
   */
  revenueSource?: string | null;
}

export type VcValuationInput = BuildVcValuationInput;

/** Pre-revenue weights (G19 D3): Berkus 0.5 + scorecard 0.3 + stage baseline 0.2. */
export const PRE_REVENUE_WEIGHTS: Readonly<Record<"berkus" | "scorecard" | "stage_baseline", number>> = { berkus: 0.5, scorecard: 0.3, stage_baseline: 0.2 };

/** Revenue-stage weights (unchanged blend); scorecard + stage baseline stay reference rows. */
const REVENUE_WEIGHTS: Readonly<Record<VcValuationMethodKey, number>> = {
  revenue_multiple: 0.35,
  berkus: 0.1,
  dcf_proxy: 0.25,
  comparables: 0.15,
  risk_factor_summation: 0.15,
  scorecard: 0,
  stage_baseline: 0,
};

const REVENUE_METHODS: readonly VcValuationMethodKey[] = ["revenue_multiple", "dcf_proxy", "comparables", "risk_factor_summation"];

export const NEEDS_REVENUE_RATIONALE = "Needs revenue: connect Stripe/Xero or state MRR.";

/**
 * Sector-median monthly growth used when nothing observed a rate (Bessemer /
 * PitchBook mid-growth cohort, ~20–60 % YoY → ≈ 2–4 % MoM). Cited as
 * "assumed" on every surface that shows it.
 */
export const SECTOR_MEDIAN_MONTHLY_GROWTH_PCT: Readonly<Partial<Record<Sector, number>>> & { default: number } = {
  saas: 3.0,
  ai: 4.0,
  fintech: 2.5,
  healthtech: 2.5,
  cybertech: 3.0,
  marketplace: 2.5,
  ecommerce: 2.0,
  default: 2.5,
};

const SVI_STAGE_LABEL: Record<number, string> = {
  0: "Concept",
  1: "Validated idea",
  2: "MVP / pre-seed",
  3: "Traction / seed",
  4: "Revenue / Series A",
  5: "Growth",
  6: "Scale",
  7: "Corporation",
};

/** CFO stage label → SVI stage 0–7 when the caller gave no `sviStage`. */
const CFO_STAGE_TO_SVI: Record<string, number> = { "pre-seed": 2, seed: 3, "series-a": 4, "series-b": 6, "series-c": 7 };

export function sviStageFor(input: Pick<BuildVcValuationInput, "stage" | "sviStage">): number {
  if (typeof input.sviStage === "number" && Number.isFinite(input.sviStage)) return Math.max(0, Math.min(7, Math.round(input.sviStage)));
  return CFO_STAGE_TO_SVI[(input.stage ?? "pre-seed").toLowerCase()] ?? 2;
}

/** Normalise a caller's revenue-source label to the four-way enum. */
export function normaliseRevenueSource(label: string | null | undefined, mrrAud: number): ValuationRevenueSource {
  if (!(mrrAud > 0)) return "none";
  const s = (label ?? "").toLowerCase();
  if (s === "connector" || /stripe|xero|myob|quickbooks|connected|connector/.test(s)) return "connector";
  if (s === "document" || /document|upload|statement|bas\b|p&l|financials/.test(s)) return "document";
  return "founder_stated";
}

function audShort(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `A$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (Math.abs(n) >= 1_000) return `A$${Math.round(n / 1_000)}K`;
  return `A$${Math.round(n)}`;
}

export function buildVcValuationReport(input: BuildVcValuationInput): VcValuationReport {
  const { sector = "default", stage = "pre-seed", mrrAud = 0, esicQualifies = false, estimatedRdtiRefundAud = 0 } = input;
  // S27-C: multiples resolve through lib/valuation/sector-multiples (approved
  // override → static row); the label lands in the method rationale + notes.
  const bm = vcBenchmark(sector);
  const [multiLow, multiHigh] = bm.multipleRange;
  const arrAud = mrrAud * 12;
  const preRevenue = arrAud <= 0;
  const revenueSource = normaliseRevenueSource(input.revenueSource, mrrAud);
  const revenueEvidenced = revenueSource === "connector" || revenueSource === "document";

  // G19-S42 (c): growth is never silently 10 %/mo. Observed → used as is;
  // otherwise the sector median is used and flagged as assumed (only matters
  // once revenue exists — pre-revenue no growth-dependent method runs).
  const growthObserved = typeof input.monthlyGrowthRatePct === "number" && Number.isFinite(input.monthlyGrowthRatePct);
  const sectorKey = (SECTOR_MULTIPLES[sector as Sector] ? sector : "default") as Sector;
  const assumedGrowthRatePct = SECTOR_MEDIAN_MONTHLY_GROWTH_PCT[sectorKey] ?? SECTOR_MEDIAN_MONTHLY_GROWTH_PCT.default;
  const growthAssumed = !preRevenue && !growthObserved;
  const monthlyGrowthRatePct = growthObserved ? (input.monthlyGrowthRatePct as number) : preRevenue ? 0 : assumedGrowthRatePct;
  const growthInput: BuildVcValuationInput = { ...input, monthlyGrowthRatePct };
  const annualGrowth = monthlyGrowthRatePct * 12;
  const growthTier = growthTierAdjustment(annualGrowth);
  const growthNote = growthAssumed ? ` Growth assumed at the ${sectorKey} sector median ${assumedGrowthRatePct}%/mo (no observed rate).` : "";

  const market = estimateMarketSizing(input);
  const { tamAud, samAud, somAud } = market;
  const cagrPct = bm.medianMultiple > 8 ? 35 : bm.medianMultiple > 5 ? 25 : 18;

  const revLow = arrAud * multiLow;
  const revHigh = arrAud * multiHigh;
  const revMid = (revLow + revHigh) / 2;

  // Berkus signals derived from real input rather than hardcoded flags.
  // Quality-team credit needs a governance signal (founder vesting is the
  // cheapest AU proxy: it separates committed teams from paper co-founders).
  // Strategic-relationships credit needs structured investor artefacts (SHA
  // or a populated data room — both imply the startup has done the legwork
  // to be transactable with third parties).
  const berkusPillars: BerkusPillars = {
    soundIdea: true,
    prototype: mrrAud > 0 || (input.customers ?? 0) > 0,
    qualityTeam: input.hasFounderVesting === true,
    strategicRelationships: input.hasShareholdersAgreement === true || input.hasDataRoom === true,
    productRollout: mrrAud > 0,
  };
  const berkus = calculateBerkusValuation(berkusPillars.soundIdea, berkusPillars.prototype, berkusPillars.qualityTeam, berkusPillars.strategicRelationships, berkusPillars.productRollout);
  const pillarCount = Object.values(berkusPillars).filter(Boolean).length;
  const pillarNames = (Object.keys(berkusPillars) as Array<keyof BerkusPillars>).filter((k) => berkusPillars[k]).map((k) => k.replace(/([A-Z])/g, " $1").toLowerCase());

  // Revenue-dependent methods — only meaningful with ARR > 0 (G19-S42 (a)).
  const dcfMid = arrAud * (multiLow + 1);
  const rfBase = arrAud * bm.medianMultiple;
  const rdtiLiftPct = estimatedRdtiRefundAud > 0 && rfBase > 0
    ? Math.min(15, (estimatedRdtiRefundAud / Math.max(rfBase, 250_000)) * 100)
    : 0;
  const auTaxPct = (esicQualifies ? AU_MARKET_DATA.esicOffset * 100 : 0) + rdtiLiftPct;
  const rfMid = rfBase * (1 + auTaxPct / 100);
  let rfsRationale = `Tax-adjusted ARR multiple heuristic; au-tax: ${auTaxPct.toFixed(0)}%`;
  if (esicQualifies) rfsRationale += "; ESIC qualified (+20% offset)";
  if (estimatedRdtiRefundAud > 0) rfsRationale += `; Refundable RDTI est. A$${Math.round(estimatedRdtiRefundAud / 1000)}K (+${rdtiLiftPct.toFixed(1)}% proportional lift)`;
  const adjMultiple = bm.medianMultiple * growthTier.factor;
  const compMid = arrAud * adjMultiple;

  const scorecard = scorecardMethod(input);

  // Stage baseline — AU pre-money by SVI stage (CTV 2024/25 medians).
  const sviStage = sviStageFor(input);
  const baseline = VALUATION_BASELINES_AUD[sviStage] ?? VALUATION_BASELINES_AUD[2];
  const stageBaseline = {
    sviStage,
    stageLabel: SVI_STAGE_LABEL[sviStage] ?? stage,
    lowAud: baseline.low,
    midAud: baseline.mid,
    highAud: baseline.high,
    source: "Cut Through Venture — State of Australian Startup Funding 2024/25 medians (lib/valuation.ts VALUATION_BASELINES_AUD)",
  };

  const founderStatedSuffix = revenueSource === "founder_stated" ? " Founder-stated ARR — weight halved until Stripe/Xero or a statement evidences it." : "";
  const revenueWeightFactor = revenueSource === "founder_stated" ? 0.5 : 1;

  const rawMethods: VcValuationMethodRow[] = preRevenue
    ? [
        { method: "revenue_multiple", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: NEEDS_REVENUE_RATIONALE },
        { method: "berkus", lowAud: Math.round(berkus * 0.7), midAud: Math.round(berkus), highAud: Math.round(berkus * 1.3), weight: PRE_REVENUE_WEIGHTS.berkus, applicable: true, rationale: `Berkus milestone-based valuation (A$500K per pillar, AU-adjusted): ${pillarCount} of 5 pillars evidenced.` },
        { method: "dcf_proxy", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: NEEDS_REVENUE_RATIONALE },
        { method: "comparables", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: NEEDS_REVENUE_RATIONALE },
        { method: "risk_factor_summation", lowAud: 0, midAud: 0, highAud: 0, weight: 0, applicable: false, rationale: NEEDS_REVENUE_RATIONALE },
        { ...scorecard, method: "scorecard", weight: PRE_REVENUE_WEIGHTS.scorecard, applicable: true },
        { method: "stage_baseline", lowAud: baseline.low, midAud: baseline.mid, highAud: baseline.high, weight: PRE_REVENUE_WEIGHTS.stage_baseline, applicable: true, rationale: `AU pre-money baseline for SVI stage ${sviStage} (${stageBaseline.stageLabel}) — ${stageBaseline.source.split(" (")[0]}.` },
      ]
    : [
        { method: "revenue_multiple", lowAud: Math.round(revLow), midAud: Math.round(revMid), highAud: Math.round(revHigh), weight: REVENUE_WEIGHTS.revenue_multiple * revenueWeightFactor, applicable: true, rationale: `AU ${sector} revenue multiples ${multiLow}–${multiHigh}x ARR for ${stage} stage. Multiples: ${bm.sourceLabel}.${founderStatedSuffix}` },
        { method: "berkus", lowAud: Math.round(berkus * 0.7), midAud: Math.round(berkus), highAud: Math.round(berkus * 1.3), weight: REVENUE_WEIGHTS.berkus, applicable: true, rationale: `Berkus milestone-based valuation (A$500K per pillar, AU-adjusted): ${pillarCount} of 5 pillars evidenced.` },
        { method: "dcf_proxy", lowAud: Math.round(dcfMid * 0.7), midAud: Math.round(dcfMid), highAud: Math.round(dcfMid * 1.4), weight: REVENUE_WEIGHTS.dcf_proxy * revenueWeightFactor, applicable: true, rationale: `Adjusted ARR multiple: ARR × (sector lower multiple + 1). No discounted cash flows are calculated.${growthNote}${founderStatedSuffix}` },
        { method: "comparables", lowAud: Math.round(compMid * 0.75), midAud: Math.round(compMid), highAud: Math.round(compMid * 1.35), weight: REVENUE_WEIGHTS.comparables * revenueWeightFactor, applicable: true, rationale: `Comparable AU ${sector} transactions — growth tier: ${growthTier.tier} (${Math.round(annualGrowth)}% YoY${growthAssumed ? ", assumed" : ""}, Bessemer Cloud Index 2025 adjustment: ${growthTier.factor}x).${founderStatedSuffix}` },
        { method: "risk_factor_summation", lowAud: Math.round(rfMid * 0.75), midAud: Math.round(rfMid), highAud: Math.round(rfMid * 1.4), weight: REVENUE_WEIGHTS.risk_factor_summation * revenueWeightFactor, applicable: true, rationale: `${rfsRationale}.${founderStatedSuffix}` },
        { ...scorecard, method: "scorecard", weight: 0, applicable: false, rationale: `${scorecard.rationale} Reference only (weight 0) once revenue multiples apply.` },
        { method: "stage_baseline", lowAud: baseline.low, midAud: baseline.mid, highAud: baseline.high, weight: 0, applicable: false, rationale: `AU pre-money baseline for SVI stage ${sviStage} (${stageBaseline.stageLabel}) — shown as a cross-check, not blended.` },
      ];

  // Normalise so the applicable weights sum to exactly 1.
  const activeWeightSum = rawMethods.filter((m) => m.applicable).reduce((s, m) => s + m.weight, 0);
  const methods = rawMethods.map((m) => (m.applicable && activeWeightSum > 0 ? { ...m, weight: m.weight / activeWeightSum } : { ...m, weight: 0 }));
  const active = methods.filter((m) => m.applicable);

  const blendedLow = active.reduce((s, m) => s + m.lowAud * m.weight, 0);
  const blendedMid = active.reduce((s, m) => s + m.midAud * m.weight, 0);
  const blendedHigh = active.reduce((s, m) => s + m.highAud * m.weight, 0);

  // G19-S42 (b): evidence-driven confidence, no unconditional +10.
  //   35 + 25·(revenue connector / document) + 10·(founder-stated revenue)
  //      + 15·(growth observed) + 10·(≥ 2 applicable revenue-evidenced methods)
  //      − 10·(pre-revenue with only the idea pillar) → cap 85, floor 25.
  // "Non-Berkus" excludes the pre-revenue heuristics (scorecard, stage
  // baseline) — counting them would make the +10 unconditional again.
  const evidencedMethods = active.filter((m) => REVENUE_METHODS.includes(m.method)).length;
  const confidence = Math.max(
    25,
    Math.min(
      85,
      35 +
        (revenueEvidenced ? 25 : 0) +
        (revenueSource === "founder_stated" ? 10 : 0) +
        (growthObserved && !preRevenue ? 15 : 0) +
        (evidencedMethods >= 2 && revenueEvidenced ? 10 : 0) -
        (preRevenue && pillarCount <= 1 ? 10 : 0),
    ),
  );

  const projection = projectFinancials(growthInput, 36);
  const breakEvenRow = projection.find((r) => r.ebitdaAud >= 0);

  const perCustomer = monthlyRevenuePerCustomer(input);
  const cacAud = Math.max(500, input.cacAud ?? perCustomer * 2);
  const ltvAud = perCustomer > 0 ? perCustomer * 24 * 0.7 : 0;
  const grossMarginPct = input.grossMarginPct ?? 72;
  const ruleOf40 = monthlyGrowthRatePct * 12 + (grossMarginPct - 28);

  // G19-S42 (d): the raise is the founder's number or nothing.
  const raiseStated = typeof input.raiseAud === "number" && Number.isFinite(input.raiseAud) && input.raiseAud > 0;
  const raiseAud = raiseStated ? (input.raiseAud as number) : 0;
  const preMoneyAud = blendedMid;
  const postMoneyAud = preMoneyAud + raiseAud;
  const opexMonthly = input.monthlyOpexAud ?? Math.max(15_000, mrrAud * 0.8);

  const ue = unitEconomics(growthInput);
  const auExitCheck = auExitRealisationCheck(growthInput, projection);

  const derivation: Partial<Record<VcValuationMethodKey, string>> = preRevenue
    ? {
        berkus: `${pillarCount} of 5 pillars × A$500K (${pillarNames.join(", ")}) = ${audShort(berkus)}`,
        scorecard: scorecard.rationale.replace(/^Bill Payne Scorecard Method anchored to /, "").replace(/\.$/, ""),
        stage_baseline: `SVI stage ${sviStage} (${stageBaseline.stageLabel}) median ${audShort(baseline.mid)} (${audShort(baseline.low)}–${audShort(baseline.high)}), CTV 2024/25`,
        revenue_multiple: NEEDS_REVENUE_RATIONALE,
        dcf_proxy: NEEDS_REVENUE_RATIONALE,
        comparables: NEEDS_REVENUE_RATIONALE,
        risk_factor_summation: NEEDS_REVENUE_RATIONALE,
      }
    : {
        revenue_multiple: `ARR ${audShort(arrAud)} × ${multiLow}–${multiHigh} (sector p25–p75, ${bm.sourceLabel})`,
        berkus: `${pillarCount} of 5 pillars × A$500K (${pillarNames.join(", ")}) = ${audShort(berkus)}`,
        dcf_proxy: `ARR ${audShort(arrAud)} × (${multiLow} + 1) adjusted multiple heuristic${growthAssumed ? ` — growth assumed ${assumedGrowthRatePct}%/mo` : ""}`,
        comparables: `ARR ${audShort(arrAud)} × sector p50 multiple ${bm.medianMultiple} × growth tier ${growthTier.factor} (${growthTier.tier}${growthAssumed ? ", assumed" : ""})`,
        risk_factor_summation: `ARR ${audShort(arrAud)} × sector p50 multiple ${bm.medianMultiple} × (1 + AU tax ${auTaxPct.toFixed(0)} %)`,
        scorecard: `${scorecard.rationale.replace(/^Bill Payne Scorecard Method anchored to /, "").replace(/\.$/, "")} — reference`,
        stage_baseline: `SVI stage ${sviStage} (${stageBaseline.stageLabel}) median ${audShort(baseline.mid)} — cross-check`,
      };

  const inputs: ValuationInputsRecord = {
    mrrAud: Math.round(mrrAud),
    arrAud: Math.round(arrAud),
    revenueSource,
    ...(growthObserved ? { monthlyGrowthRatePct: input.monthlyGrowthRatePct as number } : {}),
    growthAssumed,
    ...(growthAssumed ? { assumedGrowthRatePct } : {}),
    esicQualifies,
    rdtiRefundAud: Math.round(estimatedRdtiRefundAud),
    berkusPillars,
    stage,
    sviStage,
    sector: sectorKey,
    sectorMultipleLow: multiLow,
    sectorMultipleHigh: multiHigh,
    sectorMultipleMedian: bm.medianMultiple,
    sectorMultipleSource: bm.sourceLabel,
    raiseStated,
    ...(raiseStated ? { raiseAud } : {}),
  };

  return {
    stage, sector, currency: "AUD",
    blended: { lowAud: Math.round(blendedLow), midAud: Math.round(blendedMid), highAud: Math.round(blendedHigh), confidence },
    market: { tamAud: Math.round(tamAud), samAud: Math.round(samAud), somAud: Math.round(somAud), cagrPct, methodology: "Top-down TAM sizing using AU market data (Austrade + ABS + sector benchmarks)." },
    methods,
    inputs,
    derivation,
    stageBaseline,
    projection,
    unitEconomics: { cacAud: Math.round(cacAud), ltvAud: Math.round(ltvAud), ltvCacRatio: ue.ltvCacRatio, grossMarginPct, ruleOf40: Math.round(ruleOf40), cacPaybackMonths: cacAud > 0 && perCustomer > 0 ? Math.max(1, Math.round(cacAud / (perCustomer * (grossMarginPct / 100)))) : null, verdict: ue.verdict },
    injection: {
      raiseAud: Math.round(raiseAud),
      raiseStated,
      preMoneyAud: Math.round(preMoneyAud),
      postMoneyAud: Math.round(postMoneyAud),
      dilutionPct: postMoneyAud > 0 ? Math.round((raiseAud / postMoneyAud) * 1000) / 10 : 0,
      runwayExtensionMonths: raiseStated ? Math.round(raiseAud / opexMonthly) : 0,
      useOfFunds: [{ category: "Product", pct: 40, aud: Math.round(raiseAud * 0.4) }, { category: "Sales & Mktg", pct: 30, aud: Math.round(raiseAud * 0.3) }, { category: "Team", pct: 20, aud: Math.round(raiseAud * 0.2) }, { category: "Ops", pct: 10, aud: Math.round(raiseAud * 0.1) }],
      nextMilestone: stage === "pre-seed" ? "Reach A$10K MRR and launch first paying customer cohort." : stage === "seed" ? "Hit A$50K MRR with demonstrated NRR >100%." : "Achieve A$500K MRR with repeatable GTM motion.",
    },
    scenarios: { bear: Math.round(blendedLow * 0.7), base: Math.round(blendedMid), bull: Math.round(blendedHigh * 1.3) },
    breakEven: { month: breakEvenRow?.month ?? null, mrrAtBreakEvenAud: breakEvenRow?.mrrAud },
    payback: { months: null, roiPct: 0 },
    notes: [
      ...(preRevenue ? ["MRR not provided — Berkus (50 %), scorecard (30 %) and the AU stage baseline (20 %) carry the band; 4 methods need revenue: connect Stripe/Xero or state MRR."] : []),
      ...(revenueSource === "founder_stated" ? ["Revenue is founder-stated — revenue-method weights halved until a connector or statement evidences it."] : []),
      ...(growthAssumed ? [`Growth rate assumed at the ${sectorKey} sector median ${assumedGrowthRatePct}%/mo — no observed rate.`] : []),
      ...(raiseStated ? [] : ["No raise stated — the ask, dilution and use of funds are not modelled until the founder states a round."]),
      `AU exit precedent: ${auExitCheck.note}`,
      `Sector multiples: ${bm.sourceLabel}.`,
    ],
    sources: ["Austrade Startup Investment Report 2024", "Cut Through Ventures AU VC Landscape", "SaaS Capital Index 2024", "Airtree AU Benchmarks 2025", "au-benchmark: AU exit realisation data", `sector-multiples: ${bm.sourceLabel}`],
    auExitCheck,
  };
}
