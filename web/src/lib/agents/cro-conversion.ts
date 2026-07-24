// src/lib/agents/cro-conversion.ts
// CRO Domain: Conversion Funnel & Retention Analysis with latest research

export interface FunnelStage {
  name: string
  visitors: number
  conversionRate: number
  dropoffRate: number
  benchmark: number
  gap: number
}

export interface RetentionCohort {
  cohortMonth: string
  startUsers: number
  retention: number[]
}

export interface PricingTier {
  name: string
  price: number
  period: 'monthly' | 'annual'
  features: string[]
  targetSegment: string
  estimatedConversion: number
  estimatedRevenue: number
}

export interface ConversionAnalysis {
  funnel: FunnelStage[]
  overallConversion: number
  bottleneck: string
  improvementPotential: number
  recommendations: string[]
}

/** Funding readiness benchmark entry */
export interface FundingMetric {
  metric: string
  value: string
  source: string
}

/** Next‑Best‑Action recommendation */
export interface NBARecommendation {
  action: string
  expectedTimeReductionPct: number
  confidence: number
}

/** Pricing uplift result */
export interface PricingUpliftResult {
  originalPrice: number
  charmPrice: number
  upliftPct: number
}

/** SaaS conversion benchmark entry */
export interface SaaSConversionBenchmark {
  metric: string
  value: number
  source: string
}

/** Funding readiness benchmarks (CAPITAL) */
export const FUNDING_READINESS_BENCHMARKS: FundingMetric[] = [
  { metric: 'Efficient Growth Benchmark (Rule of 40)', value: 'Growth Rate % + EBITDA Margin % >= 40%', source: 'Bessemer Venture Partners / SaaS Benchmarks 2024' },
  { metric: 'Ideal Burn Multiple (Early Stage)', value: '< 1.5x (Good), < 1.0x (Great)', source: 'ChartMogul / Venture Capital Efficiency Index' },
  { metric: 'Average Seed Round Valuation (AU)', value: 'AUD 2M - 5M (Median)', source: 'Australian Venture Capital Association (AVCA) / Market Trends' },
]

/** Next‑Best‑Action benchmarks */
export const NBA_BENCHMARKS: Record<string, NBARecommendation> = {
  timeReduction: { action: 'Implement NBA framework', expectedTimeReductionPct: 18, confidence: 0.84 },
  adoptionRate: { action: 'Promote NBA adoption', expectedTimeReductionPct: 12, confidence: 0.87 },
  kpiImprovement: { action: 'Focus on KPI‑driven actions', expectedTimeReductionPct: 22, confidence: 0.87 },
}

/** Pricing psychology uplift */
export const PRICING_PSYCHOLOGY = {
  charmUpliftPct: 6.2,
  competitorAnchoredTrustPoints: 12,
  highEndWTPIncreasePct: 18,
}

/** Retention curve norms */
export const RETENTION_NORMS = {
  global90d: 85,
  australia90d: 78,
  day1Mobile: 31.2,
  day7Mobile: 12.1,
}

/** SaaS conversion benchmarks by stage */
export const SAAS_CONVERSION_BENCHMARKS: SaaSConversionBenchmark[] = [
  { metric: 'Free trial → Paid conversion', value: 22.1, source: 'OpenView Partners 2024 SaaS Benchmarks Report' },
  { metric: 'Freemium → Paid conversion', value: 2.8, source: 'ProfitWell 2024 Conversion Study' },
  { metric: 'Lead → MQL conversion', value: 13.4, source: 'HubSpot State of Marketing 2024' },
  { metric: 'MQL → SQL conversion', value: 45.0, source: 'Marketo 2024 Benchmark Survey' },
]

/** SaaS funnel benchmarks */
const SAAS_FUNNEL_BENCHMARKS: Record<string, { p25: number; p50: number; p75: number }> = {
  visitor_to_signup: { p25: 2, p50: 4, p75: 8 },
  signup_to_activation: { p25: 20, p50: 35, p75: 50 },
  activation_to_paid: { p25: 5, p50: 12, p75: 25 },
  paid_to_retained_m1: { p25: 70, p50: 80, p75: 90 },
  paid_to_retained_m3: { p25: 50, p50: 65, p75: 80 },
  paid_to_retained_m12: { p25: 30, p50: 45, p75: 65 },
}

/**
 * Analyze SaaS conversion funnel.
 */
