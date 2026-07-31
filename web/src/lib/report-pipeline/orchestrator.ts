// Report Orchestrator — Main pipeline controller for multi-agent report generation.
//
// Coordinates the 3-phase pipeline:
//   Phase 1: GATHER — Parallel data collection (tech audit, competitive research)
//   Phase 2: ANALYZE — 3 waves of agent analysis (13 criteria)
//   Phase 3: SYNTHESIZE — Cross-validation, executive summary, assembly
//
// The orchestrator is stateless — all state flows through ReportContext.

import type {
  ReportContext,
  ReportTier,
  AssembledReport,
  PipelineStatus,
  PipelinePhase,
  GatherResults,
  CriterionData,
  AgentRole,
  SectionAuditRecord,
} from "./types";
import type { CriterionKey } from "@/lib/evaluation-criteria";
import { CRITERION_KEYS } from "@/lib/evaluation-criteria";
import {
  WAVE_1,
  WAVE_2,
  WAVE_3,
  dispatchWave,
  buildEvidenceCatalogue,
  type DispatchOptions,
} from "./agent-dispatcher";
import { assembleReport } from "./section-assembler";
import { buildAgentPrompt } from "./agent-prompts";
import { auditSections, type AuditableSection } from "./llm-auditor";
import { researchMarket } from "@/lib/adk/agents";
import { getAIBudgetStatus } from "@/lib/ai-client";

type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>;

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  accountId: string;
  userId: string;
  projectId?: string;
  startupName: string;
  rawText: string;
  sviAnalysis: import("@/lib/svi-analysis").SVIAnalysis;
  evidenceItems: import("@/lib/svi-analysis").EvidenceItem[];
  criteriaData: Record<CriterionKey, CriterionData>;
  tier: ReportTier;
  locale?: "en" | "vi";
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>;
  onPhaseChange?: (status: PipelineStatus) => void;
  /** Overrides for the structured dispatch path (model label, transport, …). */
  dispatchOptions?: DispatchOptions;
  /**
   * Budget predicate for the §5.4 grounding sweep. Defaults to the
   * ai-client monthly cap: once the month's spend hits MONTHLY_BUDGET_USD
   * the sweep stops making model calls and reports the remaining sections
   * with their (free) deterministic verdict only.
   */
  auditBudgetOk?: () => boolean;
}

// ── Orchestrate ─────────────────────────────────────────────────────────────

