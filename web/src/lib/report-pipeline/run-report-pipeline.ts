import { trackOriginWork } from "@/lib/ops/origin-activity";
import type { ReportSaveStatus } from "@/lib/report-save-outcome";
// run-report-pipeline — `runReportPipeline()`, the single generator behind
// the streaming SVI analysis (`/api/svi/dimensions/stream`), the per-dimension
// re-run (`/api/svi/dimension-analyze`) and — through run-for-project — the
// paid / evaluator reports (spec 12-product-ai-tbr-v2.md §C.1, S-R3).
//
//   load context (loadProjectReportContext) → same-deck cache (svi_deck_cache,
//   keyed deck_hash + pipeline_version) → orchestrateReport({ onEvent }) →
//   persist (today's svi_snapshots row: dim_results / criterion_results /
//   report_v2, or the deck cache for a deck run) → notify / email.
//
// The orchestrator emits the §C.12 vocabulary (`dim` + `chapter` payloads);
// this module translates every event into the WIRE shape the streaming
// client (components/svi/svi-stream-analysis.tsx) has parsed since Wave 24 —
// same event names, legacy fields kept, richer payload added:
//
//   context            { industry, stage: <label>, stageIndex, phaseId, tier, estimatedCalls, estimatedSeconds, dims }
//   gather_complete    { evidenceRows, connectors, diagnostics }                          (new)
//   criteria_synthesis_start { total: 13 }                                                (before the first W4 chapter)
//   dimension_start    { dimension, label, dim, ownerAgent }
//   dimension_complete { dimension, label, score, markdown, insights, priority, market_benchmark, dim, chapter }
//   progress           { completed, total }              — dims landed / dims requested (legacy counter)
//   pipeline_progress  { pct, phase }                    — the orchestrator's stage progress (new name)
//   error              { dimension, message, dim, degraded: true }
//   valuation_complete { chapter }                                                          (new)
//   criteria_synthesis { criteria: CriterionResult[13] }
//   executive_complete { summary } · audit_complete { groundedShare, revised }              (new)
//   cache_hit          { ageMs, dims, criteria }
//   done               { totalMs, fromCache, reportId, snapshotId, calls, costAud, degradedSections, deadlineHit }
//   fatal_error        { message }                                                          (route only)
//
// `criterion_addendum` (the Wave 25C overlap artefact) is retired: chapters
// and criteria come from one run, so there is no "late signal" to reconcile.

import "server-only";
import { readStreamValuation } from "@/lib/svi/stream-valuation";
import { createHash } from "crypto";
import { CRITERIA } from "@/lib/evaluation-criteria";
import type { CriterionCard, DimensionChapter, ReportTierV2, ReportV2 } from "@/lib/report-v2/schema";
import { insertImmutableReportRevision, writeSnapshotReportV2 } from "@/lib/report-v2/storage";
import { DIM_LEGACY_ORDER, DIM_ORDER, type DimKey } from "./dimension-owners";
import { PIPELINE_VERSION, assertReportUsable, orchestrateReport, type AICallerInput, type PipelineEvent } from "./orchestrator";
import { pipelineCallTimeouts } from "./pipeline-timeouts";
import { createRunStrikeLedger } from "@/lib/ai/run-strikes";
import { buildCriteriaData, loadProjectReportContext, upsertSnapshotWithToken, type LoadContextResult, type ProjectReportContext } from "./run-for-project";
import { computeSVI, extractSignals } from "@/lib/svi-analysis";
import type { AssembledReport, ReportTier } from "./types";

// ── Wire types ──────────────────────────────────────────────────────────────

/** Legacy criterion wire shape (what the streaming client + email render). */
export interface CriterionResult {
  key: string;
  title: string;
  primary_dimension: string;
  weight: number;
  score: number;
  verdict: string;
  strengths: string[];
  gaps: string[];
  next_action: string;
  /** S-R3 extras (ignored by the legacy client). */
  quality?: string;
  citations?: Array<{ evidence_id: string; quote: string }>;
}

/** Legacy dimension wire shape (also `svi_snapshots.dim_results[dim]` / `svi_deck_cache.dim_results[]`). */
export interface LegacyDimResult {
  dimension: string;
  label: string;
  score: number;
  markdown: string;
  insights: string[];
  priority: "high" | "medium" | "low";
  market_benchmark?: string;
}

