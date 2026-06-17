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
  bundleSizeReduction: 0.42, 
  ttfbImprovement: 0.6, 
  reRendersReduction: 0.4, 
  mobilePerformanceImprovementAPAC: 0.6, 
  serverComponentsClientJSReduction: 0.4, 
}

/** APAC Network Latency Benchmarks (ms) */
export const APAC_NETWORK_LATENCY: {
  australia: number
  asia: number
  pacific: number
} = {
  australia: 50,
  asia: 70,
  pacific: 80,
}

/** Streaming SSR TTFB Improvement Calculator */
export function calculateStreamingSSRTTFBImprovement(
  originalTTFB: number,
  networkLatency: number
): number {
  return originalTTFB * (1 - NEXT_JS_PERFORMANCE_OPTIMIZATION.ttfbImprovement) 
}

/** Server Components Client JS Reduction Calculator */
export function calculateServerComponentsClientJSReduction(
  originalClientJS: number
): number {
  return originalClientJS * (1 - NEXT_JS_PERFORMANCE_OPTIMIZATION.serverComponentsClientJSReduction) 
}

/** Mobile Performance Improvement Calculator for APAC Networks */
export function calculateMobilePerformanceImprovementAPAC(
  originalPerformance: number,
  networkLatency: number
): number {
  return originalPerformance * (1 + NEXT_JS_PERFORMANCE_OPTIMIZATION.mobilePerformanceImprovementAPAC) 
}
