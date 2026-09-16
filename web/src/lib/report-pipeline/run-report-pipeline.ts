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
import { createHash } from "crypto";
import { CRITERIA } from "@/lib/evaluation-criteria";
import type { CriterionCard, DimensionChapter, ReportTierV2, ReportV2 } from "@/lib/report-v2/schema";
import { writeSnapshotReportV2 } from "@/lib/report-v2/storage";
import { DIM_LEGACY_ORDER, DIM_ORDER, legacyStreamDimMeta, type DimKey } from "./dimension-owners";
import { PIPELINE_VERSION, assertReportUsable, orchestrateReport, type AICallerInput, type PipelineEvent } from "./orchestrator";
import { loadProjectReportContext, upsertSnapshotWithToken, type LoadContextResult, type ProjectReportContext } from "./run-for-project";
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
  | { type: "cache_hit"; ageMs: number; dims: number; criteria: number }
  | { type: "done"; totalMs: number; fromCache: boolean; reportId: string | null; snapshotId: string | null; calls: number; costAud: number; degradedSections: string[]; deadlineHit: boolean }
  | { type: "fatal_error"; message: string };

export type StreamEventHandler = (event: StreamEvent) => void;

// ── Legacy projections ──────────────────────────────────────────────────────

const LEGACY_META = legacyStreamDimMeta();

export function legacyLabel(dim: DimKey): string {
  return LEGACY_META[dim]?.label ?? dim.toUpperCase();
}

export function priorityForScore(score: number): "high" | "medium" | "low" {
  return score < 50 ? "high" : score < 70 ? "medium" : "low";
}

/** Chapter → the ≤ 300-word markdown block the legacy card renders (strengths / gaps / next step). */
export function chapterToMarkdown(chapter: DimensionChapter): string {
  const lines = [chapter.verdict.trim(), ""];
  lines.push("**Strengths (with evidence):**", ...(chapter.strengths.length ? chapter.strengths.map((s) => `- ${s}`) : ["- none evidenced yet"]), "");
  lines.push("**Gaps (what's missing or unverifiable):**", ...(chapter.gaps.length ? chapter.gaps.map((g) => `- ${g}`) : ["- none identified"]), "");
  const na = chapter.nextAction;
  lines.push("**Next Step (concrete, this-week action):**", `- ${na.title} (${na.window.replace(/_/g, " ")}, expected lift +${na.expectedLift})`);
  if (chapter.scoreNote) lines.push("", `*${chapter.scoreNote}*`);
  if (chapter.degraded) lines.push("", `*Deterministic card — ${chapter.degradeReason ?? "owner call unavailable"}.*`);
  return lines.join("\n");
}

const clip = (s: string, words: number) => {
  const w = s.trim().split(/\s+/).filter(Boolean);
  return w.length <= words ? w.join(" ") : `${w.slice(0, words).join(" ")}…`;
};

export function chapterToLegacy(chapter: DimensionChapter): LegacyDimResult {
  const insights = [chapter.strengths[0], chapter.gaps[0]].filter((s): s is string => Boolean(s)).map((s) => clip(s.replace(/\s*\[(?:ev:[^\]]*|unevidenced)\]/g, ""), 15));
  const b = chapter.benchmark;
  return {
    dimension: chapter.dim,
    label: legacyLabel(chapter.dim),
    score: chapter.score,
    markdown: chapterToMarkdown(chapter),
    insights: insights.length ? insights : ["Analysis complete — see the chapter"],
    priority: priorityForScore(chapter.score),
    market_benchmark: `Stage ${b.stage} cohort: p25 ${b.p25} · p50 ${b.p50} · p75 ${b.p75}${typeof b.percentile === "number" ? ` — you sit at the ${b.percentile}th percentile` : ""} (svi-dimension-benchmarks ANCHORS; sector cohort when N ≥ 30)`,
  };
}

export function cardToLegacy(card: CriterionCard): CriterionResult {
  const def = CRITERIA.find((c) => c.key === card.key);
  return {
    key: card.key,
    title: card.title || def?.title || card.key,
    primary_dimension: def?.primaryDimension ?? "tre",
    weight: def?.weight ?? 0,
    score: card.score,
    verdict: card.verdict,
    strengths: card.strengths.slice(0, 2),
    gaps: card.gaps.slice(0, 2),
    next_action: card.nextAction,
    quality: card.quality,
    citations: card.citations,
  };
}

// ── Event translation (pure, tested) ────────────────────────────────────────

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