export type StreamEvent =
  | { type: "context"; industry: string; stage: string; stageIndex: number; phaseId: string; tier: ReportTierV2; estimatedCalls: number; estimatedSeconds: number; dims: DimKey[] }
  | { type: "gather_complete"; evidenceRows: number; connectors: string[]; diagnostics?: Record<string, { ms: number; status: string; note?: string }> }
  | { type: "criteria_synthesis_start"; total: number }
  | { type: "dimension_start"; dimension: string; label: string; dim: DimKey; ownerAgent: string }
  | ({ type: "dimension_complete"; dim: DimKey; chapter?: DimensionChapter } & LegacyDimResult)
  | { type: "progress"; completed: number; total: number }
  | { type: "pipeline_progress"; pct: number; phase: string }
  | { type: "error"; dimension: string; message: string; dim?: DimKey; degraded: true }
  | { type: "valuation_complete"; chapter: ReportV2["valuation"] }
  | { type: "criteria_synthesis"; criteria: CriterionResult[] }
  | { type: "executive_complete"; summary: string }
  | { type: "audit_complete"; groundedShare: number; revised: number }
  | { type: "final_projection"; projection: FinalProjection }
  | { type: "cache_hit"; ageMs: number; dims: number; criteria: number }
  | { type: "done"; valuationStatus?: "available" | "unavailable"; saveStatus?: ReportSaveStatus; totalMs: number; fromCache: boolean; reportId: string | null; snapshotId: string | null; calls: number; costAud: number; degradedSections: string[]; deadlineHit: boolean }
  | { type: "fatal_error"; message: string };

export type StreamEventHandler = (event: StreamEvent) => void;

// ── Legacy projections ──────────────────────────────────────────────────────

import { cardToLegacy, chapterToLegacy, legacyLabel, projectFinalReport, projectFinalSelectedChapters, readFinalProjection, type FinalProjection } from "./final-projection";
export { cardToLegacy, chapterToLegacy, chapterToMarkdown, legacyLabel, priorityForScore } from "./final-projection";

export interface WireState {
  dims: DimKey[];
  completed: number;
  synthesisStarted: boolean;
  /** Filled by the runner before the terminal `done`. */
  reportId: string | null;
  snapshotId: string | null;
  dimResults: LegacyDimResult[];
  chapters: DimensionChapter[];
  criteria: CriterionResult[];
  cards: CriterionCard[];
  industry: string | null;
  stage: string | null;
  valuation: ReportV2["valuation"] | null;
  done: Extract<PipelineEvent, { type: "done" }> | null;
}

export function newWireState(dims: DimKey[]): WireState {
  return { dims, completed: 0, synthesisStarted: false, reportId: null, snapshotId: null, dimResults: [], chapters: [], criteria: [], cards: [], industry: null, stage: null, valuation: null, done: null };
}

/**
 * Orchestrator event → wire events. The terminal `done` is NOT forwarded
 * here: the runner persists first and emits its own `done` with the
 * snapshot id (`emitDone`).
 */
export function toWireEvents(ev: PipelineEvent, state: WireState): StreamEvent[] {
  switch (ev.type) {
    case "context":
      state.industry = ev.industry;
      state.stage = ev.stageLabel;
      state.dims = ev.dims;
      return [{ type: "context", industry: ev.industry, stage: ev.stageLabel, stageIndex: ev.stage, phaseId: ev.phaseId, tier: ev.tier, estimatedCalls: ev.estimatedCalls, estimatedSeconds: ev.estimatedSeconds, dims: ev.dims }];
    case "gather_complete":
      return [{ type: "gather_complete", evidenceRows: ev.evidenceRows, connectors: ev.connectors, diagnostics: ev.diagnostics }];
    case "dimension_start": {
      const out: StreamEvent[] = [];
      if (!state.synthesisStarted && state.dims.length === DIM_ORDER.length) {
        state.synthesisStarted = true;
        out.push({ type: "criteria_synthesis_start", total: CRITERIA.length });
      }
      out.push({ type: "dimension_start", dimension: ev.dim, label: legacyLabel(ev.dim), dim: ev.dim, ownerAgent: ev.ownerAgent });
      return out;
    }
    case "dimension_complete": {
      const legacy = chapterToLegacy(ev.chapter);
      state.completed += 1;
      state.dimResults.push(legacy);
      state.chapters.push(ev.chapter);
      return [
        { type: "dimension_complete", ...legacy, dim: ev.dim, chapter: ev.chapter },
        { type: "progress", completed: state.completed, total: state.dims.length },
      ];
    }
    case "error":
      return ev.dim ? [{ type: "error", dimension: ev.dim, message: ev.message, dim: ev.dim, degraded: true }] : [];
    case "progress":
      return [{ type: "pipeline_progress", pct: ev.completed, phase: ev.phase }];
    case "valuation_complete":
      state.valuation = ev.chapter;
      return [{ type: "valuation_complete", chapter: ev.chapter }];
    case "criteria_synthesis":
      state.cards = ev.criteria;
      state.criteria = ev.criteria.map(cardToLegacy);
      return [{ type: "criteria_synthesis", criteria: state.criteria }];
    case "executive_complete":
      return [{ type: "executive_complete", summary: ev.summary }];
    case "audit_complete":
      return [{ type: "audit_complete", groundedShare: ev.groundedShare, revised: ev.revised }];
    case "done":
      state.done = ev;
      state.reportId = ev.reportId;
      return [];
    default:
      return [];
  }
}

