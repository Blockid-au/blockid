// Report Orchestrator — Main pipeline controller for multi-agent report generation.
//
// Waves (G13-W2-R2, spec 12-product-ai-tbr-v2.md §C.1):
//   GATHER  — parallel data collection + deterministic precompute (phase gate,
//             module outputs, evidence rows); no LLM except market research
//   W1/W2/W3 — criterion calls (13 max; W3 skipped on free / thin evidence
//             unless the criterion is phase-required)
//   W4      — 8 dimension-owner chapter calls in parallel (DimensionChapter
//             Zod payload, one repair, then a deterministic `degraded` card)
//   SYNTH   — CEO executive summary (1 call); CDO cross-validate is one LLM
//             call at premium+, deterministic consistency checks otherwise
//   AUDIT   — llm-auditor over executive + chapters + criteria, tier cap
//   ASSEMBLE — AssembledReport (legacy sections) + ReportV2 projection with
//             the W4 chapters (persisted by run-for-project via report-v2/storage)
//
// Cost guardrails (goal doc §3 D7/D8/D9): a per-report call counter hard-stops
// at the tier max (free 16 / standard 30 / premium 40 / investor_memo 48);
// past the stop every remaining stage degrades to deterministic output —
// a report never fails on budget. `REPORT_PIPELINE_W4=off` rolls back to the
// 13-criteria assembly (the S-R1 adapter still renders a ReportV2 on read).
//
// `onEvent` emits the SSE vocabulary the TBR client consumes (§C.12):
// context · gather_complete · dimension_start · dimension_complete ·
// valuation_complete · criteria_synthesis · executive_complete ·
// audit_complete · progress · done · error.
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
import type { CriterionKey, QualityLevel } from "@/lib/evaluation-criteria";
import { CRITERIA, CRITERION_KEYS, QUALITY_LEVELS } from "@/lib/evaluation-criteria";
import {
  WAVE_1,
  WAVE_2,
  WAVE_3,
  buildEvidenceRows,
  deterministicDimensionChapters,
  dispatchDimensionChapters,
  dispatchWave,
  buildEvidenceCatalogue,
  type CallBudget,
  type DispatchOptions,
} from "./agent-dispatcher";
import { selectAgentsForContext } from "./agent-selector";
import type { IntakeContext } from "@/lib/intake/detect-context";
import { assembleReport } from "./section-assembler";
import { buildAgentPrompt } from "./agent-prompts";
import { AUDITOR_CAP_BY_TIER, auditSections, type AuditableSection } from "./llm-auditor";
import { researchMarket } from "@/lib/adk/agents";
import { getAIBudgetStatus } from "@/lib/ai-client";
import { DIM_ORDER, DIMENSION_OWNERS, criteriaForDimension, type DimKey } from "./dimension-owners";
import { precomputeModules } from "./module-precompute";
import { fromAssembledReport, inferPhase } from "@/lib/report-v2/adapter";
import { isReportV2, type CriterionCard, type DimensionChapter, type ReportTierV2, type ReportV2 } from "@/lib/report-v2/schema";

// S31-A: the optional 4th argument is the Anthropic task class (lib/ai/anthropic-tier.ts).
// Only the CEO final synthesis passes "synthesis" (→ Opus 5); everything else
// is a "report" (→ Sonnet 5) on the quality tier.
type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: "classify" | "report" | "synthesis") => Promise<string>;

// ── Call budget (D7/D8/D9) ──────────────────────────────────────────────────

/** Hard stop per report, by tier (§C.8). */
export const TIER_CALL_MAX: Record<ReportTierV2, number> = { free: 16, standard: 30, premium: 40, investor_memo: 48 };

export class CallBudgetExceededError extends Error {
  constructor(max: number) {
    super(`Report LLM call budget exhausted (${max})`);
    this.name = "CallBudgetExceededError";
  }
}

/** Per-report LLM call counter — `tryAcquire()` false once `max` is reached. */
export class ReportCallBudget implements CallBudget {
  private count = 0;
  constructor(readonly max: number) {}
  get used(): number {
    return this.count;
  }
  get remaining(): number {
    return Math.max(0, this.max - this.count);
  }
  tryAcquire(): boolean {
    if (this.count >= this.max) return false;
    this.count += 1;
    return true;
  }
}

