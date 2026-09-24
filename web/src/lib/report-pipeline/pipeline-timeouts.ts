// G28-B — per-stage model timeouts + the W4 reserve for the report pipeline.
//
// Until 2026-09-21 every pipeline call asked ai-client for `timeoutMs:
// 120_000` per model attempt. With DeepInfra answering nothing, one W1
// criterion call walked three models × 120 s before the chain moved on —
// six of them in parallel — and the wall-clock budget was gone before W4
// (`showcase-rerun5/6.log`: W1 took 94–437 s of 480 s, eight degraded
// chapters, no report).
//
// The orchestrator now tells the caller which STAGE a call belongs to
// (`PipelineCallHint`, the 5th argument of its `callAI`), the caller maps
// it to a per-attempt timeout here, and — for a stage that shares the
// deadline with the rest of the run — caps the call's total wall clock at
// what is left of the run (`budgetMs`, so no attempt outlives the deadline).
//
//   criterion (W1–W3)   60 s   REPORT_PIPELINE_TIMEOUT_MS_CRITERION
//   chapter   (W4)     120 s   REPORT_PIPELINE_TIMEOUT_MS_CHAPTER
//   synthesis (CEO,
//     auditor, CDO)    120 s   REPORT_PIPELINE_TIMEOUT_MS_SYNTHESIS
//
// A caller without a hint (legacy paths, tests) keeps the old 120 s.
//
// W4 reserve: W1–W3 stop dispatching at `deadline − reserve` so the eight
// chapter calls always get their own window. 120 s by default
// (`REPORT_W4_RESERVE_MS`), never more than half the deadline — a 120 s
// interactive standard run keeps 60 s for W1 and 60 s for W4.

export type PipelineCallStage = "criterion" | "chapter" | "synthesis";

/** What the orchestrator hands its `callAI` on every call (5th argument). */
export interface PipelineCallHint {
  stage: PipelineCallStage;
  /** Wall clock left on the run's deadline at dispatch time (ms); the call may not outlive it. */
  remainingMs?: number;
}

export const PIPELINE_TIMEOUT_MS: Readonly<Record<PipelineCallStage, number>> = {
  criterion: 60_000, // healthy DeepInfra W1 calls take 56–91 s end-to-end (run 5) — 45 s struck the primary on slow-but-healthy days
  chapter: 120_000,
  synthesis: 120_000,
};

/** Timeout for a pipeline call with no stage hint (the pre-G28 figure). */
export const PIPELINE_TIMEOUT_MS_DEFAULT = 120_000;

/** Floor for any per-attempt timeout — below this a model cannot answer a chapter at all. */
export const PIPELINE_TIMEOUT_MS_MIN = 5_000;

export function pipelineTimeoutEnvName(stage: PipelineCallStage): string {
  return `REPORT_PIPELINE_TIMEOUT_MS_${stage.toUpperCase()}`;
}

/** Per-model timeout for a stage: env override, else the constant; no stage → the legacy 120 s. */
export function pipelineTimeoutMs(stage?: PipelineCallStage | null): number {
  if (!stage) return PIPELINE_TIMEOUT_MS_DEFAULT;
  const env = process.env[pipelineTimeoutEnvName(stage)];
  const n = env ? Number(env) : Number.NaN;
  const ms = Number.isFinite(n) && n > 0 ? Math.floor(n) : PIPELINE_TIMEOUT_MS[stage];
  return Math.max(PIPELINE_TIMEOUT_MS_MIN, ms);
}

/** Wall clock one fallback attempt needs after a failed first attempt (the criterion timeout). */
export const FALLBACK_HEADROOM_MS = PIPELINE_TIMEOUT_MS.criterion;

/**
 * `timeoutMs` (+ `budgetMs` when the hint carries the run's remaining wall
 * clock) for ai-client's `callAI`. Inside a budget the per-attempt timeout
 * is `min(stage timeout, max(budget / 2, budget − FALLBACK_HEADROOM_MS))`:
 * a first attempt never eats the whole window (a 120 s W4 reserve gives a
 * dead primary 75 s, then 45 s for the fallback), and a short window still
 * allows two attempts.
 */