export function doneEvent(state: WireState, totalMs: number, fromCache: boolean): Extract<StreamEvent, { type: "done" }> {
  return {
    type: "done",
    totalMs,
    fromCache,
    valuationStatus: state.valuation && state.valuation.status !== "unavailable" ? "available" : "unavailable",
    reportId: state.reportId,
    snapshotId: state.snapshotId,
    calls: state.done?.calls ?? 0,
    costAud: state.done?.costAud ?? 0,
    degradedSections: state.done?.degradedSections ?? [],
    deadlineHit: state.done?.deadlineHit ?? false,
  };
}

// ── Runner ──────────────────────────────────────────────────────────────────

/** Deck-derived analysis contract; old caches may contain another input's signals. */
export const DECK_CACHE_VERSION = `${PIPELINE_VERSION}:deck-input-v1:final-projection-v1`;

export interface DeckInputSnapshot {
  version: "deck-input-v1";
  textSha256: string;
  receivedTextChars: number;
  /** Upstream extraction may already be truncated; this runner cannot certify it. */
  extractionCompleteness: "unknown";
}

export const DECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export function scopedDeckCacheKey(text: string, projectId: string | null | undefined, tier: string, locale = "en"): string {
  return createHash("sha256").update(JSON.stringify([hashDeck(text), projectId ?? null, tier, locale])).digest("hex");
}

export function hashDeck(deckText: string): string {
  return createHash("sha256").update(deckText).digest("hex");
}

type Row = Record<string, unknown>;

/** Minimal supabase surface the runner needs (deck cache). */
export interface RunnerDb {
  from(table: string): {
    select(cols: string): {
      eq(col: string, v: unknown): { eq(col: string, v: unknown): { maybeSingle(): Promise<{ data: Row | null; error: { message: string } | null }> } };
    };
    upsert(row: Row, opts?: { onConflict?: string }): Promise<{ error: { message: string } | null }>;
  };
}

export interface RunPipelineDeps {
  loadContext?: (args: { ownerEmail: string; projectId: string | null; callerEmail?: string }) => Promise<LoadContextResult>;
  orchestrate?: typeof orchestrateReport;
  callAI?: AICallerInput;
  /** `undefined` → getSupabaseAdmin(); `null` → no DB (no cache, no persist). */
  db?: RunnerDb | null;
  persistSnapshot?: (args: PersistSnapshotArgs) => Promise<{ snapshotId: string | null; reportV2Saved: boolean; reportRevisionSaved?: boolean }>;
  notify?: (args: { userId: string; projectId: string | null; kind: "analysis_done"; payload: Row }) => Promise<unknown>;
  sendEmail?: (args: EmailArgs) => Promise<unknown>;
  now?: () => number;
}

export interface PersistSnapshotArgs {
  ctx: ProjectReportContext;
  report: AssembledReport;
  dimResults: LegacyDimResult[];
  criterionResults: CriterionResult[];
  reportV2: ReportV2 | null;
}

export interface EmailArgs {
  userId: string;
  projectId: string | null;
  dimResults: Record<string, { score: number; priority?: "high" | "medium" | "low"; insights?: string[]; label?: string }>;
  criterionResults: CriterionResult[];
  industry: string;
  stage: string;
  baseUrl?: string;
  /** S-R4: the run's own ReportV2 + the persisted snapshot, so the email renders the same document as the web/PDF. */
  reportV2?: ReportV2 | null;
  snapshotId?: string | null;
}