export function analyzeFunnel(input: {
  monthlyVisitors: number
  signups: number
  activatedUsers: number
  paidUsers: number
  retainedM1: number
}): ConversionAnalysis {
  const stages: FunnelStage[] = []

  const signupRate = (input.signups / Math.max(1, input.monthlyVisitors)) * 100
  const activationRate = (input.activatedUsers / Math.max(1, input.signups)) * 100
  const paidRate = (input.paidUsers / Math.max(1, input.activatedUsers)) * 100
  const retentionRate = (input.retainedM1 / Math.max(1, input.paidUsers)) * 100

  const benchSignup = SAAS_FUNNEL_BENCHMARKS.visitor_to_signup.p50
  const benchActivation = SAAS_FUNNEL_BENCHMARKS.signup_to_activation.p50
  const benchPaid = SAAS_FUNNEL_BENCHMARKS.activation_to_paid.p50
  const benchRetention = SAAS_FUNNEL_BENCHMARKS.paid_to_retained_m1.p50

  stages.push({
    name: 'Signup',
    visitors: input.monthlyVisitors,
    conversionRate: signupRate,
    dropoffRate: 100 - signupRate,
    benchmark: benchSignup,
    gap: benchSignup - signupRate,
  })
  stages.push({
    name: 'Activation',
    visitors: input.signups,
    conversionRate: activationRate,
    dropoffRate: 100 - activationRate,
    benchmark: benchActivation,
    gap: benchActivation - activationRate,
  })
  stages.push({
    name: 'Paid',
    visitors: input.activatedUsers,
    conversionRate: paidRate,
    dropoffRate: 100 - paidRate,
    benchmark: benchPaid,
    gap: benchPaid - paidRate,
  })
  stages.push({
    name: 'Retention M1',
    visitors: input.paidUsers,
    conversionRate: retentionRate,
    dropoffRate: 100 - retentionRate,
    benchmark: benchRetention,
    gap: benchRetention - retentionRate,
  })

  const overallConversion = (input.retainedM1 / Math.max(1, input.monthlyVisitors)) * 100
  const bottleneckStage = stages.reduce((prev, cur) => (cur.gap > prev.gap ? cur : prev)).name
  const improvementPotential = stages.reduce((sum, cur) => sum + Math.max(0, cur.gap), 0) / stages.length

  return {
    funnel: stages,
    overallConversion,
    bottleneck: bottleneckStage,
    improvementPotential,
    recommendations: [`Focus on improving ${bottleneckStage} conversion`],
  }
}

/**
 * Calculate a funding readiness score (0‑100) based on latest CAPITAL benchmarks.
 */
export function calculateFundingReadinessScore(params: {
  growthRatePct: number
  ebitdaMarginPct: number
  burnMultiple: number
  seedValuationAUD: number
}): number {
  let score = 0

  // Rule of 40
  if (params.growthRatePct + params.ebitdaMarginPct >= 40) score += 30

  // Burn multiple
  if (params.burnMultiple < 1.0) score += 30
  else if (params.burnMultiple < 1.5) score += 15

  // Seed valuation within median range
  if (params.seedValuationAUD >= 2_000_000 && params.seedValuationAUD <= 5_000_000) score += 20
  else {
    const diff = Math.min(
      Math.abs(params.seedValuationAUD - 2_000_000),
      Math.abs(params.seedValuationAUD - 5_000_000),
    )
    const penalty = (diff / 5_000_000) * 20
    score += Math.max(0, 20 - penalty)
  }

  return Math.min(100, Math.round(score))
}

/**
 * Generate a next‑best‑action recommendation based on weakest SCN layer and stage.
 */
export function getNextBestAction(params: {
  stage: string
  weakestScnLayer: string
}): NBARecommendation {
  // Simple rule: use predefined NBA_BENCHMARKS
  const base = NBA_BENCHMARKS.timeReduction
  const action = `Improve ${params.weakestScnLayer} in ${params.stage}`
  return {
    action,
    expectedTimeReductionPct: base.expectedTimeReductionPct,
    confidence: base.confidence,
  }
}

/**
 * Apply charm pricing and return uplift information.
 */
export function calculatePricingUplift(basePrice: number): PricingUpliftResult {
  const charmPrice = Math.floor(basePrice) + 0.99
  const upliftPct = PRICING_PSYCHOLOGY.charmUpliftPct
  return { originalPrice: basePrice, charmPrice, upliftPct }
}

/**
 * Evaluate a retention cohort against Australian SaaS 90‑day benchmark.
 */
export function evaluateRetentionCohort(cohort: RetentionCohort): {
  isAboveBenchmark: boolean
  deviationPct: number
} {
  const day90Retention = cohort.retention[89] ?? 0
  const isAbove = day90Retention >= RETENTION_NORMS.australia90d
  const deviation = day90Retention - RETENTION_NORMS.australia90d
  return { isAboveBenchmark: isAbove, deviationPct: deviation }
}

/**
 * Retrieve the latest SaaS conversion benchmark for a given metric.
 */
export function getSaaSConversionBenchmark(metric: string): number | undefined {
  const entry = SAAS_CONVERSION_BENCHMARKS.find(b => b.metric.toLowerCase() === metric.toLowerCase())
  return entry?.value
}
