// The live stage timeline of a Trusted Business Report run (26/09/2026).
//
// Founder complaint (26/09): after a deck upload on /analyze the page looked
// frozen — one "Gathering evidence · 35 %" line under the score, for 3–8
// minutes. startupvalueindex.com shows every stage with its status, elapsed
// time, a median ETA and the one-line result that came back; this module is
// that model for the BlockID pipeline.
//
// Pure and isomorphic (no `server-only`, no I/O): the job runner folds the
// orchestrator's REAL events into `FullReportV2Envelope.stages` (persisted in
// `analyses.full_report_json`, no migration), the poll route summarises it
// into the payload (`FullReportView.timeline`), and the page renders it.
// Nothing here advances on a timer: a stage is `running` only because an
// event said it started, and `done` only because an event said it finished.
//
// Stage order = the pipeline order (orchestrator.ts):
//   received   the upload reached the server and was saved (the row exists)
//   read       text extracted from the deck — slides / pages / words
//   score      company + deterministic baseline score; while the row waits
//              for a worker this is the stage that is "running" (queued)
//   evidence   GATHER — public evidence, market research, registers
//   agents     W1–W3 — the C-level analyses
//   dimensions W4 — the eight dimension chapters (n of 8 as they land)
//   valuation  the valuation chapter (computed in GATHER, published after W4)
//   synthesis  the CEO investment view
//   audit      the grounding / citation check over every section
//   assemble   the document is assembled (risk matrix, 90-day plan, appendix)

import type { PipelineEvent } from "@/lib/report-pipeline/orchestrator";

export const TBR_STAGE_KEYS = [
  "received",
  "read",
  "score",
  "evidence",
  "agents",
  "dimensions",
  "valuation",
  "synthesis",
  "audit",
  "assemble",
] as const;

export type TbrStageKey = (typeof TBR_STAGE_KEYS)[number];

export type TbrStageStatus = "waiting" | "running" | "done" | "failed" | "skipped";

export interface TbrEvidenceSource {
  name: string;
  /** ok | cached | skipped | timeout | error — the gather diagnostic verbatim. */
  status: string;
  ms?: number;
}

/**
 * Structured, language-free facts about a stage. The page renders them in
 * EN or VI; nothing here is prose, so no model output reaches this line.
 */
export interface TbrStageDetail {
  // received / read
  filename?: string;
  bytesLoaded?: number;
  bytesTotal?: number;
  units?: number;
  unitLabel?: "slides" | "pages";
  words?: number;
  chars?: number;
  truncated?: boolean;
  /** Pitch-deck sections found in the text (problem, market, team…). */
  sections?: string[];
  // score
  company?: string;
  baselineSvi?: number;
  stageLabel?: string;
  /** The row is waiting for a report worker. */
  queued?: boolean;
  /** …because today's free-report cap is reached (the cron starts it). */
  heldForCap?: boolean;
  // evidence
  industry?: string;
  evidenceRows?: number;
  sources?: TbrEvidenceSource[];
  // agents
  wave?: number;
  // dimensions
  done?: number;
  total?: number;
  degraded?: number;
  /** Dimensions whose owner agent is writing right now. */
  writing?: string[];
  /** Dimensions that have landed, in landing order. */
  landed?: string[];
  // valuation
  lowAud?: number;
  midAud?: number;
  highAud?: number;
  unavailable?: boolean;
  // audit
  groundedPct?: number;
  revised?: number;
  // assemble
  deadlineHit?: boolean;
  /** Why a stage failed or was skipped — a short machine key, never a raw error string. */
  reason?: "deadline" | "degraded" | "error" | "not_run" | "retrying";
}

export interface TbrStageRecord {
  key: TbrStageKey;
  status: TbrStageStatus;
  /** ISO — when the stage started (server clock). */
  startedAt?: string;
  /** ISO — when it finished, failed or was skipped. */
  finishedAt?: string;
  detail?: TbrStageDetail;
}

/**
 * Fallback ETAs (seconds) when the timings ledger has no history yet —
 * from the G33/G35 background runs (420 s deadline, 150 s W4 reserve).
 * The page labels them "usually ~Xs"; `samples` says whether they are
 * medians of real runs or these defaults.
 */
export const DEFAULT_STAGE_SECONDS: Record<TbrStageKey, number> = {
  received: 0,
  read: 0,
  score: 5,
  evidence: 45,
  agents: 100,
  dimensions: 150,
  valuation: 1,
  synthesis: 40,
  audit: 30,
  assemble: 5,
};

