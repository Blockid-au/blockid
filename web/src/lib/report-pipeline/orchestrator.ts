// Report Orchestrator — the ONE generator every Trusted Business Report ships
// through (spec 12-product-ai-tbr-v2.md §C.1, S-R3: the stream route, the
// paid A$3 report, the evaluator report and the per-dimension re-run all
// call `orchestrateReport` / `runReportPipeline`).
//
// Waves:
//   GATHER  — parallel data collection (report-pipeline/gather.ts §C.3):
//             market research (2 metered LLM calls), tech + repo audits
//             (20 s timeout, 24 h cache), connector snapshots from the last
//             sync, cap-table register, grants match, CFO valuation inputs;
//             every result is an EvidenceRow. Deterministic precompute
//             (phase gate, module outputs, valuation chapter) follows.
//   W1/W2/W3 — criterion calls (13 max; W3 skipped on free / thin evidence
//             unless the criterion is phase-required)
//   W4      — 8 dimension-owner chapter calls in parallel (DimensionChapter
//             Zod payload, one repair, then a deterministic `degraded` card)
//   SYNTH   — CEO executive summary (1 call); CDO cross-validate is one LLM
//             call at premium+, deterministic consistency checks otherwise
//   AUDIT   — llm-auditor over executive + chapters + criteria, tier cap,
//             critic passes in parallel
//   GATES   — §C.9 deterministic consistency checks (consistency-gates.ts)
//   ASSEMBLE — AssembledReport (legacy sections) + ReportV2 with the W4
//             chapters + the 6-method valuation chapter (§C.5)
//
// Cost guardrails (goal doc §3 D7/D8/D9): a per-report call counter hard-stops
// at the tier max (free 16 / standard 30 / premium 40 / investor_memo 48);
// past the stop every remaining stage degrades to deterministic output —
// a report never fails on budget. `REPORT_PIPELINE_W4=off` rolls back to the
// 13-criteria assembly (the S-R1 adapter still renders a ReportV2 on read).
//
// Wall-clock deadline (W2 review (a)): the orchestration is raced against a
// per-tier deadline (free 90 s / standard 120 s / premium 240 s /
// investor_memo 240 s, `REPORT_DEADLINE_MS_<TIER>` overrides). Past it every
// remaining stage degrades deterministically and in-flight LLM calls are
// dropped, so the `done` event always fires before deadline + grace — nginx
// caps `/api/` at 300 s and the client must never wait longer. The only
// failure a caller ever sees is a FULLY degraded report (`isFullyDegraded`).
//
// Cost telemetry (W2 review (b)): `callAI` may return `{ text, costUsd,
// provider, model }`; the meter sums the REAL cost the provider chain
// reported and the `done` event carries it (`costAud`), written to
// ai-spend-daily.json per tier by spend-guard.recordReportSpend.
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
  CriterionData,
  AgentRole,
  SectionAuditRecord,
  AgentAnalysisResult,
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
import { getAIBudgetStatus } from "@/lib/ai-client";
import { DIM_ORDER, DIMENSION_OWNERS, criteriaForDimension, type DimKey } from "./dimension-owners";
import { precomputeModules } from "./module-precompute";
import { GATHER_RESEARCH_CALLS, gatherData, type GatherDeps, type GatherOutput } from "./gather";
import { buildValuationChapter, type ValuationAskInput, type VcValuationLike } from "./valuation-chapter";
import { applyConsistencyGates } from "./consistency-gates";
import { fromAssembledReport, inferPhase } from "@/lib/report-v2/adapter";
import { isReportV2, type CriterionCard, type DimensionChapter, type ReportTierV2, type ReportV2 } from "@/lib/report-v2/schema";

// ── AI caller contract ──────────────────────────────────────────────────────

/** Rich result a caller MAY return from `callAI` so the pipeline can meter real cost (W2 review (b)). */
export interface AICallerResult {
  text: string;
  /** USD the provider chain reported (0 for free tiers). */
  costUsd?: number;
  /** Dispatcher provider that served the call (`deepinfra`, `claude-apikey`, …). */
  provider?: string;
  model?: string;
}

export type AITaskClass = "classify" | "report" | "synthesis";

/** What callers inject: a plain string or the rich result. */
export type AICallerInput = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: AITaskClass) => Promise<string | AICallerResult>;

