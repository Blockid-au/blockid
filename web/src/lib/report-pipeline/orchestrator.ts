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
  refreshComputedFactRows,
  type CallBudget,
  type DispatchOptions,
} from "./agent-dispatcher";
import { selectAgentsForContext } from "./agent-selector";
import { computedFacts, isComputedFactId } from "./computed-facts";
import type { IntakeContext } from "@/lib/intake/detect-context";
import { assembleReport } from "./section-assembler";
import { buildAgentPrompt } from "./agent-prompts";
import { AUDITOR_CAP_BY_TIER, auditSections, type AuditableSection } from "./llm-auditor";
import { autoCite, itemsFromCatalogue, itemsFromEvidenceRows, itemsFromModuleOutputs, type CitableItem } from "./auto-cite";
import { bumpQualityCounter } from "./types";
import { getAIBudgetStatus } from "@/lib/ai-client";
import { DIM_ORDER, DIMENSION_OWNERS, criteriaForDimension, type DimKey } from "./dimension-owners";
import { PIPELINE_VERSION } from "./version";
import { precomputeModules } from "./module-precompute";
import { GATHER_RESEARCH_CALLS, gatherData, type GatherDeps, type GatherOutput } from "./gather";
import { buildValuationChapter, type ValuationAskInput, type VcValuationLike } from "./valuation-chapter";
import { primeComparables } from "@/lib/valuation/comparables-repo.server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { supabaseChapterCache, type ChapterCache, type ChapterCacheDb } from "./chapter-cache";
import { applyConsistencyGates } from "./consistency-gates";
import { executiveFromChapters, fromAssembledReport, inferPhase, type MoneyOnTableInput } from "@/lib/report-v2/adapter";
import { structureExecutive } from "@/lib/report-v2/executive-structure";
import { dispatchExecutiveSummary, executiveOutputContract } from "./executive-summary";
import { isReportV2, type CriterionCard, type DimensionChapter, type ExecutiveStructured, type ReportTierV2, type ReportV2 } from "@/lib/report-v2/schema";
import { FULLY_DEGRADED_MIN_CHAPTERS, recordFullyDegraded, type DegradedEventWriter, type FullyDegradedReason } from "./pipeline-health";
import type { RunDiagnostics } from "./run-diagnostics";
import { w4ReserveMsFor, type PipelineCallHint, type PipelineCallStage } from "./pipeline-timeouts";

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

/** What callers inject: a plain string or the rich result. G28-B: the 5th
 *  argument says which stage the call belongs to (`criterion` W1–W3 /
 *  `chapter` W4 / `synthesis`) and how much of the run's wall clock is left —
 *  the caller maps it to a per-model timeout + call budget
 *  (`pipeline-timeouts.ts`). Legacy callers ignore it. */
export type AICallerInput = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: AITaskClass, hint?: PipelineCallHint) => Promise<string | AICallerResult>;

// Internal: every stage sees a string transport (metered, deadline-aware).
type AICaller = (systemPrompt: string, userPrompt: string, maxTokens: number, taskClass?: AITaskClass) => Promise<string>;

// ── Call budget (D7/D8/D9) ──────────────────────────────────────────────────

/** Hard stop per report, by tier (§C.8). */
export const TIER_CALL_MAX: Record<ReportTierV2, number> = { free: 16, standard: 30, premium: 40, investor_memo: 48 };

/**
 * G19-S46: env `REPORT_CALL_MAX_<TIER>` overrides the hard stop — for the
 * OFFLINE weekly self-report only (scripts/run-self-analysis.mjs --report),
 * where nobody waits and a widened cap costs cents. Interactive routes never
 * set it. Measured 2026-09-20: at the standard cap of 30, W1–W3 (13 criterion
 * calls, ONE repair pass each) plus the 2 research calls consumed every call
 * before W4 whenever ≥ 3 first answers failed the schema — all 8 chapters
 * degraded and the run refunded (`ReportFullyDegradedError`).
 */
export function callMaxForTier(tier: ReportTierV2): number {
  const env = process.env[`REPORT_CALL_MAX_${tier.toUpperCase()}`];
  const n = env ? Number(env) : Number.NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : TIER_CALL_MAX[tier];
}

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
export function isFullyDegraded(
  report: { executiveSummary?: string | null; llmCalls?: number },
  chapters: ReadonlyMap<DimKey, { degraded?: boolean }> | undefined,
  opts: { deadlineHit?: boolean } = {},
): boolean {
  return fullyDegradedReason(report, chapters, opts) !== null;
}

