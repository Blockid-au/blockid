/** Tech stack cost model */
export interface TechStackCost {
  /** Category name (e.g., "infra", "service") */
  category: string
  /** Items belonging to the category */
  items: TechItem[]
  /** Aggregated monthly cost for the category */
  monthlyCost: number
}

/** Tech item */
export interface TechItem {
  /** Human‑readable name */
  name: string
  /** Classification of the item */
  type: 'infra' | 'service' | 'tool' | 'ai_model'
  /** Recurring cost per month */
  monthlyCost: number
  /** Unit of measurement (e.g., "instance", "license") */
  unit: string
  /** Additional notes */
  notes: string
}

/** Development cost model */
export interface DevelopmentCost {
  /** Phase identifier (e.g., "MVP", "Scale") */
  phase: string
  /** Duration in weeks */
  durationWeeks: number
  /** Team composition */
  teamSize: TeamMember[]
  /** Weekly burn rate (USD) */
  weeklyBurn: number
  /** Total cost for the phase */
  totalCost: number
  /** Milestones for the phase */
  milestones: string[]
}

/** Team member */
export interface TeamMember {
  /** Role name (e.g., "Frontend Engineer") */
  role: string
  /** Number of people in this role */
  count: number
  /** Weekly rate per person (USD) */
  weeklyRate: number
  /** Full‑time flag */
  isFullTime: boolean
}

/** Tech budget projection */
export interface TechBudgetProjection {
  /** Monthly breakdown */
  months: TechBudgetMonth[]
  /** 12‑month infra total */
  totalInfra12: number
  /** 12‑month development total */
  totalDev12: number
  /** 12‑month AI models total */
  totalAI12: number
  /** 12‑month tools total */
  totalTools12: number
  /** Grand total for 12 months */
  grandTotal12: number
}

/** Tech budget month */
export interface TechBudgetMonth {
  /** Month index (1‑based) */
  month: number
  /** Human‑readable label (e.g., "Jan 2025") */
  label: string
  /** Infra cost for the month */
  infra: number
  /** Development cost for the month */
  development: number
  /** AI models cost for the month */
  aiModels: number
  /** Tools cost for the month */
  tools: number
  /** Sum of all categories for the month */
  total: number
}

/** Tech stack health and compliance score */
export interface TechHealthScore {
  /** Overall security compliance (0‑1) */
  securityCompliance: number
  /** Maintainability index (0‑100) */
  maintainabilityIndex: number
  /** Modernity of infrastructure (0‑1) */
  infrastructureModernity: number
  /** Aggregated overall score (0‑1) */
  overallScore: number
  /** Essential Eight maturity (0‑1) */
  essentialEightMaturity: number
  /** OWASP Top 10 adoption rate (0‑1) */
  owaspAdoptionRate: number
  /** SAST coverage (0‑1) */
  sastCoverage: number
  /** CI/CD quality‑gate integration flag */
  cicdQualityGateIntegration: boolean
  /** Next.js optimization score (0‑1) */
  nextJsOptimizationScore: number
  /** Streaming SSR enabled flag */
  streamingSsrEnabled: boolean
  /** Bundle size reduction percentage (0‑1) */
  bundleSizeReductionPercentage: number
}

/** Market share and adoption benchmarks based on 2024‑2026 research */
export const TECH_ADOPTION_BENCHMARKS = {
  infrastructure: {
    kubernetesProduction: 0.78,
    serverlessProduction: 0.34,
  },
  frontend: {
    react: 0.62,
    vue: 0.14,
    angular: 0.11,
    svelte: 0.09,
  },
  developerExperience: {
    aiAssistantUsage: 0.48,
  },
} as const

/** Australian Security and Quality Compliance Benchmarks (2026) */
export const AU_SECURITY_BENCHMARKS = {
  essentialEightSmeCompliance: 0.38,
  essentialEightPatchLevel3: 0.71,
  owaspTop10AdoptionRate: 0.45,
  sastAdoptionRate: 0.72,
  cicdQualityGateIntegrationRate: 0.68,
  maintainabilityIndexAverage: 68,
  staticAnalysisCoverage: 0.85,
} as const

/** Next.js 16 performance optimization benchmarks */
export const NEXTJS_OPTIMIZATION_BENCHMARKS = {
  bundleSizeReduction: 0.42,
  streamingSsrTtfbImprovement: 0.60,
  concurrentFeaturesReRenderReduction: 0.10,
} as const

/** Calculate infrastructure modernity score (0‑1) */
export function calculateInfrastructureModernity(): number {
  const { kubernetesProduction, serverlessProduction } = TECH_ADOPTION_BENCHMARKS.infrastructure
  return (kubernetesProduction + serverlessProduction) / 2
}

/** Calculate security compliance score (0‑1) */
export function calculateSecurityCompliance(): number {
  const {
    essentialEightSmeCompliance,
    essentialEightPatchLevel3,
    owaspTop10AdoptionRate,
  } = AU_SECURITY_BENCHMARKS
  return (essentialEightSmeCompliance + essentialEightPatchLevel3 + owaspTop10AdoptionRate) / 3
}