export class ReportFullyDegradedError extends Error {
  constructor(readonly degradedSections: number, readonly calls: number) {
    super(`report fully degraded: ${degradedSections} deterministic chapters and a placeholder summary after ${calls} calls`);
    this.name = "ReportFullyDegradedError";
  }
}

/** Callers that persist + charge call this right after `orchestrateReport()`. */
export function assertReportUsable(report: { fullyDegraded?: boolean; llmCalls?: number; reportV2?: ReportV2 }): void {
  if (report.fullyDegraded) {
    throw new ReportFullyDegradedError(report.reportV2?.quality.degradedSections.length ?? 0, report.llmCalls ?? 0);
  }
}

const SUMMARY_PLACEHOLDER = "Executive summary generation encountered an error";

/**
 * True when nothing an LLM wrote survived: every W4 chapter degraded to a
 * deterministic card AND the summary is the placeholder. Reads the chapters
 * themselves (not `reportV2.quality.degradedSections`, which the adapter
 * fallback also fills for merely unscored dims).
 */
export function isFullyDegraded(report: { executiveSummary?: string | null }, chapters: ReadonlyMap<DimKey, { degraded?: boolean }> | undefined): boolean {
  if (process.env.REPORT_FAIL_WHEN_FULLY_DEGRADED === "off") return false;
  if (!chapters || chapters.size < DIM_ORDER.length) return false;
  if (!DIM_ORDER.every((dim) => chapters.get(dim)?.degraded === true)) return false;
  return typeof report.executiveSummary === "string" && report.executiveSummary.includes(SUMMARY_PLACEHOLDER);
}

/** Wrap a callAI so every call draws from the budget; throws once exhausted. */
export function meterCallAI(callAI: AICaller, budget: ReportCallBudget): AICaller {
  return async (system, user, maxTokens, taskClass) => {
    if (!budget.tryAcquire()) throw new CallBudgetExceededError(budget.max);
    return callAI(system, user, maxTokens, taskClass);
  };
}

// ── Events (§C.12 SSE vocabulary) ───────────────────────────────────────────

export type PipelineEvent =
  | { type: "context"; industry: string; stage: number; stageLabel: string; phaseId: string; tier: ReportTierV2; estimatedCalls: number; estimatedSeconds: number }
  | { type: "gather_complete"; evidenceRows: number; connectors: string[] }
  | { type: "dimension_start"; dim: DimKey; ownerAgent: AgentRole }
  | { type: "dimension_complete"; dim: DimKey; chapter: DimensionChapter }
  | { type: "valuation_complete"; chapter: ReportV2["valuation"] }
  | { type: "criteria_synthesis"; criteria: CriterionCard[] }
  | { type: "executive_complete"; summary: string }
  | { type: "audit_complete"; groundedShare: number; revised: number }
  | { type: "progress"; completed: number; total: number; phase: PipelinePhase }
  | { type: "done"; reportId: string; totalMs: number; calls: number; costAud: number; degradedSections: string[] }
  | { type: "error"; dim?: DimKey; message: string; degraded: true };

export type PipelineEventHandler = (event: PipelineEvent) => void;

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
  /** ReportV2 tier; "free" turns W3 off, chapters 6–9 into cards and caps calls at 16. Defaults to `tier`. */
  tierV2?: ReportTierV2;
  locale?: "en" | "vi";
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: "classify" | "report" | "synthesis") => Promise<string>;
  onPhaseChange?: (status: PipelineStatus) => void;
  /** §C.12 event hook — the SSE route forwards every event verbatim. */
  onEvent?: PipelineEventHandler;
  /** Overrides for the structured dispatch path (model label, transport, …). */
  dispatchOptions?: DispatchOptions;
  /**
   * Budget predicate for the §5.4 grounding sweep and the W4 degrade path.
   * Defaults to the ai-client monthly cap: once the month spend hits
   * MONTHLY_BUDGET_USD the sweep stops making model calls and W4 emits
   * deterministic cards instead of owner calls.
   */
  auditBudgetOk?: () => boolean;
  /** Override the per-report hard stop (tests). Defaults to TIER_CALL_MAX[tierV2]. */
  maxCalls?: number;
  /** Explicit growth phase (projects.growth_phase_current); inferred from criteria + dims otherwise. */
  phaseId?: string | null;
  /**
   * Optional intake context. When provided and `DYNAMIC_WAVES !== "false"`,
   * the orchestrator swaps the static WAVE_1/2/3 for phase-tuned waves via
   * `selectAgentsForContext`. Kept optional so every existing caller keeps
   * the legacy behaviour without a code change.
   */
  context?: IntakeContext;
}