// Internal: every stage sees a string transport (metered, deadline-aware).
type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: AITaskClass) => Promise<string>;

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

// ── Cost meter (W2 review (b)) ──────────────────────────────────────────────

/** Sums the real per-call cost the transport reported; `reported` = calls that carried a cost. */
export class CostMeter {
  totalUsd = 0;
  reported = 0;
  readonly byProvider: Record<string, number> = {};
  record(r: AICallerResult): void {
    if (typeof r.costUsd !== "number" || !Number.isFinite(r.costUsd)) return;
    this.reported += 1;
    this.totalUsd += Math.max(0, r.costUsd);
    const p = r.provider ?? "unknown";
    this.byProvider[p] = (this.byProvider[p] ?? 0) + Math.max(0, r.costUsd);
  }
}

/** Rough per-call AUD used ONLY for calls whose transport reported no cost (free chain ≈ US$0.0006; Sonnet-class ≈ US$0.03). */
const COST_AUD_PER_CALL = { free_chain: 0.001, sonnet_class: 0.045 } as const;

// ── Wall-clock deadline (W2 review (a)) ─────────────────────────────────────

/** Per-tier deadline in ms (§C.8 latency targets); env `REPORT_DEADLINE_MS_<TIER>` overrides. */
export const TIER_DEADLINE_MS: Record<ReportTierV2, number> = { free: 90_000, standard: 120_000, premium: 240_000, investor_memo: 240_000 };
/** Deterministic tail budget after the deadline (assemble + persist) — `done` fires within deadline + grace. */
export const DEADLINE_GRACE_MS = 5_000;

export function deadlineMsForTier(tier: ReportTierV2): number {
  const env = process.env[`REPORT_DEADLINE_MS_${tier.toUpperCase()}`];
  const n = env ? Number(env) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : TIER_DEADLINE_MS[tier];
}

export class ReportDeadlineExceededError extends Error {
  constructor(readonly ms: number) {
    super(`Report wall-clock deadline exceeded (${ms} ms) — remaining stages degraded`);
    this.name = "ReportDeadlineExceededError";
  }
}

