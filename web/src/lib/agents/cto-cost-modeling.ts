// src/lib/agents/cto-cost-modeling.ts

export interface TechStackCost {
  category: string
  items: TechItem[]
  monthlyCost: number
}

export interface TechItem {
  name: string
  type: "infra" | "service" | "tool" | "ai_model"
  monthlyCost: number
  unit: string
  notes: string
}

export interface DevelopmentCost {
  phase: string
  durationWeeks: number
  teamSize: TeamMember[]
  weeklyBurn: number
  totalCost: number
  milestones: string[]
}

export interface TeamMember {
  role: string
  count: number
  weeklyRate: number
  isFullTime: boolean
}

export interface TechBudgetProjection {
  months: TechBudgetMonth[]
  totalInfra12: number
  totalDev12: number
  totalAI12: number
  totalTools12: number
  grandTotal12: number
}

export interface TechBudgetMonth {
  month: number
  label: string
  infra: number
  development: number
  aiModels: number
  tools: number
  total: number
}

/** Australian developer daily rate benchmarks (AUD) */
export const AU_DEV_RATES: Record<
  string,
  { junior: number; mid: number; senior: number; lead: number }
> = {
  "full-stack": { junior: 1200, mid: 1800, senior: 2500, lead: 3200 },
  frontend: { junior: 1100, mid: 1700, senior: 2300, lead: 3000 },
  backend: { junior: 1200, mid: 1800, senior: 2600, lead: 3300 },
  mobile: { junior: 1300, mid: 1900, senior: 2700, lead: 3400 },
  devops: { junior: 1400, mid: 2000, senior: 2800, lead: 3500 },
  "data-engineer": { junior: 1300, mid: 2000, senior: 2800, lead: 3500 },
  designer: { junior: 900, mid: 1400, senior: 2000, lead: 2600 },
  "product-manager": { junior: 1100, mid: 1700, senior: 2500, lead: 3200 },
}

/** Infrastructure cost templates */
const INFRA_TEMPLATES: Record<string, TechStackCost[]> = {
  mvp: [
    {
      category: "Compute",
      items: [
        {
          name: "AWS EC2 t3.micro",
          type: "infra",
          monthlyCost: 15,
          unit: "instance",
          notes: "Baseline compute for MVP",
        },
      ],
      monthlyCost: 15,
    },
    {
      category: "Database",
      items: [
        {
          name: "MongoDB Atlas M0",
          type: "service",
          monthlyCost: 0,
          unit: "cluster",
          notes: "Free tier for early stage",
        },
      ],
      monthlyCost: 0,
    },
  ],
}

/** Next.js 16 performance benchmarks */
export const NEXTJS_16_BENCHMARKS = {
  confidence: 0.85 as const,
  bundleSizeReductionPercent: 42 as const,
  streamingSSR_TTFBImprovementPercent: 60 as const,
  serverComponentsClientJsReductionPercent: 40 as const,
}

/** Average APAC latency for mobile users (ms) */
export const AU_APAC_MOBILE_LATENCY_MS = 250

/** Startup performance metrics */
export interface StartupMetrics {
  /** Current bundle size in megabytes */
  bundleSizeMB: number
  /** Current average Time‑to‑First‑Byte in ms */
  ttfbMs: number
  /** Monthly CDN data transfer in GB */
  cdnTransferGB: number
  /** Average revenue per user (AUD) */
  arpAU: number
  /** Monthly active users */
  mau: number
}

/**
 * Calculate monetary savings from bundle size reduction.
 * @param costPerGB Monthly CDN cost per GB (AUD)
 * @param originalSizeGB Original bundle size in GB
 * @param reductionPercent Percent reduction (e.g., 42)
 * @returns Savings per month (AUD)
 */
