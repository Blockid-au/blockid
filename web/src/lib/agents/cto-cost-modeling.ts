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

/** Australian Security Compliance Benchmarks (2026) */
export const AU_SECURITY_BENCHMARKS = {
  essentialEightSmeCompliance: 0.38,
  essentialEightPatchLevel3: 0.71,
  owaspTop10Adoption: 0.45,
  sastAdoptionRate: 0.72,
  cicdQualityGateIntegration: 0.68,
  averageMaintainabilityIndex: 68,
  staticAnalysisCoverageSaaS: 0.85,
} as const;

/** Next.js 16 & React 19 Performance Targets */
export const NEXTJS_PERFORMANCE_TARGETS = {
  bundleSizeReductionTarget: 0.42,
  clientJsReductionTarget: 0.40,
  ttfbImprovementTarget: 0.60,
  recommendedStrategy: "Streaming SSR for APAC high-latency networks",
} as const;

/**
 * Calculates the security compliance gap for an Australian SME
 * @param currentCompliance - The current compliance percentage (0-1)
 * @param metric - The specific benchmark key from AU_SECURITY_BENCHMARKS
 */
export function calculateSecurityGap(
  currentCompliance: number,
  metric: keyof typeof AU_SECURITY_BENCHMARKS
): number {
  const benchmark = AU_SECURITY_BENCHMARKS[metric];
  return Math.max(0, benchmark - currentCompliance);
}

/**
 * Evaluates the maintainability of a codebase against AU startup benchmarks
 * @param currentIndex - The measured maintainability index (0-100)
 */
export function evaluateMaintainability(currentIndex: number): "Below Average" | "Average" | "Above Average" {
  const benchmark = AU_SECURITY_BENCHMARKS.averageMaintainabilityIndex;
  if (currentIndex < benchmark * 0.8) return "Below Average";
  if (currentIndex > benchmark * 1.2) return "Above Average";
  return "Average";
}

/**
 * Projects performance gains based on Next.js 16 migration research
 * @param currentBundleSize - Current bundle size in KB
 * @param currentTTFB - Current Time to First Byte in ms
 */
export function projectNextJsOptimization(currentBundleSize: number, currentTTFB: number) {
  return {
    projectedBundleSize: currentBundleSize * (1 - NEXTJS_PERFORMANCE_TARGETS.bundleSizeReductionTarget),
    projectedTTFB: currentTTFB * (1 - NEXTJS_PERFORMANCE_TARGETS.ttfbImprovementTarget),
    clientJsReduction: currentBundleSize * NEXTJS_PERFORMANCE_TARGETS.clientJsReductionTarget,
  };
}

/**
 * Computes an overall Tech Health Score based on weighted research metrics
 * @param metrics - The current health metrics of the platform
 */
export function calculateOverallHealthScore(metrics: Partial<TechHealthScore>): number {
  const weights = {
    securityCompliance: 0.4,
    maintainabilityIndex: 0.3,
    infrastructureModernity: 0.2,
    nextJsOptimizationScore: 0.1,
  };

  let totalScore = 0;
  let weightSum = 0;

  for (const [key, weight] of Object.entries(weights)) {
    const value = metrics[key as keyof TechHealthScore];
    if (typeof value === "number") {
      totalScore += value * weight;
      weightSum += weight;
    }
  }

  return weightSum === 0 ? 0 : totalScore / weightSum;
}

/**
 * Validates if the tech stack aligns with modern production trends (2026)
 * @param stack - The current technology stack configuration
 */
export function validateStackModernity(stack: {
  usesK8s: boolean;
  usesServerless: boolean;
  frontendFramework: string;
  usesAICompanion: boolean;
}) {
  const scores: Record<string, number> = {
    infra: stack.usesK8s ? 1 : 0,
    serverless: stack.usesServerless ? 1 : 0,
    frontend: stack.frontendFramework === "React" ? 1 : 0.5,
    dx: stack.usesAICompanion ? 1 : 0,
  };

  const averageModernity = Object.values(scores).reduce((a, b) => a + b, 0) / 4;
  return {
    modernityScore: averageModernity,
    isCompetitive: averageModernity >= 0.75,
  };
}