export function pipelineCallTimeouts(hint?: PipelineCallHint | null): { timeoutMs: number; budgetMs?: number } {
  const timeoutMs = pipelineTimeoutMs(hint?.stage);
  if (!hint || typeof hint.remainingMs !== "number" || !Number.isFinite(hint.remainingMs)) return { timeoutMs };
  const budgetMs = Math.max(1_000, Math.floor(hint.remainingMs));
  const attemptCap = Math.max(PIPELINE_TIMEOUT_MS_MIN, Math.max(Math.floor(budgetMs / 2), budgetMs - FALLBACK_HEADROOM_MS));
  return { timeoutMs: Math.min(timeoutMs, attemptCap), budgetMs };
}

// ── Background run budget ───────────────────────────────
//
// Review v3.27.0 P1: every non-interactive run (paid order drain, workspace
// re-score, the free-grant job) needs the SAME wall clock the showcase script
// uses — the orchestrator's interactive default (120 s / 30 calls) degrades
// every chapter to cards. One helper, env overrides for ops.

export const BACKGROUND_CALL_MAX_DEFAULT = 48;
export const BACKGROUND_DEADLINE_MS_DEFAULT = 420_000;
export function backgroundRunBudget(env: NodeJS.ProcessEnv = process.env): { maxCalls: number; deadlineMs: number } {
  const calls = Number(env.REPORT_ORDER_CALL_MAX ?? "");
  const ms = Number(env.REPORT_ORDER_DEADLINE_MS ?? "");
  return {
    maxCalls: Number.isFinite(calls) && calls > 0 ? Math.floor(calls) : BACKGROUND_CALL_MAX_DEFAULT,
    deadlineMs: Number.isFinite(ms) && ms > 0 ? Math.floor(ms) : BACKGROUND_DEADLINE_MS_DEFAULT,
  };
}

// ── W4 reserve ──────────────────────────────────────────────────────────────

export const W4_RESERVE_MS_DEFAULT = 120_000;
export const W4_RESERVE_ENV = "REPORT_W4_RESERVE_MS";

/**
 * Wall clock W1–W3 must leave for W4 on a run with `deadlineMs`: the
 * configured reserve, capped at half the deadline so short interactive runs
 * still get a first wave.
 */
export function w4ReserveMsFor(deadlineMs: number): number {
  const env = process.env[W4_RESERVE_ENV];
  const n = env ? Number(env) : Number.NaN;
  const reserve = Number.isFinite(n) && n >= 0 ? Math.floor(n) : W4_RESERVE_MS_DEFAULT;
  return Math.max(0, Math.min(reserve, Math.floor(deadlineMs / 2)));
}

// ── SYNTH reserve (G33-T16) ─────────────────────────────────────────────────
//
// 24/09 canary: both real runs used the whole 420 s background deadline and
// the CEO summary started with 22–34 s left, so it timed out into the
// deterministic placeholder while all eight chapters were fine. W4 now stops at
// `deadline − synth reserve`; the summary (EXECUTIVE_MAX_TOKENS 2 600 ≈ 82 s on
// DeepSeek-V4-Flash at 32 tok/s) keeps that window. Never more than a quarter
// of the deadline, so a 120 s interactive run keeps 90 s for the waves.

export const SYNTH_RESERVE_MS_DEFAULT = 90_000;
export const SYNTH_RESERVE_ENV = "REPORT_SYNTH_RESERVE_MS";

export function synthReserveMsFor(deadlineMs: number): number {
  const env = process.env[SYNTH_RESERVE_ENV];
  const n = env ? Number(env) : Number.NaN;
  const reserve = Number.isFinite(n) && n >= 0 ? Math.floor(n) : SYNTH_RESERVE_MS_DEFAULT;
  return Math.max(0, Math.min(reserve, Math.floor(deadlineMs / 4)));
}
