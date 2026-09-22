// Report Pipeline Types — Shared interfaces for multi-agent orchestrated report generation.

import type { SVIAnalysis, EvidenceItem } from "@/lib/svi-analysis";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import type { PhaseGateResult } from "@/lib/growth/phase-gate";
import type { DimensionChapter, EvidenceRow, ExecutiveStructured, ReportV2 } from "@/lib/report-v2/schema";
import type { DimKey } from "./dimension-owners";

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

  // ── G7 provenance (optional so existing consumers are unaffected) ────
  /** True when the response passed the canonical Zod contract. */
  schemaValidated?: boolean;
  /** True when validation failed twice and prose fallback was used. */
  degraded?: boolean;
  /** Why the structured path failed (schema_fail / model_error / …). */
  degradeReason?: string;
  /** True when at least one citation resolved to a supplied evidence id. */
  grounded?: boolean;
  /** Citations that resolved against the evidence catalogue. */
  citations?: Array<{ evidence_id: string; quote: string }>;
  /** ai_runs.id for this agent call (migration 0231). */
  runId?: string;
}

/** One citable source handed to an agent, with a deterministic uuid. */
export interface EvidenceCatalogueEntry {
  evidence_id: string;
  label: string;
  content: string;
}

// ── Section grounding audit (G8) ────────────────────────────────────────────

export interface SectionAuditRecord {
  /** Section identity — criterion key, or "executive" for the summary. */
  sectionId: string;
  /** Claims that carry no evidence_id citation. */
  uncitedClaims: string[];
  /** Critic findings when the LLM pass ran. */
  findings: string[];
  /** True when the section was rewritten by the reviser. */
  revised: boolean;
  /** True when the section is grounded (no uncited material claims). */
  grounded: boolean;
  /** Why the LLM pass was skipped, when it was. */
  skipped?: "budget" | "tier" | "clean" | "cap";
  /** G24-D: true when the critic→reviser pass ran on this section (absent on pre-G24 rows). */
  llmAudited?: boolean;
  /** G24-D: true when the critic objected after the deterministic filter — the reason a zero-uncited section is still ungrounded. */
  hadIssues?: boolean;
}

// ── Gather Phase Results ────────────────────────────────────────────────────

export interface GatherResults {
  techAudit?: Record<string, unknown>;
  repoAudit?: Record<string, unknown>;
  competitiveResearch?: Record<string, unknown>;
  scrapedData?: Record<string, unknown>;
  evidenceQuality?: Record<string, unknown>;
  // ── S-R3 §C.3 (un-stubbed GATHER) ──────────────────────────────────
  /** Connector signal snapshots read from the LAST sync (svi_signals / connector_snapshots) — never a live OAuth call. */
  connectorSignals?: Record<string, unknown>;
  /** Admission result; unqualified observations cannot authorize a valuation. */
  revenueQualification?: { status: "qualified" | "unqualified"; reasons: string[] };
  /** Cap-table register summary (shareholders + esop_pool). */
  capTable?: Record<string, unknown>;
  /** Grants / programs match (grant-advisor.ts) for the project's grant profile. */
  grants?: Record<string, unknown>;
  // ── S-R5 §C.7 evidence connectors ───────────────────────────────────
  /** Latest parsed LinkedIn export / URL (connectors/linkedin-upload.ts → founder_signals) — FTV. */
  founderSignals?: Record<string, unknown>;
  /** G14-S37: the founder execution rubric over founder_profiles (founder/execution.ts) — FTV "Founder Execution" card. */
  founderExecution?: Record<string, unknown>;
  /** Latest 90-day GA4 snapshot (ga4_signal_snapshots: AARRR funnel + channel mix) — TRE / MPC. */
  ga4?: Record<string, unknown>;
  /** CFO 5-method valuation (agents/cfo-valuation.ts buildVcValuationReport) + the inputs it ran on. */
  valuation?: Record<string, unknown>;
  /** G14-S40: open AU register rows for the project's verified ABN (lib/signals/external-signals.ts) — LCO / IRI / TRE. */
  externalSignals?: Record<string, unknown>;
  /** G19-S43: the project's Evidence Hub rows (`svi_dimension_evidence`) — count / byDim / verified / codes. */
  evidenceHub?: Record<string, unknown>;
  /** Per-source timing / cache / timeout diagnostics (`done` telemetry, tests). */
  diagnostics?: Record<string, { ms: number; status: "ok" | "cached" | "timeout" | "error" | "skipped"; note?: string }>;
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
  /** G19-S43: projects.verification_level (0–5) — a verified ABN is never asked for again. */
  verificationLevel?: number | null;