/** Rough per-call cost in AUD for the `done` event (free chain ≈ US$0.0006; Sonnet-class ≈ US$0.03). */
const COST_AUD_PER_CALL = { free_chain: 0.001, sonnet_class: 0.045 } as const;

function w4Enabled(): boolean {
  return (process.env.REPORT_PIPELINE_W4 ?? "on").toLowerCase() !== "off";
}

// ── Orchestrate ─────────────────────────────────────────────────────────────

export async function orchestrateReport(input: OrchestratorInput): Promise<AssembledReport> {
  const reportId = generateReportId();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const tierV2: ReportTierV2 = input.tierV2 ?? input.tier;
  const budget = new ReportCallBudget(input.maxCalls ?? TIER_CALL_MAX[tierV2]);
  const callAI = meterCallAI(input.callAI, budget);
  const emit: PipelineEventHandler = (e) => {
    try {
      input.onEvent?.(e);
    } catch {
      // A listener failure never breaks the pipeline.
    }
  };
  const monthlyOk =
    input.auditBudgetOk ??
    (() => {
      const b = getAIBudgetStatus();
      return b.spent < b.limit;
    });

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
    emit({ type: "progress", completed: progress, total: 100, phase });
  };

  // Resolve which waves to run — dynamic (context-aware) vs static (legacy).
  const dynamicEnabled = process.env.DYNAMIC_WAVES !== "false";
  const [wave1, wave2Raw, wave3Raw] =
    dynamicEnabled && input.context
      ? selectAgentsForContext(input.context)
      : [WAVE_1, WAVE_2, WAVE_3];
  // Free tier: W1 (+ phase-tuned W2 when an intake context is given), never W3 (§C.1).
  const wave2 = tierV2 === "free" && !input.context ? [] : wave2Raw;
  const wave3 = tierV2 === "free" ? [] : wave3Raw;
  const w4On = w4Enabled();
  const estimatedCalls = wave1.length + wave2.length + wave3.length + (w4On ? 8 : 0) + 1 + (tierV2 === "premium" || tierV2 === "investor_memo" ? 1 : 0);

  // ── Phase 1: GATHER ─────────────────────────────────────────────────
  notify("gathering", 5);
  context.gatherResults = await gatherData(context, callAI);
  // Deterministic precompute: phase gate, evidence rows, module outputs.
  context.phaseGate = inferPhase(
    input.phaseId ?? null,
    CRITERIA.map((c) => ({ criterion_key: c.key, quality_level: qualityOf(context.criteriaData[c.key]) })),
    dimScoresOf(context),
  );
  buildEvidenceRows(context);
  context.moduleOutputs = precomputeModules(context);
  emit({
    type: "context",
    industry: input.sviAnalysis.sectorLabel ?? input.sviAnalysis.sector ?? "Unclassified",
    stage: context.stage,
    stageLabel: input.sviAnalysis.stageLabel,
    phaseId: context.phaseGate.currentPhase,
    tier: tierV2,
    estimatedCalls: Math.min(estimatedCalls, budget.max),
    estimatedSeconds: tierV2 === "free" ? 90 : tierV2 === "standard" ? 120 : 180,
  });
  emit({ type: "gather_complete", evidenceRows: context.evidenceRows?.length ?? 0, connectors: Object.keys(context.gatherResults) });

  // ── Phase 2: ANALYZE ────────────────────────────────────────────────
  // Every agent call is schema-validated and audit-logged to ai_runs.
  const dispatchOpts: DispatchOptions = {
    purpose: "customer_report",
    businessId: input.projectId ?? null,
    userId: input.userId,
    tierV2,
    callBudget: budget,
    budgetOk: monthlyOk,
    ...(input.dispatchOptions ?? {}),
  };

  // Wave 1: Independent analyses
  notify("wave1", 15);
  await dispatchWave(wave1, context, input.tier, callAI, dispatchOpts);

  // Wave 2: Depends on Wave 1
  if (wave2.length > 0) {
    notify("wave2", 45);
    await dispatchWave(wave2, context, input.tier, callAI, dispatchOpts);
  }

  // Wave 3: Depends on Wave 1 + 2 (may be empty when evidenceCompleteness < 0.5)
  if (wave3.length > 0) {
    notify("wave3", 75);
    await dispatchWave(wave3, context, input.tier, callAI, dispatchOpts);
  }

  // ── Wave 4: dimension chapters (8 owners in parallel) ───────────────
  if (w4On) {
    notify("wave4", 80);
    DIM_ORDER.forEach((dim) => emit({ type: "dimension_start", dim, ownerAgent: DIMENSION_OWNERS[dim].primary }));
    if (!monthlyOk() || budget.remaining === 0) {
      deterministicDimensionChapters(context, tierV2, budget.remaining === 0 ? `budget: report call cap (${budget.max}) reached before W4` : "budget: monthly AI cap reached before W4");
      context.dimensionChapters?.forEach((chapter, dim) => {
        emit({ type: "error", dim, message: chapter.degradeReason ?? "degraded", degraded: true });
        emit({ type: "dimension_complete", dim, chapter });
      });
    } else {
      await dispatchDimensionChapters(context, input.tier, callAI, {
        ...dispatchOpts,
        onChapter: (dim, chapter) => {
          if (chapter.degraded) emit({ type: "error", dim, message: chapter.degradeReason ?? "degraded", degraded: true });
          emit({ type: "dimension_complete", dim, chapter });
        },
      });
    }
    emit({ type: "criteria_synthesis", criteria: criterionCardsFromChapters(context) });
  }

  // ── Phase 3: SYNTHESIZE ─────────────────────────────────────────────
  notify("synthesizing", 85);

  // CDO cross-validation: one LLM call at premium+ (§B.9); deterministic elsewhere.
  context.consistencyIssues =
    tierV2 === "premium" || tierV2 === "investor_memo"
      ? await crossValidate(context, callAI)
      : deterministicConsistencyIssues(context);

  // CEO executive summary
  context.executiveSummary = await generateExecutiveSummary(context, callAI);
  emit({ type: "executive_complete", summary: context.executiveSummary });

  // LLM Auditor (ported from Google Agent Garden llm-auditor sample) —
  // §5.4 grounding sweep over EVERY section (executive summary + chapters +
  // criterion sections). Fully fail-safe and metered.
  const audit = await auditAllSections(context, tierV2, callAI, {
    budgetOk: () => monthlyOk() && budget.remaining >= 2,
  });
  context.executiveSummary = audit.executiveSummary;
  context.auditFindings = audit.findings;
  context.sectionAudits = audit.records;
  emit({ type: "audit_complete", groundedShare: audit.groundedShare, revised: audit.records.filter((r) => r.revised).length });

  context.qualityScore = computeFinalQuality(context);
  context.callsUsed = budget.used;

  // ── Assemble ────────────────────────────────────────────────────────
  notify("rendering", 95);
  const report = assembleReport(context, input.tier, reportId);
  report.llmCalls = budget.used;
  const reportV2 = buildReportV2(report, context, input, tierV2, audit.groundedShare);
  if (reportV2) {
    report.reportV2 = reportV2;
    emit({ type: "valuation_complete", chapter: reportV2.valuation });
  }

  // W2 review P1: a report whose 8 chapters ALL degraded to deterministic
  // cards and whose summary is the error placeholder is not a product. D9
  // says the orchestrator itself never fails on budget, so it only FLAGS the
  // report; the persisting callers (paywall generator, run-for-project) turn
  // the flag into their failure path (retry tick / refund) instead of storing
  // `complete` and charging A$3.
  report.fullyDegraded = isFullyDegraded(report, context.dimensionChapters);

  notify("complete", 100);
  const sonnetCalls = w4On && (process.env.MODEL_AGENT_CEO || process.env.MODEL_AGENT_CFO) && tierV2 !== "free" ? 2 : 0;
  emit({
    type: "done",
    reportId,
    totalMs: Date.now() - t0,
    calls: budget.used,
    costAud: Math.round(((budget.used - sonnetCalls) * COST_AUD_PER_CALL.free_chain + sonnetCalls * COST_AUD_PER_CALL.sonnet_class) * 1000) / 1000,
    degradedSections: reportV2?.quality.degradedSections ?? [],
  });
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


