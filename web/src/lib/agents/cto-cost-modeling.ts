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

/** Next.js performance optimization benchmarks */
export const NEXT_JS_PERFORMANCE_OPTIMIZATION: {
  bundleSizeReduction: number
  ttfbImprovement: number
  reRendersReduction: number
  serverComponentsClientJSReduction: number
  mobilePerformanceImprovementAPAC: number
} = {
  bundleSizeReduction: 0.42,
  ttfbImprovement: 0.6,
  reRendersReduction: 0.4,
  serverComponentsClientJSReduction: 0.4,
  mobilePerformanceImprovementAPAC: 0.6,
}

/** Streaming SSR benefits for Australian startups */
export const STREAMING_SSR_BENEFITS: {
  ttfbImprovement: number
  mobilePerformanceImprovementAPAC: number
} = {
  ttfbImprovement: NEXT_JS_PERFORMANCE_OPTIMIZATION.ttfbImprovement,
  mobilePerformanceImprovementAPAC: NEXT_JS_PERFORMANCE_OPTIMIZATION.mobilePerformanceImprovementAPAC,
}

/** Server Components benefits */
export const SERVER_COMPONENTS_BENEFITS: {
  clientJSReduction: number
} = {
  clientJSReduction: NEXT_JS_PERFORMANCE_OPTIMIZATION.serverComponentsClientJSReduction,
}

/**
 * Calculates the potential cost savings of using Next.js 16 performance optimizations
 * @param currentBundleSize - current bundle size
 * @param currentTTFB - current time to first byte
 * @param currentReRenders - current number of re-renders
 * @param currentClientJS - current client-side JavaScript
 * @returns potential cost savings
 */
export function calculatePotentialCostSavings(
  currentBundleSize: number,
  currentTTFB: number,
  currentReRenders: number,
  currentClientJS: number
): {
  bundleSizeSavings: number
  ttfbSavings: number
  reRendersSavings: number
  clientJSSavings: number
} {
  const bundleSizeSavings =
    currentBundleSize * NEXT_JS_PERFORMANCE_OPTIMIZATION.bundleSizeReduction
  const ttfbSavings = currentTTFB * NEXT_JS_PERFORMANCE_OPTIMIZATION.ttfbImprovement
  const reRendersSavings =
    currentReRenders * NEXT_JS_PERFORMANCE_OPTIMIZATION.reRendersReduction
  const clientJSSavings =
    currentClientJS * SERVER_COMPONENTS_BENEFITS.clientJSReduction

  return {
    bundleSizeSavings,
    ttfbSavings,
    reRendersSavings,
    clientJSSavings,
  }
}

/**
 * Calculates the potential performance improvement of using Streaming SSR for Australian startups
 * @param currentMobilePerformance - current mobile performance
 * @returns potential performance improvement
 */
export function calculatePotentialPerformanceImprovement(
  currentMobilePerformance: number
): number {
  return (
    currentMobilePerformance * STREAMING_SSR_BENEFITS.mobilePerformanceImprovementAPAC
  )
}
