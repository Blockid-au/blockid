// CDO Domain: Data Quality & AI Governance
//
// Data quality scoring, report consistency validation,
// analytics maturity assessment, and AI governance framework.

export interface DataQualityScore {
  overall: number;
  dimensions: DataQualityDimension[];
  issues: DataIssue[];
  recommendations: string[];
}

export interface DataQualityDimension {
  name: string;
  score: number;
  weight: number;
  description: string;
}

export interface DataIssue {
  severity: "critical" | "high" | "medium" | "low";
  table: string;
  field: string;
  issue: string;
  affectedRows: number;
  fix: string;
}

export interface AnalyticsMaturity {
  level: number;
  levelName: string;
  currentCapabilities: string[];
  nextLevelActions: string[];
  score: number;
}

// ── Data Quality Dimensions ────────────────────────────────────────────

const DQ_DIMENSIONS: Omit<DataQualityDimension, "score">[] = [
  { name: "Completeness", weight: 25, description: "Percentage of required fields that are filled" },
  { name: "Accuracy", weight: 25, description: "Data matches reality and is verifiable" },
  { name: "Consistency", weight: 20, description: "Same data doesn't conflict across tables" },
  { name: "Timeliness", weight: 15, description: "Data is up-to-date and refreshed regularly" },
  { name: "Uniqueness", weight: 15, description: "No duplicate records for the same entity" },
];

export function calculateDataQuality(input: {
  totalRecords: number;
  completeRecords: number;
  verifiedRecords: number;
  conflictingRecords: number;
  staleRecords: number;
  duplicateRecords: number;
}): DataQualityScore {
  const total = Math.max(1, input.totalRecords);

  const completenessScore = (input.completeRecords / total) * 100;
  const accuracyScore = (input.verifiedRecords / total) * 100;
  const consistencyScore = ((total - input.conflictingRecords) / total) * 100;
  const timelinessScore = ((total - input.staleRecords) / total) * 100;
  const uniquenessScore = ((total - input.duplicateRecords) / total) * 100;

  const dimensions: DataQualityDimension[] = DQ_DIMENSIONS.map((d) => {
    let score = 0;
    if (d.name === "Completeness") score = completenessScore;
    else if (d.name === "Accuracy") score = accuracyScore;
    else if (d.name === "Consistency") score = consistencyScore;
    else if (d.name === "Timeliness") score = timelinessScore;
    else if (d.name === "Uniqueness") score = uniquenessScore;
    return { ...d, score: Math.round(score) };
  });

  const overall = Math.round(
    dimensions.reduce((s, d) => s + d.score * (d.weight / 100), 0),
  );

  const issues: DataIssue[] = [];
  const recs: string[] = [];

  if (completenessScore < 80) {
    recs.push(`${Math.round(total - input.completeRecords)} records have missing required fields — implement validation rules`);
  }
  if (input.duplicateRecords > 0) {
    recs.push(`${input.duplicateRecords} duplicate records found — implement dedup and unique constraints`);
  }
  if (input.staleRecords > total * 0.1) {
    recs.push(`${Math.round((input.staleRecords / total) * 100)}% of records are stale — implement data refresh schedules`);
  }

  return { overall, dimensions, issues, recommendations: recs };
}

// ── Analytics Maturity Model ───────────────────────────────────────────

const MATURITY_LEVELS = [
  {
    level: 1,
    name: "Ad Hoc",
    capabilities: ["Basic page views", "Manual reporting", "Spreadsheet analysis"],
    nextActions: ["Implement event tracking", "Set up automated dashboards", "Define KPIs"],
  },
  {
    level: 2,
    name: "Defined",
    capabilities: ["Event tracking", "Funnel analysis", "Basic dashboards", "KPI monitoring"],
    nextActions: ["Add cohort analysis", "Implement A/B testing", "Set up data warehouse"],
  },
  {
    level: 3,
    name: "Managed",
    capabilities: ["Cohort analysis", "A/B testing", "Automated reports", "Data warehouse"],
    nextActions: ["Build ML models", "Implement predictive analytics", "Real-time dashboards"],
  },
  {
    level: 4,
    name: "Optimized",
    capabilities: ["Predictive analytics", "ML models", "Real-time dashboards", "Data-driven decisions"],
    nextActions: ["AI-powered insights", "Autonomous optimization", "Cross-platform attribution"],
  },
  {
    level: 5,
    name: "Innovating",
    capabilities: ["AI-powered insights", "Autonomous optimization", "Advanced ML", "Data monetization"],
    nextActions: ["Stay at cutting edge", "Share learnings", "Build data products"],
  },
];

export function assessAnalyticsMaturity(input: {
  hasEventTracking: boolean;
  hasFunnelAnalysis: boolean;
  hasCohortAnalysis: boolean;
  hasABTesting: boolean;
  hasDataWarehouse: boolean;
  hasMLModels: boolean;
  hasRealTimeDashboard: boolean;
}): AnalyticsMaturity {
  let score = 0;
  if (input.hasEventTracking) score += 15;
  if (input.hasFunnelAnalysis) score += 15;
  if (input.hasCohortAnalysis) score += 15;
  if (input.hasABTesting) score += 15;
  if (input.hasDataWarehouse) score += 15;
  if (input.hasMLModels) score += 15;
  if (input.hasRealTimeDashboard) score += 10;

  const level = score >= 85 ? 5 : score >= 65 ? 4 : score >= 45 ? 3 : score >= 25 ? 2 : 1;
  const maturity = MATURITY_LEVELS[level - 1] ?? MATURITY_LEVELS[0];

  return {
    level,
    levelName: maturity?.name ?? "Unknown",
    currentCapabilities: maturity?.capabilities ?? [],
    nextLevelActions: maturity?.nextActions ?? [],
    score,
  };
}

// ── AI Governance Framework (NIST AI RMF) ──────────────────────────────

export const AI_GOVERNANCE_CHECKLIST = [
  { category: "Transparency", item: "Document all AI models used and their purposes", priority: "high" },
  { category: "Transparency", item: "Disclose AI-generated content to users", priority: "high" },
  { category: "Fairness", item: "Test AI outputs for bias across demographics", priority: "medium" },
  { category: "Fairness", item: "Implement human review for high-stakes AI decisions", priority: "high" },
  { category: "Privacy", item: "Minimize personal data sent to AI providers", priority: "critical" },
  { category: "Privacy", item: "Use data processing agreements with AI providers", priority: "high" },
  { category: "Security", item: "Validate and sanitize AI inputs/outputs", priority: "critical" },
  { category: "Security", item: "Rate limit AI API calls to prevent abuse", priority: "high" },
  { category: "Reliability", item: "Implement AI fallback chains (multi-provider)", priority: "medium" },
  { category: "Reliability", item: "Monitor AI response quality and accuracy", priority: "high" },
  { category: "Accountability", item: "Log all AI interactions for audit trail", priority: "high" },
  { category: "Accountability", item: "Define AI incident response process", priority: "medium" },
];
