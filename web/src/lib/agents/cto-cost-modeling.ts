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
  mobilePerformanceImprovementAPAC: number
  serverComponentsClientJSReduction: number
} = {
  bundleSizeReduction: 0.42, // 42% reduction in bundle size
  ttfbImprovement: 0.6, // 60% improvement in TTFB
  reRendersReduction: 0.4, // React 19 concurrent features reduce re-renders by 40%
  mobilePerformanceImprovementAPAC: 0.6, // Streaming SSR improves mobile performance on high-latency APAC networks by 60%
  serverComponentsClientJSReduction: 0.4, // Server Components reduce client JS by 40%
}

/** Next.js tech stack items with estimated costs */
export const NEXT_JS_TECH_STACK_ITEMS: TechItem[] = [
  {
    name: 'Server',
    type: 'infra',
    monthlyCost: 500,
    unit: 'instance',
    notes: 'For server-side rendering and API routes',
  },
  {
    name: 'CDN',
    type: 'service',
    monthlyCost: 100,
    unit: 'GB',
    notes: 'For caching and content delivery',
  },
  {
    name: 'Monitoring Tool',
    type: 'tool',
    monthlyCost: 50,
    unit: 'seat',
    notes: 'For performance monitoring and error tracking',
  },
]

/**
 * Calculates the estimated monthly cost of a Next.js tech stack
 * @param teamSize - The size of the development team
 * @param infraItems - The infrastructure items required
 * @param serviceItems - The services required
 * @param toolItems - The tools required
 * @returns The estimated monthly cost
 */
export function estimateNextJSTechStackCost(
  teamSize: number,
  infraItems: TechItem[],
  serviceItems: TechItem[],
  toolItems: TechItem[],
): number {
  const devCost = teamSize * AU_DEV_RATES['full-stack'].mid * 4 // assume 4 weeks per month
  const infraCost = infraItems.reduce((acc, item) => acc + item.monthlyCost, 0)
  const serviceCost = serviceItems.reduce((acc, item) => acc + item.monthlyCost, 0)
  const toolCost = toolItems.reduce((acc, item) => acc + item.monthlyCost, 0)
  return devCost + infraCost + serviceCost + toolCost
}

/**
 * Calculates the estimated performance improvement of using Next.js 16
 * @param currentBundleSize - The current bundle size
 * @param currentTTFB - The current TTFB
 * @param currentReRenders - The current number of re-renders
 * @returns The estimated performance improvement
 */
export function estimateNextJSPerformanceImprovement(
  currentBundleSize: number,
  currentTTFB: number,
  currentReRenders: number,
): {
  bundleSizeReduction: number
  ttfbImprovement: number
  reRendersReduction: number
} {
  const bundleSizeReduction = currentBundleSize * NEXT_JS_PERFORMANCE_OPTIMIZATION.bundleSizeReduction
  const ttfbImprovement = currentTTFB * NEXT_JS_PERFORMANCE_OPTIMIZATION.ttfbImprovement
  const reRendersReduction = currentReRenders * NEXT_JS_PERFORMANCE_OPTIMIZATION.reRendersReduction
  return {
    bundleSizeReduction,
    ttfbImprovement,
    reRendersReduction,
  }
}
