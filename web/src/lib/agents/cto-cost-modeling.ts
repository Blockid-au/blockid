// src/lib/agents/cto-cost-modeling.ts

/**
 * Tech stack cost model interfaces and data
 */

/** Tech stack cost model */
export interface TechStackCost {
  category: string
  items: TechItem[]
  monthlyCost: number
}

/** Tech item */
export interface TechItem {
  name: string
  type: "infra" | "service" | "tool" | "ai_model"
  monthlyCost: number
  unit: string
  notes: string
}

/** Development cost model */
export interface DevelopmentCost {
  phase: string
  durationWeeks: number
  teamSize: TeamMember[]
  weeklyBurn: number
  totalCost: number
  milestones: string[]
}

/** Team member */
export interface TeamMember {
  role: string
  count: number
  weeklyRate: number
  isFullTime: boolean
}

/** Tech budget projection */
export interface TechBudgetProjection {
  months: TechBudgetMonth[]
  totalInfra12: number
  totalDev12: number
  totalAI12: number
  totalTools12: number
  grandTotal12: number
}

/** Tech budget month */
export interface TechBudgetMonth {
  month: number
  label: string
  infra: number
  development: number
  aiModels: number
  tools: number
  total: number
}

/**
 * Australian developer daily rate benchmarks (AUD)
 */
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

/**
 * Modern tech stack evaluation criteria
 */
export const MODERN_TECH_STACK_CRITERIA = {
  cloudAdoptionRate: 0.85,
  aiMlInvestmentGrowth: 0.35,
  cybersecuritySpending: 4.8e9, // AUD 4.8B
  lowCodeNoCodeAdoptionRate: 0.4,
  userExperienceFocus: 0.8,
}

/**
 * Security benchmarks
 */
export const SECURITY_BENCHMARKS = {
  essentialEightAdoptionRate: 0.5, // placeholder, actual value not provided
  owaspTop10: true, // widely recognized and relevant security standard
}

/**
 * Code quality assessment frameworks
 */
export const CODE_QUALITY_ASSESSMENT_FRAMEWORKS = {
  sonarQubeAdoptionRate: 0.72,
  codeQlAdoptionRate: 0.4,
  averageCodeCoveragePercentage: 0.85,
  securityVulnerabilityDensity: 0.45, // per 1,000 lines of code
}

/**
 * Next.js 16 performance optimization
 */
export const NEXT_JS_PERFORMANCE_OPTIMIZATION = {
  bundleSizeReduction: 0.42,
  serverComponentsReduction: 0.4, // 40% reduction in client JS
  streamingSsrImprovement: 0.6, // 60% improvement in TTFB
}

/**
 * Calculates the total cost of a development team
 * @param teamSize - TeamMember[]
 * @param durationWeeks - number of weeks
 * @returns total cost
 */
export function calculateDevelopmentCost(teamSize: TeamMember[], durationWeeks: number): number {
  const totalCost = teamSize.reduce((acc, member) => acc + member.weeklyRate * member.count, 0) * durationWeeks
  return totalCost
}

/**
 * Calculates the tech budget projection for 12 months
 * @param techStackCost - TechStackCost
 * @param developmentCost - DevelopmentCost
 * @returns TechBudgetProjection
 */
export function calculateTechBudgetProjection(techStackCost: TechStackCost, developmentCost: DevelopmentCost): TechBudgetProjection {
  const months = Array(12).fill(0).map((_, index) => ({
    month: index + 1,
    label: `Month ${index + 1}`,
    infra: techStackCost.monthlyCost,
    development: developmentCost.totalCost / 12,
    aiModels: 0, // placeholder
    tools: 0, // placeholder
    total: techStackCost.monthlyCost + developmentCost.totalCost / 12,
  }))

  const totalInfra12 = techStackCost.monthlyCost * 12
  const totalDev12 = developmentCost.totalCost
  const totalAI12 = 0 // placeholder
  const totalTools12 = 0 // placeholder
  const grandTotal12 = totalInfra12 + totalDev12 + totalAI12 + totalTools12

  return {
    months,
    totalInfra12,
    totalDev12,
    totalAI12,
    totalTools12,
    grandTotal12,
  }
}