export interface RunReportPipelineInput {
  /** app_users.id of the requester (credits, ai_runs). */
  userId: string;
  /** Data owner — the svi_accounts / svi_analyses email (project scope's dataEmail). */
  ownerEmail: string;
  /** The caller's email (members never fall back to the owner's pre-project record). */
  callerEmail?: string;
  /** Owner's app_users.id when known (connector signals / cap table). Defaults to `userId`. */
  ownerUserId?: string | null;
  projectId: string | null;
  tier: ReportTierV2;
  /** Per-dimension re-run: only these W4 chapters; W1–W3 reused from the stored criterion cards. */
  dims?: DimKey[];
  /** Deck flow: full received text is the source for a fresh deterministic analysis. */
  deckText?: string | null;
  locale?: "en" | "vi";
  /** Origin for links in the report email. */
  baseUrl?: string;
  /** Default true: today's svi_snapshots row (+ report_v2) for a full non-deck run, the deck cache for a deck run. */
  persist?: boolean;
  onEvent: StreamEventHandler;
  deps?: RunPipelineDeps;
}

export type RunReportPipelineResult =
  | {
      ok: true;
      saveStatus?: ReportSaveStatus;
      fromCache: boolean;
      accountId: string | null;
      reportId: string | null;
      snapshotId: string | null;
      dimResults: LegacyDimResult[];
      chapters: DimensionChapter[];
      criterionResults: CriterionResult[];
      report: AssembledReport | null;
      calls: number;
      costAud: number;
      totalMs: number;
      deadlineHit: boolean;
      /** In-memory trace; cache stores its hash, full snapshot persistence is follow-on. */
      inputSnapshot?: DeckInputSnapshot;
    }
  | { ok: false; error: "no_account" | "no_analysis" | "db_unavailable" | "fully_degraded" | "pipeline_failed" | "needs_input" | "full_analysis_required"; message: string };

function tierForOrchestrator(tier: ReportTierV2): ReportTier {
  return tier === "free" ? "standard" : tier;
}

async function defaultCallAI(agentId: string, userId: string): Promise<AICallerInput> {
  const { callAI } = await import("@/lib/ai-client");
  // G28-B: one strike ledger per run + per-stage timeouts (pipeline-timeouts.ts).
  const runStrikes = createRunStrikeLedger();
  return async (system, user, maxTokens, taskClass, hint) => {
    const r = await callAI({ policy: "blockid-report-v1", system, user, maxTokens, ...pipelineCallTimeouts(hint), agentId, userId, taskClass, runStrikes });
    return { text: r.text, costUsd: r.cost_usd, provider: r.via ?? r.provider, model: r.model };
  };
}

async function defaultDb(): Promise<RunnerDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin() as unknown as RunnerDb | null;
}

/** Today's svi_snapshots row for the account: legacy shapes + the pipeline ReportV2. */
async function defaultPersistSnapshot(args: PersistSnapshotArgs): Promise<{ snapshotId: string | null; reportV2Saved: boolean; reportRevisionSaved?: boolean }> {
  const { ctx, report, dimResults, criterionResults, reportV2 } = args;
  if (!ctx.projectId) return { snapshotId: null, reportV2Saved: false, reportRevisionSaved: false };
  const dimResultsMap: Record<string, Row> = {};
  const dimensionScores: Record<string, { score: number; priority: "high" | "medium" | "low" }> = {};
  dimResults.forEach((d) => {
    dimResultsMap[d.dimension] = { status: "complete", score: d.score, markdown: d.markdown, insights: d.insights, priority: d.priority, marketBenchmark: d.market_benchmark ?? null };
    dimensionScores[d.dimension] = { score: d.score, priority: d.priority };
  });
  const sviTotal = Math.round(reportV2?.cover.svi.total ?? ctx.sviAnalysis.totalSVI);
  const { snapshotId } = await upsertSnapshotWithToken({
    accountId: ctx.account.id,
    projectId: ctx.projectId,
    sviTotal,
    stage: ctx.sviAnalysis.stage,
    delta: null,
    analysisJson: {
      source: "stream_pipeline",
      report_id: report.id,
      pipeline_version: PIPELINE_VERSION,
      industry: ctx.sviAnalysis.sectorLabel ?? ctx.sviAnalysis.sector ?? null,
      stageLabel: ctx.sviAnalysis.stageLabel,
      executiveSummary: report.executiveSummary.slice(0, 2000),
      qualityScore: report.qualityScore,
      llmCalls: report.llmCalls ?? null,
    },
    dimensionScores,
    dimResults: dimResultsMap,
    criterionResults: criterionResults as unknown as Row[],
  });
  let reportV2Saved = false;
  let reportRevisionSaved = false;
  if (snapshotId && reportV2) {
    const db = await defaultDb();
    if (db) {
      const document = { ...reportV2, snapshotId, projectId: ctx.projectId };
      reportV2Saved = await writeSnapshotReportV2(db as unknown as Parameters<typeof writeSnapshotReportV2>[0], snapshotId, document);
      if (reportV2Saved) {
        reportRevisionSaved = Boolean(await insertImmutableReportRevision(db as unknown as Parameters<typeof insertImmutableReportRevision>[0], {
          snapshotId,
          accountId: ctx.account.id,
          projectId: ctx.projectId,
          report: document,
        }));
      }
    }
  }
  return { snapshotId, reportV2Saved, reportRevisionSaved };
}