/** A single timer the stages race against; `expired()` flips once and stays. */
export class ReportDeadline {
  private hit = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  readonly promise: Promise<"deadline">;
  constructor(readonly ms: number, private readonly startedAt: number = Date.now()) {
    this.promise = new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.hit = true;
        resolve("deadline");
      }, ms);
    });
  }
  expired(): boolean {
    return this.hit;
  }
  remainingMs(now: number = Date.now()): number {
    return Math.max(0, this.startedAt + this.ms - now);
  }
  /** Resolve `work` or the deadline, whichever first; the loser keeps running but its result is dropped. */
  race<T>(work: Promise<T>): Promise<T | "deadline"> {
    return Promise.race([work, this.promise]);
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

/**
 * Wrap a callAI so every call draws from the budget, records real cost and
 * refuses to start once the deadline has passed. Throws once exhausted /
 * expired — the dispatchers turn the throw into a deterministic card.
 */
export function meterCallAI(callAI: AICallerInput, budget: ReportCallBudget, opts: { meter?: CostMeter; deadline?: ReportDeadline } = {}): AICaller {
  return async (system, user, maxTokens, taskClass) => {
    if (opts.deadline?.expired()) throw new ReportDeadlineExceededError(opts.deadline.ms);
    if (!budget.tryAcquire()) throw new CallBudgetExceededError(budget.max);
    const out = await callAI(system, user, maxTokens, taskClass);
    if (typeof out === "string") return out;
    opts.meter?.record(out);
    return out.text;
  };
}

// ── Events (§C.12 SSE vocabulary) ───────────────────────────────────────────

export type PipelineEvent =
  | { type: "context"; industry: string; stage: number; stageLabel: string; phaseId: string; tier: ReportTierV2; estimatedCalls: number; estimatedSeconds: number; dims: DimKey[] }
  | { type: "gather_complete"; evidenceRows: number; connectors: string[]; diagnostics?: Record<string, { ms: number; status: string; note?: string }> }
  | { type: "dimension_start"; dim: DimKey; ownerAgent: AgentRole }
  | { type: "dimension_complete"; dim: DimKey; chapter: DimensionChapter }
  | { type: "valuation_complete"; chapter: ReportV2["valuation"] }
  | { type: "criteria_synthesis"; criteria: CriterionCard[] }
  | { type: "executive_complete"; summary: string }
  | { type: "audit_complete"; groundedShare: number; revised: number }
  | { type: "progress"; completed: number; total: number; phase: PipelinePhase }
  | { type: "done"; reportId: string; totalMs: number; calls: number; costAud: number; costUsd: number; costReportedCalls: number; degradedSections: string[]; deadlineHit: boolean }
  | { type: "error"; dim?: DimKey; message: string; degraded: true };

export type PipelineEventHandler = (event: PipelineEvent) => void;

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  accountId: string;
  userId: string;
  projectId?: string;
  /** app_users.id of the project OWNER (connector signals / cap table key). Defaults to `userId`. */
  ownerUserId?: string | null;
  startupName: string;
  rawText: string;
  sviAnalysis: import("@/lib/svi-analysis").SVIAnalysis;
  evidenceItems: import("@/lib/svi-analysis").EvidenceItem[];
  criteriaData: Record<CriterionKey, CriterionData>;
  tier: ReportTier;
  /** ReportV2 tier; "free" turns W3 off, chapters 6–9 into cards and caps calls at 16. Defaults to `tier`. */
  tierV2?: ReportTierV2;
  locale?: "en" | "vi";
  callAI: AICallerInput;
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
  /** Override the wall-clock deadline in ms (tests). Defaults to deadlineMsForTier(tierV2). */
  deadlineMs?: number;
  /** Explicit growth phase (projects.growth_phase_current); inferred from criteria + dims otherwise. */
  phaseId?: string | null;
  /**
   * Optional intake context. When provided and `DYNAMIC_WAVES !== "false"`,
   * the orchestrator swaps the static WAVE_1/2/3 for phase-tuned waves via
   * `selectAgentsForContext`. Kept optional so every existing caller keeps
   * the legacy behaviour without a code change.
   */
  context?: IntakeContext;
  /**
   * S-R3 per-dimension re-run: only these W4 chapters are generated; W1–W3
   * are reused from `seedCriteria` (the stored criterion cards) instead of
   * being re-run, and the CEO / auditor stages are skipped.
   */
  dims?: DimKey[];
  /** Stored criterion cards (svi_snapshots.criterion_results) seeded as W1–W3 results for a partial run. */
  seedCriteria?: CriterionCard[] | null;
  /** GATHER I/O overrides (tests, evaluator batch). */
  gatherDeps?: GatherDeps;
  /** Skip the spend-guard ledger write (tests). */
  recordSpend?: boolean;
}

function w4Enabled(): boolean {
  return (process.env.REPORT_PIPELINE_W4 ?? "on").toLowerCase() !== "off";
}

/**
 * The GATHER market-research agent (2 LLM calls) runs on paid tiers and full
 * runs only: the free tier's 16-call cap is exactly W1 (6) + W4 (8) + CEO (1)
 * with one unit spare, and a partial re-run reuses the stored criteria.
 */
export function researchEnabled(tierV2: ReportTierV2, partial: boolean): boolean {
  return !partial && tierV2 !== "free";
}

/** Expected LLM calls for a run — the `context.estimatedCalls` figure (includes the GATHER research calls where they run). */
export function estimateCalls(args: { waves: number; w4Chapters: number; tierV2: ReportTierV2; partial: boolean }): number {
  if (args.partial) return args.w4Chapters;
  return (researchEnabled(args.tierV2, args.partial) ? GATHER_RESEARCH_CALLS : 0) + args.waves + args.w4Chapters + 1 + (args.tierV2 === "premium" || args.tierV2 === "investor_memo" ? 1 : 0);
}

// ── Orchestrate ─────────────────────────────────────────────────────────────