  // Gather phase results
  gatherResults: GatherResults;

  // Agent analysis results (populated progressively)
  criterionResults: Map<CriterionKey, AgentAnalysisResult>;

  // Synthesis
  executiveSummary?: string;
  /** G19-S47: the CEO call's validated sections (null / absent → structured on read from the thesis). */
  executiveStructured?: ExecutiveStructured | null;
  qualityScore?: number;
  consistencyIssues?: string[];
  /** Unsupported/fabricated claims flagged by the LLM Auditor (Agent Garden pattern). */
  auditFindings?: string[];
  /** Per-section grounding verdicts (§5.4 — G8). */
  sectionAudits?: SectionAuditRecord[];
  /** Per-phase completed step IDs — phaseId → string[] of step IDs */
  phaseStepsCompleted?: Record<string, string[]>;

  // ── G13-W2-R2: W4 dimension chapters ────────────────────────────────
  /** Deterministic phase gate (growth/phase-gate.ts) resolved before W1. */
  phaseGate?: PhaseGateResult;
  /** Deterministic module outputs per dimension (module-precompute.ts). */
  moduleOutputs?: Partial<Record<DimKey, Array<{ id: string; output: Record<string, unknown> }>>>;
  /** Evidence rows the W4 chapters may cite (ids stable per run). */
  evidenceRows?: EvidenceRow[];
  /** S-R3: rows minted by GATHER (audits, connectors, cap table, grants) — merged by buildEvidenceRows. */
  gatherEvidenceRows?: EvidenceRow[];
  /** S-R3 §C.5: the deterministic valuation chapter (built after GATHER, streamed as `valuation_complete`). */
  valuationChapter?: ReportV2["valuation"];
  /** S-R3 partial re-run (`dims: [key]`): only these chapters are (re)generated. */
  dimsFilter?: DimKey[];
  /** W4 output — one chapter per dimension, filled by dispatchDimensionChapters. */
  dimensionChapters?: Map<DimKey, DimensionChapter>;
  /** LLM calls consumed so far (per-report call counter). */
  callsUsed?: number;
  /** G23-A: per-run grounding counters (budget overruns salvaged / repaired, verdicts trimmed, claims auto-cited). */
  qualityCounters?: QualityCounters;
}

/** G23-A quality counters — written to the tbr-quality.jsonl row beside groundedShare. */
export interface QualityCounters {
  /** Structured calls whose raw output was cut by its token budget (salvaged or repaired). */
  budgetOverruns: number;
  /** W4 verdicts (chapter, card, criterion card) trimmed to their word cap instead of failing. */
  verdictTrimmed: number;
  /** Material claims that received an evidence id from the auto-citer. */
  autoCited: number;
}

/** Increment one counter on the context (creating the block on first use). */
export function bumpQualityCounter(context: Pick<ReportContext, "qualityCounters">, key: keyof QualityCounters, by = 1): void {
  if (!by) return;
  context.qualityCounters ??= { budgetOverruns: 0, verdictTrimmed: 0, autoCited: 0 };
  context.qualityCounters[key] += by;
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
  /** G13-W2-R2: the ReportV2 projection with W4 chapters (persisted via report-v2/storage). */
  reportV2?: ReportV2;
  /** W2 review P1: every chapter degraded AND the summary is the placeholder — persisting callers must not charge for it. */
  fullyDegraded?: boolean;
  /** LLM calls consumed (hard-stopped at the tier max). */
  llmCalls?: number;
  /** G19-S46: the orchestrator's `done` event as run-for-project captured it (quality telemetry). */
  pipelineStats?: PipelineRunStats;
}

/** G19-S46: what one pipeline run cost — copied from the orchestrator's `done` event. */
export interface PipelineRunStats {
  calls: number;
  costUsd: number;
  costAud: number;
  durationMs: number;
  degradedSections: string[];
  deadlineHit: boolean;
  /** G23-A counters (absent on a pre-G23 stats object). */
  budgetOverruns?: number;
  verdictTrimmed?: number;
  autoCited?: number;
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

export type PipelinePhase = "gathering" | "wave1" | "wave2" | "wave3" | "wave4" | "synthesizing" | "rendering" | "complete" | "failed";

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