export async function orchestrateReport(input: OrchestratorInput): Promise<AssembledReport> {
  const reportId = generateReportId();
  const startedAt = new Date().toISOString();

  // Initialize context
  const context: ReportContext = {
    accountId: input.accountId,
    userId: input.userId,
    projectId: input.projectId,
    startupName: input.startupName,
    rawText: input.rawText,
    sviAnalysis: input.sviAnalysis,
    evidenceItems: input.evidenceItems,
    criteriaData: ensureAllCriteria(input.criteriaData),
    stage: input.sviAnalysis.stage,
    locale: input.locale ?? "en",
    gatherResults: {},
    criterionResults: new Map(),
  };

  const notify = (phase: PipelinePhase, progress: number, currentAgent?: AgentRole) => {
    input.onPhaseChange?.({
      reportId,
      phase,
      progress,
      completedAgents: [...context.criterionResults.keys()].map(() => currentAgent ?? "ceo"),
      totalAgents: WAVE_1.length + WAVE_2.length + WAVE_3.length + 2,
      currentAgent,
      startedAt,
    });
  };

  // ── Phase 1: GATHER ─────────────────────────────────────────────────
  notify("gathering", 5);
  context.gatherResults = await gatherData(context, input.callAI);

  // ── Phase 2: ANALYZE ────────────────────────────────────────────────
  // Every agent call is schema-validated and audit-logged to ai_runs.
  const dispatchOpts: DispatchOptions = {
    purpose: "customer_report",
    businessId: input.projectId ?? null,
    userId: input.userId,
    ...(input.dispatchOptions ?? {}),
  };

  // Wave 1: Independent analyses
  notify("wave1", 15);
  await dispatchWave(WAVE_1, context, input.tier, input.callAI, dispatchOpts);

  // Wave 2: Depends on Wave 1
  notify("wave2", 45);
  await dispatchWave(WAVE_2, context, input.tier, input.callAI, dispatchOpts);

  // Wave 3: Depends on Wave 1 + 2
  notify("wave3", 75);
  await dispatchWave(WAVE_3, context, input.tier, input.callAI, dispatchOpts);

  // ── Phase 3: SYNTHESIZE ─────────────────────────────────────────────
  notify("synthesizing", 85);

  // CDO cross-validation
  context.consistencyIssues = await crossValidate(context, input.callAI);

  // CEO executive summary
  context.executiveSummary = await generateExecutiveSummary(context, input.callAI);

  // LLM Auditor (ported from Google Agent Garden's llm-auditor sample) —
  // §5.4 grounding sweep over EVERY section (executive summary + all
  // criterion sections), not just the summary. Fully fail-safe and metered.
  const audit = await auditAllSections(context, input.tier, input.callAI, {
    budgetOk: input.auditBudgetOk,
  });
  context.executiveSummary = audit.executiveSummary;
  context.auditFindings = audit.findings;
  context.sectionAudits = audit.records;

  context.qualityScore = computeFinalQuality(context);

  // ── Assemble ────────────────────────────────────────────────────────
  notify("rendering", 95);
  const report = assembleReport(context, input.tier, reportId);

  notify("complete", 100);
  return report;
}

// ── Phase 1: Data Gathering ─────────────────────────────────────────────────

async function gatherData(context: ReportContext, callAI: AICaller): Promise<GatherResults> {
  const results: GatherResults = {};

  // Gather runs are fire-and-forget — failures don't block the pipeline
  try {
    const gatherPromises: Promise<void>[] = [];

    // Market & competitive research (Agent Garden port) — populates the
    // `competitiveResearch` slot the CMO's market prompt already consumes.
    gatherPromises.push(
      (async () => {
        const research = await researchMarket(
          {
            startupName: context.startupName,
            description: context.rawText,
            sector: context.criteriaData.market?.textInput || undefined,
          },
          callAI,
        );
        if (research) {
          results.competitiveResearch = research as unknown as Record<string, unknown>;
        }
      })(),
    );

    // Extract any URLs from criteria data for tech audit
    const websiteData = context.criteriaData.website;
    const codeData = context.criteriaData.code_git;

    if (websiteData?.links?.length) {
      gatherPromises.push(
        (async () => {
          // Tech audit would run here via existing deepTechAudit()
          results.techAudit = { url: websiteData.links[0]?.url, status: "gathered" };
        })(),
      );
    }

    if (codeData?.links?.length) {
      gatherPromises.push(
        (async () => {
          // Repo audit would run here via existing auditGitHubRepo()
          results.repoAudit = { url: codeData.links[0]?.url, status: "gathered" };
        })(),
      );
    }

    // Evidence quality check
    gatherPromises.push(
      (async () => {
        const totalEvidence = Object.values(context.criteriaData).reduce(
          (sum, d) => sum + d.files.length + d.links.length + (d.textInput ? 1 : 0),
          0,
        );
        results.evidenceQuality = {
          totalItems: totalEvidence,
          completedCriteria: Object.values(context.criteriaData).filter(
            (d) => d.textInput.length > 0 || d.files.length > 0 || d.links.length > 0,
          ).length,
          totalCriteria: CRITERION_KEYS.length,
        };
      })(),
    );

    await Promise.allSettled(gatherPromises);
  } catch {
    // Non-blocking: gather phase failures don't stop the pipeline
  }

  return results;
}

// ── CDO Cross-Validation ────────────────────────────────────────────────────

