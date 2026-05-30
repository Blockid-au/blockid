// Startup Value Index (SVI) — Shared types for the SVI Engine microservice.
// Mirrors the monolith's svi-analysis.ts interface definitions.

export const SVI_VERSION = "2.0.0";

// ─── Stage labels ─────────────────────────────────────────────────────────────
export const SVI_STAGE_LABELS: string[] = [
  "Concept",
  "Validated Idea",
  "MVP / Prototype",
  "Early Traction",
  "Revenue",
  "Growth",
  "Scale",
  "Corporation",
];

export const STAGE_BONUSES: Record<number, number> = {
  0: 0,
  1: 3,
  2: 5,
  3: 8,
  4: 12,
  5: 18,
  6: 25,
  7: 35,
};

// ─── Benchmark bands per stage ────────────────────────────────────────────────
export const SVI_BENCHMARKS: Record<
  number,
  { p10: number; p25: number; p50: number; p75: number; p90: number }
> = {
  0: { p10: 60,  p25: 75,  p50: 90,  p75: 105, p90: 115 },
  1: { p10: 75,  p25: 90,  p50: 105, p75: 118, p90: 130 },
  2: { p10: 85,  p25: 100, p50: 115, p75: 130, p90: 145 },
  3: { p10: 95,  p25: 110, p50: 125, p75: 142, p90: 158 },
  4: { p10: 105, p25: 120, p50: 138, p75: 155, p90: 170 },
  5: { p10: 118, p25: 135, p50: 152, p75: 168, p90: 185 },
  6: { p10: 135, p25: 152, p50: 168, p75: 185, p90: 200 },
  7: { p10: 155, p25: 170, p50: 185, p75: 200, p90: 220 },
};

// ─── Evidence confidence levels ───────────────────────────────────────────────
export const EVIDENCE_CONFIDENCE: Record<string, number> = {
  self_declared: 0.20,
  public_url: 0.35,
  document_uploaded: 0.50,
  connected_source: 0.75,
  transaction_data: 0.90,
  third_party_verified: 1.00,
};

// ─── Input types ──────────────────────────────────────────────────────────────
export interface SVITextInput {
  rawText: string;
  fileName?: string;
}

export interface SVIExtractedSignals {
  // Founder signals
  hasCoFounder: boolean;
  founderExperience: "first-time" | "experienced" | "serial";
  founderSectorFit: boolean;
  hasAdvisors: boolean;

  // Idea / market signals
  marketSize: "unknown" | "small" | "medium" | "large";
  problemClarity: "vague" | "clear" | "validated";
  hasCustomerInterviews: boolean;
  isAIWrapper: boolean;
  hasMoat: boolean;
  hasNetworkEffect: boolean;
  hasDataAdvantage: boolean;
  hasSwitchingCosts: boolean;

  // Product signals
  hasProduct: boolean;
  hasDemo: boolean;
  hasSourceCode: boolean;
  hasWebsite: boolean;
  hasApp: boolean;

  // Traction / revenue signals
  hasRevenue: boolean;
  revenueBand: "pre-revenue" | "early" | "growing" | "scaling";
  hasCustomers: boolean;
  hasSocialProof: boolean;
  hasAnalytics: boolean;

  // Cap table / governance signals
  hasCapTable: boolean;
  hasVesting: boolean;
  hasShareholdersAgreement: boolean;
  hasBoardCadence: boolean;
  hasFinancialAudit: boolean;
  esopAllocated: boolean;

  // Investor readiness
  hasPitchDeck: boolean;
  hasFinancialModel: boolean;
  hasDataRoom: boolean;
  targetRaiseMentioned: boolean;
  raiseMentioned: boolean;

  // Legal & compliance
  hasABN: boolean;
  hasIPProtection: boolean;
  hasContracts: boolean;
  hasLegalDocs: boolean;

  // Evidence quality
  evidenceLevel: keyof typeof EVIDENCE_CONFIDENCE;

  // ── Extended signals for 13 evaluation criteria ─────────────────────────

  // Idea signals
  hasUniqueness: boolean;
  hasProblemSolutionFit: boolean;
  innovationLevel: "incremental" | "novel" | "breakthrough";

  // Team Structure signals
  hasOrgChart: boolean;
  hasAdvisoryBoard: boolean;
  teamSize: "solo" | "small" | "medium" | "large";
  hasHiringPlan: boolean;

  // Go-to-Market signals
  hasGTMStrategy: boolean;
  hasDistributionChannels: boolean;
  hasPricingStrategy: boolean;
  hasAcquisitionPlan: boolean;

  // Code/Git signals (enhanced)
  hasCommitHistory: boolean;
  codeQuality: "unknown" | "basic" | "good" | "production";
  hasArchitectureDoc: boolean;
  hasTests: boolean;

  // Customer Size signals
  userBaseSize: "none" | "early" | "growing" | "significant";
  hasEngagementMetrics: boolean;
  hasGrowthRate: boolean;

  // Roadmap signals
  hasProductRoadmap: boolean;
  hasMilestones: boolean;
  roadmapClarity: "vague" | "clear" | "detailed";

  // Document Quality signals
  hasBusinessPlan: boolean;
  documentCompleteness: "minimal" | "partial" | "comprehensive";
}

export interface SVISubScore {
  label: string;
  key: string;
  value: number;
  adjustment: number;
  rationale: string;
  evidence: string[];
  gaps: string[];
}

export interface RiskPenalty {
  label: string;
  points: number;
  reason: string;
}

export interface SVIEvidenceGap {
  priority: "P0" | "P1" | "P2";
  label: string;
  action: string;
  impact: number;
  evidenceType: string;
}

export interface SVIAnalysis {
  version: string;
  totalSVI: number;
  baselineSVI: number;
  netAdjustment: number;
  confidenceMultiplier: number;
  subs: SVISubScore[];
  riskPenalties: RiskPenalty[];
  evidenceGaps: SVIEvidenceGap[];
  nextActions: { priority: "P0" | "P1" | "P2"; title: string; detail: string; impact: string }[];
  signals: SVIExtractedSignals;
  summary: string;
  stage: number;
  stageLabel: string;
  stageBonus: number;
  weeklyDelta?: number;
  percentileRank?: number;
  metricsBonus?: number;
}

// ─── Startup metrics input shape ─────────────────────────────────────────────
export interface StartupMetricsInput {
  mrr?: number;
  arr?: number;
  users_total?: number;
  churn_rate?: number;
  nps?: number;
  revenue?: number;
}

// ─── Evidence item shape (from svi_evidence table) ───────────────────────────
export interface EvidenceItem {
  evidence_type: string;
  confidence_level: string;
  dimension: string;
  label: string;
}
