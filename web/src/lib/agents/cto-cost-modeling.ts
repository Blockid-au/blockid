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
  /** Total spend for this month */
  total: number;
}

/**
 * 2026 Australian Market Benchmarks for CTO Decision Making
 */
export const AU_TECH_BENCHMARKS_2026 = {
  infrastructure: {
    kubernetesAdoption: 0.78,
    serverlessAdoption: 0.34,
    recommendedSSR: 'Streaming SSR',
    targetBundleReduction: 0.42,
  },
  frameworks: {
    react: 0.62,
    vue: 0.14,
    angular: 0.11,
    svelte: 0.09,
  },
  security: {
    essentialEightSmeCompliance: 0.38,
    patchingMaturityLevel3: 0.71,
    owaspTop10Adoption: 0.45,
  },
  quality: {
    sastAdoptionRate: 0.72,
    cicdQualityGateIntegration: 0.68,
    avgMaintainabilityIndex: 68,
    staticAnalysisCoverage: 0.85,
  },
  productivity: {
    aiAssistantUsage: 0.48,
  },
} as const;

/**
 * Evaluates if a tech stack aligns with 2026 AU market standards
 * @param stack Current stack configuration
 * @returns Compliance and alignment score
 */
export function evaluateStackAlignment(stack: TechItem[]): { score: number; gaps: string[] } {
  const gaps: string[] = [];
  let score = 0;

  const hasK8s = stack.some(i => i.name.toLowerCase().includes('kubernetes'));
  const hasSast = stack.some(i => i.type === 'security' && i.name.toLowerCase().includes('sast'));
  const hasAI = stack.some(i => i.type === 'ai_model');

  if (hasK8s) score += 25; else gaps.push('Missing Kubernetes (Industry standard: 78%)');
  if (hasSast) score += 25; else gaps.push('Missing SAST tools (Industry standard: 72%)');
  if (hasAI) score += 25; else gaps.push('No AI productivity tools integrated (Industry standard: 48%)');
  if (stack.some(i => i.type === 'security')) score += 25; else gaps.push('No dedicated security tooling');

  return { score, gaps };
}

/**
 * Calculates estimated performance gain for upgrading to Next.js 16 based on 2026 research
 * @param currentBundleSize Current JS bundle size in KB
 * @param currentTtfb Current Time to First Byte in ms
 * @returns Projected improvements
 */
export function projectNextJs16Gains(currentBundleSize: number, currentTtfb: number): {
  projectedBundleSize: number;
  projectedTtfb: number;
  improvementPercentage: number;
} {
  const bundleReduction = AU_TECH_BENCHMARKS_2026.infrastructure.targetBundleReduction;
  const ttfbImprovement = 0.60;

  return {
    projectedBundleSize: currentBundleSize * (1 - bundleReduction),
    projectedTtfb: currentTtfb * (1 - ttfbImprovement),
    improvementPercentage: (bundleReduction + ttfbImprovement) / 2 * 100,
  };
}

/**
 * Calculates the "Security Debt" based on ACSC Essential Eight and OWASP benchmarks
 * @param controlsImplemented Number of Essential Eight controls implemented
 * @param owaspControlsImplemented Number of OWASP Top 10 controls implemented
 * @returns Debt score where 0 is fully compliant
 */
export function calculateSecurityDebt(controlsImplemented: number, owaspControlsImplemented: number): number {
  const e8Gap = 8 - controlsImplemented;
  const owaspGap = 10 - owaspControlsImplemented;
  const auSmeAvg = (1 - AU_TECH_BENCHMARKS_2026.security.essentialEightSmeCompliance) * 8;

  const totalGap = e8Gap + owaspGap;
  const relativeDebt = totalGap / (auSmeAvg + 5.5);

  return Math.max(0, Math.round(relativeDebt * 100));
}

/**
 * Projects 12-month budget based on monthly burn and scaling factors
 * @param initialMonth TechBudgetMonth
 * @param monthlyGrowth Scaling factor (e.g., 1.1 for 10% growth)
 * @returns Full 12-month projection
 */
export function projectAnnualBudget(initialMonth: TechBudgetMonth, monthlyGrowth: number = 1.05): TechBudgetProjection {
  const months: TechBudgetMonth[] = [];
  let totals = { infra: 0, dev: 0, ai: 0, tools: 0, security: 0 };

  for (let i = 1; i <= 12; i++) {
    const growthFactor = Math.pow(monthlyGrowth, i - 1);
    const monthlyCosts = initialMonth.costs.map(cat => ({
      ...cat,
      monthlyCost: cat.monthlyCost * growthFactor,
      items: cat.items.map(item => ({
        ...item,
        monthlyCost: item.monthlyCost * growthFactor,
      })),
    }));

    const monthTotal = monthlyCosts.reduce((sum, cat) => sum + cat.monthlyCost, 0);
    months.push({ month: i, costs: monthlyCosts, total: monthTotal });

    monthlyCosts.forEach(cat => {
      if (cat.category === 'infra') totals.infra += cat.monthlyCost;
      if (cat.category === 'dev') totals.dev += cat.monthlyCost;
      if (cat.category === 'ai') totals.ai += cat.monthlyCost;
      if (cat.category === 'tools') totals.tools += cat.monthlyCost;
      if (cat.category === 'security') totals.security += cat.monthlyCost;
    });
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