export function calculateBundleSizeSavings(
  costPerGB: number,
  originalSizeGB: number,
  reductionPercent: number,
): number {
  const reducedSizeGB = originalSizeGB * (1 - reductionPercent / 100)
  const originalCost = originalSizeGB * costPerGB
  const newCost = reducedSizeGB * costPerGB
  return originalCost - newCost
}

/**
 * Estimate revenue uplift from faster TTFB via streaming SSR.
 * @param ttfbImprovementPercent Percent improvement (e.g., 60)
 * @param baseConversionRate Current conversion rate (decimal)
 * @param arpAU Average revenue per user (AUD)
 * @param mau Monthly active users
 * @returns Additional monthly revenue (AUD)
 */
export function estimateTTFBUpliftRevenue(
  ttfbImprovementPercent: number,
  baseConversionRate: number,
  arpAU: number,
  mau: number,
): number {
  const upliftFactor = 1 + ttfbImprovementPercent / 200 // empirical 0.5x improvement => ~5% conversion boost
  const newConversionRate = baseConversionRate * upliftFactor
  const additionalConversions = (newConversionRate - baseConversionRate) * mau
  return additionalConversions * arpAU
}

/**
 * Apply Next.js 16 streaming SSR benefits to a budget projection.
 * Adjusts development cost (reduced re‑renders) and adds estimated revenue uplift.
 * @param budget Existing budget projection
 * @param metrics Startup performance metrics
 * @param baseConversionRate Current conversion rate (decimal)
 * @returns Updated budget projection with added `performanceUpliftAU` field
 */
export function applyNextJs16Performance(
  budget: TechBudgetProjection,
  metrics: StartupMetrics,
  baseConversionRate: number,
): TechBudgetProjection & { performanceUpliftAU: number } {
  const cdnCostPerGB = 0.12 // AUD, typical CDN pricing
  const originalBundleGB = metrics.bundleSizeMB / 1024
  const bundleSavings = calculateBundleSizeSavings(
    cdnCostPerGB,
    originalBundleGB,
    NEXTJS_16_BENCHMARKS.bundleSizeReductionPercent,
  )
  const revenueUplift = estimateTTFBUpliftRevenue(
    NEXTJS_16_BENCHMARKS.streamingSSR_TTFBImprovementPercent,
    baseConversionRate,
    metrics.arpAU,
    metrics.mau,
  )
  const totalUplift = bundleSavings + revenueUplift
  const adjustedGrandTotal = budget.grandTotal12 - totalUplift
  return {
    ...budget,
    grandTotal12: adjustedGrandTotal,
    performanceUpliftAU: totalUplift,
  }
}

/**
 * Generate a simple 12‑month budget projection incorporating Next.js 16 benefits.
 * @param baseBudget Base budget projection without performance adjustments
 * @param metrics Startup performance metrics
 * @param conversionRate Current conversion rate (decimal)
 * @returns Updated budget projection
 */
export function generateEnhancedBudget(
  baseBudget: TechBudgetProjection,
  metrics: StartupMetrics,
  conversionRate: number,
): TechBudgetProjection & { performanceUpliftAU: number } {
  return applyNextJs16Performance(baseBudget, metrics, conversionRate)
}

/**
 * Helper to create a baseline 12‑month budget from infrastructure templates.
 * @param templateKey Template identifier (e.g., "mvp")
 * @returns Initialized TechBudgetProjection
 */
export function createBaselineBudget(templateKey: string): TechBudgetProjection {
  const infraCosts = INFRA_TEMPLATES[templateKey] ?? []
  const months: TechBudgetMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `Month ${i + 1}`,
    infra: infraCosts.reduce((sum, cat) => sum + cat.monthlyCost, 0),
    development: 0,
    aiModels: 0,
    tools: 0,
    total: 0,
  }))
  const totalInfra12 = months.reduce((s, m) => s + m.infra, 0)
  return {
    months,
    totalInfra12,
    totalDev12: 0,
    totalAI12: 0,
    totalTools12: 0,
    grandTotal12: totalInfra12,
  }
}