export async function orchestrateReport(input: OrchestratorInput): Promise<AssembledReport> {
  const reportId = generateReportId();
  const startedAt = new Date().toISOString();
  const t0 = Date.now();
  const tierV2: ReportTierV2 = input.tierV2 ?? input.tier;
  const budget = new ReportCallBudget(input.maxCalls ?? TIER_CALL_MAX[tierV2]);
  const meter = new CostMeter();
  const deadline = new ReportDeadline(input.deadlineMs ?? deadlineMsForTier(tierV2), t0);
  const callAI = meterCallAI(input.callAI, budget, { meter, deadline });
  const partialDims = input.dims && input.dims.length ? DIM_ORDER.filter((d) => input.dims!.includes(d)) : null;
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
    dimsFilter: partialDims ?? undefined,
  };
  if (partialDims && input.seedCriteria?.length) seedCriterionResults(context, input.seedCriteria);

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
  const w4Dims: DimKey[] = partialDims ?? [...DIM_ORDER];
  const estimatedCalls = estimateCalls({ waves: wave1.length + wave2.length + wave3.length, w4Chapters: w4On ? w4Dims.length : 0, tierV2, partial: Boolean(partialDims) });

  try {
    // ── Phase 1: GATHER ─────────────────────────────────────────────────
    // The phase gate is deterministic on the stored criteria + dims, so the
    // `context` event goes out BEFORE the (slow) gather so the client can
    // render the header / estimate immediately.
    context.phaseGate = inferPhase(
      input.phaseId ?? null,
      CRITERIA.map((c) => ({ criterion_key: c.key, quality_level: qualityOf(context.criteriaData[c.key]) })),
      dimScoresOf(context),
    );
    emit({
      type: "context",
      industry: input.sviAnalysis.sectorLabel ?? input.sviAnalysis.sector ?? "Unclassified",
      stage: context.stage,
      stageLabel: input.sviAnalysis.stageLabel,
      phaseId: context.phaseGate.currentPhase,
      tier: tierV2,
      estimatedCalls: Math.min(estimatedCalls, budget.max),
      estimatedSeconds: Math.round(deadline.ms / 1000),
      dims: w4Dims,
    });
    notify("gathering", 5);
    const gathered = await deadline.race(
      gatherData(context, callAI, {
        ownerUserId: input.ownerUserId ?? input.userId,
        projectId: input.projectId ?? null,
        skipResearch: !researchEnabled(tierV2, Boolean(partialDims)),
        deadline,
        deps: input.gatherDeps,
      }),
    );
    const gather: GatherOutput = gathered === "deadline" ? { results: { diagnostics: { gather: { ms: deadline.ms, status: "timeout", note: "deadline" } } }, evidenceRows: [], valuation: { vc: null, ask: null, revenueEvidenceIds: [] } } : gathered;
    context.gatherResults = gather.results;
    context.gatherEvidenceRows = gather.evidenceRows;
    // Deterministic precompute: evidence rows, module outputs, valuation chapter.
    buildEvidenceRows(context);
    context.moduleOutputs = precomputeModules(context);
    context.valuationChapter = valuationChapterFor(gather.valuation, input, context) ?? undefined;
    emit({ type: "gather_complete", evidenceRows: context.evidenceRows?.length ?? 0, connectors: Object.keys(context.gatherResults).filter((k) => k !== "diagnostics"), diagnostics: context.gatherResults.diagnostics });

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

    if (!partialDims) {
      // Wave 1: Independent analyses
      notify("wave1", 15);
      if (!deadline.expired()) await deadline.race(dispatchWave(wave1, context, input.tier, callAI, dispatchOpts));

      // Wave 2: Depends on Wave 1
      if (wave2.length > 0 && !deadline.expired()) {
        notify("wave2", 45);
        await deadline.race(dispatchWave(wave2, context, input.tier, callAI, dispatchOpts));
      }

      // Wave 3: Depends on Wave 1 + 2 (may be empty when evidenceCompleteness < 0.5)
      if (wave3.length > 0 && !deadline.expired()) {
        notify("wave3", 75);
        await deadline.race(dispatchWave(wave3, context, input.tier, callAI, dispatchOpts));
      }
    }

    // ── Wave 4: dimension chapters (8 owners in parallel) ───────────────
    if (w4On) {
      notify("wave4", 80);
      w4Dims.forEach((dim) => emit({ type: "dimension_start", dim, ownerAgent: DIMENSION_OWNERS[dim].primary }));
      const degradeAll = (reason: string) => {
        const all = deterministicDimensionChapters(context, tierV2, reason);
        all.forEach((chapter, dim) => {
          if (!w4Dims.includes(dim)) return;
          emit({ type: "error", dim, message: chapter.degradeReason ?? "degraded", degraded: true });
          emit({ type: "dimension_complete", dim, chapter });
        });
      };
      if (deadline.expired()) {
        degradeAll(`deadline: wall-clock budget (${Math.round(deadline.ms / 1000)} s) reached before W4`);
      } else if (!monthlyOk() || budget.remaining === 0) {
        degradeAll(budget.remaining === 0 ? `budget: report call cap (${budget.max}) reached before W4` : "budget: monthly AI cap reached before W4");
      } else {
        const emitted = new Set<DimKey>();
        const live = new Map<DimKey, DimensionChapter>();
        context.dimensionChapters = live;
        const w4 = deadline.race(
          dispatchDimensionChapters(context, input.tier, callAI, {
            ...dispatchOpts,
            dims: w4Dims,
            onChapter: (dim, chapter) => {
              if (deadline.expired() || emitted.has(dim)) return;
              emitted.add(dim);
              if (chapter.degraded) emit({ type: "error", dim, message: chapter.degradeReason ?? "degraded", degraded: true });
              emit({ type: "dimension_complete", dim, chapter });
            },
          }),
        );
        if ((await w4) === "deadline") {
          // Seal: late chapters keep writing to `live`; the report reads a copy
          // with the missing dims filled deterministically.
          const sealed = new Map<DimKey, DimensionChapter>(live);
          const fallback = deterministicDimensionChapters({ ...context, dimensionChapters: undefined }, tierV2, `deadline: wall-clock budget (${Math.round(deadline.ms / 1000)} s) reached during W4`);
          w4Dims.forEach((dim) => {
            if (sealed.has(dim)) return;
            const chapter = fallback.get(dim)!;
            sealed.set(dim, chapter);
            if (!emitted.has(dim)) {
              emitted.add(dim);
              emit({ type: "error", dim, message: chapter.degradeReason ?? "degraded", degraded: true });
              emit({ type: "dimension_complete", dim, chapter });
            }
          });
          context.dimensionChapters = sealed;
        }
      }
      if (context.valuationChapter) emit({ type: "valuation_complete", chapter: context.valuationChapter });
      emit({ type: "criteria_synthesis", criteria: criterionCardsFromChapters(context) });
    }

    // ── Phase 3: SYNTHESIZE ─────────────────────────────────────────────
    notify("synthesizing", 85);

    // CDO cross-validation: one LLM call at premium+ (§B.9); deterministic elsewhere.
    context.consistencyIssues =
      (tierV2 === "premium" || tierV2 === "investor_memo") && !partialDims && !deadline.expired()
        ? await crossValidate(context, callAI)
        : deterministicConsistencyIssues(context);

    // CEO executive summary — deterministic after the deadline / on a partial run.
    context.executiveSummary =
      partialDims || deadline.expired()
        ? deterministicExecutiveSummary(context, partialDims ? "partial re-run" : "deadline")
        : await generateExecutiveSummary(context, callAI);
    emit({ type: "executive_complete", summary: context.executiveSummary });

    // LLM Auditor (ported from Google Agent Garden llm-auditor sample) —
    // §5.4 grounding sweep over EVERY section (executive summary + chapters +
    // criterion sections). Fully fail-safe and metered; the critic passes run
    // in parallel under the tier cap. After the deadline only the free
    // deterministic citation gate runs.
    const audit = await auditAllSections(context, tierV2, callAI, {
      budgetOk: () => !deadline.expired() && !partialDims && monthlyOk() && budget.remaining >= 2,
    });
    context.executiveSummary = audit.executiveSummary;
    context.auditFindings = audit.findings;
    context.sectionAudits = audit.records;
    emit({ type: "audit_complete", groundedShare: audit.groundedShare, revised: audit.records.filter((r) => r.revised).length });

    // ── §C.9 gate 3: deterministic consistency checks ───────────────────
    const gates = applyConsistencyGates({
      chapters: context.dimensionChapters,
      dimScores: dimScoresOf(context),
      valuation: context.valuationChapter ?? null,
      stage: context.stage,
      evidenceRows: context.evidenceRows ?? [],
      phaseGate: context.phaseGate,
      executiveSummary: context.executiveSummary,
    });
    context.executiveSummary = gates.executiveSummary;
    context.consistencyIssues = [...(context.consistencyIssues ?? []), ...gates.issues.map((i) => i.description)].slice(0, 12);

    context.qualityScore = computeFinalQuality(context);
    context.callsUsed = budget.used;

    // ── Assemble ────────────────────────────────────────────────────────
    notify("rendering", 95);
    const report = assembleReport(context, input.tier, reportId);
    report.llmCalls = budget.used;
    // Gate issues keep their real type / severity on the assembled report.
    const gateDescriptions = new Set(gates.issues.map((i) => i.description));
    report.consistencyIssues = [...report.consistencyIssues.filter((i) => !gateDescriptions.has(i.description)), ...gates.issues];
    const reportV2 = buildReportV2(report, context, input, tierV2, audit.groundedShare, gather.valuation);
    if (reportV2) report.reportV2 = reportV2;

    // W2 review P1: a report whose 8 chapters ALL degraded to deterministic
    // cards and whose summary is the error placeholder is not a product. D9
    // says the orchestrator itself never fails on budget, so it only FLAGS the
    // report; the persisting callers (paywall generator, run-for-project) turn
    // the flag into their failure path (retry tick / refund) instead of storing
    // `complete` and charging A$3.
    report.fullyDegraded = isFullyDegraded(report, context.dimensionChapters);

    notify("complete", 100);
    const cost = realCostAud(meter, budget.used, w4On, tierV2);
    if (input.recordSpend !== false) {
      void recordSpendBestEffort(tierV2, cost.usd, budget.used);
    }
    emit({
      type: "done",
      reportId,
      totalMs: Date.now() - t0,
      calls: budget.used,
      costAud: cost.aud,
      costUsd: cost.usd,
      costReportedCalls: meter.reported,
      degradedSections: reportV2?.quality.degradedSections ?? [],
      deadlineHit: deadline.expired(),
    });
    return report;
  } finally {
    deadline.dispose();
  }
}

