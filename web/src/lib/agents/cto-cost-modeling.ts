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
  mobilePerformanceImprovement: number
} = {
  bundleSizeReduction: 0.42, // 42% reduction in bundle size
  ttfbImprovement: 0.6, // 60% improvement in TTFB
  reRendersReduction: 0.4, // 40% reduction in re-renders
  mobilePerformanceImprovement: 0.6, // 60% improvement in mobile performance on high-latency APAC networks
}

/** Australian mobile performance benchmarks (APAC) */
export const AU_MOBILE_PERFORMANCE: {
  averageLatency: number
  highLatencyThreshold: number
} = {
  averageLatency: 150, // average latency in ms
  highLatencyThreshold: 300, // high latency threshold in ms
}

/** Recommended tech stack for Australian startups */
export const AU_STARTUP_TECH_STACK: {
  frontend: string
  backend: string
  infrastructure: string
} = {
  frontend: "Next.js",
  backend: "Node.js",
  infrastructure: "AWS",
}

/** Calculates development cost savings using Next.js performance optimization */
export function calculateDevelopmentCostSavings(
  developmentCost: DevelopmentCost,
  teamMember: TeamMember,
  optimization: { bundleSizeReduction: number; ttfbImprovement: number; reRendersReduction: number }
): number {
  // Assuming 10% cost savings for every 10% reduction in bundle size
  const bundleSizeSavings = developmentCost.totalCost * (optimization.bundleSizeReduction * 0.1)
  // Assuming 5% cost savings for every 10% improvement in TTFB
  const ttfbSavings = developmentCost.totalCost * (optimization.ttfbImprovement * 0.05)
  // Assuming 3% cost savings for every 10% reduction in re-renders
  const reRendersSavings = developmentCost.totalCost * (optimization.reRendersReduction * 0.03)

  return bundleSizeSavings + ttfbSavings + reRendersSavings
}

/** Calculates mobile performance improvement using Next.js performance optimization */
export function calculateMobilePerformanceImprovement(
  mobilePerformance: { averageLatency: number; highLatencyThreshold: number },
  optimization: { mobilePerformanceImprovement: number }
): number {
  // Assuming 10% improvement in mobile performance for every 10% reduction in latency
  return mobilePerformance.averageLatency * (1 - optimization.mobilePerformanceImprovement)
}