export interface StageEtas {
  /** Median seconds per stage. */
  stages: Record<TbrStageKey, number>;
  /** Median total seconds of a whole run (claim → document). */
  totalSec: number;
  /** Runs behind the medians — 0 = the defaults above. */
  samples: number;
}

export function defaultStageEtas(): StageEtas {
  const stages = { ...DEFAULT_STAGE_SECONDS };
  return { stages, totalSec: TBR_STAGE_KEYS.reduce((n, k) => n + stages[k], 0), samples: 0 };
}

const ORDER_INDEX: Record<TbrStageKey, number> = Object.fromEntries(TBR_STAGE_KEYS.map((k, i) => [k, i])) as Record<TbrStageKey, number>;

export function isTbrStageKey(v: unknown): v is TbrStageKey {
  return typeof v === "string" && (TBR_STAGE_KEYS as readonly string[]).includes(v);
}

function isTerminal(s: TbrStageStatus): boolean {
  return s === "done" || s === "failed" || s === "skipped";
}

// ── Document facts (read stage) ─────────────────────────────────────────────

/** The row fields the read-stage detail is derived from (a structural subset of FullReportRow). */
export interface DocumentRowLike {
  input_filename?: string | null;
  input_chars?: number | null;
  input_truncated?: boolean | null;
  input_text?: string | null;
  intake?: Record<string, unknown> | null;
}

export function countWords(text: string | null | undefined): number {
  if (!text) return 0;
  return (text.match(/\S+/g) ?? []).length;
}

/** What we know about the uploaded document — real numbers from the saved row, nothing estimated. */
export function documentDetail(row: DocumentRowLike): TbrStageDetail {
  const structured = (row.intake?.structured ?? null) as {
    slides?: unknown;
    extractedUnits?: unknown;
    deckSections?: unknown;
  } | null;
  const detail: TbrStageDetail = {};
  if (row.input_filename) detail.filename = row.input_filename;
  const slides = Array.isArray(structured?.slides) ? structured.slides.length : 0;
  const units = Array.isArray(structured?.extractedUnits) ? (structured.extractedUnits as Array<{ kind?: unknown }>) : [];
  const pages = units.filter((u) => u?.kind === "page").length;
  if (slides > 0) {
    detail.units = slides;
    detail.unitLabel = "slides";
  } else if (pages > 0) {
    detail.units = pages;
    detail.unitLabel = "pages";
  }
  const words = countWords(row.input_text);
  if (words > 0) detail.words = words;
  if (typeof row.input_chars === "number" && row.input_chars > 0) detail.chars = row.input_chars;
  if (row.input_truncated) detail.truncated = true;
  if (structured?.deckSections && typeof structured.deckSections === "object") {
    const found = Object.entries(structured.deckSections as Record<string, unknown>)
      .filter(([, v]) => Array.isArray(v) && v.length > 0)
      .map(([k]) => k);
    if (found.length > 0) detail.sections = found.slice(0, 10);
  }
  return detail;
}

// ── Construction ────────────────────────────────────────────────────────────

export interface InitialStagesInput {
  /** ISO — the row's created_at (the upload landed and was saved). */
  createdAt: string;
  /** ISO — this worker claimed the row. */
  claimedAt: string;
  document: TbrStageDetail;
  company?: string;
  baselineSvi?: number;
  stageLabel?: string;
}

/** The timeline a freshly-claimed run starts from: upload + reading + baseline done, the pipeline waiting. */
export function initialStages(input: InitialStagesInput): TbrStageRecord[] {
  return TBR_STAGE_KEYS.map((key): TbrStageRecord => {
    if (key === "received") {
      return { key, status: "done", startedAt: input.createdAt, finishedAt: input.createdAt, detail: pick(input.document, ["filename", "chars"]) };
    }
    if (key === "read") {
      return { key, status: "done", startedAt: input.createdAt, finishedAt: input.createdAt, detail: { ...input.document } };
    }
    if (key === "score") {
      const detail: TbrStageDetail = {};
      if (input.company) detail.company = input.company;
      if (typeof input.baselineSvi === "number" && Number.isFinite(input.baselineSvi)) detail.baselineSvi = Math.round(input.baselineSvi);
      if (input.stageLabel) detail.stageLabel = input.stageLabel;
      return { key, status: "done", startedAt: input.createdAt, finishedAt: input.claimedAt, detail };
    }
    return { key, status: "waiting" };
  });
}