/** Why a report is fully degraded (G15-R3.4 counter), or null when it is usable. Same rules as `isFullyDegraded`. */
export function fullyDegradedReason(
  report: { executiveSummary?: string | null; llmCalls?: number },
  chapters: ReadonlyMap<DimKey, { degraded?: boolean }> | undefined,
  opts: { deadlineHit?: boolean } = {},
): FullyDegradedReason | null {
  if (process.env.REPORT_FAIL_WHEN_FULLY_DEGRADED === "off") return null;
  if (!chapters || chapters.size < DIM_ORDER.length) return null;
  const degradedCount = DIM_ORDER.filter((dim) => chapters.get(dim)?.degraded === true).length;
  if (degradedCount < FULLY_DEGRADED_MIN_CHAPTERS) return null;
  if (degradedCount === DIM_ORDER.length) {
    // Every chapter is a deterministic card. That is "nothing an LLM wrote"
    // when the summary is the error placeholder, when no metered call ever
    // succeeded, or when the wall-clock deadline degraded everything (the
    // deadline summary is deterministic prose, not the placeholder — W3 review P1).
    if (opts.deadlineHit) return "deadline_hit";
    if ((report.llmCalls ?? 0) === 0) return "no_llm_calls";
    if (typeof report.executiveSummary === "string" && report.executiveSummary.includes(SUMMARY_PLACEHOLDER)) return "placeholder_summary";
  }
  // G28-B: ≥ 7 of 8 chapters on deterministic cards is not a product either —
  // one prose chapter beside seven cards reads as an outage, not a report.
  // Not persisted, not charged, one digest line (pipeline-health).
  return "mostly_degraded";
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

/**
 * A single timer the stages race against; `expired()` flips once and stays.
 *
 * G28-B: a second, SOFT deadline at `ms − reserveMs` is what W1–W3 race
 * against — they stop dispatching (and refuse new calls) `reserveMs` before
 * the hard deadline so W4 always has its own window
 * (`pipeline-timeouts.ts` W4 reserve). W4, the summary and the auditor race
 * the hard deadline as before. `reserveMs` 0 → both deadlines coincide.
 */
export class ReportDeadline {
  private hit = false;
  private softHit = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private softTimer: ReturnType<typeof setTimeout> | null = null;
  readonly promise: Promise<"deadline">;
  /** Resolves at `ms − reserveMs` (or with the hard deadline when the reserve is 0). */
  readonly softPromise: Promise<"deadline">;
  readonly reserveMs: number;
  constructor(readonly ms: number, private readonly startedAt: number = Date.now(), reserveMs = 0) {
    this.reserveMs = Math.max(0, Math.min(Math.floor(reserveMs), ms));
    this.promise = new Promise((resolve) => {
      this.timer = setTimeout(() => {
        this.hit = true;
        this.softHit = true;
        resolve("deadline");
      }, ms);
    });
    this.softPromise = this.reserveMs === 0
      ? this.promise
      : new Promise((resolve) => {
          this.softTimer = setTimeout(() => {
            this.softHit = true;
            resolve("deadline");
          }, ms - this.reserveMs);
        });
  }
  expired(): boolean {
    return this.hit;
  }
  /** True once W1–W3 must stop: the W4 reserve has begun (or the hard deadline passed). */
  softExpired(): boolean {
    return this.softHit || this.hit;
  }
  remainingMs(now: number = Date.now()): number {
    return Math.max(0, this.startedAt + this.ms - now);
  }
  /** Wall clock W1–W3 may still use (until the W4 reserve begins). */
  remainingSoftMs(now: number = Date.now()): number {
    return Math.max(0, this.startedAt + this.ms - this.reserveMs - now);
  }
  /** Resolve `work` or the deadline, whichever first; the loser keeps running but its result is dropped. */
  race<T>(work: Promise<T>): Promise<T | "deadline"> {
    return Promise.race([work, this.promise]);
  }
  /** Same as `race` against the soft (W4-reserve) deadline — for W1–W3. */
  raceSoft<T>(work: Promise<T>): Promise<T | "deadline"> {
    return Promise.race([work, this.softPromise]);
  }
  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.softTimer) clearTimeout(this.softTimer);
    this.timer = null;
    this.softTimer = null;
  }
}

/**
 * Wrap a callAI so every call draws from the budget, records real cost and
 * refuses to start once the deadline has passed. Throws once exhausted /
 * expired — the dispatchers turn the throw into a deterministic card.
 */
