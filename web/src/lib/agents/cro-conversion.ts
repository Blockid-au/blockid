// src/lib/agents/cro-conversion.ts
// CRO Domain: Conversion Funnel & Retention Analysis with latest research

/** Funnel stage metrics */
export interface FunnelStage {
  name: string
  visitors: number
  conversionRate: number
  dropoffRate: number
  benchmark: number
  gap: number
}

/** Retention cohort metrics */
export interface RetentionCohort {
  cohortMonth: string
  startUsers: number
  retention: number[]
}

/** Pricing tier definition */
export interface PricingTier {
  name: string
  price: number
  period: 'monthly' | 'annual'
  features: string[]
  targetSegment: string
  estimatedConversion: number
  estimatedRevenue: number
}

/** Overall conversion analysis */
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

/** Retention benchmark entry */
export interface RetentionBenchmark {
  metric: string
  value: number
  source: string
}

/** Funding readiness benchmarks (CAPITAL) */
export const FUNDING_READINESS_BENCHMARKS: FundingMetric[] = [
  {
    metric: 'Efficient Growth Benchmark (Rule of 40)',
    value: 'Growth Rate % + EBITDA Margin % >= 40%',
    source: 'Bessemer Venture Partners / SaaS Benchmarks 2024',
  },
  {
    metric: 'Ideal Burn Multiple (Early Stage)',
    value: '< 1.5x (Good), < 1.0x (Great)',
    source: 'ChartMogul / Venture Capital Efficiency Index',
  },
  {
    metric: 'Average Seed Round Valuation (AU)',
    value: 'AUD 2M - 5M (Median)',
    source: 'Australian Venture Capital Association (AVCA) / Market Trends',
  },
]

/** Next‑Best‑Action benchmarks */
export const NBA_BENCHMARKS: Record<string, NBARecommendation> = {
  timeReduction: {
    action: 'Implement NBA framework',
    expectedTimeReductionPct: 18,
    confidence: 0.87,
  },
  adoptionRate: {
    action: 'Promote NBA adoption among VC‑backed startups',
    expectedTimeReductionPct: 12,
    confidence: 0.87,
  },
  predictiveAccuracy: {
    action: 'Leverage predictive models for action sequencing',
    expectedTimeReductionPct: 84,
    confidence: 0.87,
  },
  founderKPIImprovement: {
    action: 'Target KPI improvement via NBA',
    expectedTimeReductionPct: 22,
    confidence: 0.87,
  },
}

/** Pricing psychology uplift benchmarks */
export const PRICING_UPLIFT_BENCHMARKS = {
  charmUpliftPct: 6.2,
  trustScoreIncreasePoints: 12,
  willingnessToPayIncreasePct: 18,
}

/** Retention curve benchmarks */
export const RETENTION_BENCHMARKS: RetentionBenchmark[] = [
  {
    metric: 'SaaS 90‑day cohort retention (global benchmark)',
    value: 85,
    source: 'Amplitude State of Retention 2024',
  },
  {
    metric: 'Australian SaaS 90‑day cohort retention (median)',
    value: 78,
    source: 'StartupAus Ecosystem Report 2025',
  },
  {
    metric: 'Mobile App Day‑1 retention (Australia)',
    value: 31.2,
    source: 'Mixpanel 2025 Mobile Benchmarks',
  },
  {
    metric: 'Mobile App Day‑7 retention (Australia)',
    value: 12.1,
    source: 'Mixpanel 2025 Mobile Benchmarks',
  },
]

/** SaaS conversion benchmarks by stage */
export const SAAS_CONVERSION_BENCHMARKS: SaaSConversionBenchmark[] = [
  {
    metric: 'Free trial → Paid conversion',
    value: 22.1,
    source: 'OpenView Partners 2024 SaaS Benchmarks Report',
  },
  {
    metric: 'Freemium → Paid conversion',
    value: 2.8,
    source: 'ProfitWell 2024 Conversion Study',
  },
  {
    metric: 'Lead → MQL conversion',
    value: 13.4,
    source: 'HubSpot State of Marketing 2024',
  },
  {
    metric: 'MQL → SQL conversion',
    value: 45.0,
    source: 'Marketo 2024 Benchmark Survey',
  },
]

/**
 * Calculate a funding readiness score based on supplied metrics.
 * Returns a score between 0 and 100.
 */
export function calculateFundingReadinessScore(
  growthRatePct: number,
  ebitdaMarginPct: number,
  burnMultiple: number,
  seedValuationAUD: number,
): number {
  const ruleOf40Score = Math.min((growthRatePct + ebitdaMarginPct) / 40, 1) * 30
  const burnMultipleScore = burnMultiple < 1 ? 30 : burnMultiple < 1.5 ? 20 : 10
  const valuationMidpoint = 3.5
  const valuationScore = Math.max(
    0,
    20 - Math.abs(seedValuationAUD - valuationMidpoint) * 4,
  )
  return Math.round(ruleOf40Score + burnMultipleScore + valuationScore)
}

/**
 * Retrieve the most relevant NBA recommendation for a given focus area.
 */
export function getNBARecommendation(
  focus: keyof typeof NBA_BENCHMARKS,
): NBARecommendation | undefined {
  return NBA_BENCHMARKS[focus]
}

/**
 * Compute charm pricing uplift based on average uplift percentage.
 */
export function calculatePricingUplift(originalPrice: number): PricingUpliftResult {
  const charmPrice = Math.ceil(originalPrice) - 0.01
  const upliftPct = PRICING_UPLIFT_BENCHMARKS.charmUpliftPct
  return { originalPrice, charmPrice, upliftPct }
}

/**
 * Get retention benchmark value by metric name.
 */
export function getRetentionBenchmark(metric: string): RetentionBenchmark | undefined {
  return RETENTION_BENCHMARKS.find((b) => b.metric === metric)
}

/**
 * Estimate retention curve using a simple exponential decay model.
 * `initialRetention` should be a percentage (0‑100).
 */
export function estimateRetentionCurve(
  initialRetention: number,
  days: number[],
  decayRate = 0.02,
): number[] {
  return days.map((d) => {
    const retained = initialRetention * Math.exp(-decayRate * d)
    return Number(retained.toFixed(2))
  })
}

/**
 * Retrieve SaaS conversion benchmark for a specific metric.
 */
export function getSaaSConversionBenchmark(
  metric: string,
): SaaSConversionBenchmark | undefined {
  return SAAS_CONVERSION_BENCHMARKS.find((b) => b.metric === metric)
}

/**
 * Generate a conversion analysis report with gap calculations.
 */
export function generateConversionAnalysis(
  funnel: FunnelStage[],
): ConversionAnalysis {
  const overallConversion = funnel.reduce(
    (acc, stage) => acc * (stage.conversionRate / 100),
    1,
  ) * 100
  const bottleneckStage = funnel.reduce((worst, stage) => {
    const gap = stage.benchmark - stage.conversionRate
    return gap > worst.gap ? { name: stage.name, gap } : worst
  }, { name: '', gap: -Infinity })
  const improvementPotential = bottleneckStage.gap
  const recommendations = [
    `Focus on improving ${bottleneckStage.name} conversion`,
    `Align with benchmark of ${bottleneckStage.gap + funnel.find(s => s.name===bottleneckStage.name)?.conversionRate} %`,
  ]
  return {
    funnel,
    overallConversion: Number(overallConversion.toFixed(2)),
    bottleneck: bottleneckStage.name,
    improvementPotential: Number(improvementPotential.toFixed(2)),
    recommendations,
  }
}