async function defaultNotify(args: { userId: string; projectId: string | null; kind: "analysis_done"; payload: Row }): Promise<unknown> {
  const { insertNotification } = await import("@/lib/notifications");
  return insertNotification(args);
}

/**
 * S-R5 (W4 review b): the email's PDF + PNG render no longer runs inside
 * the stream request. The snapshot is stamped `report_email_queued_at` and
 * /api/cron/report-email-sweep renders + sends off the request path. Before
 * migration 0402 (column missing) — or without a snapshot id — the
 * in-process send stays as the fallback.
 */
async function defaultSendEmail(args: EmailArgs): Promise<unknown> {
  if (args.snapshotId) {
    const [{ queueReportEmail }, { getSupabaseAdmin }] = await Promise.all([import("@/lib/svi/email-queue"), import("@/lib/supabase")]);
    const db = getSupabaseAdmin();
    if (db) {
      const q = await queueReportEmail(db as unknown as Parameters<typeof queueReportEmail>[0], args.snapshotId);
      if (q.queued) return { ok: true, queued: true };
      if (q.reason === "already_sent") return { ok: true, reason: "already_sent" };
      if (q.reason !== "not_migrated") console.warn("[run-report-pipeline:email] queue failed, sending inline:", q.reason, q.error ?? "");
    }
  }
  const { sendReportEmail } = await import("@/lib/svi/email-report");
  return sendReportEmail(args);
}

/**
 * The one generator. Never throws for pipeline reasons — returns `{ ok:false }`
 * (and emits `fatal_error`) only for a missing account / analysis, a DB
 * outage or a FULLY degraded report; a degraded-but-usable report is `ok`.
 */
export async function runReportPipeline(input: RunReportPipelineInput): Promise<RunReportPipelineResult> {
  return trackOriginWork("report_pipeline", () => runReportPipelineTracked(input));
}