export function meterCallAI(
  callAI: AICallerInput,
  budget: ReportCallBudget,
  opts: { meter?: CostMeter; deadline?: ReportDeadline; stage?: PipelineCallStage } = {},
): AICaller {
  // G28-B: the stage is bound per caller (one metered caller per stage), so a
  // late W1 repair that fires after W4 started is still a `criterion` call
  // and is refused inside the reserve — never re-labelled as a chapter call.
  const stage: PipelineCallStage = opts.stage ?? "criterion";
  return async (system, user, maxTokens, taskClass) => {
    if (opts.deadline?.expired()) throw new ReportDeadlineExceededError(opts.deadline.ms);
    // G28-B: a criterion call may not start inside the W4 reserve.
    if (stage === "criterion" && opts.deadline?.softExpired()) throw new ReportDeadlineExceededError(opts.deadline.ms - opts.deadline.reserveMs);
    if (!budget.tryAcquire()) throw new CallBudgetExceededError(budget.max);
    const hint: PipelineCallHint = {
      stage,
      ...(opts.deadline ? { remainingMs: stage === "criterion" ? opts.deadline.remainingSoftMs() : opts.deadline.remainingMs() } : {}),
    };
    const out = await callAI(system, user, maxTokens, taskClass, hint);
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
  | { type: "audit_complete"; groundedShare: number; revised: number; /** G24-D: the full per-section audit (scripts/run-self-analysis.mjs --audit-dump); not forwarded on the SSE mapper. */ dump?: AuditDump }
  | { type: "progress"; completed: number; total: number; phase: PipelinePhase }
  | { type: "done"; reportId: string; totalMs: number; calls: number; costAud: number; costUsd: number; costReportedCalls: number; degradedSections: string[]; deadlineHit: boolean; /** G29-B: the wave whose race the deadline (soft W4-reserve or hard) first won — null when neither fired. */ deadlineHitPhase?: PipelinePhase | null; budgetOverruns: number; verdictTrimmed: number; autoCited: number }
  | { type: "error"; dim?: DimKey; message: string; degraded: true }
  /** G29-B: emitted by run-for-project (not the orchestrator) right before a failed run re-throws — the strike ledger + wave timings for the audit dump. */
  | ({ type: "run_diagnostics" } & RunDiagnostics);

export type PipelineEventHandler = (event: PipelineEvent) => void;

// ── Types ───────────────────────────────────────────────────────────────────

export interface OrchestratorInput {
  accountId: string;
  userId: string;
  projectId?: string;
  /** app_users.id of the project OWNER (connector signals / cap table key). Defaults to `userId`. */
  ownerUserId?: string | null;
  /** S-R5 §C.8: chapter cache. `undefined` → the Supabase-backed default; `null` → caching off (tests). */
  chapterCache?: ChapterCache | null;
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
  /** G28-B: override the W4 reserve in ms (tests). Defaults to w4ReserveMsFor(deadlineMs). */
  w4ReserveMs?: number;
  /** Explicit growth phase (projects.growth_phase_current); inferred from criteria + dims otherwise. */
  phaseId?: string | null;
  /** G14-S36: projects.verification_level (0–5) → ReportV2.cover.verification badge; falls back to the analysis' meta, then L0. */
  verificationLevel?: number | null;
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
  /** G15-R3.4: sink for the fully-degraded event (default appends to content/reports/report-pipeline-health.jsonl; tests inject). */
  degradedWriter?: DegradedEventWriter;
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
  const budget = new ReportCallBudget(input.maxCalls ?? callMaxForTier(tierV2));
  const meter = new CostMeter();
  const deadlineMs = input.deadlineMs ?? deadlineMsForTier(tierV2);
  const deadline = new ReportDeadline(deadlineMs, t0, input.w4ReserveMs ?? w4ReserveMsFor(deadlineMs));
  // G28-B: one metered caller per stage over the SAME call budget — the
  // per-model timeout and the W4-reserve refusal live on the stage
  // (pipeline-timeouts.ts). `callAI` = criterion (gather + W1–W3).
  const callAI = meterCallAI(input.callAI, budget, { meter, deadline, stage: "criterion" });
  const callAIChapter = meterCallAI(input.callAI, budget, { meter, deadline, stage: "chapter" });
  const callAISynthesis = meterCallAI(input.callAI, budget, { meter, deadline, stage: "synthesis" });
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
    verificationLevel: input.verificationLevel ?? input.sviAnalysis.meta?.verification?.level ?? null,
    gatherResults: {},
    criterionResults: new Map(),
    dimsFilter: partialDims ?? undefined,
  };
  if (partialDims && input.seedCriteria?.length) seedCriterionResults(context, input.seedCriteria);

  // G29-B: the wave whose wall-clock race the deadline (soft or hard) first won — `done.deadlineHitPhase`.
  let currentPhase: PipelinePhase = "gathering";
  let deadlineHitPhase: PipelinePhase | null = null;
  const markDeadline = () => {
    if (deadlineHitPhase === null) deadlineHitPhase = currentPhase;
  };
  const notify = (phase: PipelinePhase, progress: number, currentAgent?: AgentRole) => {
    currentPhase = phase;
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
    // S-R5: warm the AU comparables cache (verified table rows, static
    // fallback) so the sync valuation-chapter builder below cites live N.
    await primeComparables().catch(() => undefined);
    const gathered = await deadline.race(
      gatherData(context, callAI, {
        ownerUserId: input.ownerUserId ?? input.userId,
        projectId: input.projectId ?? null,
        skipResearch: !researchEnabled(tierV2, Boolean(partialDims)),
        deadline,
        deps: { ...(input.gatherDeps ?? {}), deadlineRemainingMs: () => deadline.remainingMs() },
      }),
    );
    if (gathered === "deadline") markDeadline();
    const gather: GatherOutput = gathered === "deadline" ? { results: { diagnostics: { gather: { ms: deadline.ms, status: "timeout", note: "deadline" } } }, evidenceRows: [], valuation: { vc: null, ask: null, revenueEvidenceIds: [] } } : gathered;
    context.gatherResults = gather.results;
    context.gatherEvidenceRows = gather.evidenceRows;
    // Deterministic precompute: evidence rows, module outputs, valuation chapter.
    buildEvidenceRows(context);
    context.moduleOutputs = precomputeModules(context);
    context.valuationChapter = valuationChapterFor(gather.valuation, input, context) ?? undefined;
    // G24-D: the computed rows (SVI scores, benchmarks, valuation consensus)
    // re-stamped now that the valuation chapter exists.
    refreshComputedFactRows(context);
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
      // G28-B: W1–W3 results that land inside the W4 reserve are dropped
      // (W4 has started); W4 itself overrides this with the hard deadline.
      isExpired: () => deadline.softExpired(),
      // §C.8 chapter-level cache (S-R5): unchanged evidence → last chapter, no
      // owner call. Per-dimension re-runs (partialDims) bypass it.
      chapterCache: input.chapterCache === undefined ? supabaseChapterCache(getSupabaseAdmin() as unknown as ChapterCacheDb | null) : (input.chapterCache ?? undefined),
      chapterCacheScope: { projectId: input.projectId ?? null, pipelineVersion: PIPELINE_VERSION },
      chapterCacheBypass: Boolean(partialDims),
      ...(input.dispatchOptions ?? {}),
    };

    if (!partialDims) {
      // G28-B: W1–W3 race the SOFT deadline (hard − W4 reserve) so a slow
      // provider in W1 can never leave W4 with no wall clock.
      // Wave 1: Independent analyses
      notify("wave1", 15);
      if (!deadline.softExpired() && (await deadline.raceSoft(dispatchWave(wave1, context, input.tier, callAI, dispatchOpts))) === "deadline") markDeadline();

      // Wave 2: Depends on Wave 1
      if (wave2.length > 0 && !deadline.softExpired()) {
        notify("wave2", 45);
        if ((await deadline.raceSoft(dispatchWave(wave2, context, input.tier, callAI, dispatchOpts))) === "deadline") markDeadline();
      }

      // Wave 3: Depends on Wave 1 + 2 (may be empty when evidenceCompleteness < 0.5)
      if (wave3.length > 0 && !deadline.softExpired()) {
        notify("wave3", 75);
        if ((await deadline.raceSoft(dispatchWave(wave3, context, input.tier, callAI, dispatchOpts))) === "deadline") markDeadline();
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
        markDeadline();
        degradeAll(`deadline: wall-clock budget (${Math.round(deadline.ms / 1000)} s) reached before W4`);
      } else if (!monthlyOk() || budget.remaining === 0) {
        degradeAll(budget.remaining === 0 ? `budget: report call cap (${budget.max}) reached before W4` : "budget: monthly AI cap reached before W4");
      } else {
        const emitted = new Set<DimKey>();
        const live = new Map<DimKey, DimensionChapter>();
        context.dimensionChapters = live;
        const w4 = deadline.race(
          dispatchDimensionChapters(context, input.tier, callAIChapter, {
            ...dispatchOpts,
            isExpired: () => deadline.expired(),
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
          markDeadline();
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
    if (deadline.expired()) markDeadline();

    // CDO cross-validation: one LLM call at premium+ (§B.9); deterministic elsewhere.
    context.consistencyIssues =
      (tierV2 === "premium" || tierV2 === "investor_memo") && !partialDims && !deadline.expired()
        ? await crossValidate(context, callAISynthesis)
        : deterministicConsistencyIssues(context);

    // CEO executive summary — deterministic after the deadline / on a partial run.
    // G19-S47: the live call returns the structured sections (JSON contract)
    // beside the thesis; a deterministic / prose summary is structured on read.
    if (partialDims || deadline.expired()) {
      context.executiveSummary = deterministicExecutiveSummary(context, partialDims ? "partial re-run" : "deadline");
      context.executiveStructured = null;
    } else {
      const ceo = await generateExecutiveSummary(context, callAISynthesis, {
        allowRepair: () => !deadline.expired() && monthlyOk() && budget.remaining >= 2,
        businessId: input.projectId ?? null,
        userId: input.userId ?? null,
      });
      context.executiveSummary = ceo.thesis;
      context.executiveStructured = ceo.structured;
    }
    emit({ type: "executive_complete", summary: context.executiveSummary });

    // LLM Auditor (ported from Google Agent Garden llm-auditor sample) —
    // §5.4 grounding sweep over EVERY section (executive summary + chapters +
    // criterion sections). Fully fail-safe and metered; the critic passes run
    // in parallel under the tier cap. After the deadline only the free
    // deterministic citation gate runs.
    const audit = await auditAllSections(context, tierV2, callAISynthesis, {
      budgetOk: () => !deadline.expired() && !partialDims && monthlyOk() && budget.remaining >= 2,
    });
    context.executiveSummary = audit.executiveSummary;
    context.auditFindings = audit.findings;
    context.sectionAudits = audit.records;
    emit({ type: "audit_complete", groundedShare: audit.groundedShare, revised: audit.records.filter((r) => r.revised).length, dump: audit.dump });

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
    const degradedReason = fullyDegradedReason(report, context.dimensionChapters, { deadlineHit: deadline.expired() });
    report.fullyDegraded = degradedReason !== null;
    // G15-R3.4: count it (structured log line + report-pipeline-health.jsonl)
    // so /api/status.ai.fully_degraded_24h and the error digest see AI outages
    // that would otherwise only surface as refunds. Best-effort, never throws.
    if (degradedReason !== null) {
      recordFullyDegraded({ projectId: input.projectId, reason: degradedReason, llmCalls: budget.used }, input.degradedWriter);
    }

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
      deadlineHitPhase: deadline.expired() ? (deadlineHitPhase ?? currentPhase) : deadlineHitPhase,
      // G23-A counters — written to the tbr-quality.jsonl row by run-for-project.
      budgetOverruns: context.qualityCounters?.budgetOverruns ?? 0,
      verdictTrimmed: context.qualityCounters?.verdictTrimmed ?? 0,
      autoCited: context.qualityCounters?.autoCited ?? 0,
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
      sviIndex: input.sviAnalysis.totalSVI,
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

/** The placeholder the placeholder-detection (`fullyDegradedReason`) keys on. */
function placeholderExecutiveSummary(context: ReportContext): string {
  return `## Executive Summary\n\n**${context.startupName}** — SVI Score: ${context.sviAnalysis.totalSVI} (${context.sviAnalysis.stageLabel})\n\n*Executive summary generation encountered an error. Please refer to individual section analyses below.*`;
}

/**
 * G19-S47: ONE metered CEO call on the synthesis class with the executive
 * JSON contract in the OUTPUT_SCHEMA slot (`executive-summary.ts`). A
 * structured answer becomes `executive.structured` + a plain-text thesis; a
 * prose answer is kept verbatim as the thesis (structured on read); a failed
 * call keeps the placeholder shell — never a thrown error.
 */
async function generateExecutiveSummary(
  context: ReportContext,
  callAI: AICaller,
  opts: { allowRepair?: () => boolean; businessId?: string | null; userId?: string | null } = {},
): Promise<{ thesis: string; structured: ExecutiveStructured | null }> {
  const gate = context.phaseGate;
  const systemPrompt = buildAgentPrompt("ceo", context, { phaseId: gate?.currentPhase, outputSchema: executiveOutputContract() });
  try {
    const out = await dispatchExecutiveSummary(context, callAI, {
      systemPrompt,
      allowRepair: opts.allowRepair,
      businessId: opts.businessId ?? null,
      userId: opts.userId ?? null,
    });
    if (out.thesis !== null) return { thesis: out.thesis, structured: out.structured };
    if (out.reason) console.warn(`[report-pipeline] CEO summary: ${out.reason}`);
  } catch (err) {
    console.warn("[report-pipeline] CEO summary threw:", err instanceof Error ? err.message : String(err));
  }
  return { thesis: placeholderExecutiveSummary(context), structured: null };
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
): Promise<{ executiveSummary: string; findings: string[]; records: SectionAuditRecord[]; groundedShare: number; dump: AuditDump }> {
  // G23-A fix (a): the CEO thesis quotes chapter numbers that sit in the
  // evidence register — give those sentences the id before the citation
  // gate reads them, and let the gate resolve ids against the whole register.
  // G24-D: the citable pool is the FULL text behind every register id (the
  // criterion catalogues + the gather rows), not the 160-char register
  // values — the 09:02 showcase thesis quoted "A$12M SAM across 5,700
  // organisations" from the market text past the value cut and stayed uncited.
  const registerIds = (context.evidenceRows ?? []).map((e) => e.evidence_id);
  const reportCitable = citableItemsForReport(context);
  const thesisCite = autoCite(context.executiveSummary ?? "", reportCitable);
  bumpQualityCounter(context, "autoCited", thesisCite.added);
  const draft = thesisCite.text;

  // The grounding evidence the critic sees. G24-D: the whole submission —
  // the description, every criterion's founder text, the gathered rows, the
  // computed facts and the citable id list — not just the description +
  // scores; the 09:02 critic called "525 pages", "Sydney Angels 40
  // applicants" and every cited anchor number fabricated because it had
  // never been shown the criterion text they came from.
  const evidence = criticEvidenceFor(context);

  const sections: AuditableSection[] = [];
  if (draft.trim()) {
    sections.push({ id: "executive", title: "Executive Summary", content: draft, allowedEvidenceIds: registerIds, citable: reportCitable });
  }
  context.dimensionChapters?.forEach((chapter, dim) => {
    // The chapter's evidence rows + its deterministic module outputs (the owner
    // prompt lists both by id; buildDimensionChapter accepts both).
    const modules = itemsFromModuleOutputs(chapter.modules ?? []);
    const ids = [...chapter.evidence.map((e) => e.evidence_id), ...modules.map((m) => m.id)];
    const idSet = new Set(ids);
    sections.push({
      id: `dim:${dim}`,
      title: chapter.title,
      content: [chapter.verdict, ...chapter.strengths.map((s) => `- ${s}`), ...chapter.gaps.map((g) => `- ${g}`)].join("\n"),
      allowedEvidenceIds: ids,
      citable: [...reportCitable.filter((i) => idSet.has(i.id)), ...modules],
    });
  });
  context.criterionResults.forEach((result, key) => {
    const catalogue = buildEvidenceCatalogue(key, context);
    sections.push({
      id: key,
      title: key,
      content: result.content,
      allowedEvidenceIds: catalogue.map((e) => e.evidence_id),
      citable: itemsFromCatalogue(catalogue),
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

  const dumpSections: AuditDump["sections"] = [];
  outcomes.forEach((o) => {
    const revised = o.revised !== originals.get(o.sectionId);
    records.push({ sectionId: o.sectionId, uncitedClaims: o.uncitedClaims, findings: o.findings, revised, grounded: o.grounded, skipped: o.skipped, llmAudited: o.llmAudited, hadIssues: o.hadIssues });
    dumpSections.push({ ...records[records.length - 1]!, droppedFindings: o.droppedFindings, content: originals.get(o.sectionId) ?? "", allowedEvidenceIds: sections.find((s) => s.id === o.sectionId)?.allowedEvidenceIds ?? [] });
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
  const dump: AuditDump = {
    groundedShare,
    sections: dumpSections,
    register: (context.evidenceRows ?? []).map((e) => ({ id: e.evidence_id, label: e.label, source: e.source, status: e.status })),
    criticEvidenceChars: evidence.length,
  };
  return { executiveSummary, findings: findings.slice(0, 24), records, groundedShare, dump };
}

// ── G24-D: audit diagnostics ────────────────────────────────────────────────

/**
 * Everything the grounding sweep saw and decided, per section — carried on
 * the `audit_complete` event so `scripts/run-self-analysis.mjs --audit-dump`
 * can write it. The persisted ReportV2 keeps only the compact records.
 */
export interface AuditDump {
  groundedShare: number;
  sections: Array<
    SectionAuditRecord & {
      /** Critic lines the deterministic filter dropped (llm-auditor.ts filterCriticFindings). */
      droppedFindings: string[];
      /** The section text the gate + critic read (pre-revision). */
      content: string;
      allowedEvidenceIds: string[];
    }
  >;
  register: Array<{ id: string; label: string; source: string; status: string }>;
  criticEvidenceChars: number;
}

/**
 * Every register id with the FULL text behind it: the 13 criterion
 * catalogues (description, founder text, files, links, gather audits, market
 * anchor, computed facts — same ids as buildEvidenceRows) plus the gather /
 * hub rows that only exist as register rows (label + value).
 */
export function citableItemsForReport(context: ReportContext): CitableItem[] {
  const seen = new Map<string, CitableItem>();
  CRITERIA.forEach((def) => {
    itemsFromCatalogue(buildEvidenceCatalogue(def.key, context)).forEach((item) => {
      if (!seen.has(item.id)) seen.set(item.id, item);
    });
  });
  itemsFromEvidenceRows(context.evidenceRows ?? []).forEach((item) => {
    if (!seen.has(item.id) && item.text.trim()) seen.set(item.id, item);
  });
  return Array.from(seen.values());
}

/** Chars of the critic's evidence block — keeps the critic prompt inside the free-model context. */
export const CRITIC_EVIDENCE_MAX_CHARS = 36_000;

/**
 * The critic's EVIDENCE: the founder's whole submission (description + every
 * criterion's text, files and links), the gathered rows with a value, the
 * computed facts, the per-criterion scores and the citable id list.
 */
export function criticEvidenceFor(context: ReportContext): string {
  const rows = context.evidenceRows ?? [];
  const criteriaText = CRITERIA.map((def) => {
    const d = context.criteriaData[def.key];
    const parts: string[] = [];
    if (d?.textInput?.trim()) parts.push(d.textInput.trim());
    (d?.files ?? []).forEach((f) => parts.push(`file: ${f.name} (${f.type}, ${f.size} bytes)`));
    (d?.links ?? []).forEach((l) => parts.push(`link: ${l.label} — ${l.url}`));
    return parts.length ? `### ${def.key}\n${parts.join("\n")}` : "";
  }).filter(Boolean);
  const gathered = rows
    // G28-A: the computed / knowledge rows move to the PROVENANCE block below (same content, plus its source).
    .filter((r) => r.value && r.value.trim() && !/^Founder evidence:|^Startup description$/.test(r.label) && !isComputedFactId(r.evidence_id))
    .map((r) => `- ${r.label}: ${r.value!.trim()}`);
  const criterionScores = [...context.criterionResults.entries()].map(([key, r]) => `- ${key}: ${Math.round(r.score)}/100`);
  // The deterministic module outputs the chapter owners quote (score ledger,
  // compliance checklist, funnel, cap table …) — flattened, capped per module.
  const modules = Object.entries(context.moduleOutputs ?? {}).flatMap(([dim, list]) =>
    itemsFromModuleOutputs(list ?? []).map((m) => `- [${dim}] ${m.id}: ${m.text.slice(0, 500)}`),
  );
  const ids = rows.map((r) => `- ${r.evidence_id} — ${r.label}`);
  // G28-A: the computed / knowledge rows with their provenance — the 11:34
  // showcase critic called the trade mark fee "an invented specific" because
  // nothing told it where the platform's bands come from. Full content here
  // (the gathered block above may carry it too; the provenance is what is new).
  const provenance = computedFacts(context).map((f) => `- ${f.evidence_id} — ${f.label}\n  provenance: ${f.provenance}\n  content: ${f.content}`);
  const blocks = [
    `Startup: ${context.startupName}`,
    `Stage: ${context.sviAnalysis.stageLabel}`,
    `SVI index: ${Math.round(context.sviAnalysis.totalSVI)} (open-ended, base 100)`,
    `## Startup description (founder-submitted)\n${context.rawText.trim()}`,
    criteriaText.length ? `## Founder evidence per criterion (founder-submitted)\n${criteriaText.join("\n\n")}` : "",
    gathered.length ? `## Gathered and computed rows (platform)\n${gathered.join("\n")}` : "",
    provenance.length ? `## Platform knowledge and computed rows — PROVENANCE (a figure in one of these rows is supported by it; never call it fabricated)\n${provenance.join("\n")}` : "",
    criterionScores.length ? `## Per-criterion scores (platform)\n${criterionScores.join("\n")}` : "",
    modules.length ? `## Deterministic module outputs (platform — the chapter owners cite these by id)\n${modules.join("\n").slice(0, 8000)}` : "",
    ids.length ? `## CITABLE IDS (an [ev:<id>] marker on a sentence points at one of these, or at a module id above)\n${ids.join("\n")}` : "",
  ].filter(Boolean);
  const text = blocks.join("\n\n");
  return text.length > CRITIC_EVIDENCE_MAX_CHARS ? `${text.slice(0, CRITIC_EVIDENCE_MAX_CHARS)}\n…(evidence truncated)` : text;
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
/** Bumped whenever the generator's output shape / prompts change — the `svi_deck_cache` key is `deck_hash + pipeline_version`. Lives in ./version.ts so /methodology can print it without importing the pipeline. */
export { PIPELINE_VERSION };

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
      sviAnalysis: input.sviAnalysis,
      phaseId: context.phaseGate?.currentPhase ?? null,
      verificationLevel: input.verificationLevel ?? input.sviAnalysis.meta?.verification?.level ?? null,
      tier: tierV2,
      locale: context.locale,
      vc: valuation?.vc ?? null,
      valuationAsk: valuation?.ask ?? null,
      revenueEvidenceIds: valuation?.revenueEvidenceIds ?? null,
      // G19-S43: GATHER + Evidence Hub rows reach the adapter fallback's chapter
      // tables / register / CTA rows, and the grant matches fill Money on the Table.
      evidenceRows: context.evidenceRows ?? null,
      moneyOnTable: moneyOnTableFromGather(context),
    });
    // §C.5: the gated valuation chapter (consistency-gates may have annotated it).
    const withValuation: ReportV2 = context.valuationChapter ? { ...base, valuation: context.valuationChapter } : base;
    const chapters = context.dimensionChapters;
    if (!chapters || chapters.size !== 8) return withValuation;
    const dimensions = DIM_ORDER.map((dim) => chapters.get(dim)!);
    const degraded = dimensions.filter((d) => d.degraded).map((d) => d.dim);
    // G19-S44: executive strengths / gaps from the PIPELINE chapters' criterion
    // cards (by lift, with the evidence source), confidence = mean chapter
    // ledger confidence — the same builder the adapter path uses.
    const fromCards = executiveFromChapters(dimensions, context.locale);
    const v2: ReportV2 = {
      ...withValuation,
      source: "pipeline",
      pipelineVersion: PIPELINE_VERSION,
      promptVersionIds: {},
      dimensions,
      executive: {
        ...base.executive,
        strengths: fromCards.strengths.length ? fromCards.strengths : base.executive.strengths,
        gaps: fromCards.gaps.length ? fromCards.gaps : base.executive.gaps,
        confidence: fromCards.confidence ?? base.executive.confidence,
        phaseNow: context.phaseGate ?? base.executive.phaseNow,
        thesis: context.executiveSummary?.trim() || base.executive.thesis,
        audit: { ...base.executive.audit, grounded: (context.sectionAudits ?? []).some((r) => r.sectionId === "executive" && r.grounded) },
        // G19-S47: the CEO call's sections, else the thesis parsed against the
        // PIPELINE chapters (the adapter's own block was built on its fallback chapters).
        structured: context.executiveStructured ?? structuredFromThesis(context, base, withValuation, dimensions, fromCards.confidence ?? base.executive.confidence),
      },
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

/** G19-S47: the thesis parsed against the PIPELINE chapters; the adapter's own block when the chapters are unusable. */
function structuredFromThesis(context: ReportContext, base: ReportV2, doc: ReportV2, dimensions: DimensionChapter[], confidence: number): ReportV2["executive"]["structured"] {
  try {
    return structureExecutive(context.executiveSummary?.trim() || base.executive.thesis, dimensions, doc.valuation, context.phaseGate ?? base.executive.phaseNow, {
      locale: context.locale,
      cover: { startupName: doc.cover.startupName, svi: doc.cover.svi },
      actionPlan: doc.actionPlan.steps,
      confidence,
    });
  } catch {
    return base.executive.structured;
  }
}

/**
 * G19-S43: `gatherResults.grants` (grant-advisor matches on the saved grant
 * profile) → the Money on the Table input; null when GATHER found no profile
 * (the chapter then renders the "complete your grant profile" CTA).
 */
export function moneyOnTableFromGather(context: Pick<ReportContext, "gatherResults">): MoneyOnTableInput | null {
  const g = context.gatherResults?.grants;
  if (!g || typeof g !== "object") return null;
  const pick = (v: unknown): MoneyOnTableInput["grants"] =>
    Array.isArray(v)
      ? v
          .filter((m): m is Record<string, unknown> => Boolean(m) && typeof m === "object")
          .map((m) => ({
            id: String(m.id ?? m.name ?? ""),
            name: String(m.name ?? ""),
            amountAud: typeof m.amountAud === "number" && Number.isFinite(m.amountAud) ? m.amountAud : null,
            ...(typeof m.deadline === "string" && m.deadline ? { deadline: m.deadline } : {}),
            fit: typeof m.fit === "number" && Number.isFinite(m.fit) ? m.fit : 0,
            ...(typeof m.url === "string" && m.url ? { url: m.url } : {}),
          }))
          .filter((m) => m.id && m.name)
      : [];
  return { grants: pick(g.grants), programs: pick(g.programs) };
}

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
