// src/lib/agents/cto-cost-modeling.ts

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

/** Modern tech stack evaluation criteria */
export const MODERN_TECH_STACK_CRITERIA = {
  cloudAdoptionRate: 0.85,
  aiMlInvestmentGrowth: 0.35,
  cybersecuritySpend: 0.12,
}

/** Cloud provider market share in Australia (Q2 2026) */
export const AU_CLOUD_PROVIDER_SHARE: Record<string, number> = {
  aws: 0.51,
  azure: 0.30,
  gcp: 0.12,
  others: 0.07,
}

/** Kubernetes adoption among Australian tech startups */
export const AU_KUBERNETES_ADOPTION = 0.62 // up 3% QoQ

/** Serverless (FaaS) usage in new AU startups */
export const AU_SERVERLESS_USAGE = 0.38 // increase 7% in last 30 days

/** Essential Eight compliance percentages (Australian SMEs, 2024) */
export const ESSENTIAL_EIGHT_COMPLIANCE = {
  level1: 0.62,
  level3: 0.18,
}

/** Reduction in ransomware incidents at Level 3 vs Level 1 */
export const RANSOMWARE_INCIDENT_REDUCTION = 0.70 // 70% fewer incidents

/** OWASP Top 10 vulnerability share in Australian startups */
export const OWASP_VULN_SHARE = 0.22

/** Static analysis tool adoption (Australian startups) */
export const STATIC_ANALYSIS_ADOPTION = 0.78

/** Average unit test coverage (funded startups) */
export const UNIT_TEST_COVERAGE = 0.82

/** Technical debt density (hours per 1 kLOC) */
export const TECH_DEBT_DENSITY = 4.2

/** Next.js 16 performance improvements */
export const NEXTJS_PERF_IMPROVEMENTS = {
  bundleSizeReduction: 0.42, // 42% reduction
  streamingTtfbImprovement: 0.60, // 60% faster TTFB
}

/**
 * Retrieves the market share weight for a given cloud provider.
 * @param provider Cloud provider name (aws, azure, gcp, others)
 * @returns Decimal share (e.g., 0.51 for 51%)
 */
export function getCloudProviderWeight(provider: string): number {
  const key = provider.toLowerCase()
  return AU_CLOUD_PROVIDER_SHARE[key] ?? 0
}

/**
 * Adjusts a tech item's monthly cost based on the chosen cloud provider's market share.
 * @param item Original tech item
 * @param provider Cloud provider name
 * @returns New tech item with cost scaled by provider share
 */
export function adjustTechItemCostForMarketShare(
  item: TechItem,
  provider: string
): TechItem {
  const weight = getCloudProviderWeight(provider)
  return {
    ...item,
    monthlyCost: Math.round(item.monthlyCost * weight),
    notes: `${item.notes} (adjusted for ${provider.toUpperCase()} share)`,
  }
}

/**
 * Estimates potential savings from ransomware incident reduction when moving from
 * Essential Eight Level 1 to Level 3 compliance.
 * @param devCost Development cost model for the period
 * @param level Desired compliance level (1 or 3)
 * @returns Estimated monetary savings (AUD) assuming each incident costs $150k
 */
export function calculateRansomwareSavings(
  devCost: DevelopmentCost,
  level: 1 | 3
): number {
  const baseIncidents = 1 // baseline incident count for Level 1
  const reductionFactor = level === 3 ? RANSOMWARE_INCIDENT_REDUCTION : 0
  const avoidedIncidents = baseIncidents * reductionFactor
  const incidentCost = 150_000 // average incident cost AUD
  return avoidedIncidents * incidentCost
}

/**
 * Computes the monetary impact of technical debt.
 * @param totalKLOC Total thousands of lines of code
 * @param hourlyRate Hourly developer rate (AUD)
 * @returns Technical debt cost (AUD)
 */
export function computeTechnicalDebtCost(
  totalKLOC: number,
  hourlyRate: number
): number {
  const debtHours = TECH_DEBT_DENSITY * totalKLOC
  return Math.round(debtHours * hourlyRate)
}

/**
 * Projects Next.js performance gains for a given baseline.
 * @param baseTtfb Baseline time‑to‑first‑byte (ms)
 * @param baseBundleSizeKb Baseline bundle size (KB)
 * @returns Object with improved TTFB and bundle size
 */
export function projectNextJsPerformance(
  baseTtfb: number,
  baseBundleSizeKb: number
): { improvedTtfb: number; improvedBundleSizeKb: number } {
  const improvedTtfb = Math.round(baseTtfb * (1 - NEXTJS_PERF_IMPROVEMENTS.streamingTtfbImprovement))
  const improvedBundleSizeKb = Math.round(baseBundleSizeKb * (1 - NEXTJS_PERF_IMPROVEMENTS.bundleSizeReduction))
  return { improvedTtfb, improvedBundleSizeKb }
}

/**
 * Calculates a weighted compliance score based on Essential Eight levels.
 * @param level1Pct Percentage meeting Level 1
 * @param level3Pct Percentage meeting Level 3
 * @returns Composite compliance score (0‑1)
 */
export function computeComplianceScore(
  level1Pct: number = ESSENTIAL_EIGHT_COMPLIANCE.level1,
  level3Pct: number = ESSENTIAL_EIGHT_COMPLIANCE.level3
): number {
  // Weight Level 3 higher (2×) because of stronger security posture
  const weighted = level1Pct * 1 + level3Pct * 2
  const maxPossible = 1 * 1 + 1 * 2
  return weighted / maxPossible
}

/**
 * Provides a summary of current Australian tech stack adoption metrics.
 * @returns Object aggregating key percentages
 */
export function getAustralianAdoptionSummary() {
  return {
    cloudProviderShare: AU_CLOUD_PROVIDER_SHARE,
    kubernetesAdoption: AU_KUBERNETES_ADOPTION,
    serverlessUsage: AU_SERVERLESS_USAGE,
    staticAnalysisAdoption: STATIC_ANALYSIS_ADOPTION,
    unitTestCoverage: UNIT_TEST_COVERAGE,
    technicalDebtDensity: TECH_DEBT_DENSITY,
    owaspVulnShare: OWASP_VULN_SHARE,
  }
}