async function runReportPipelineTracked(input: RunReportPipelineInput): Promise<RunReportPipelineResult> {
  const deps = input.deps ?? {};
  const now = deps.now ?? Date.now;
  const t0 = now();
  const send = (e: StreamEvent) => {
    try {
      input.onEvent(e);
    } catch {
      // A listener failure never breaks the run.
    }
  };
  const dims: DimKey[] = input.dims?.length ? DIM_ORDER.filter((d) => input.dims!.includes(d)) : [...DIM_ORDER];
  const partial = dims.length !== DIM_ORDER.length;
  // Never fall back to an old project analysis when an explicitly supplied
  // deck contains no usable text, and never hash only the first 8,000 chars.
  if (typeof input.deckText === "string" && !input.deckText.trim()) {
    const message = "The supplied document has no readable text. Please provide readable business information.";
    send({ type: "fatal_error", message });
    return { ok: false, error: "needs_input", message };
  }
  const deckText = typeof input.deckText === "string" ? input.deckText : null;
  if (deckText && partial) {
    const message = "A new document requires a full analysis. Start a full analysis to assess all criteria before opening individual sections.";
    send({ type: "fatal_error", message });
    return { ok: false, error: "full_analysis_required", message };
  }
  const inputSnapshot: DeckInputSnapshot | undefined = deckText ? {
    version: "deck-input-v1", textSha256: hashDeck(deckText), receivedTextChars: deckText.length, extractionCompleteness: "unknown",
  } : undefined;
  const persist = input.persist !== false;

  // 1. Context — account + latest analysis + evidence + 13-criteria inputs.
  let loaded = await (deps.loadContext ?? loadProjectReportContext)({ ownerEmail: input.ownerEmail, projectId: input.projectId, callerEmail: input.callerEmail });
  if (!loaded.ok && deckText && loaded.error !== "db_unavailable") {
    // Deck flow parity with the previous generator: a founder whose FIRST
    // action is a deck upload has no stored analysis yet — score the deck
    // text in memory instead of failing (nothing is persisted for deck runs
    // except the cache; save-snapshot stays the client's step).
    loaded = { ok: true, ctx: syntheticDeckContext(input, deckText) };
  }
  if (!loaded.ok) {
    const message = loaded.error === "no_account" ? "No SVI account found — run an analysis first" : loaded.error === "no_analysis" ? "No SVI analysis found — run an analysis first" : "Database unavailable";
    send({ type: "fatal_error", message });
    return { ok: false, error: loaded.error, message };
  }
  let ctx = loaded.ctx;
  if (deckText) {
    const fresh = syntheticDeckContext(input, deckText);
    // Preserve resolved account/project identity and authorization scope, but
    // never borrow signals/answers from a different document. Existing rows
    // carry no matching input fingerprint, so their evidence cannot be reused
    // here. Criterion definitions/questions remain in the shared catalogue.
    ctx = {
      ...ctx,
      account: { ...ctx.account, current_svi: fresh.account.current_svi, current_stage: fresh.account.current_stage },
      latestAnalysis: { ...fresh.latestAnalysis, analysis_json: { ...fresh.latestAnalysis.analysis_json, input_snapshot: inputSnapshot } },
      sviAnalysis: fresh.sviAnalysis,
      evidenceItems: [],
      criteriaData: buildCriteriaData(null),
    };
  }

  // 2. Same-deck cache (full deck runs only) keyed deck_hash + pipeline_version.
  const db = deps.db === undefined ? await defaultDb().catch(() => null) : deps.db;
  const deckHash = deckText ? scopedDeckCacheKey(deckText, ctx.projectId ?? input.projectId, input.tier, input.locale ?? "en") : null;
  if (deckHash && !partial && db) {
    try {
      const { data: cached } = await db.from("svi_deck_cache").select("dim_results, criterion_results, created_at, industry, stage, pipeline_version").eq("deck_hash", deckHash).eq("user_id", input.userId).maybeSingle();
      if (cached && cached.created_at && cached.pipeline_version === DECK_CACHE_VERSION) {
        const ageMs = now() - new Date(String(cached.created_at)).getTime();
        const cachedDims = Array.isArray(cached.dim_results) ? (cached.dim_results as LegacyDimResult[]) : [];
        const cacheProjection = readFinalProjection((cachedDims[0] as (LegacyDimResult & { finalProjection?: unknown }) | undefined)?.finalProjection);
        const cachedCriteria = Array.isArray(cached.criterion_results) ? (cached.criterion_results as CriterionResult[]) : [];
        if (ageMs >= 0 && ageMs < DECK_CACHE_TTL_MS && cacheProjection?.scope === "full" && cachedDims.length === 8) {
          send({ type: "context", industry: String(cached.industry ?? ctx.sviAnalysis.sectorLabel ?? "Unclassified"), stage: String(cached.stage ?? ctx.sviAnalysis.stageLabel), stageIndex: ctx.sviAnalysis.stage, phaseId: "", tier: input.tier, estimatedCalls: 0, estimatedSeconds: 0, dims });
          send({ type: "cache_hit", ageMs, dims: cachedDims.length, criteria: cachedCriteria.length });
          cacheProjection.dimensions.forEach((r, i) => {
            send({ type: "dimension_complete", ...r, dim: r.dimension as DimKey });
            send({ type: "progress", completed: i + 1, total: cachedDims.length });
          });
          if (cacheProjection.criteria.length) {
            send({ type: "criteria_synthesis_start", total: cacheProjection.criteria.length });
            send({ type: "criteria_synthesis", criteria: cacheProjection.criteria });
          }
          send({ type: "final_projection", projection: cacheProjection });
          const cachedValuation = (cachedDims[0] as LegacyDimResult & { finalValuation?: ReportV2["valuation"] }).finalValuation;
          const cachedValuationValid = readStreamValuation(cachedValuation) !== null;
          if (cachedValuation && (cachedValuationValid || cachedValuation.status === "unavailable")) send({ type: "valuation_complete", chapter: cachedValuation });
          const totalMs = now() - t0;
          // This cache contains a display projection, not a durable report save receipt.
          send({ type: "done", valuationStatus: cachedValuationValid ? "available" : "unavailable", saveStatus: "not_requested", totalMs, fromCache: true, reportId: null, snapshotId: null, calls: 0, costAud: 0, degradedSections: [], deadlineHit: false });
          void trackOriginWork("report_notification", () => (deps.notify ?? defaultNotify)({ userId: input.userId, projectId: input.projectId, kind: "analysis_done", payload: { fromCache: true, dims: cachedDims.length } })).catch(() => undefined);
          return { ok: true, fromCache: true, accountId: ctx.account.id, reportId: null, snapshotId: null, dimResults: cacheProjection.dimensions, chapters: [], criterionResults: cacheProjection.criteria, report: null, calls: 0, costAud: 0, totalMs, deadlineHit: false, ...(inputSnapshot ? { inputSnapshot } : {}) };
        }
      }
    } catch (err) {
      console.warn("[run-report-pipeline:cache] read failed", err instanceof Error ? err.message : String(err));
    }
  }

  // 3. Orchestrate — the orchestrator's events become wire events.
  const state = newWireState(dims);
  const agentId = `svi:${ctx.account.id}${ctx.projectId ? `:${ctx.projectId}` : ""}`;
  const callAI = deps.callAI ?? (await defaultCallAI(agentId, input.userId));
  const seedCriteria = partial && !deckText ? await loadStoredCriteria(db, ctx) : null;
  let report: AssembledReport;
  try {
    report = await (deps.orchestrate ?? orchestrateReport)({
      accountId: ctx.account.id,
      userId: input.userId,
      ownerUserId: input.ownerUserId ?? ctx.account.user_id ?? input.userId,
      projectId: ctx.projectId ?? undefined,
      startupName: String(ctx.account.startup_name ?? "Your Startup"),
      rawText: String(ctx.latestAnalysis.raw_input ?? ""),
      sviAnalysis: ctx.sviAnalysis,
      evidenceItems: ctx.evidenceItems,
      criteriaData: ctx.criteriaData,
      tier: tierForOrchestrator(input.tier),
      tierV2: input.tier,
      locale: input.locale ?? "en",
      callAI,
      dims: partial ? dims : undefined,
      seedCriteria,
      onEvent: (ev) => toWireEvents(ev, state).forEach(send),
    });
    assertReportUsable(report);
  } catch (err) {
    const fully = err instanceof Error && err.name === "ReportFullyDegradedError";
    const message = fully ? "The AI providers were unavailable — nothing was generated, nothing is charged. Please try again in a few minutes." : "The analysis stopped unexpectedly. Please try again.";
    console.error("[run-report-pipeline] orchestration failed:", err);
    send({ type: "fatal_error", message });
    return { ok: false, error: fully ? "fully_degraded" : "pipeline_failed", message };
  }

  const finalProjection = partial
    ? projectFinalSelectedChapters(report.finalDimensionChapters, report.id, dims)
    : report.reportV2 ? projectFinalReport(report.reportV2, report.id) : null;
  if (partial && !finalProjection) {
    const message = "The updated sections could not be finalized. Your previous saved report is unchanged.";
    send({ type: "fatal_error", message });
    return { ok: false, error: "pipeline_failed", message };
  }
  if (finalProjection) {
    state.dimResults = finalProjection.dimensions;
    state.criteria = finalProjection.criteria;
    state.chapters = partial ? report.finalDimensionChapters!.filter(d => dims.includes(d.dim)) : report.reportV2!.dimensions;
  }
  // Generated content remains usable if storage fails; this is separate from billing.
  let saveStatus: ReportSaveStatus = "not_requested";
  // 4. Persist.
  if (persist && !partial) {
    if (deckHash) {
      if (db && state.dimResults.length) {
        try {
          const write = await db.from("svi_deck_cache").upsert(
            { deck_hash: deckHash, user_id: input.userId, dim_results: state.dimResults.map((d, i) => i === 0 && finalProjection ? { ...d, finalProjection, finalValuation: report.reportV2?.valuation ?? null } : d), criterion_results: state.criteria, industry: state.industry, stage: state.stage, pipeline_version: DECK_CACHE_VERSION, created_at: new Date(now()).toISOString() },
            { onConflict: "deck_hash" },
          );
          if (write.error) console.warn("[run-report-pipeline:cache] write failed", write.error.message);
        } catch (err) {
          console.warn("[run-report-pipeline:cache] write threw", err instanceof Error ? err.message : String(err));
        }
      }
    } else {
      try {
        const { snapshotId, reportV2Saved, reportRevisionSaved } = await (deps.persistSnapshot ?? defaultPersistSnapshot)({ ctx, report, dimResults: state.dimResults, criterionResults: state.criteria, reportV2: report.reportV2 ?? null });
        state.snapshotId = snapshotId;
        saveStatus = snapshotId && reportV2Saved && reportRevisionSaved !== false ? "saved" : "save_failed";
      } catch (err) {
        saveStatus = "save_failed";
        console.warn("[run-report-pipeline] snapshot persist failed", err instanceof Error ? err.message : String(err));
      }
    }
  }

  // Final consistency gates can revise the earlier chapter. Publish the same
  // canonical value used by saved reports and exports before acknowledging done.
  if (!partial) {
    state.valuation = report.reportV2?.valuation ?? null;
    if (state.valuation) send({ type: "valuation_complete", chapter: state.valuation });
  }
  if (finalProjection) send({ type: "final_projection", projection: finalProjection });
  const totalMs = now() - t0;
  send({ ...doneEvent(state, totalMs, false), ...(partial && !state.valuation ? { valuationStatus: undefined } : {}), saveStatus });

  // 5. Notify + email (fire-and-forget; a full run only).
  if (!partial && saveStatus !== "save_failed") {
    void trackOriginWork("report_notification", () => (deps.notify ?? defaultNotify)({ userId: input.userId, projectId: input.projectId, kind: "analysis_done", payload: { fromCache: false, dims: state.dimResults.length, totalMs, reportId: report.id } })).catch(() => undefined);
    if (state.criteria.length) {
      const dimEmail: EmailArgs["dimResults"] = {};
      state.dimResults.forEach((d) => {
        dimEmail[d.dimension] = { score: d.score, priority: d.priority, insights: d.insights, label: d.label };
      });
      void trackOriginWork("report_email", () => (deps.sendEmail ?? defaultSendEmail)({ userId: input.userId, projectId: input.projectId, dimResults: dimEmail, criterionResults: state.criteria, industry: state.industry ?? "Technology", stage: state.stage ?? ctx.sviAnalysis.stageLabel, baseUrl: input.baseUrl, reportV2: report.reportV2 ?? null, snapshotId: state.snapshotId ?? null })).catch((err: unknown) => console.warn("[run-report-pipeline:email] error", err));
    }
  }

  return {
    ok: true,
    saveStatus,
    fromCache: false,
    accountId: ctx.account.id,
    reportId: report.id,
    snapshotId: state.snapshotId,
    dimResults: state.dimResults,
    chapters: state.chapters,
    criterionResults: state.criteria,
    report,
    calls: state.done?.calls ?? report.llmCalls ?? 0,
    costAud: state.done?.costAud ?? 0,
    totalMs,
    deadlineHit: state.done?.deadlineHit ?? false,
    ...(inputSnapshot ? { inputSnapshot } : {}),
  };
}

