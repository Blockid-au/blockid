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
} = {
  bundleSizeReduction: 0.42, // 42% reduction in bundle size
  ttfbImprovement: 0.6, // 60% improvement in TTFB
  reRendersReduction: 0.4, // 40% reduction in re-renders
}

/** Infrastructure cost templates with Next.js optimization */
const INFRA_TEMPLATES: Record<string, TechStackCost[]> = {
  mvp: [
    {
      category: "Compute",
      items: [
        {
          name: "Vercel Edge Function",
          type: "infra",
          monthlyCost: 10,
          unit: "function",
          notes: "Baseline compute for MVP with Next.js optimization",
        },
      ],
      monthlyCost: 10,
    },
    {
      category: "CDN",
      items: [
        {
          name: "Vercel CDN",
          type: "service",
          monthlyCost: 20,
          unit: "GB",
          notes: "CDN for static assets with Next.js optimization",
        },
      ],
      monthlyCost: 20,
    },
  ],
  production: [
    {
      category: "Compute",
      items: [
        {
          name: "AWS EC2 c6g.medium",
          type: "infra",
          monthlyCost: 50,
          unit: "instance",
          notes: "Production compute with Next.js optimization",
        },
      ],
      monthlyCost: 50,
    },
    {
      category: "CDN",
      items: [
        {
          name: "Cloudflare CDN",
          type: "service",
          monthlyCost: 50,
          unit: "GB",
          notes: "CDN for static assets with Next.js optimization",
        },
      ],
      monthlyCost: 50,
    },
  ],
}

/** Australian mobile performance benchmarks (APAC) */
export const AU_MOBILE_PERFORMANCE_BENCHMARKS: {
  latency: number
  ttfb: number
} = {
  latency: 200, // 200ms latency in APAC
  ttfb: 500, // 500ms TTFB benchmark for mobile
}

/**
 * Calculates the total cost of infrastructure with Next.js optimization
 * @param infraTemplates - Infrastructure cost templates
 * @returns Total cost of infrastructure
 */
export function calculateTotalInfraCost(infraTemplates: Record<string, TechStackCost[]>): number {
  let totalCost = 0
  Object.values(infraTemplates).forEach((template) => {
    template.forEach((stack) => {
      totalCost += stack.monthlyCost
    })
  })
  return totalCost
}

/**
 * Calculates the performance improvement with Next.js optimization
 * @param currentPerformance - Current performance metrics
 * @returns Performance improvement metrics
 */
export function calculatePerformanceImprovement(currentPerformance: { ttfb: number; reRenders: number }): {
  ttfbImprovement: number
  reRendersReduction: number
} {
  const ttfbImprovement = currentPerformance.ttfb * NEXT_JS_PERFORMANCE_OPTIMIZATION.ttfbImprovement
  const reRendersReduction = currentPerformance.reRenders * NEXT_JS_PERFORMANCE_OPTIMIZATION.reRendersReduction
  return { ttfbImprovement, reRendersReduction }
}
