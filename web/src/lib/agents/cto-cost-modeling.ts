/**
 * CTO Domain Module: Cost Modeling & Tech Stack Evaluation
 * Enhanced with 2026 Australian Market Research Data
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
  /** Human‑readable label (e.g., "Jan 2026") */
  label: string;
  /** Infra cost for the month */
  infra: number;
  /** Development cost for the month */
  development: number;
  /** AI model costs for the month */
  aiModels: number;
  /** tooling costs for the month */
  tools: number;
  /** security costs for the month */
  security: number;
}

export interface SecurityComplianceScore {
  /** Essential Eight overall compliance percentage */
  essentialEightCompliance: number;
  /** Maturity level for Patch Applications (Target: 71% for L3) */
  patchingMaturityLevel: number;
  /** OWASP Top 10 controls integrated (out of 10) */
  owaspControlsIntegrated: number;
  /** SAST tool adoption status */
  sastEnabled: boolean;
  /** CI/CD quality gate integration status */
  qualityGatesEnabled: boolean;
}

export interface TechStackBenchmark {
  /** Frontend framework market share % */
  frontendMarketShare: {
    react: number;
    vue: number;
    angular: number;
    svelte: number;
  };
  /** Infrastructure adoption % */
  infraAdoption: {
    kubernetes: number;
    serverless: number;
  };
  /** Developer Productivity */
  aiAssistantUsageRate: number;
  /** Code Quality Indices */
  averageMaintainabilityIndex: number;
  /** Static Analysis Coverage % */
  staticAnalysisCoverage: number;
}

export const AU_MARKET_BENCHMARKS_2026: TechStackBenchmark = {
  frontendMarketShare: {
    react: 0.62,
    vue: 0.14,
    angular: 0.11,
    svelte: 0.09,
  },
  infraAdoption: {
    kubernetes: 0.78,
    serverless: 0.34,
  },
  aiAssistantUsageRate: 0.48,
  averageMaintainabilityIndex: 68,
  staticAnalysisCoverage: 0.85,
};

export const AU_SECURITY_BENCHMARKS_2026 = {
  essentialEightSmeCompliance: 0.38,
  patchingLevel3Compliance: 0.71,
  owaspTop10AdoptionRate: 0.45,
  sastAdoptionRate: 0.72,
  cicdQualityGateRate: 0.68,
};

/**
 * Calculates the projected performance improvement based on Next.js 16 migration research.
 * Specifically targets high-latency APAC networks.
 * @param currentTtfb Current Time to First Byte in ms
 * @returns Projected TTFB after Streaming SSR implementation
 */
export function calculateProjectedTtfbImprovement(currentTtfb: number): number {
  const improvementFactor = 0.60;
  return currentTtfb * (1 - improvementFactor);
}

/**
 * Evaluates the security posture of an AU startup against the 2026 benchmarks.
 * @param current Current security scores
 * @returns Analysis of compliance gaps
 */
export function evaluateSecurityPosture(current: SecurityComplianceScore) {
  return {
    essentialEightGap: AU_SECURITY_BENCHMARKS_2026.essentialEightSmeCompliance - current.essentialEightCompliance,
    patchingGap: AU_SECURITY_BENCHMARKS_2026.patchingLevel3Compliance - (current.patchingMaturityLevel >= 3 ? 1 : 0),
    owaspGap: (AU_SECURITY_BENCHMARKS_2026.owaspTop10AdoptionRate * 10) - current.owaspControlsIntegrated,
    sastStatus: current.sastEnabled ? 'Aligned' : 'Below Market Average',
    qualityGateStatus: current.qualityGatesEnabled ? 'Aligned' : 'Below Market Average',
  };
}

/**
 * Estimates the reduction in client-side JavaScript bundle size when migrating 
 * to Next.js 16 Server Components.
 * @param currentBundleSize Size in KB
 * @returns Projected size in KB
 */
export function estimateBundleReduction(currentBundleSize: number): number {
  const reductionRate = 0.42;
  return currentBundleSize * (1 - reductionRate);
}

/**
 * Calculates the total project cost across all phases.
 * @param phases Array of development phases
 * @returns Total cost in AUD
 */
export function calculateTotalDevCost(phases: DevelopmentCost[]): number {
  return phases.reduce((acc, phase) => acc + phase.totalCost, 0);
}

/**
 * Generates a 12-month budget projection based on initial monthly costs and growth multipliers.
 * @param initialCosts Initial monthly spend per category
 * @param growthMultiplier Monthly growth factor (e.g., 1.05 for 5% growth)
 * @returns TechBudgetProjection
 */
export function generateBudgetProjection(
  initialCosts: Record<string, number>,
  growthMultiplier: number = 1.0
): TechBudgetProjection {
  const months: TechBudgetMonth[] = [];
  let totals = { infra: 0, dev: 0, ai: 0, tools: 0, security: 0 };

  for (let i = 1; i <= 12; i++) {
    const multiplier = Math.pow(growthMultiplier, i - 1);
    const monthData: TechBudgetMonth = {
      month: i,
      label: `Month ${i}`,
      infra: (initialCosts.infra || 0) * multiplier,
      development: (initialCosts.development || 0) * multiplier,
      aiModels: (initialCosts.aiModels || 0) * multiplier,
      tools: (initialCosts.tools || 0) * multiplier,
      security: (initialCosts.security || 0) * multiplier,
    };
    months.push(monthData);
    totals.infra += monthData.infra;
    totals.dev += monthData.development;
    totals.ai += monthData.aiModels;
    totals.tools += monthData.tools;
    totals.security += monthData.security;
  }

  return {
    months,
    totalInfra12: totals.infra,
    totalDev12: totals.dev,
    totalAI12: totals.ai,
    totalTools12: totals.tools,
    totalSecurity12: totals.security,
    grandTotal12: totals.infra + totals.dev + totals.ai + totals.tools + totals.security,
  };
}