/** In-memory context for a deck run with no stored account / analysis (computeSVI over the deck text). */
export function syntheticDeckContext(input: Pick<RunReportPipelineInput, "userId" | "ownerEmail" | "ownerUserId" | "projectId">, deckText: string): ProjectReportContext {
  const analysis = computeSVI(extractSignals({ rawText: deckText }));
  const firstLine = deckText.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "Your Startup";
  return {
    projectId: input.projectId,
    account: { id: `deck:${input.userId}`, email: input.ownerEmail, startup_name: firstLine.slice(0, 80), current_svi: Math.round(analysis.totalSVI), current_stage: analysis.stage, user_id: input.ownerUserId ?? input.userId },
    latestAnalysis: { id: `deck:${hashDeck(deckText).slice(0, 12)}`, raw_input: deckText, total_svi: Math.round(analysis.totalSVI), analysis_json: analysis as unknown as Record<string, unknown> },
    evidenceItems: [],
    criteriaData: buildCriteriaData(null),
    sviAnalysis: analysis,
  };
}

/** Stored criterion cards (latest snapshot) — the W1–W3 inputs a per-dimension re-run reuses. */
async function loadStoredCriteria(db: RunnerDb | null, ctx: ProjectReportContext): Promise<CriterionCard[] | null> {
  if (!db || !ctx.projectId) return null;
  try {
    // The runner's minimal DB type has no `.order()`; go through the admin client directly.
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const admin = getSupabaseAdmin();
    if (!admin) return null;
    const { data } = await admin.from("svi_snapshots").select("report_v2, criterion_results").eq("project_id", ctx.projectId).order("created_at", { ascending: false }).limit(1).maybeSingle();
    const row = (data ?? null) as Row | null;
    const v2 = row?.report_v2 as ReportV2 | null | undefined;
    if (v2 && Array.isArray(v2.dimensions)) {
      const cards = v2.dimensions.flatMap((d) => d.criteria ?? []);
      if (cards.length) return cards;
    }
    const legacy = Array.isArray(row?.criterion_results) ? (row!.criterion_results as CriterionResult[]) : [];
    return legacy.length
      ? legacy.map((c) => ({ key: c.key as CriterionCard["key"], title: c.title, score: c.score, quality: "good", verdict: c.verdict, strengths: c.strengths ?? [], gaps: c.gaps ?? [], nextAction: c.next_action ?? "", citations: [], ownerAgent: "ceo", lens: (c.primary_dimension || "tre") as DimKey }) as unknown as CriterionCard)
      : null;
  } catch {
    return null;
  }
}

export { DIM_LEGACY_ORDER };