// ── Cost telemetry ──────────────────────────────────────────────────────────

/** USD → AUD at the spend-guard FX (AI_USD_AUD_RATE, default 1.55). */
function usdAudRate(): number {
  const raw = process.env.AI_USD_AUD_RATE;
  const n = raw ? Number(raw) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? n : 1.55;
}

/**
 * Real cost when the transport reported it (every metered call carried
 * `costUsd`); the free-chain / Sonnet estimate covers only the calls that
 * did not — a plain-string caller still gets the old estimate.
 */
export function realCostAud(meter: CostMeter, calls: number, w4On: boolean, tierV2: ReportTierV2): { usd: number; aud: number } {
  const unreported = Math.max(0, calls - meter.reported);
  const sonnetCalls = w4On && (process.env.MODEL_AGENT_CEO || process.env.MODEL_AGENT_CFO) && tierV2 !== "free" ? Math.min(2, unreported) : 0;
  const estimatedAud = (unreported - sonnetCalls) * COST_AUD_PER_CALL.free_chain + sonnetCalls * COST_AUD_PER_CALL.sonnet_class;
  const rate = usdAudRate();
  const aud = meter.totalUsd * rate + estimatedAud;
  return { usd: Math.round((meter.totalUsd + estimatedAud / rate) * 10_000) / 10_000, aud: Math.round(aud * 1000) / 1000 };
}