async function crossValidate(
  context: ReportContext,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
): Promise<string[]> {
  if (context.criterionResults.size < 3) return [];

  const scoreSummary = [...context.criterionResults.entries()]
    .map(([key, result]) => `${key}: ${result.score}/100 (${result.highlights[0] ?? "no highlights"})`)
    .join("\n");

  const systemPrompt = buildAgentPrompt("cdo", context);
  const userPrompt = `## Cross-Validation Task

Review these 13 criterion scores and highlights for consistency:

${scoreSummary}

Identify any:
1. Score inconsistencies (e.g., high market score but low customer score at growth stage)
2. Contradictory findings between criteria
3. Evidence quality concerns
4. Missing data that could change assessments

List issues as bullet points. If no issues found, respond with "No consistency issues detected."`;

  try {
    const response = await callAI(systemPrompt, userPrompt, 800);
    if (response.includes("No consistency issues")) return [];

    return response
      .split("\n")
      .filter((line) => line.match(/^\s*[-*]/))
      .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
      .filter((line) => line.length > 10)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ── CEO Executive Summary ───────────────────────────────────────────────────

async function generateExecutiveSummary(
  context: ReportContext,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
): Promise<string> {
  const summaries = [...context.criterionResults.entries()]
    .map(([key, result]) => `**${key}** (${result.score}/100): ${result.highlights.slice(0, 2).join("; ")}`)
    .join("\n");

  const systemPrompt = buildAgentPrompt("ceo", context);
  const userPrompt = `## Executive Summary Generation

Based on ALL 13 criterion analyses below, write a comprehensive Executive Summary (500-800 words).

${summaries}

SVI Score: ${context.sviAnalysis.totalSVI}
Stage: ${context.sviAnalysis.stageLabel}
${context.consistencyIssues?.length ? `\nConsistency Issues:\n${context.consistencyIssues.join("\n")}` : ""}

Include:
1. One-paragraph startup overview
2. Investment thesis: top 3 reasons to back this startup
3. Top 3 critical gaps
4. Stage-appropriate benchmarks
5. Overall verdict and next milestone`;

  try {
    return await callAI(systemPrompt, userPrompt, 2000);
  } catch {
    return `## Executive Summary\n\n**${context.startupName}** — SVI Score: ${context.sviAnalysis.totalSVI} (${context.sviAnalysis.stageLabel})\n\n*Executive summary generation encountered an error. Please refer to individual section analyses below.*`;
  }
}

// ── LLM Auditor (Agent Garden pattern) ──────────────────────────────────────

/**
 * §5.4 grounding sweep — G8.
 *
 * Runs over the executive summary AND every criterion section. Two stages
 * (see llm-auditor.ts): a free deterministic citation gate on every section,
 * then a metered critic→reviser LLM pass.
 *
 * Cost control, by tier:
 *   standard        — LLM pass only on sections the free gate flagged, max 6.
 *                     Typical clean report: 0 auditor calls (was 2).
 *                     Worst case: 12 calls.
 *   premium /       — LLM pass on every section, max 16 sections
 *   investor_memo     (≤ 32 calls). These tiers pay 2-3x Standard.
 *
 * The monthly ai-client budget short-circuits the LLM pass at any point; the
 * free gate still runs, so no section is ever reported as grounded without
 * having been checked.
 */
async function auditAllSections(
  context: ReportContext,
  tier: ReportTier,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
  opts: { budgetOk?: () => boolean } = {},
): Promise<{ executiveSummary: string; findings: string[]; records: SectionAuditRecord[] }> {
  const draft = context.executiveSummary ?? "";

  // Build the grounding evidence: startup description + actual SVI scores +
  // per-criterion scores. The auditor treats this as the ONLY source of truth.
  const sviScores = context.sviAnalysis.subs
    .map((s: { label: string; value: number }) => `- ${s.label}: ${s.value}/100`)
    .join("\n");
  const criterionScores = [...context.criterionResults.entries()]
    .map(([key, r]) => `- ${key}: ${r.score}/100`)
    .join("\n");

  const evidence = [
    `Startup: ${context.startupName}`,
    `Stage: ${context.sviAnalysis.stageLabel}`,
    `Overall SVI: ${context.sviAnalysis.totalSVI}/100`,
    `## Startup Description\n${context.rawText.slice(0, 4000)}`,
    `## SVI Dimension Scores\n${sviScores}`,
    `## Per-Criterion Scores\n${criterionScores}`,
  ].join("\n\n");

  const sections: AuditableSection[] = [];
  if (draft.trim()) {
    sections.push({ id: "executive", title: "Executive Summary", content: draft });
  }
  for (const [key, result] of context.criterionResults) {
    sections.push({
      id: key,
      title: key,
      content: result.content,
      allowedEvidenceIds: buildEvidenceCatalogue(key, context).map(e => e.evidence_id),
    });
  }

  const fullSweep = tier === "premium" || tier === "investor_memo";
  const budgetOk =
    opts.budgetOk ??
    (() => {
      const b = getAIBudgetStatus();
      return b.spent < b.limit;
    });

  const outcomes = await auditSections(sections, evidence, callAI, {
    llmOnlyWhenUncited: !fullSweep,
    maxLlmSections: fullSweep ? 16 : 6,
    budgetOk,
    maxTokens: 2000,
  });

  const originals = new Map(sections.map(s => [s.id, s.content]));
  const findings: string[] = [];
  const records: SectionAuditRecord[] = [];
  let executiveSummary = draft;

  for (const o of outcomes) {
    records.push({
      sectionId: o.sectionId,
      uncitedClaims: o.uncitedClaims,
      findings: o.findings,
      revised: o.revised !== originals.get(o.sectionId),
      grounded: o.grounded,
      skipped: o.skipped,
    });

    for (const f of o.findings) findings.push(`[${o.sectionId}] ${f}`);
    for (const c of o.uncitedClaims.slice(0, 2)) {
      findings.push(`[${o.sectionId}] uncited claim: ${c}`);
    }

    if (o.sectionId === "executive") {
      executiveSummary = o.revised;
      continue;
    }

    // Downgrade + flag — never silently publish an ungrounded section.
    const result = context.criterionResults.get(o.sectionId as CriterionKey);
    if (!result) continue;
    result.content = o.revised;
    result.grounded = o.grounded;
    if (!o.grounded) {
      result.confidence = Math.round(result.confidence * 0.7 * 100) / 100;
      result.risks = [
        `Grounding: ${o.uncitedClaims.length} claim(s) in this section are not backed by a cited evidence id — verify before relying on the figures.`,
        ...result.risks,
      ];
    }
  }

  return { executiveSummary, findings: findings.slice(0, 24), records };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function generateReportId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `rpt-${ts}-${rand}`;
}

function ensureAllCriteria(
  data: Record<string, CriterionData>,
): Record<CriterionKey, CriterionData> {
  const empty: CriterionData = {
    textInput: "",
    files: [],
    links: [],
    qualityLevel: "incomplete",
  };
  const result: Record<string, CriterionData> = {};
  for (const key of CRITERION_KEYS) {
    result[key] = data[key] ?? empty;
  }
  return result as Record<CriterionKey, CriterionData>;
}

function computeFinalQuality(context: ReportContext): number {
  const criterionCount = context.criterionResults.size;
  if (criterionCount === 0) return 0;

  const avgConfidence = [...context.criterionResults.values()].reduce(
    (sum, r) => sum + r.confidence,
    0,
  ) / criterionCount;

  const evidenceComplete = Object.values(context.criteriaData).filter(
    (d) => d.textInput.length > 0 || d.files.length > 0 || d.links.length > 0,
  ).length / CRITERION_KEYS.length;

  const sectionComplete = criterionCount / 13;
  const consistency = (context.consistencyIssues?.length ?? 0) === 0 ? 1 : 0.7;

  return Math.round(
    (avgConfidence * 30 + evidenceComplete * 25 + sectionComplete * 25 + consistency * 20),
  );
}