// ── Deterministic consistency (CDO at standard / free) ──────────────────────

/**
 * Score-consistency issues without an LLM: a chapter whose owner score sits
 * more than 15 points from the mean of its mapped criterion scores, or a
 * chapter reconciled by the ±10 clamp. Premium+ additionally runs the CDO
 * LLM cross-validate (`crossValidate`).
 */
export function deterministicConsistencyIssues(context: ReportContext): string[] {
  const issues: string[] = [];
  context.dimensionChapters?.forEach((chapter, dim) => {
    const scores = criteriaForDimension(dim)
      .map((k) => context.criterionResults.get(k)?.score)
      .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
    if (scores.length) {
      const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
      if (Math.abs(mean - chapter.score) > 15) {
        issues.push(`${dim.toUpperCase()} chapter score ${chapter.score} differs from its criterion mean ${Math.round(mean)} by more than 15 points — check the evidence behind the higher figure.`);
      }
    }
    if (chapter.scoreNote) issues.push(`${dim.toUpperCase()}: ${chapter.scoreNote}`);
  });
  return issues.slice(0, 5);
}

// ── CEO Executive Summary ───────────────────────────────────────────────────

async function generateExecutiveSummary(
  context: ReportContext,
  callAI: AICaller,
): Promise<string> {
  const summaries = [...context.criterionResults.entries()]
    .map(([key, result]) => `**${key}** (${result.score}/100): ${result.highlights.slice(0, 2).join("; ")}`)
    .join("\n");
  const chapters = context.dimensionChapters
    ? [...context.dimensionChapters.values()].map((c) => `**${c.dim.toUpperCase()}** ${c.score}/100 (${c.band}): ${c.verdict}`).join("\n")
    : "";
  const gate = context.phaseGate;
  const phaseNow = gate
    ? `\nPhase now: ${gate.currentPhaseLabel} (${gate.completionPct}% of the exit gate cleared)${gate.blockers.length ? `; blockers: ${gate.blockers.map((b) => b.detail).join("; ")}` : "; no blockers"}${gate.nextPhase ? `; next phase ${gate.nextPhase}` : ""}`
    : "";

  const systemPrompt = buildAgentPrompt("ceo", context, { phaseId: gate?.currentPhase });
  const userPrompt = `## Executive Summary Generation

Based on ALL 13 criterion analyses below, write a comprehensive Executive Summary (500-800 words).

${summaries}
${chapters ? `\n## Dimension chapter verdicts (owner agents)\n${chapters}\n` : ""}
SVI Score: ${context.sviAnalysis.totalSVI}
Stage: ${context.sviAnalysis.stageLabel}${phaseNow}
${context.consistencyIssues?.length ? `\nConsistency Issues:\n${context.consistencyIssues.join("\n")}` : ""}

Include:
1. One-paragraph startup overview
2. Investment thesis: top 3 reasons to back this startup
3. Top 3 critical gaps
4. Stage-appropriate benchmarks
5. Overall verdict and next milestone${gate ? "\n6. Phase now: the current growth phase, its blockers (exactly the ones listed above) and what clears the gate" : ""}`;

  try {
    // CEO final synthesis — the one call routed to Opus 5 on the quality tier.
    return await callAI(systemPrompt, userPrompt, 2000, "synthesis");
  } catch {
    return `## Executive Summary\n\n**${context.startupName}** — SVI Score: ${context.sviAnalysis.totalSVI} (${context.sviAnalysis.stageLabel})\n\n*Executive summary generation encountered an error. Please refer to individual section analyses below.*`;
  }
}