/**
 * The timeline of a row no worker has claimed yet (or a legacy envelope with
 * no stages): the document facts are real, the score stage says "queued".
 */
export function queuedStages(createdAt: string, document: TbrStageDetail, opts: { heldForCap?: boolean } = {}): TbrStageRecord[] {
  return TBR_STAGE_KEYS.map((key): TbrStageRecord => {
    if (key === "received") return { key, status: "done", startedAt: createdAt, finishedAt: createdAt, detail: pick(document, ["filename", "chars"]) };
    if (key === "read") return { key, status: "done", startedAt: createdAt, finishedAt: createdAt, detail: { ...document } };
    if (key === "score") return { key, status: "running", startedAt: createdAt, detail: { queued: true, ...(opts.heldForCap ? { heldForCap: true } : {}) } };
    return { key, status: "waiting" };
  });
}

/** Legacy phase label (envelope.progress.phase) → the stage it corresponds to. */
const LEGACY_PHASE_STAGE: Record<string, TbrStageKey> = {
  starting: "evidence",
  gather: "evidence",
  gathering: "evidence",
  analyze: "agents",
  wave1: "agents",
  wave2: "agents",
  wave3: "agents",
  wave4: "dimensions",
  synthesis: "synthesis",
  synthesizing: "synthesis",
  audit: "audit",
  rendering: "assemble",
};

/**
 * A run written before stages existed (in flight across the deploy): the
 * phase label is all there is, so earlier stages read done, the phase's
 * stage running, later ones waiting — no timings invented.
 */
export function stagesFromLegacyPhase(createdAt: string, document: TbrStageDetail, phase: string, chaptersDone: number): TbrStageRecord[] {
  const current = LEGACY_PHASE_STAGE[phase] ?? "evidence";
  const stages = initialStages({ createdAt, claimedAt: createdAt, document });
  for (const s of stages) {
    if (ORDER_INDEX[s.key] <= ORDER_INDEX.score) continue;
    if (ORDER_INDEX[s.key] < ORDER_INDEX[current]) s.status = "done";
    else if (s.key === current) s.status = "running";
  }
  if (chaptersDone > 0) {
    const dims = stages.find((s) => s.key === "dimensions")!;
    dims.detail = { ...(dims.detail ?? {}), done: Math.min(8, chaptersDone), total: 8 };
    if (dims.status === "waiting") dims.status = "running";
  }
  return stages;
}

// ── Transitions ─────────────────────────────────────────────────────────────

function pick(d: TbrStageDetail, keys: Array<keyof TbrStageDetail>): TbrStageDetail {
  const out: TbrStageDetail = {};
  for (const k of keys) if (d[k] !== undefined) (out as Record<string, unknown>)[k] = d[k];
  return out;
}

function find(stages: TbrStageRecord[], key: TbrStageKey): TbrStageRecord | undefined {
  return stages.find((s) => s.key === key);
}

/**
 * Start `key`. Every earlier pipeline stage still running is finished
 * (the pipeline is sequential); an earlier one that never started is
 * `skipped` (e.g. no W1–W3 on a partial re-run). Returns true when anything
 * changed.
 */
export function startStage(stages: TbrStageRecord[], key: TbrStageKey, at: string, detail?: TbrStageDetail): boolean {
  let changed = false;
  for (const s of stages) {
    if (ORDER_INDEX[s.key] >= ORDER_INDEX[key] || ORDER_INDEX[s.key] <= ORDER_INDEX.score) continue;
    // Only EARLIER stages are touched: the valuation chapter (published
    // after W4) is skipped here only when synthesis starts without it.
    if (s.status === "running") {
      s.status = "done";
      s.finishedAt = at;
      changed = true;
    } else if (s.status === "waiting") {
      s.status = "skipped";
      s.finishedAt = at;
      s.detail = { ...(s.detail ?? {}), reason: s.detail?.reason ?? "not_run" };
      changed = true;
    }
  }
  const s = find(stages, key);
  if (!s) return changed;
  if (s.status === "waiting") {
    s.status = "running";
    s.startedAt = at;
    changed = true;
  }
  if (detail) {
    s.detail = { ...(s.detail ?? {}), ...detail };
    changed = true;
  }
  return changed;
}

