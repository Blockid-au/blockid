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
  essentialEightPatchMaturityL3: 0.71,
  owaspTop10AdoptionRate: 0.45,
  sastAdoptionRate: 0.72,
  cicdQualityGateIntegration: 0.68,
  avgMaintainabilityIndex: 68,
  staticAnalysisCoverage: 0.85,
} as const;

/** Next.js 16 Performance Targets for APAC Networks */
export const NEXTJS_PERF_TARGETS = {
  bundleSizeReductionTarget: 0.42,
  clientJsReductionTarget: 0.40,
  ttfbImprovementTarget: 0.60,
  recommendStreamingSsr: true,
} as const;

/**
 * Calculates the security compliance score based on Australian benchmarks.
 * @param currentCompliance - The current compliance percentages of the platform.
 * @returns A normalized score between 0 and 100.
 */
export function calculateSecurityComplianceScore(currentCompliance: {
  essentialEight: number;
  owasp: number;
  sast: number;
}): number {
  const weights = { essentialEight: 0.5, owasp: 0.3, sast: 0.2 };
  const score = (
    (currentCompliance.essentialEight / AU_SECURITY_BENCHMARKS.essentialEightSmeCompliance) * weights.essentialEight +
    (currentCompliance.owasp / AU_SECURITY_BENCHMARKS.owaspTop10AdoptionRate) * weights.owasp +
    (currentCompliance.sast / AU_SECURITY_BENCHMARKS.sastAdoptionRate) * weights.sast
  ) * 100;
  return Math.min(Math.round(score), 100);
}

/**
 * Evaluates the maintainability of the codebase against AU startup benchmarks.
 * @param currentMaintainabilityIndex - The current maintainability score (0-100).
 * @returns Comparison ratio against the AU average.
 */
export function evaluateMaintainability(currentMaintainabilityIndex: number): number {
  return currentMaintainabilityIndex / AU_SECURITY_BENCHMARKS.avgMaintainabilityIndex;
}

/**
 * Calculates the projected performance gain from upgrading to Next.js 16 streaming SSR.
 * Specifically targets high-latency APAC network improvements.
 * @param currentTtfb - Current Time to First Byte in ms.
 * @returns Projected TTFB after optimization.
 */
export function projectTtfbImprovement(currentTtfb: number): number {
  return currentTtfb * (1 - NEXTJS_PERF_TARGETS.ttfbImprovementTarget);
}

/**
 * Validates if the current tech stack aligns with 2026 modern production standards.
 * @param stack - The current stack configuration.
 * @returns A map of alignment gaps.
 */
export function analyzeStackAlignment(stack: {
  usesK8s: boolean;
  usesServerless: boolean;
  frontendFramework: string;
  usesAiAssistant: boolean;
}) {
  return {
    k8sGap: stack.usesK8s ? 0 : 1 - TECH_ADOPTION_BENCHMARKS.infrastructure.kubernetesProduction,
    serverlessGap: stack.usesServerless ? 0 : 1 - TECH_ADOPTION_BENCHMARKS.infrastructure.serverlessProduction,
    frameworkAlignment: TECH_ADOPTION_BENCHMARKS.frontend[stack.frontendFramework as keyof typeof TECH_ADOPTION_BENCHMARKS.frontend] || 0,
    aiAdoptionGap: stack.usesAiAssistant ? 0 : 1 - TECH_ADOPTION_BENCHMARKS.developerExperience.aiAssistantUsage,
  };
}