// ── LLM Auditor (Agent Garden pattern) ──────────────────────────────────────

/**
 * §5.4 grounding sweep — G8, extended to the W4 chapters (§C.9 gate 2).
 *
 * Runs over the executive summary, every dimension chapter (verdict +
 * strengths + gaps, id `dim:<key>`) and every criterion section. Two stages
 * (see llm-auditor.ts): a free deterministic citation gate on every section,
 * then a metered critic→reviser LLM pass capped per tier
 * (`AUDITOR_CAP_BY_TIER`: free 4, standard 8, premium / investor_memo 16).
 * Standard + free only send sections the free gate flagged. The per-report
 * call budget and the monthly ai-client budget both short-circuit the LLM
 * pass; the free gate still runs, so no section is ever reported as grounded
 * without having been checked. `groundedShare` = grounded sections / all.
 */
async function auditAllSections(
  context: ReportContext,
  tierV2: ReportTierV2,
  callAI: (systemPrompt: string, userPrompt: string, maxTokens: number) => Promise<string>,
  opts: { budgetOk?: () => boolean } = {},
): Promise<{ executiveSummary: string; findings: string[]; records: SectionAuditRecord[]; groundedShare: number }> {
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
  context.dimensionChapters?.forEach((chapter, dim) => {
    sections.push({
      id: `dim:${dim}`,
      title: chapter.title,
      content: [chapter.verdict, ...chapter.strengths.map((s) => `- ${s}`), ...chapter.gaps.map((g) => `- ${g}`)].join("\n"),
      allowedEvidenceIds: chapter.evidence.map((e) => e.evidence_id),
    });
  });
  context.criterionResults.forEach((result, key) => {
    sections.push({
      id: key,
      title: key,
      content: result.content,
      allowedEvidenceIds: buildEvidenceCatalogue(key, context).map((e) => e.evidence_id),
    });
  });

  const fullSweep = tierV2 === "premium" || tierV2 === "investor_memo";
  const budgetOk =
    opts.budgetOk ??
    (() => {
      const b = getAIBudgetStatus();
      return b.spent < b.limit;
    });

  const outcomes = await auditSections(sections, evidence, callAI, {
    llmOnlyWhenUncited: !fullSweep,
    maxLlmSections: AUDITOR_CAP_BY_TIER[tierV2],
    budgetOk,
    maxTokens: 2000,
  });

  const originals = new Map(sections.map((s) => [s.id, s.content]));
  const findings: string[] = [];
  const records: SectionAuditRecord[] = [];
  let executiveSummary = draft;
  const at = new Date().toISOString();

  outcomes.forEach((o) => {
    const revised = o.revised !== originals.get(o.sectionId);
    records.push({ sectionId: o.sectionId, uncitedClaims: o.uncitedClaims, findings: o.findings, revised, grounded: o.grounded, skipped: o.skipped });
    o.findings.forEach((f) => findings.push(`[${o.sectionId}] ${f}`));
    o.uncitedClaims.slice(0, 2).forEach((c) => findings.push(`[${o.sectionId}] uncited claim: ${c}`));

    if (o.sectionId === "executive") {
      executiveSummary = o.revised;
      return;
    }
    if (o.sectionId.startsWith("dim:")) {
      // Chapters are structured: stamp the audit, never splice revised prose back into fields.
      const chapter = context.dimensionChapters?.get(o.sectionId.slice(4) as DimKey);
      if (chapter) chapter.audit = { grounded: o.grounded, uncited: o.uncitedClaims.length, revised, auditor: "llm-auditor", at };
      return;
    }

    // Downgrade + flag — never silently publish an ungrounded section.
    const result = context.criterionResults.get(o.sectionId as CriterionKey);
    if (!result) return;
    result.content = o.revised;
    result.grounded = o.grounded;
    if (!o.grounded) {
      result.confidence = Math.round(result.confidence * 0.7 * 100) / 100;
      result.risks = [
        `Grounding: ${o.uncitedClaims.length} claim(s) in this section are not backed by a cited evidence id — verify before relying on the figures.`,
        ...result.risks,
      ];
    }
  });

  const groundedShare = records.length ? Math.round((records.filter((r) => r.grounded).length / records.length) * 100) / 100 : 0;
  return { executiveSummary, findings: findings.slice(0, 24), records, groundedShare };
}