/** Finish `key` (starting it first when no start event was seen). */
export function finishStage(stages: TbrStageRecord[], key: TbrStageKey, at: string, detail?: TbrStageDetail, status: "done" | "failed" | "skipped" = "done"): boolean {
  const s = find(stages, key);
  if (!s) return false;
  if (s.status === "waiting") startStage(stages, key, at);
  if (isTerminal(s.status) && s.status === status && !detail) return false;
  s.status = status;
  s.startedAt ??= at;
  s.finishedAt = at;
  if (detail) s.detail = { ...(s.detail ?? {}), ...detail };
  return true;
}

/** Merge detail into a stage without changing its status. */
export function patchStage(stages: TbrStageRecord[], key: TbrStageKey, detail: TbrStageDetail): boolean {
  const s = find(stages, key);
  if (!s) return false;
  s.detail = { ...(s.detail ?? {}), ...detail };
  return true;
}

/** A phase label from the orchestrator's `progress` event → the stage it opens. */
const PHASE_STAGE: Record<string, TbrStageKey | undefined> = {
  gathering: "evidence",
  wave1: "agents",
  wave2: "agents",
  wave3: "agents",
  wave4: "dimensions",
  synthesizing: "synthesis",
  rendering: "assemble",
};

function sourcesFrom(diagnostics: Record<string, { ms: number; status: string; note?: string }> | undefined): TbrEvidenceSource[] {
  if (!diagnostics) return [];
  return Object.entries(diagnostics)
    .filter(([, d]) => d && typeof d === "object" && typeof d.status === "string")
    .map(([name, d]) => ({ name, status: d.status, ...(typeof d.ms === "number" && Number.isFinite(d.ms) ? { ms: Math.max(0, Math.round(d.ms)) } : {}) }))
    .slice(0, 20);
}

/**
 * Fold one orchestrator event into the timeline (mutates `stages`).
 * Returns true when the timeline changed — the runner saves right away then,
 * so a stage flip reaches the page on the next poll, not 4 s later.
 */
export function applyPipelineEvent(stages: TbrStageRecord[], ev: PipelineEvent, at: string): boolean {
  switch (ev.type) {
    case "context": {
      const changed = startStage(stages, "evidence", at, ev.industry ? { industry: ev.industry } : undefined);
      patchStage(stages, "dimensions", { total: Array.isArray(ev.dims) && ev.dims.length > 0 ? ev.dims.length : 8 });
      return changed;
    }
    case "gather_complete":
      return finishStage(stages, "evidence", at, { evidenceRows: ev.evidenceRows, sources: sourcesFrom(ev.diagnostics) });
    case "progress": {
      const key = PHASE_STAGE[String(ev.phase)];
      if (ev.phase === "complete") return finishStage(stages, "assemble", at);
      if (!key) return false;
      const wave = /^wave([123])$/.exec(String(ev.phase));
      return startStage(stages, key, at, wave ? { wave: Number(wave[1]) } : undefined);
    }
    case "dimension_start": {
      startStage(stages, "dimensions", at);
      const dims = find(stages, "dimensions")!;
      const writing = new Set(dims.detail?.writing ?? []);
      writing.add(ev.dim);
      patchStage(stages, "dimensions", { writing: [...writing] });
      return true;
    }
    case "dimension_complete": {
      startStage(stages, "dimensions", at);
      const dims = find(stages, "dimensions")!;
      const landed = dims.detail?.landed ?? [];
      if (landed.includes(ev.dim)) return false;
      const nextLanded = [...landed, ev.dim];
      const degraded = (dims.detail?.degraded ?? 0) + (ev.chapter?.degraded ? 1 : 0);
      const total = dims.detail?.total ?? 8;
      patchStage(stages, "dimensions", {
        landed: nextLanded,
        done: nextLanded.length,
        degraded,
        writing: (dims.detail?.writing ?? []).filter((d) => d !== ev.dim),
      });
      if (nextLanded.length >= total) finishStage(stages, "dimensions", at);
      return true;
    }
    case "valuation_complete": {
      const ch = ev.chapter as { status?: string; consensus?: { lowAud?: number; midAud?: number; highAud?: number } } | null;
      const c = ch && ch.status !== "unavailable" ? ch.consensus : undefined;
      const detail: TbrStageDetail =
        c && typeof c.midAud === "number" && c.midAud > 0
          ? { lowAud: c.lowAud, midAud: c.midAud, highAud: c.highAud }
          : { unavailable: true };
      return finishStage(stages, "valuation", at, detail);
    }
    case "criteria_synthesis": {
      const dims = find(stages, "dimensions");
      return dims && dims.status === "running" ? finishStage(stages, "dimensions", at) : false;
    }
    case "executive_complete": {
      const changed = finishStage(stages, "synthesis", at);
      startStage(stages, "audit", at);
      return changed;
    }
    case "audit_complete":
      return finishStage(stages, "audit", at, {
        groundedPct: Number.isFinite(ev.groundedShare) ? Math.round(ev.groundedShare * 100) : undefined,
        revised: ev.revised,
      });
    case "done": {
      patchStage(stages, "assemble", ev.deadlineHit ? { deadlineHit: true } : {});
      finishStage(stages, "assemble", at);
      finalizeStages(stages, at);
      return true;
    }
    default:
      return false;
  }
}