export function doneEvent(state: WireState, totalMs: number, fromCache: boolean): StreamEvent {
  return {
    type: "done",
    totalMs,
    fromCache,
    reportId: state.reportId,
    snapshotId: state.snapshotId,
    calls: state.done?.calls ?? 0,
    costAud: state.done?.costAud ?? 0,
    degradedSections: state.done?.degradedSections ?? [],
    deadlineHit: state.done?.deadlineHit ?? false,
  };
}

// ── Runner ──────────────────────────────────────────────────────────────────

export const DECK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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
  persistSnapshot?: (args: PersistSnapshotArgs) => Promise<{ snapshotId: string | null }>;
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
  /** Deck flow: the extracted deck text replaces the stored analysis text as the primary context (≤ 8 KiB). */
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
    }
  | { ok: false; error: "no_account" | "no_analysis" | "db_unavailable" | "fully_degraded" | "pipeline_failed"; message: string };

const DECK_TEXT_MAX = 8_000;

function tierForOrchestrator(tier: ReportTierV2): ReportTier {
  return tier === "free" ? "standard" : tier;
}

async function defaultCallAI(agentId: string, userId: string): Promise<AICallerInput> {
  const { callAI } = await import("@/lib/ai-client");
  return async (system, user, maxTokens, taskClass) => {
    const r = await callAI({ system, user, maxTokens, timeoutMs: 120_000, agentId, userId, taskClass });
    return { text: r.text, costUsd: r.cost_usd, provider: r.via ?? r.provider, model: r.model };
  };
}

async function defaultDb(): Promise<RunnerDb | null> {
  const { getSupabaseAdmin } = await import("@/lib/supabase");
  return getSupabaseAdmin() as unknown as RunnerDb | null;
}

/** Today's svi_snapshots row for the account: legacy shapes + the pipeline ReportV2. */
async function defaultPersistSnapshot(args: PersistSnapshotArgs): Promise<{ snapshotId: string | null }> {
  const { ctx, report, dimResults, criterionResults, reportV2 } = args;
  if (!ctx.projectId) return { snapshotId: null };
  const dimResultsMap: Record<string, Row> = {};
  const dimensionScores: Record<string, { score: number; priority: "high" | "medium" | "low" }> = {};
  dimResults.forEach((d) => {
    dimResultsMap[d.dimension] = { status: "complete", score: d.score, markdown: d.markdown, insights: d.insights, priority: d.priority, marketBenchmark: d.market_benchmark ?? null };
    dimensionScores[d.dimension] = { score: d.score, priority: d.priority };
  });
  const sviTotal = Math.round(ctx.sviAnalysis.totalSVI);
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
  if (snapshotId && reportV2) {
    const db = await defaultDb();
    if (db) await writeSnapshotReportV2(db as unknown as Parameters<typeof writeSnapshotReportV2>[0], snapshotId, { ...reportV2, snapshotId, projectId: ctx.projectId });
  }
  return { snapshotId };
}

async function defaultNotify(args: { userId: string; projectId: string | null; kind: "analysis_done"; payload: Row }): Promise<unknown> {
  const { insertNotification } = await import("@/lib/notifications");
  return insertNotification(args);
}

async function defaultSendEmail(args: EmailArgs): Promise<unknown> {
  const { sendReportEmail } = await import("@/lib/svi/email-report");
  return sendReportEmail(args);
}

/**
 * The one generator. Never throws for pipeline reasons — returns `{ ok:false }`
 * (and emits `fatal_error`) only for a missing account / analysis, a DB
 * outage or a FULLY degraded report; a degraded-but-usable report is `ok`.
 */
