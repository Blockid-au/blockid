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

/** Tech adoption data for Australian startups */
export interface TechAdoptionData {
  k8sProductionPct: number
  serverlessProductionPct: number
  frontEndFrameworkShare: Record<string, number>
  aiAssistantUsagePct: number
}

/** Australian tech adoption snapshot (2024) */
export const AU_TECH_ADOPTION: TechAdoptionData = {
  k8sProductionPct: 78,
  serverlessProductionPct: 34,
  frontEndFrameworkShare: { React: 62, Vue: 14, Angular: 11, Svelte: 9 },
  aiAssistantUsagePct: 48,
}

/** Security compliance data for Australian SMEs */
export interface SecurityComplianceData {
  essentialEightCompliancePct: number
  patchLevel3Pct: number
  owaspTop10AdoptionPct: number
}

/** Security compliance snapshot (Q2 2026) */
export const AU_SECURITY_COMPLIANCE: SecurityComplianceData = {
  essentialEightCompliancePct: 38,
  patchLevel3Pct: 71,
  owaspTop10AdoptionPct: 45,
}

/** Code quality assessment metrics */
export interface CodeQualityMetrics {
  sastAdoptionPct: number
  ciCdQualityGatePct: number
  maintainabilityIndex: number
  staticAnalysisCoveragePct: number
}

/** Code quality benchmarks for Australian startups (2026) */
export const AU_CODE_QUALITY: CodeQualityMetrics = {
  sastAdoptionPct: 72,
  ciCdQualityGatePct: 68,
  maintainabilityIndex: 68,
  staticAnalysisCoveragePct: 85,
}

/** Next.js 16 performance optimisation metrics */
export interface NextJsOptimizationMetrics {
  bundleSizeReductionPct: number
  streamingSsRTtfbImprovementPct: number
  reRenderReductionPct: number
}

/** Next.js optimisation findings (2024‑2026) */
export const NEXT_JS_OPTIMISATION: NextJsOptimizationMetrics = {
  bundleSizeReductionPct: 42,
  streamingSsRTtfbImprovementPct: 60,
  reRenderReductionPct: 0, // placeholder; derived from concurrent features
}

/**
 * Compute a weighted evaluation score for a tech stack based on
 * modern criteria and Australian adoption data.
 * @param criteria Evaluation criteria
 * @param adoption Adoption data
 * @returns Score between 0 and 100
 */
export function computeTechStackEvaluationScore(
  criteria: typeof MODERN_TECH_STACK_CRITERIA,
  adoption: TechAdoptionData
): number {
  const cloudScore = criteria.cloudAdoptionRate * adoption.k8sProductionPct
  const serverlessScore = criteria.aiMlInvestmentGrowth * adoption.serverlessProductionPct
  const aiAssistScore = criteria.aiMlInvestmentGrowth * adoption.aiAssistantUsagePct
  const frontEndScore = Object.entries(adoption.frontEndFrameworkShare).reduce(
    (acc, [_, share]) => acc + share,
    0
  )
  const rawScore = cloudScore + serverlessScore + aiAssistScore + frontEndScore
  return Math.min(100, rawScore / 4)
}

/**
 * Estimate cost savings after applying Next.js 16 optimisation.
 * @param originalCost Current monthly cost (AUD)
 * @param optimisation Optimisation metrics
 * @returns Adjusted monthly cost after reduction
 */
export function estimateNextJsCostSavings(
  originalCost: number,
  optimisation: NextJsOptimizationMetrics
): number {
  const reductionFactor = 1 - optimisation.bundleSizeReductionPct / 100
  return Math.round(originalCost * reductionFactor)
}

/**
 * Summarise security compliance status for Australian SMEs.
 * @param data Security compliance data
 * @returns Human‑readable summary
 */
export function summarizeSecurityCompliance(data: SecurityComplianceData): string {
  const parts = [
    `Essential Eight overall compliance: ${data.essentialEightCompliancePct}%`,
    `Patch Level 3 compliance: ${data.patchLevel3Pct}%`,
    `OWASP Top 10 adoption: ${data.owaspTop10AdoptionPct}%`,
  ]
  return parts.join("; ")
}

/**
 * Adjust a tech stack cost model by applying a percentage reduction.
 * @param model Original cost model
 * @param reductionPct Percentage reduction to apply (0‑100)
 * @returns New cost model with reduced monthlyCost
 */
export function applyCostReduction(
  model: TechStackCost,
  reductionPct: number
): TechStackCost {
  const factor = 1 - reductionPct / 100
  const reducedItems = model.items.map(item => ({
    ...item,
    monthlyCost: Math.round(item.monthlyCost * factor),
  }))
  const reducedMonthlyCost = Math.round(model.monthlyCost * factor)
  return { ...model, items: reducedItems, monthlyCost: reducedMonthlyCost }
}

/**
 * Calculate an overall code‑quality score for Australian startups.
 * @param metrics Code quality metrics
 * @returns Score out of 100
 */
export function calculateCodeQualityScore(metrics: CodeQualityMetrics): number {
  const weights = {
    sastAdoption: 0.25,
    ciCdQualityGate: 0.25,
    maintainability: 0.25,
    staticAnalysis: 0.25,
  }
  const maintainabilityScore = (metrics.maintainabilityIndex / 100) * 100
  const rawScore =
    metrics.sastAdoptionPct * weights.sastAdoption +
    metrics.ciCdQualityGatePct * weights.ciCdQualityGate +
    maintainabilityScore * weights.maintainability +
    metrics.staticAnalysisCoveragePct * weights.staticAnalysis
  return Math.min(100, Math.round(rawScore))
}
