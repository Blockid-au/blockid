/**
 * CTO Domain Module: Cost Modeling & Tech Stack Evaluation
 * Enhanced with 2026 Australian Market Research Data
 * Focus: Infrastructure trends, Essential Eight compliance, and Next.js 16 optimizations
 */

export interface TechStackCost {
  /** Category name (e.g., "infra", "service") */
  category: string;
  /** Items belonging to the category */
  items: TechItem[];
  /** Aggregated monthly cost for the category */
  monthlyCost: number;
}

export interface TechItem {
  /** Human‑readable name */
  name: string;
  /** Classification of the item */
  type: 'infra' | 'service' | 'tool' | 'ai_model' | 'security';
  /** Recurring cost per month */
  monthlyCost: number;
  /** Unit of measurement (e.g., "instance", "license") */
  unit: string;
  /** Additional notes */
  notes: string;
}

export interface DevelopmentCost {
  /** Phase identifier (e.g., "MVP", "Scale") */
  phase: string;
  /** Duration in weeks */
  durationWeeks: number;
  /** Team composition */
  teamSize: TeamMember[];
  /** Weekly burn rate (AUD) */
  weeklyBurn: number;
  /** Total cost for the phase */
  totalCost: number;
  /** Milestones for the phase */
  milestones: string[];
}

export interface TeamMember {
  /** Role name (e.g., "Frontend Engineer") */
  role: string;
  /** Number of people in this role */
  count: number;
  /** Weekly rate per person (AUD) */
  weeklyRate: number;
  /** Full‑time flag */
  isFullTime: boolean;
}

export interface TechBudgetProjection {
  /** Monthly breakdown */
  months: TechBudgetMonth[];
  /** 12‑month infra total */
  totalInfra12: number;
  /** 12‑month development total */
  totalDev12: number;
  /** 12‑month AI models total */
  totalAI12: number;
  /** 12‑month tools total */
  totalTools12: number;
  /** 12‑month security total */
  totalSecurity12: number;
  /** Grand total for 12 months */
  grandTotal12: number;
}

export interface TechBudgetMonth {
  /** Month index (1‑based) */
  month: number;
  /** Monthly cost breakdown */
  costs: TechStackCost[];
  /** Total monthly spend */
  monthlyTotal: number;
}

/**
 * 2026 Australian Market Benchmarks for CTOs
 */
export const AU_TECH_BENCHMARKS_2026 = {
  infrastructure: {
    kubernetesAdoptionRate: 0.78,
    serverlessWorkloadRate: 0.34,
    frontendMarketShare: {
      react: 0.62,
      vue: 0.14,
      angular: 0.11,
      svelte: 0.09,
    },
    aiAssistantUsageRate: 0.48,
  },
  security: {
    essentialEightSmeCompliance: 0.38,
    essentialEightPatchMaturityL3: 0.71,
    owaspTop10AdoptionRate: 0.45,
  },
  quality: {
    sastAdoptionRate: 0.72,
    cicdQualityGateIntegration: 0.68,
    avgMaintainabilityIndex: 68,
    staticAnalysisCoverage: 0.85,
  },
  performance: {
    nextJs16BundleReduction: 0.42,
    nextJs16ClientJsReduction: 0.40,
    nextJs16TtfbImprovement: 0.60,
  },
} as const;

/**
 * Calculates the estimated reduction in client-side JS bundle size when migrating to Next.js 16
 * based on 2026 research findings.
 * @param currentBundleSize Size in KB
 * @returns Estimated new bundle size in KB
 */
export function calculateNextJs16BundleOptimization(currentBundleSize: number): number {
  return currentBundleSize * (1 - AU_TECH_BENCHMARKS_2026.performance.nextJs16BundleReduction);
}

/**
 * Evaluates a startup's security posture against the 2026 Australian SME average.
 * @param complianceScore Current compliance percentage (0-1)
 * @param controlsIntegrated Number of OWASP controls integrated (0-10)
 * @returns Analysis of posture relative to market
 */
export function evaluateSecurityPosture(complianceScore: number, controlsIntegrated: number): {
  isAboveAverage: boolean;
  gapToMarket: number;
  recommendation: string;
} {
  const avgCompliance = AU_TECH_BENCHMARKS_2026.security.essentialEightSmeCompliance;
  const isAboveAverage = complianceScore > avgCompliance;
  const gapToMarket = complianceScore - avgCompliance;
  
  let recommendation = 'Maintain current security trajectory.';
  if (controlsIntegrated < 7) {
    recommendation = 'Increase OWASP Top 10 integration to meet the 45% AU startup benchmark (7+ controls).';
  } else if (complianceScore < avgCompliance) {
    recommendation = 'Prioritize Essential Eight maturity to exceed the 38% SME compliance average.';
  }

  return { isAboveAverage, gapToMarket, recommendation };
}

/**
 * Estimates the impact of AI assistant adoption on developer velocity and cost.
 * @param teamSize Total number of developers
 * @param currentWeeklyBurn Total weekly burn for developers
 * @returns Projected cost efficiency gain based on 48% adoption trend
 */
export function estimateAiVelocityGain(teamSize: number, currentWeeklyBurn: number): {
  projectedEfficiencyGain: number;
  costPerDeveloperAdjusted: number;
} {
  const adoptionRate = AU_TECH_BENCHMARKS_2026.infrastructure.aiAssistantUsageRate;
  const efficiencyMultiplier = 0.15; // Estimated 15% boost for AI-assisted devs
  const projectedEfficiencyGain = currentWeeklyBurn * adoptionRate * efficiencyMultiplier;
  
  return {
    projectedEfficiencyGain,
    costPerDeveloperAdjusted: (currentWeeklyBurn - projectedEfficiencyGain) / teamSize,
  };
}

/**
 * Validates if the tech stack meets the 2026 Australian SaaS Quality Benchmarks.
 * @param maintainabilityIndex Current index (0-100)
 * @param analysisCoverage Static analysis coverage (0-1)
 * @returns Boolean indicating if the stack is competitive in the AU market
 */
export function validateQualityBenchmarks(maintainabilityIndex: number, analysisCoverage: number): boolean {
  return (
    maintainabilityIndex >= AU_TECH_BENCHMARKS_2026.quality.avgMaintainabilityIndex &&
    analysisCoverage >= AU_TECH_BENCHMARKS_2026.quality.staticAnalysisCoverage
  );
}

/**
 * Projects the total 12-month cost across all categories.
 * @param budget Monthly breakdown
 * @returns Grand total for the year
 */
export function calculateAnnualProjection(budget: TechBudgetMonth[]): number {
  return budget.reduce((acc, month) => acc + month.monthlyTotal, 0);
}