export async function runReportPipeline(input: RunReportPipelineInput): Promise<RunReportPipelineResult> {
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
  const deckText = typeof input.deckText === "string" && input.deckText.trim() ? input.deckText.slice(0, DECK_TEXT_MAX) : null;
  const persist = input.persist !== false;

  // 1. Context — account + latest analysis + evidence + 13-criteria inputs.
  const loaded = await (deps.loadContext ?? loadProjectReportContext)({ ownerEmail: input.ownerEmail, projectId: input.projectId, callerEmail: input.callerEmail });
  if (!loaded.ok) {
    const message = loaded.error === "no_account" ? "No SVI account found — run an analysis first" : loaded.error === "no_analysis" ? "No SVI analysis found — run an analysis first" : "Database unavailable";
    send({ type: "fatal_error", message });
    return { ok: false, error: loaded.error, message };
  }
  const ctx = loaded.ctx;
  if (deckText) ctx.latestAnalysis = { ...ctx.latestAnalysis, raw_input: deckText };

  // 2. Same-deck cache (full deck runs only) keyed deck_hash + pipeline_version.
  const db = deps.db === undefined ? await defaultDb().catch(() => null) : deps.db;
  const deckHash = deckText ? hashDeck(deckText) : null;
  if (deckHash && !partial && db) {
    try {
      const { data: cached } = await db.from("svi_deck_cache").select("dim_results, criterion_results, created_at, industry, stage, pipeline_version").eq("deck_hash", deckHash).eq("user_id", input.userId).maybeSingle();
      if (cached && cached.created_at && cached.pipeline_version === PIPELINE_VERSION) {
        const ageMs = now() - new Date(String(cached.created_at)).getTime();
        const cachedDims = Array.isArray(cached.dim_results) ? (cached.dim_results as LegacyDimResult[]) : [];
        const cachedCriteria = Array.isArray(cached.criterion_results) ? (cached.criterion_results as CriterionResult[]) : [];
        if (ageMs < DECK_CACHE_TTL_MS && cachedDims.length > 0) {
          send({ type: "context", industry: String(cached.industry ?? ctx.sviAnalysis.sectorLabel ?? "Unclassified"), stage: String(cached.stage ?? ctx.sviAnalysis.stageLabel), stageIndex: ctx.sviAnalysis.stage, phaseId: "", tier: input.tier, estimatedCalls: 0, estimatedSeconds: 0, dims });
          send({ type: "cache_hit", ageMs, dims: cachedDims.length, criteria: cachedCriteria.length });
          cachedDims.forEach((r, i) => {
            send({ type: "dimension_complete", ...r, dim: r.dimension as DimKey });
            send({ type: "progress", completed: i + 1, total: cachedDims.length });
          });
          if (cachedCriteria.length) {
            send({ type: "criteria_synthesis_start", total: cachedCriteria.length });
            send({ type: "criteria_synthesis", criteria: cachedCriteria });
          }
          const totalMs = now() - t0;
          send({ type: "done", totalMs, fromCache: true, reportId: null, snapshotId: null, calls: 0, costAud: 0, degradedSections: [], deadlineHit: false });
          void (deps.notify ?? defaultNotify)({ userId: input.userId, projectId: input.projectId, kind: "analysis_done", payload: { fromCache: true, dims: cachedDims.length } }).catch(() => undefined);
          return { ok: true, fromCache: true, accountId: ctx.account.id, reportId: null, snapshotId: null, dimResults: cachedDims, chapters: [], criterionResults: cachedCriteria, report: null, calls: 0, costAud: 0, totalMs, deadlineHit: false };
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
  const seedCriteria = partial ? await loadStoredCriteria(db, ctx) : null;
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

  // 4. Persist.
  if (persist && !partial) {
    if (deckHash) {
      if (db && state.dimResults.length) {
        try {
          const write = await db.from("svi_deck_cache").upsert(
            { deck_hash: deckHash, user_id: input.userId, dim_results: state.dimResults, criterion_results: state.criteria, industry: state.industry, stage: state.stage, pipeline_version: PIPELINE_VERSION, created_at: new Date(now()).toISOString() },
            { onConflict: "deck_hash" },
          );
          if (write.error) console.warn("[run-report-pipeline:cache] write failed", write.error.message);
        } catch (err) {
          console.warn("[run-report-pipeline:cache] write threw", err instanceof Error ? err.message : String(err));
        }
      }
    } else {
      try {
        const { snapshotId } = await (deps.persistSnapshot ?? defaultPersistSnapshot)({ ctx, report, dimResults: state.dimResults, criterionResults: state.criteria, reportV2: report.reportV2 ?? null });
        state.snapshotId = snapshotId;
      } catch (err) {
        console.warn("[run-report-pipeline] snapshot persist failed", err instanceof Error ? err.message : String(err));
      }
    }
  }

  const totalMs = now() - t0;
  send(doneEvent(state, totalMs, false));

  // 5. Notify + email (fire-and-forget; a full run only).
  if (!partial) {
    void (deps.notify ?? defaultNotify)({ userId: input.userId, projectId: input.projectId, kind: "analysis_done", payload: { fromCache: false, dims: state.dimResults.length, totalMs, reportId: report.id } }).catch(() => undefined);
    if (state.criteria.length) {
      const dimEmail: EmailArgs["dimResults"] = {};
      state.dimResults.forEach((d) => {
        dimEmail[d.dimension] = { score: d.score, priority: d.priority, insights: d.insights, label: d.label };
      });
      void (deps.sendEmail ?? defaultSendEmail)({ userId: input.userId, projectId: input.projectId, dimResults: dimEmail, criterionResults: state.criteria, industry: state.industry ?? "Technology", stage: state.stage ?? ctx.sviAnalysis.stageLabel, baseUrl: input.baseUrl }).catch((err: unknown) => console.warn("[run-report-pipeline:email] error", err));
    }
  }

  return {
    ok: true,
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