/** Calculate maintainability index (0‑100) */
export function calculateMaintainabilityIndex(): number {
  const {
    maintainabilityIndexAverage,
    staticAnalysisCoverage,
    sastAdoptionRate,
  } = AU_SECURITY_BENCHMARKS
  const coverageFactor = (staticAnalysisCoverage + sastAdoptionRate) / 2
  return maintainabilityIndexAverage * coverageFactor
}

/** Calculate Next.js optimization score (0‑1) */
export function calculateNextJsOptimizationScore(
  streamingSsrEnabled: boolean,
): number {
  const {
    bundleSizeReduction,
    streamingSsrTtfbImprovement,
    concurrentFeaturesReRenderReduction,
  } = NEXTJS_OPTIMIZATION_BENCHMARKS
  const ssrFactor = streamingSsrEnabled ? streamingSsrTtfbImprovement : 0
  return (bundleSizeReduction + ssrFactor + concurrentFeaturesReRenderReduction) / 3
}

/** Assemble a full TechHealthScore based on current benchmarks */
export function computeTechHealthScore(
  streamingSsrEnabled: boolean,
  cicdQualityGateIntegration: boolean,
): TechHealthScore {
  const infrastructureModernity = calculateInfrastructureModernity()
  const securityCompliance = calculateSecurityCompliance()
  const maintainabilityIndex = calculateMaintainabilityIndex()
  const nextJsOptimizationScore = calculateNextJsOptimizationScore(streamingSsrEnabled)
  const overallScore = (
    infrastructureModernity +
    securityCompliance +
    maintainabilityIndex / 100 +
    nextJsOptimizationScore
  ) / 4
  return {
    securityCompliance,
    maintainabilityIndex,
    infrastructureModernity,
    overallScore,
    essentialEightMaturity: AU_SECURITY_BENCHMARKS.essentialEightPatchLevel3,
    owaspAdoptionRate: AU_SECURITY_BENCHMARKS.owaspTop10AdoptionRate,
    sastCoverage: AU_SECURITY_BENCHMARKS.sastAdoptionRate,
    cicdQualityGateIntegration,
    nextJsOptimizationScore,
    streamingSsrEnabled,
    bundleSizeReductionPercentage: NEXTJS_OPTIMIZATION_BENCHMARKS.bundleSizeReduction,
  }
}

/** Adjust a TechStackCost projection by applying adoption weightings */
export function applyAdoptionWeightings(cost: TechStackCost): TechStackCost {
  const weightingMap: Record<string, number> = {
    infra: calculateInfrastructureModernity(),
    service: TECH_ADOPTION_BENCHMARKS.developerExperience.aiAssistantUsage,
    tool: AU_SECURITY_BENCHMARKS.cicdQualityGateIntegrationRate,
    ai_model: 0.5,
  }
  const factor = weightingMap[cost.category] ?? 1
  const adjustedItems = cost.items.map(item => ({
    ...item,
    monthlyCost: Math.round(item.monthlyCost * factor * 100) / 100,
  }))
  const monthlyCost = adjustedItems.reduce((sum, i) => sum + i.monthlyCost, 0)
  return { ...cost, items: adjustedItems, monthlyCost }
}

/** Project a 12‑month budget using adjusted TechStackCost objects */
export function project12MonthBudget(
  costs: TechStackCost[],
): TechBudgetProjection {
  const months: TechBudgetMonth[] = []
  for (let m = 1; m <= 12; m++) {
    const monthLabel = new Date(2025, m - 1).toLocaleString('en-AU', {
      month: 'short',
      year: 'numeric',
    })
    const infra = costs
      .filter(c => c.category === 'infra')
      .reduce((sum, c) => sum + c.monthlyCost, 0)
    const development = costs
      .filter(c => c.category === 'service')
      .reduce((sum, c) => sum + c.monthlyCost, 0)
    const aiModels = costs
      .filter(c => c.category === 'ai_model')
      .reduce((sum, c) => sum + c.monthlyCost, 0)
    const tools = costs
      .filter(c => c.category === 'tool')
      .reduce((sum, c) => sum + c.monthlyCost, 0)
    const total = infra + development + aiModels + tools
    months.push({
      month: m,
      label: monthLabel,
      infra,
      development,
      aiModels,
      tools,
      total,
    })
  }
  const totalInfra12 = months.reduce((s, m) => s + m.infra, 0)
  const totalDev12 = months.reduce((s, m) => s + m.development, 0)
  const totalAI12 = months.reduce((s, m) => s + m.aiModels, 0)
  const totalTools12 = months.reduce((s, m) => s + m.tools, 0)
  const grandTotal12 = months.reduce((s, m) => s + m.total, 0)
  return {
    months,
    totalInfra12,
    totalDev12,
    totalAI12,
    totalTools12,
    grandTotal12,
  }
}
