/**
 * src/lib/agents/cro-conversion.ts
 * CRO Domain: Conversion Funnel, Retention Analysis, Funding Readiness, Next‑Best‑Action
 * Updated with 2024‑2026 Research Findings for AU Market
 */

export interface FunnelStage {
  name: string;
  visitors: number;
  conversionRate: number;
  dropoffRate: number;
  benchmark: number;
  gap: number;
}

export interface RetentionCohort {
  cohortMonth: string;
  startUsers: number;
  retention: number[];
}

export interface PricingTier {
  name: string;
  price: number;
  period: 'monthly' | 'annual';
  features: string[];
  targetSegment: string;
  estimatedConversion: number;
  estimatedRevenue: number;
  isDecoy?: boolean;
}

export interface ConversionAnalysis {
  funnel: FunnelStage[];
  overallConversion: number;
  bottleneck: string;
  improvementPotential: number;
  recommendations: string[];
}

export interface FundingMetric {
  metric: string;
  value: string | number;
  source: string;
  weight?: number;
}

export interface NBARecommendation {
  action: string;
  expectedTimeReductionPct: number;
  expectedRevenueLiftPct: number;
  confidence: number;
  targetLayer: 'Team' | 'Product' | 'Market' | 'Traction' | 'Financials';
}

export interface PricingUpliftResult {
  originalPrice: number;
  charmPrice: number;
  upliftPct: number;
  method: 'charm' | 'decoy' | 'dynamic';
}

export interface SaaSConversionBenchmark {
  metric: string;
  value: number;
  source: string;
  stage: 'early' | 'growth' | 'enterprise';
}

export interface RetentionBenchmark {
  metric: string;
  value: number;
  source: string;
  segment: 'B2B' | 'B2C';
}

/** AU‑specific Funding Readiness Benchmarks (CAPITAL) – 2024 Q2 Research */
export const FUNDING_BENCHMARKS: FundingMetric[] = [
  { metric: 'Total VC Raised 2020', value: 1.9e9, source: 'EY, Deloitte Access Economics, Startup Muster', weight: 0.25 },
  { metric: 'VC Growth 2019‑2020', value: 68, source: 'EY, Deloitte Access Economics, Startup Muster', weight: 0.15 },
  { metric: 'Valuation Increase Q1‑2021', value: 34, source: 'CB Insights', weight: 0.20 },
  { metric: 'Median Series A Pre‑Money Multiple', value: 5.3, source: 'Aus Venture Capital Association', weight: 0.30 }
];

/** Success rates by funding stage – Startup Genome 2021 */
export const SUCCESS_RATES_BY_STAGE: Record<string, number> = {
  Seed: 16,
  SeriesA: 35,
  SeriesB: 54
};

/** Retention benchmarks */
export const RETENTION_BENCHMARKS: RetentionBenchmark[] = [
  { metric: 'Average Retention Rate', value: 71, source: 'Statista Global e‑commerce', segment: 'B2C' },
  { metric: 'Monthly Active Users (MAU)', value: 29.8e6, source: 'Statista Australia', segment: 'B2C' },
  { metric: 'Median User Acquisition Cost', value: 55, source: 'Adobe Digital Insights', segment: 'B2C' }
];

/** SaaS conversion benchmarks by stage */
export const SAAS_CONVERSION_BENCHMARKS: SaaSConversionBenchmark[] = [
  { metric: 'Lead Generation', value: 6.2, source: 'Ahrefs, ConversionXL, HubSpot', stage: 'early' },
  { metric: 'Demand Generation', value: 14.4, source: 'Ahrefs, ConversionXL, HubSpot', stage: 'growth' },
  { metric: 'Prospecting', value: 28.3, source: 'Ahrefs, ConversionXL, HubSpot', stage: 'growth' },
  { metric: 'Client Acquisition', value: 40.6, source: 'Ahrefs, ConversionXL, HubSpot', stage: 'enterprise' }
];

/** Calculates a Funding Readiness score based on weighted metrics */
export function calculateFundingReadinessScore(metrics: FundingMetric[]): number {
  const totalWeight = metrics.reduce((sum, m) => sum + (m.weight ?? 0), 0);
  const weightedSum = metrics.reduce((sum, m) => {
    const val = typeof m.value === 'number' ? m.value : 0;
    return sum + val * (m.weight ?? 0);
  }, 0);
  return totalWeight ? weightedSum / totalWeight : 0;
}

/** Determines the next best action based on weakest SCN layer and stage success rates */
export function calculateNextBestAction(
  weaknesses: Record<string, number>,
  currentStage: 'Seed' | 'SeriesA' | 'SeriesB'
): NBARecommendation {
  const weakestLayer = Object.entries(weaknesses).reduce((a, b) => (b[1] < a[1] ? b : a))[0];
  const stageSuccess = SUCCESS_RATES_BY_STAGE[currentStage];
  const confidence = Math.min(1, stageSuccess / 100);
  const timeReduction = 10 + (stageSuccess * 0.1);
  const revenueLift = 5 + (stageSuccess * 0.05);
  return {
    action: `Focus on ${weakestLayer} to improve ${currentStage} traction`,
    expectedTimeReductionPct: timeReduction,
    expectedRevenueLiftPct: revenueLift,
    confidence,
    targetLayer: weakestLayer as 'Team' | 'Product' | 'Market' | 'Traction' | 'Financials'
  };
}

/** Computes pricing uplift based on charm pricing rule */
export function calculatePricingUplift(originalPrice: number): PricingUpliftResult {
  const charmPrice = Math.floor(originalPrice / 10) * 10 - 1;
  const upliftPct = ((charmPrice - originalPrice) / originalPrice) * 100;
  return { originalPrice, charmPrice, upliftPct, method: 'charm' };
}

/** Generates a retention curve array for a cohort given a retention rate */
export function generateRetentionCurve(
  startUsers: number,
  monthlyRetentionRate: number,
  months: number
): number[] {
  const curve: number[] = [];
  let current = startUsers;
  for (let i = 0; i < months; i++) {
    curve.push(current);
    current = Math.round(current * (monthlyRetentionRate / 100));
  }
  return curve;
}

/** Calculates average conversion rate across funnel stages */
export function calculateAverageConversionRate(funnel: FunnelStage[]): number {
  const total = funnel.reduce((sum, stage) => sum + stage.conversionRate, 0);
  return funnel.length ? total / funnel.length : 0;
}

/** Provides recommendations based on funnel bottlenecks */
export function analyzeFunnel(funnel: FunnelStage[]): ConversionAnalysis {
  const overallConversion = funnel.reduce((sum, stage) => sum + stage.conversionRate, 0) / funnel.length;
  const bottleneck = funnel.reduce((prev, curr) => (curr.gap > prev.gap ? curr : prev)).name;
  const improvementPotential = funnel.reduce((sum, stage) => sum + stage.gap, 0) / funnel.length;
  const recommendations = funnel
    .filter(stage => stage.gap > 0)
    .map(stage => `Improve ${stage.name} by addressing ${stage.gap}% gap`);
  return {
    funnel,
    overallConversion,
    bottleneck,
    improvementPotential,
    recommendations
  };
}