/** The document landed: anything still running is done, anything never started was skipped. */
export function finalizeStages(stages: TbrStageRecord[], at: string): void {
  for (const s of stages) {
    if (s.status === "running") {
      s.status = "done";
      s.finishedAt = at;
    } else if (s.status === "waiting") {
      s.status = "skipped";
      s.finishedAt = at;
      s.detail = { ...(s.detail ?? {}), reason: s.detail?.reason ?? "not_run" };
    }
  }
}

/** The run failed: the running stage is marked failed with a short reason; later stages stay waiting (the run is retried). */
export function failStages(stages: TbrStageRecord[], at: string, reason: TbrStageDetail["reason"]): void {
  let marked = false;
  for (const s of stages) {
    if (s.status === "running") {
      s.status = "failed";
      s.finishedAt = at;
      s.detail = { ...(s.detail ?? {}), reason };
      marked = true;
    }
  }
  if (!marked) {
    const next = stages.find((s) => s.status === "waiting");
    if (next) {
      next.status = "failed";
      next.startedAt ??= at;
      next.finishedAt = at;
      next.detail = { ...(next.detail ?? {}), reason };
    }
  }
}

/** Per-stage durations (ms) of a finished run — the timings ledger row. */
export function stageDurationsMs(stages: TbrStageRecord[]): Partial<Record<TbrStageKey, number>> {
  const out: Partial<Record<TbrStageKey, number>> = {};
  for (const s of stages) {
    if (s.status !== "done" || !s.startedAt || !s.finishedAt) continue;
    if (s.key === "received" || s.key === "read") continue;
    const ms = Date.parse(s.finishedAt) - Date.parse(s.startedAt);
    if (Number.isFinite(ms) && ms >= 0) out[s.key] = ms;
  }
  return out;
}

// ── The poll payload ────────────────────────────────────────────────────────

export type TbrRunState = "queued" | "held" | "running" | "done" | "retrying" | "failed";

export interface TbrStageView extends TbrStageRecord {
  /** Median (or default) seconds this stage takes. */
  etaSec: number;
  /** Seconds spent so far (running) or in total (finished); null when it has not started. */
  elapsedSec: number | null;
}

export interface TbrTimelineView {
  state: TbrRunState;
  stages: TbrStageView[];
  /** The stage running now, or null. */
  current: TbrStageKey | null;
  /** 0–100, weighted by stage ETAs; 100 only when the document exists. */
  percent: number;
  /** Seconds since the upload was saved (frozen at completion). */
  elapsedSec: number;
  /** Best estimate of the seconds left; null when finished, failed or held. */
  remainingSec: number | null;
  /** The running stage is well past its usual time (the page says "slower than usual — still running"). */
  overrun: boolean;
  /** A typical whole run, and how many real runs back that figure (0 = defaults). */
  typicalTotalSec: number;
  samples: number;
  /** ISO — the last time the worker wrote anything (event or heartbeat). */
  lastUpdateAt: string | null;
  /** ISO — the server's clock when this payload was built (the page ticks from it). */
  serverNow: string;
  /** AI calls answered so far in this run (a live counter the worker keeps). */
  calls: number | null;
}