// ── ReportV2 projection ─────────────────────────────────────────────────────

/** The 13 criterion cards as the W4 chapters carry them (SSE `criteria_synthesis`). */
export function criterionCardsFromChapters(context: ReportContext): CriterionCard[] {
  const seen = new Map<CriterionKey, CriterionCard>();
  DIM_ORDER.forEach((dim) => {
    context.dimensionChapters?.get(dim)?.criteria.forEach((card) => {
      if (!seen.has(card.key)) seen.set(card.key, card);
    });
  });
  return CRITERIA.map((c) => seen.get(c.key)).filter((c): c is CriterionCard => Boolean(c));
}

/**
 * ReportV2 with the pipeline chapters: the S-R1 adapter builds the document
 * from the AssembledReport, then the W4 chapters, evidence register, audit
 * log and quality fields replace the read-time derivations. Validated; an
 * invalid projection logs and returns null (the caller keeps the adapter
 * path) — never a failed report.
 */
export function buildReportV2(report: AssembledReport, context: ReportContext, input: OrchestratorInput, tierV2: ReportTierV2, groundedShare: number): ReportV2 | null {
  try {
    const base = fromAssembledReport(report, {
      projectId: input.projectId,
      accountId: input.accountId,
      startupName: input.startupName,
      industry: input.sviAnalysis.sectorLabel ?? input.sviAnalysis.sector ?? null,
      stageLabel: input.sviAnalysis.stageLabel,
      stage: input.sviAnalysis.stage,
      sviTotal: input.sviAnalysis.totalSVI,
      dimensionScores: input.sviAnalysis.dimensionScores ?? null,
      subs: input.sviAnalysis.subs,
      phaseId: context.phaseGate?.currentPhase ?? null,
      tier: tierV2,
      locale: context.locale,
    });
    const chapters = context.dimensionChapters;
    if (!chapters || chapters.size !== 8) return base;
    const dimensions = DIM_ORDER.map((dim) => chapters.get(dim)!);
    const degraded = dimensions.filter((d) => d.degraded).map((d) => d.dim);
    const v2: ReportV2 = {
      ...base,
      source: "pipeline",
      pipelineVersion: "pipeline-v2.0-w4",
      promptVersionIds: {},
      dimensions,
      executive: { ...base.executive, phaseNow: context.phaseGate ?? base.executive.phaseNow, thesis: context.executiveSummary?.trim() || base.executive.thesis, audit: { ...base.executive.audit, grounded: (context.sectionAudits ?? []).some((r) => r.sectionId === "executive" && r.grounded) } },
      appendix: { ...base.appendix, evidenceRegister: context.evidenceRows ?? [], auditLog: context.sectionAudits ?? [] },
      quality: { ...base.quality, score: context.qualityScore ?? base.quality.score, groundedShare, degradedSections: degraded },
    };
    if (isReportV2(v2)) return v2;
    console.warn("[report-pipeline] ReportV2 projection failed validation — keeping the adapter projection");
    return base;
  } catch (err) {
    console.warn("[report-pipeline] ReportV2 projection threw:", err instanceof Error ? err.message : String(err));
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function qualityOf(data: CriterionData | undefined): QualityLevel {
  const q = data?.qualityLevel;
  return (QUALITY_LEVELS as readonly string[]).includes(q ?? "") ? (q as QualityLevel) : "incomplete";
}

function dimScoresOf(context: ReportContext): Partial<Record<DimKey, number>> {
  const out: Partial<Record<DimKey, number>> = {};
  DIM_ORDER.forEach((dim) => {
    const v = context.sviAnalysis.dimensionScores?.[dim] ?? context.sviAnalysis.subs?.find((s) => s.key === dim)?.value;
    if (typeof v === "number" && Number.isFinite(v)) out[dim] = Math.round(v);
  });
  return out;
}
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