async function recordSpendBestEffort(tier: ReportTierV2, usd: number, calls: number): Promise<void> {
  try {
    const { recordReportSpend } = await import("@/lib/ai/spend-guard");
    recordReportSpend(tier, usd, calls);
  } catch {
    // Telemetry must never fail a report.
  }
}

// ── Partial run seed + deterministic summary ────────────────────────────────

/** Seed W1–W3 results from stored criterion cards so a per-dimension W4 re-run has its inputs. */
export function seedCriterionResults(context: ReportContext, cards: CriterionCard[]): void {
  cards.forEach((card) => {
    if (!CRITERION_KEYS.includes(card.key)) return;
    const def = CRITERIA.find((c) => c.key === card.key);
    const result: AgentAnalysisResult = {
      criterion: card.key,
      agentRole: (card as { ownerAgent?: AgentRole }).ownerAgent ?? DIMENSION_OWNERS[(def?.primaryDimension ?? "tre") as DimKey]?.primary ?? "ceo",
      score: Math.round(card.score),
      content: [card.verdict, ...card.strengths.map((s) => `- ${s}`), ...card.gaps.map((g) => `- ${g}`)].filter(Boolean).join("\n"),
      highlights: card.strengths.slice(0, 3),
      dataPoints: {},
      risks: card.gaps.slice(0, 3),
      nextSteps: card.nextAction ? [card.nextAction] : [],
      visuals: [],
      confidence: 0.6,
      wordCount: card.verdict.split(/\s+/).filter(Boolean).length,
      durationMs: 0,
      schemaValidated: true,
      grounded: (card.citations ?? []).length > 0,
      citations: card.citations ?? [],
    };
    context.criterionResults.set(card.key, result);
  });
}