export interface SummariseInput {
  stages: TbrStageRecord[];
  etas: StageEtas;
  now: Date;
  state: TbrRunState;
  /** ISO — the upload landed. */
  createdAt: string;
  /** ISO — the document landed (freezes elapsed). */
  completedAt?: string | null;
  /** ISO — the pipeline's wall-clock deadline for this run (caps the remaining estimate). */
  deadlineAt?: string | null;
  lastUpdateAt?: string | null;
  calls?: number | null;
}

function secondsBetween(a: string | undefined | null, b: number): number | null {
  if (!a) return null;
  const t = Date.parse(a);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, Math.round((b - t) / 1000));
}

export function summariseTimeline(input: SummariseInput): TbrTimelineView {
  const nowMs = input.now.getTime();
  const etaOf = (k: TbrStageKey) => Math.max(0, input.etas.stages[k] ?? DEFAULT_STAGE_SECONDS[k]);
  const stages: TbrStageView[] = input.stages.map((s) => {
    let elapsedSec: number | null = null;
    if (s.status === "running") elapsedSec = secondsBetween(s.startedAt, nowMs);
    else if (s.startedAt && s.finishedAt) {
      const ms = Date.parse(s.finishedAt) - Date.parse(s.startedAt);
      elapsedSec = Number.isFinite(ms) ? Math.max(0, Math.round(ms / 1000)) : null;
    }
    return { ...s, etaSec: etaOf(s.key), elapsedSec };
  });
  const current = stages.find((s) => s.status === "running")?.key ?? null;
  const finished = input.state === "done";

  // Percent: every stage weighs its ETA (at least 1 s, so the upload and
  // reading count for something); a running stage earns at most 95 % of its
  // weight until an event says it finished.
  let total = 0;
  let earned = 0;
  for (const s of stages) {
    const w = Math.max(1, s.etaSec);
    total += w;
    if (isTerminal(s.status)) earned += w;
    else if (s.status === "running") earned += Math.min(w * 0.95, s.elapsedSec ?? 0);
  }
  const percent = finished ? 100 : total > 0 ? Math.min(99, Math.max(1, Math.round((earned / total) * 100))) : 0;

  let remainingSec: number | null = null;
  if (!finished && (input.state === "running" || input.state === "queued" || input.state === "retrying")) {
    let r = 0;
    for (const s of stages) {
      if (s.status === "waiting") r += s.etaSec;
      else if (s.status === "running") r += Math.max(5, s.etaSec - (s.elapsedSec ?? 0));
    }
    // The pipeline always finishes by its deadline (it degrades instead of
    // waiting), so the estimate never promises longer than that.
    const deadline = input.deadlineAt ? Date.parse(input.deadlineAt) : Number.NaN;
    if (input.state === "running" && Number.isFinite(deadline)) r = Math.min(r, Math.max(10, Math.round((deadline - nowMs) / 1000) + 30));
    remainingSec = Math.max(0, Math.round(r));
  }

  const running = stages.find((s) => s.status === "running");
  const overrun = Boolean(
    !finished && running && running.key !== "score" && running.elapsedSec !== null && running.elapsedSec > running.etaSec + 20 && running.elapsedSec > running.etaSec * 1.5,
  );

  const endMs = finished && input.completedAt && Number.isFinite(Date.parse(input.completedAt)) ? Date.parse(input.completedAt) : nowMs;
  const elapsedSec = secondsBetween(input.createdAt, endMs) ?? 0;

  return {
    state: input.state,
    stages,
    current,
    percent,
    elapsedSec,
    remainingSec,
    overrun,
    typicalTotalSec: input.etas.totalSec,
    samples: input.etas.samples,
    lastUpdateAt: input.lastUpdateAt ?? null,
    serverNow: input.now.toISOString(),
    calls: typeof input.calls === "number" && Number.isFinite(input.calls) ? input.calls : null,
  };
}

/** The later of two ISO stamps (null-safe). */
export function latestIso(...values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const t = Date.parse(v);
    if (Number.isFinite(t) && t > bestMs) {
      best = v;
      bestMs = t;
    }
  }
  return best;
}

/** Loose shape check for the payload the page receives (an older server may send none). */
export function isTimelineView(v: unknown): v is TbrTimelineView {
  if (!v || typeof v !== "object") return false;
  const t = v as Partial<TbrTimelineView>;
  return Array.isArray(t.stages) && t.stages.every((s) => s && typeof s === "object" && isTbrStageKey((s as { key?: unknown }).key)) && typeof t.percent === "number" && typeof t.state === "string";
}
