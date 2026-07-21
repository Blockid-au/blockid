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
  "product-manager": { junior: 1100, mid: 1700, senior: 2300, lead: 3000 },
};

/** 2026 Australian Tech Market Benchmarks */
export const AU_TECH_BENCHMARKS_2026 = {
  security: {
    essentialEightSmeCompliance: 0.38,
    patchingMaturityLevel3: 0.71,
    owaspTop10Adoption: 0.45,
    sastAdoptionRate: 0.72,
  },
  infrastructure: {
    kubernetesProductionRate: 0.78,
    serverlessProductionRate: 0.34,
    averageMaintainabilityIndex: 68,
    staticAnalysisCoverage: 0.85,
    cicdQualityGateIntegration: 0.68,
  },
  frontend: {
    marketShare: {
      react: 0.62,
      vue: 0.14,
      angular: 0.11,
      svelte: 0.09,
    },
    nextJs16: {
      bundleSizeReduction: 0.42,
      clientJsReduction: 0.40,
      ttfbImprovement: 0.60,
    },
  },
  productivity: {
    aiAssistantUsageRate: 0.48,
  },
};

/** Calculates the health score based on Australian 2026 benchmarks */
export function calculateTechHealthScore(
  currentMetrics: {
    essentialEightLevel: number;
    owaspControlsImplemented: number;
    maintainabilityIndex: number;
    hasSast: boolean;
    hasCicdGates: boolean;
    infraModernityScore: number; // 0-1
  }
): TechHealthScore {
  const e8Score = currentMetrics.essentialEightLevel / 3;
  const owaspScore = currentMetrics.owaspControlsImplemented / 10;
  const maintainabilityScore = currentMetrics.maintainabilityIndex / 100;
  
  const securityCompliance = (e8Score + owaspScore) / 2;
  const sastBonus = currentMetrics.hasSast ? 1 : 0;
  const gateBonus = currentMetrics.hasCicdGates ? 1 : 0;

  const overallScore = (
    (securityCompliance * 0.4) + 
    (maintainabilityScore * 0.3) + 
    (currentMetrics.infraModernityScore * 0.3) +
    ((sastBonus + gateBonus) * 0.05)
  ) * 100;

  return {
    securityCompliance: securityCompliance * 100,
    maintainabilityIndex: currentMetrics.maintainabilityIndex,
    infrastructureModernity: currentMetrics.infraModernityScore * 100,
    overallScore,
    essentialEightMaturity: e8Score * 100,
    owaspAdoptionRate: owaspScore * 100,
    sastCoverage: currentMetrics.hasSast ? 100 : 0,
    cicdQualityGateIntegration: currentMetrics.hasCicdGates,
  };
}

/** Calculates projected AI productivity savings */
export function calculateAISavings(
  teamSize: number,
  avgWeeklyHours: number,
  avgHourlyRate: number,
  aiAdoptionRate: number = AU_TECH_BENCHMARKS_2026.productivity.aiAssistantUsageRate
): {
  annualSavings: number;
  hoursSavedPerYear: number;
  efficiencyGain: number;
} {
  const avgHoursSavedPerDev = avgWeeklyHours * 0.15 * aiAdoptionRate;
  const annualHoursSaved = avgHoursSavedPerDev * teamSize * 52;
  const annualSavings = annualHoursSaved * avgHourlyRate;
  const efficiencyGain = (avgHoursSavedPerDev / avgWeeklyHours) * 100;

  return {
    annualSavings,
    hoursSavedPerYear: annualHoursSaved,
    efficiencyGain,
  };
}
