// Report Pipeline Types — Shared interfaces for multi-agent orchestrated report generation.

import type { SVIAnalysis, EvidenceItem } from "@/lib/svi-analysis";
import type { CriterionKey } from "@/lib/evaluation-criteria";

// ── Agent Roles ─────────────────────────────────────────────────────────────

export const AGENT_ROLES = [
  "ceo", "cto", "cfo", "cpo", "cmo", "cro", "clo", "chro", "ciso", "cdo", "coo",
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number];

// ── Report Tiers ────────────────────────────────────────────────────────────

export type ReportTier = "standard" | "premium" | "investor_memo";

export const REPORT_TIER_CONFIG: Record<ReportTier, {
  label: string;
  maxTokensPerAgent: number;
  minWords: number;
  maxWords: number;
  creditCost: number;
  includesDocx: boolean;
  includesCharts: boolean;
}> = {
  standard: {
    label: "Standard Report",
    maxTokensPerAgent: 1500,
    minWords: 5000,
    maxWords: 8000,
    creditCost: 3.00,
    includesDocx: false,
    includesCharts: true,
  },
  premium: {
    label: "Premium Report",
    maxTokensPerAgent: 3000,
    minWords: 8000,
    maxWords: 15000,
    creditCost: 7.00,
    includesDocx: true,
    includesCharts: true,
  },
  investor_memo: {
    label: "Investor Memo",
    maxTokensPerAgent: 4000,
    minWords: 12000,
    maxWords: 20000,
    creditCost: 10.00,
    includesDocx: true,
    includesCharts: true,
  },
};

// ── Visual Specifications ───────────────────────────────────────────────────

export type ChartType =
  | "radar"
  | "bar"
  | "line"
  | "pie"
  | "funnel"
  | "scatter"
  | "org_chart"
  | "timeline"
  | "heat_map"
  | "progress"
  | "flow_diagram"
  | "checklist";

export interface VisualSpec {
  type: ChartType;
  title: string;
  subtitle?: string;
  data: Record<string, unknown>;
  placement: "inline" | "full_page" | "sidebar";
  agentId: AgentRole;
}

// ── Agent Analysis ──────────────────────────────────────────────────────────

export interface AgentAnalysisRequest {
  criterion: CriterionKey;
  agentRole: AgentRole;
  context: ReportContext;
  tier: ReportTier;
  maxTokens: number;
}

export interface AgentAnalysisResult {
  criterion: CriterionKey;
  agentRole: AgentRole;
  score: number;
  content: string;
  highlights: string[];
  dataPoints: Record<string, string>;
  risks: string[];
  nextSteps: string[];
  visuals: VisualSpec[];
  confidence: number;
  wordCount: number;
  durationMs: number;
}

// ── Gather Phase Results ────────────────────────────────────────────────────

export interface GatherResults {
  techAudit?: Record<string, unknown>;
  repoAudit?: Record<string, unknown>;
  competitiveResearch?: Record<string, unknown>;
  scrapedData?: Record<string, unknown>;
  evidenceQuality?: Record<string, unknown>;
}

// ── Report Context (shared across all agents) ───────────────────────────────

export interface ReportContext {
  // Input data
  accountId: string;
  userId: string;
  projectId?: string;
  startupName: string;
  rawText: string;
  sviAnalysis: SVIAnalysis;
  evidenceItems: EvidenceItem[];
  criteriaData: Record<CriterionKey, CriterionData>;
  stage: number;
  locale: "en" | "vi";

  // Gather phase results
  gatherResults: GatherResults;

  // Agent analysis results (populated progressively)
  criterionResults: Map<CriterionKey, AgentAnalysisResult>;

  // Synthesis
  executiveSummary?: string;
  qualityScore?: number;
  consistencyIssues?: string[];
  /** Unsupported/fabricated claims flagged by the LLM Auditor (Agent Garden pattern). */
  auditFindings?: string[];
}

export interface CriterionData {
  textInput: string;
  files: Array<{ name: string; url: string; type: string; size: number }>;
  links: Array<{ url: string; label: string }>;
  qualityLevel: string;
  aiScore?: number;
}

// ── Consistency Check ───────────────────────────────────────────────────────

export interface ConsistencyIssue {
  type: "score_mismatch" | "narrative_conflict" | "evidence_gap" | "data_misalignment";
  severity: "low" | "medium" | "high";
  description: string;
  criteria: CriterionKey[];
  suggestedFix?: string;
}

// ── Assembled Report ────────────────────────────────────────────────────────

export interface AssembledReport {
  id: string;
  title: string;
  tier: ReportTier;
  sections: ReportSection[];
  charts: VisualSpec[];
  executiveSummary: string;
  qualityScore: number;
  totalWords: number;
  consistencyIssues: ConsistencyIssue[];
  agentContributions: Record<AgentRole, { criteria: CriterionKey[]; wordCount: number }>;
  markdown: string;
  createdAt: string;
}

export interface ReportSection {
  id: string;
  title: string;
  agentRole: AgentRole;
  criterion?: CriterionKey;
  content: string;
  score?: number;
  visuals: VisualSpec[];
  wordCount: number;
}

// ── Pipeline Status (for polling) ───────────────────────────────────────────

export type PipelinePhase = "gathering" | "wave1" | "wave2" | "wave3" | "synthesizing" | "rendering" | "complete" | "failed";

export interface PipelineStatus {
  reportId: string;
  phase: PipelinePhase;
  progress: number;
  completedAgents: AgentRole[];
  totalAgents: number;
  currentAgent?: AgentRole;
  error?: string;
  startedAt: string;
  estimatedCompletion?: string;
}
