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
};

/** 2026 Australian Market Benchmarks based on ACSC and StartupAus research */
export const AU_TECH_BENCHMARKS_2026 = {
  security: {
    essentialEightSmeCompliance: 0.38,
    patchingMaturityLevel3Rate: 0.71,
    owaspTop10AdoptionRate: 0.45,
  },
  quality: {
    sastAdoptionRate: 0.72,
    cicdQualityGateIntegration: 0.68,
    avgMaintainabilityIndex: 68,
    staticAnalysisCoverage: 0.85,
  },
  infrastructure: {
    kubernetesProductionRate: 0.78,
    serverlessProductionRate: 0.34,
    aiAssistantUsageRate: 0.48,
  },
  frontendMarketShare: {
    react: 0.62,
    vue: 0.14,
    angular: 0.11,
    svelte: 0.09,
  },
};

/** Calculates a health score based on current AU market benchmarks */
export function calculateTechHealthScore(
  currentMetrics: {
    hasEssentialEight: boolean;
    patchingLevel: number;
    owaspControlsImplemented: number;
    maintainabilityIndex: number;
    hasSast: boolean;
    hasCicdGates: boolean;
    usesModernInfra: boolean;
  }
): TechHealthScore {
  const securityScore = (
    (currentMetrics.hasEssentialEight ? 40 : 0) +
    (currentMetrics.patchingLevel >= 3 ? 30 : currentMetrics.patchingLevel * 10) +
    ((currentMetrics.owaspControlsImplemented / 10) * 30)
  );

  const qualityScore = (
    (currentMetrics.hasSast ? 30 : 0) +
    (currentMetrics.hasCicdGates ? 30 : 0) +
    (Math.min(currentMetrics.maintainabilityIndex / 100, 1) * 40)
  );

  const modernScore = currentMetrics.usesModernInfra ? 100 : 50;

  return {
    securityCompliance: securityScore,
    maintainabilityIndex: currentMetrics.maintainabilityIndex,
    infrastructureModernity: modernScore,
    essentialEightMaturity: currentMetrics.patchingLevel,
    owaspAdoptionRate: currentMetrics.owaspControlsImplemented / 10,
    overallScore: (securityScore * 0.4) + (qualityScore * 0.4) + (modernScore * 0.2),
  };
}

/** 
 * Estimates performance gains for APAC networks based on Next.js 16 research.
 * Focuses on high-latency mitigation via Streaming SSR and Server Components.
 */
export function estimateNextJs16Gains(currentBundleSizeKb: number): {
  estimatedBundleSizeKb: number;
  ttfbImprovementPercent: number;
  jsReductionPercent: number;
} {
  return {
    estimatedBundleSizeKb: currentBundleSizeKb * (1 - 0.42),
    ttfbImprovementPercent: 60,
    jsReductionPercent: 40,
  };
}

/** Projects AI-driven productivity gains on development costs */
export function applyAIProductivityOffset(devCost: DevelopmentCost, aiAdoptionRate: number = 0.48): DevelopmentCost {
  const productivityMultiplier = 1 - (aiAdoptionRate * 0.15); 
  return {
    ...devCost,
    weeklyBurn: devCost.weeklyBurn * productivityMultiplier,
    totalCost: devCost.totalCost * productivityMultiplier,
  };
}
