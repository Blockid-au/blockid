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
  staticAnalysisCoverage: 0.85,
} as const;

/** Next.js 16 Performance Constants for APAC/Australian Latency Optimization */
export const NEXTJS_OPTIMIZATION_METRICS = {
  bundleSizeReduction: 0.42,
  serverComponentJsReduction: 0.40,
  streamingTtfbImprovement: 0.60,
  targetMaintainabilityIndex: 80,
} as const;

/** Calculates the compliance gap between a company's current state and AU benchmarks */
export function calculateComplianceGap(current: TechHealthScore): Record<string, number> {
  return {
    essentialEightGap: AU_SECURITY_BENCHMARKS.essentialEightSmeCompliance - current.essentialEightMaturity,
    owaspGap: AU_SECURITY_BENCHMARKS.owaspTop10Adoption - current.owaspAdoptionRate,
    sastGap: AU_SECURITY_BENCHMARKS.sastAdoptionRate - current.sastCoverage,
    maintainabilityGap: AU_SECURITY_BENCHMARKS.averageMaintainabilityIndex - current.maintainabilityIndex,
  };
}

/** Evaluates the infrastructure modernity score based on recent framework adoption */
export function evaluateInfrastructureModernity(usesK8s: boolean, usesServerless: boolean, usesStreamingSSR: boolean): number {
  let score = 0;
  if (usesK8s) score += 40;
  if (usesServerless) score += 30;
  if (usesStreamingSSR) score += 30;
  return score;
}

/** Estimates the potential performance gain for AU users adopting Next.js 16 streaming SSR */
export function estimatePerformanceGain(currentTtfbMs: number): { estimatedTtfb: number; improvementPercent: number } {
  const improvement = NEXTJS_OPTIMIZATION_METRICS.streamingTtfbImprovement;
  return {
    estimatedTtfb: currentTtfbMs * (1 - improvement),
    improvementPercent: improvement * 100,
  };
}

/** Calculates overall tech health score weighted by AU market benchmarks */
export function calculateOverallTechHealth(score: TechHealthScore): number {
  const weights = {
    security: 0.4,
    maintainability: 0.3,
    modernity: 0.3,
  };

  const securityScore = (score.essentialEightMaturity + score.owaspAdoptionRate + score.sastCoverage) / 3;
  const maintainabilityScore = score.maintainabilityIndex / 100;
  const modernityScore = (score.infrastructureModernity + score.nextJsOptimizationScore) / 200;

  return (
    (securityScore * weights.security) + 
    (maintainabilityScore * weights.maintainability) + 
    (modernityScore * weights.modernity)
  ) * 100;
}

/** Generates a budget projection based on team size and infrastructure costs */
export function projectAnnualTechBudget(
  monthlyInfra: TechStackCost[], 
  devCosts: DevelopmentCost[], 
  monthlyTools: TechItem[]
): TechBudgetProjection {
  const infraMonthly = monthlyInfra.reduce((acc, curr) => acc + curr.monthlyCost, 0);
  const toolsMonthly = monthlyTools.reduce((acc, curr) => acc + curr.monthlyCost, 0);
  
  const totalDev12 = devCosts.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalInfra12 = infraMonthly * 12;
  const totalTools12 = toolsMonthly * 12;
  const totalAI12 = toolsMonthly * 0.2 * 12; // Estimated AI overhead based on tool adoption

  const months: TechBudgetMonth[] = Array.from({ length: 12 }, (_, i) => ({
    month: i + 1,
    label: `Month ${i + 1}`,
    infra: infraMonthly,
    development: totalDev12 / 12,
    aiModels: totalAI12 / 12,
    tools: toolsMonthly,
    total: infraMonthly + (totalDev12 / 12) + (totalAI12 / 12) + toolsMonthly,
  }));

  return {
    months,
    totalInfra12,
    totalDev12,
    totalAI12,
    totalTools12,
    grandTotal12: totalInfra12 + totalDev12 + totalAI12 + totalTools12,
  };
}
