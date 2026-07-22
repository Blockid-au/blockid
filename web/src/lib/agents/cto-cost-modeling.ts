/** Tech stack cost model */
export interface TechStackCost {
  category: string;
  items: TechItem[];
  monthlyCost: number;
}

/** Tech item */
export interface TechItem {
  name: string;
  type: "infra" | "service" | "tool" | "ai_model";
  monthlyCost: number;
  unit: string;
  notes: string;
}

/** Development cost model */
export interface DevelopmentCost {
  phase: string;
  durationWeeks: number;
  teamSize: TeamMember[];
  weeklyBurn: number;
  totalCost: number;
  milestones: string[];
}

/** Team member */
export interface TeamMember {
  role: string;
  count: number;
  weeklyRate: number;
  isFullTime: boolean;
}

/** Tech budget projection */
export interface TechBudgetProjection {
  months: TechBudgetMonth[];
  totalInfra12: number;
  totalDev12: number;
  totalAI12: number;
  totalTools12: number;
  grandTotal12: number;
}

/** Tech budget month */
export interface TechBudgetMonth {
  month: number;
  label: string;
  infra: number;
  development: number;
  aiModels: number;
  tools: number;
  total: number;
}

/** Tech stack health and compliance score */
export interface TechHealthScore {
  securityCompliance: number;
  maintainabilityIndex: number;
  infrastructureModernity: number;
  overallScore: number;
  essentialEightMaturity: number;
  owaspAdoptionRate: number;
  sastCoverage: number;
  cicdQualityGateIntegration: boolean;
  nextJsOptimizationScore: number;
  streamingSsrEnabled: boolean;
  bundleSizeReductionPercentage: number;
}

/** Market share and adoption benchmarks based on 2024-2026 research */
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
} as const;

/** Australian Security and Quality Compliance Benchmarks (2026) */
export const AU_SECURITY_BENCHMARKS = {
  essentialEightSmeCompliance: 0.38,
  essentialEightPatchLevel3: 0.71,
  owaspTop10Adoption: 0.45,
  sastAdoptionRate: 0.72,
  cicdQualityGateIntegration: 0.68,
  averageMaintainabilityIndex: 68,
  staticAnalysisCoverage: 0.85,
} as const;

/** Next.js 16 Performance Targets */
export const NEXTJS_PERF_TARGETS = {
  bundleSizeReductionTarget: 0.42,
  serverComponentJsReduction: 0.40,
  streamingSsrTtfbImprovement: 0.60,
} as const;

/**
 * Calculates the overall health score of a tech stack based on AU 2026 benchmarks.
 * @param current Current metrics of the platform
 * @returns A normalized score between 0 and 100
 */
export function calculatePlatformHealthScore(current: Partial<TechHealthScore>): number {
  const weights = {
    security: 0.4,
    maintainability: 0.3,
    modernity: 0.3,
  };

  const securityScore = (
    (current.essentialEightMaturity || 0) * 0.4 +
    (current.owaspAdoptionRate || 0) * 0.3 +
    (current.sastCoverage || 0) * 0.3
  ) * 100;

  const maintainabilityScore = (
    ((current.maintainabilityIndex || 0) / 100) * 0.6 +
    (current.cicdQualityGateIntegration ? 0.4 : 0)
  ) * 100;

  const modernityScore = (
    (current.nextJsOptimizationScore || 0) * 0.5 +
    (current.streamingSsrEnabled ? 0.5 : 0)
  ) * 100;

  return (
    securityScore * weights.security +
    maintainabilityScore * weights.maintainability +
    modernityScore * weights.modernity
  );
}

/**
 * Evaluates the gap between current AU SME performance and 2026 benchmarks.
 * @param current Current platform metrics
 * @returns Gap analysis object
 */
export function evaluateComplianceGap(current: Partial<TechHealthScore>) {
  return {
    essentialEightGap: AU_SECURITY_BENCHMARKS.essentialEightSmeCompliance - (current.essentialEightMaturity || 0),
    patchingGap: AU_SECURITY_BENCHMARKS.essentialEightPatchLevel3 - (current.essentialEightMaturity || 0),
    owaspGap: AU_SECURITY_BENCHMARKS.owaspTop10Adoption - (current.owaspAdoptionRate || 0),
    sastGap: AU_SECURITY_BENCHMARKS.sastAdoptionRate - (current.sastCoverage || 0),
    maintainabilityGap: AU_SECURITY_BENCHMARKS.averageMaintainabilityIndex - (current.maintainabilityIndex || 0),
  };
}

/**
 * Estimates the performance gain from adopting Next.js 16 streaming SSR for APAC networks.
 * @param currentTtfb Current Time to First Byte in ms
 * @returns Estimated improved TTFB
 */
export function estimateStreamingSsrGain(currentTtfb: number): number {
  return currentTtfb * (1 - NEXTJS_PERF_TARGETS.streamingSsrTtfbImprovement);
}