/** Executive summary without an LLM (deadline / partial run) — chapter verdicts + phase now, never the error placeholder. */
export function deterministicExecutiveSummary(context: ReportContext, reason: string): string {
  const chapters = context.dimensionChapters ? DIM_ORDER.map((d) => context.dimensionChapters!.get(d)).filter((c): c is DimensionChapter => Boolean(c)) : [];
  const gate = context.phaseGate;
  const lines = [
    `## Executive Summary`,
    ``,
    `**${context.startupName}** — SVI ${context.sviAnalysis.totalSVI} (${context.sviAnalysis.stageLabel}). Deterministic summary (${reason}); the chapter verdicts below are the owner agents' own words.`,
    ``,
    ...chapters.map((c) => `- **${c.dim.toUpperCase()}** ${c.score}/100 (${c.band}): ${c.verdict}`),
  ];
  if (gate) {
    lines.push(``, `**Phase now:** ${gate.currentPhaseLabel} — ${gate.completionPct}% of the exit gate cleared${gate.nextPhase ? `; next phase ${gate.nextPhase}` : ""}.`);
    if (gate.blockers.length) lines.push(...gate.blockers.map((b) => `- ${b.detail}`));
  }
  return lines.join("\n");
}

/** The valuation chapter from the GATHER outputs (§C.5); null when the CFO model did not run. */
function valuationChapterFor(v: GatherOutput["valuation"], input: OrchestratorInput, context: ReportContext): ReportV2["valuation"] | null {
  if (!v.vc) return null;
  try {
    return buildValuationChapter({
      vc: v.vc,
      stage: context.stage,
      stageLabel: input.sviAnalysis.stageLabel,
      industry: input.sviAnalysis.sectorLabel ?? input.sviAnalysis.sector ?? null,
      ask: v.ask,
      revenueEvidenceIds: v.revenueEvidenceIds,
      at: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[report-pipeline] valuation chapter failed:", err instanceof Error ? err.message : String(err));
    return null;
  }
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
/** Bumped whenever the generator's output shape / prompts change — the `svi_deck_cache` key is `deck_hash + pipeline_version`. */
export const PIPELINE_VERSION = "pipeline-v2.1-s-r3";

export function buildReportV2(
  report: AssembledReport,
  context: ReportContext,
  input: OrchestratorInput,
  tierV2: ReportTierV2,
  groundedShare: number,
  valuation?: { vc: VcValuationLike | null; ask: ValuationAskInput | null; revenueEvidenceIds: string[] },
): ReportV2 | null {
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
      vc: valuation?.vc ?? null,
      valuationAsk: valuation?.ask ?? null,
      revenueEvidenceIds: valuation?.revenueEvidenceIds ?? null,
    });
    // §C.5: the gated valuation chapter (consistency-gates may have annotated it).
    const withValuation: ReportV2 = context.valuationChapter ? { ...base, valuation: context.valuationChapter } : base;
    const chapters = context.dimensionChapters;
    if (!chapters || chapters.size !== 8) return withValuation;
    const dimensions = DIM_ORDER.map((dim) => chapters.get(dim)!);
    const degraded = dimensions.filter((d) => d.degraded).map((d) => d.dim);
    const v2: ReportV2 = {
      ...withValuation,
      source: "pipeline",
      pipelineVersion: PIPELINE_VERSION,
      promptVersionIds: {},
      dimensions,
      executive: { ...base.executive, phaseNow: context.phaseGate ?? base.executive.phaseNow, thesis: context.executiveSummary?.trim() || base.executive.thesis, audit: { ...base.executive.audit, grounded: (context.sectionAudits ?? []).some((r) => r.sectionId === "executive" && r.grounded) } },
      appendix: { ...base.appendix, evidenceRegister: context.evidenceRows ?? [], auditLog: context.sectionAudits ?? [] },
      quality: { ...base.quality, score: context.qualityScore ?? base.quality.score, groundedShare, degradedSections: degraded, consistencyIssues: report.consistencyIssues },
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
