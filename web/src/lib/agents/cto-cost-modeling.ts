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
  /** Total cost for the month */
  monthlyTotal: number;
}

/**
 * 2026 AU Market Benchmarks based on ACSC, DORA, and Stack Overflow data
 */
export const AU_TECH_BENCHMARKS_2026 = {
  infrastructure: {
    k8sProductionAdoption: 0.78,
    serverlessProductionAdoption: 0.34,
    frontendMarketShare: {
      react: 0.62,
      vue: 0.14,
      angular: 0.11,
      svelte: 0.09
    }
  },
  security: {
    essentialEightSmeCompliance: 0.38,
    patchManagementLevel3Compliance: 0.71,
    owaspTop10AdoptionRate: 0.45
  },
  codeQuality: {
    sastAdoptionRate: 0.72,
    cicdQualityGateIntegration: 0.68,
    avgMaintainabilityIndex: 68,
    staticAnalysisCoverage: 0.85
  },
  performance: {
    nextJsBundleReduction: 0.42,
    serverComponentsJsReduction: 0.40,
    streamingSsrTtfbImprovement: 0.60
  }
};

export interface SecurityComplianceScore {
  /** Percentage of Essential Eight controls implemented */
  essentialEightScore: number;
  /** Percentage of OWASP Top 10 controls implemented */
  owaspScore: number;
  /** Overall security posture rating (0-100) */
  overallRating: number;
  /** Gap analysis against AU SME average */
  gapToMarketAverage: number;
}

export interface PerformanceMetric {
  /** Time to First Byte in milliseconds */
  ttfb: number;
  /** Total bundle size in KB */
  bundleSizeKb: number;
  /** Percentage of JS reduced via Server Components */
  serverComponentOptimization: number;
  /** Latency profile for APAC region */
  apacLatencyMs: number;
}

/**
 * Calculates the security compliance gap for an AU-based startup
 * @param implementedControls Number of Essential Eight controls implemented
 * @param totalControls Total number of controls (usually 8)
 * @returns SecurityComplianceScore
 */
export function calculateSecurityCompliance(implementedControls: number, totalControls: number = 8): SecurityComplianceScore {
  const score = implementedControls / totalControls;
  const marketAvg = AU_TECH_BENCHMARKS_2026.security.essentialEightSmeCompliance;
  
  return {
    essentialEightScore: score,
    owaspScore: 0, 
    overallRating: score * 100,
    gapToMarketAverage: score - marketAvg
  };
}

/**
 * Projects performance gains based on Next.js 16 benchmarks for APAC networks
 * @param currentTtfb Current Time to First Byte
 * @param currentBundleSize Current JS bundle size in KB
 * @returns PerformanceMetric
 */
export function projectNextJs16Gains(currentTtfb: number, currentBundleSize: number): PerformanceMetric {
  return {
    ttfb: currentTtfb * (1 - AU_TECH_BENCHMARKS_2026.performance.streamingSsrTtfbImprovement),
    bundleSizeKb: currentBundleSize * (1 - AU_TECH_BENCHMARKS_2026.performance.nextJsBundleReduction),
    serverComponentOptimization: AU_TECH_BENCHMARKS_2026.performance.serverComponentsJsReduction,
    apacLatencyMs: 150 // Estimated baseline for APAC high-latency networks
  };
}

/**
 * Evaluates if a tech stack is aligned with 2026 AU startup trends
 * @param stack Current tech stack configuration
 * @returns Record of alignment percentages
 */
export function evaluateStackAlignment(stack: { frontend: string; infra: string; securitySast: boolean }): Record<string, number> {
  const alignment: Record<string, number> = {};
  
  const frontendWeight = AU_TECH_BENCHMARKS_2026.infrastructure.frontendMarketShare[stack.frontend as keyof typeof AU_TECH_BENCHMARKS_2026.infrastructure.frontendMarketShare] || 0;
  alignment.frontendMarketAlignment = frontendWeight * 100;
  
  alignment.infraAlignment = stack.infra === 'kubernetes' ? AU_TECH_BENCHMARKS_2026.infrastructure.k8sProductionAdoption * 100 : 0;
  alignment.securityAlignment = stack.securitySast ? AU_TECH_BENCHMARKS_2026.codeQuality.sastAdoptionRate * 100 : 0;
  
  return alignment;
}

/**
 * Calculates total 12-month budget including growth multipliers
 * @param monthlyCosts Initial monthly costs
 * @param growthRate Monthly growth multiplier (e.g., 1.05 for 5% growth)
 * @returns TechBudgetProjection
 */
export function projectAnnualBudget(monthlyCosts: TechStackCost[], growthRate: number = 1.0): TechBudgetProjection {
  const months: TechBudgetMonth[] = [];
  let totals = { infra: 0, dev: 0, ai: 0, tools: 0, security: 0 };

  for (let i = 1; i <= 12; i++) {
    const multiplier = Math.pow(growthRate, i - 1);
    let monthlyTotal = 0;

    const currentMonthCosts = monthlyCosts.map(cat => {
      const cost = cat.monthlyCost * multiplier;
      monthlyTotal += cost;
      
      if (cat.category === 'infra') totals.infra += cost;
      else if (cat.category === 'ai_model') totals.ai += cost;
      else if (cat.category === 'tool') totals.tools += cost;
      else if (cat.category === 'security') totals.security += cost;
      
      return { ...cat, monthlyCost: cost };
    });

    months.push({
      month: i,
      costs: currentMonthCosts,
      monthlyTotal
    });
  }

  return {
    months,
    totalInfra12: totals.infra,
    totalDev12: 0, // Calculated separately via DevelopmentCost
    totalAI12: totals.ai,
    totalTools12: totals.tools,
    totalSecurity12: totals.security,
    grandTotal12: totals.infra + totals.ai + totals.tools + totals.security
  };
}
