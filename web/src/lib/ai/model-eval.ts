// A2 (pricing v5 §7.4, G35) — the model eval loop (engine).
//
// One run = every task profile × its golden cases × its eval candidates:
//   mode "smoke"  3 dev cases per task (nightly) — liveness, schema, latency;
//   mode "full"   the held-out split (weekly)  — the promotion evidence, plus
//                 a different-family judge on a sample of cases.
//
// Runs are RESUMABLE: a tick works until its wall-clock budget, checkpoints
// `model-eval-state-<mode>.json`, and the next tick of the same period (UTC
// day for smoke, ISO week for full) continues; once done, further ticks of
// that period are no-ops. A finished run is handed to the model coordinator
// (model-coordinator.ts) by the cron route.
//
// Spend (its OWN budget, separate from the report spend guard):
//   • hard cap per run (default US$1): before every call the worst-case cost
//     (prompt chars ÷ 3 + max_tokens at the catalogue price) is reserved;
//     a call that could cross the cap is never started → status
//     `budget_exhausted`, the run finalises with what it has;
//   • monthly eval budget (default US$5, `model-eval-budget.json`), same rule;
//   • only DeepInfra costs money; the free tiers price at zero; any other
//     provider is refused before I/O (`isEvalCallable`, defence in depth —
//     the transport refuses too).
//
// Pure engine with injected deps: tests drive it with fake transports.

import { costUsdFor, priceFor } from "./model-prices";
import { ModelEvalFixture, parseModelJson, scoreModelCase, type CaseScore, type ModelEvalCase } from "./model-eval-scoring";
import {
  EVAL_TASK_IDS,
  TASK_PROFILES,
  candidateKey,
  evalCandidates,
  isEvalCallable,
  judgeFor,
  type EvalCandidate,
  type EvalTaskId,
} from "./task-profiles";

export type EvalMode = "smoke" | "full";
export type EvalSplit = "dev" | "heldout";

export const RUN_COST_CAP_USD = 1;
export const DEFAULT_MONTHLY_EVAL_BUDGET_USD = 5;
export const SMOKE_CASES_PER_TASK = 3;
/** Default tick wall clock — under the route's maxDuration and cron-runner's --timeout. */
export const DEFAULT_TICK_WALL_MS = 240_000;
/** Stop starting new calls this close to the wall. */
const WALL_MARGIN_MS = 5_000;
/** Image tokens assumed when reserving a vision call (a 480×280 chart is well under this on every VL model). */
const VISION_IMAGE_TOKENS = 3_000;
const CHECKPOINT_EVERY = 10;

export interface EvalWorkItem {
  task: EvalTaskId;
  caseId: string;
  provider: string;
  model: string;
  family: string;
  judge: boolean;
}

export interface EvalResultRow {
  task: EvalTaskId;
  provider: string;
  model: string;
  score: CaseScore;
}

/**
 * `incomplete`: the run was closed before every item ran (its window ended, a
 * new period began, or ?finalize=1) — it is still coordinated, as partial
 * evidence (no promotion / eval-based demotion), never silently dropped.
 * `daily_cap_reached`: the shared paid-spend daily cap (spend-guard) is hit.
 */
export type EvalRunStatus = "running" | "done" | "budget_exhausted" | "monthly_budget_exhausted" | "daily_cap_reached" | "incomplete";

export interface EvalRunState {
  version: 1;
  run_id: string;
  mode: EvalMode;
  split: EvalSplit;
  /** smoke: UTC day YYYY-MM-DD; full: ISO week YYYY-Www. */
  period: string;
  started_at: string;
  updated_at: string;
  finished_at: string | null;
  status: EvalRunStatus;
  cap_usd: number;
  spent_usd: number;
  calls: number;
  judge_calls: number;
  judge_spent_usd: number;
  /** Calls made per provider in this run (writer + judge). */
  provider_calls?: Record<string, number>;
  candidates: Partial<Record<EvalTaskId, EvalCandidate[]>>;
  pending: EvalWorkItem[];
  results: EvalResultRow[];
  skipped: Array<{ task?: EvalTaskId; provider?: string; model?: string; reason: string }>;
  /** Planned item count (for progress). */
  planned: number;
  /** Set when the coordinator consumed this run. */
  coordinated_at?: string | null;
}

export interface EvalBudgetLedger {
  month: string;
  spent_usd: number;
  runs: number;
}

export interface ModelCallRequest {
  provider: string;
  model: string;
  system: string;
  user: string;
  maxTokens: number;
  timeoutMs: number;
  imageBase64?: string;
}

export interface ModelCallResponse {
  ok: boolean;
  text: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  error?: string;
}

export type ModelTransport = (req: ModelCallRequest) => Promise<ModelCallResponse>;

export interface EvalDeps {
  now(): number;
  loadFixture(task: EvalTaskId, split: EvalSplit): ModelEvalFixture | null;
  /** Base64 PNG for a vision case's `input.image` (relative to the task dir); null when missing. */
  loadImage(task: EvalTaskId, rel: string): string | null;
  freeLists(): Record<string, string[]>;
  configured(provider: string): boolean;
  call: ModelTransport;
  readState(mode: EvalMode): EvalRunState | null;
  writeState(mode: EvalMode, state: EvalRunState): void;
  readBudget(): EvalBudgetLedger | null;
  writeBudget(b: EvalBudgetLedger): void;
  runCapUsd?: number;
  monthlyBudgetUsd?: number;
  wallBudgetMs?: number;
  /** Minimum ms between two calls to one provider (free-tier RPM limits). */
  paceMs?: (provider: string) => number;
  sleep?: (ms: number) => Promise<void>;
  /** Max calls per provider per run — protects the production free-tier daily quota. */
  providerCallCaps?: Partial<Record<string, number>>;
  /** P2-3: record each PAID call's USD in the shared paid-spend ledger (spend-guard recordPaidSpend), tagged as eval. */
  recordSpend?: (provider: string, usd: number) => void;
  /** P2-3: the shared daily paid cap is reached — no paid call starts. */
  dailyCapReached?: () => boolean;
}

/** Free-tier pacing (requests/minute limits of the free plans). */
export const DEFAULT_PACE_MS: Readonly<Record<string, number>> = Object.freeze({ groq: 2_100, cerebras: 2_100, sambanova: 3_000, openrouter: 3_100 });

/**
 * Per-run call caps for the free tiers: the eval must never burn the daily
 * free quota production falls back on (OpenRouter `:free` is ~50 requests /
 * day on an account under US$10 of credit).
 */
export const DEFAULT_PROVIDER_CALL_CAPS: Readonly<Record<EvalMode, Readonly<Record<string, number>>>> = Object.freeze({
  smoke: Object.freeze({ openrouter: 6, groq: 60, cerebras: 60, sambanova: 30 }),
  full: Object.freeze({ openrouter: 24, groq: 250, cerebras: 250, sambanova: 120 }),
});

/**
 * Per-run call caps, overridable per mode by env (MODEL_EVAL_CALL_CAPS_FULL /
 * MODEL_EVAL_CALL_CAPS_SMOKE = "groq=200,openrouter=10"). Unknown / invalid
 * entries are ignored; a cap is a non-negative integer. Pure.
 */
export function parseCallCaps(raw: string | undefined, defaults: Readonly<Record<string, number>>): Record<string, number> {
  const out: Record<string, number> = { ...defaults };
  for (const part of (raw ?? "").split(",")) {
    const m = part.trim().match(/^([a-z0-9_-]+)\s*=\s*(\d{1,6})$/i);
    if (m) out[m[1]!.toLowerCase()] = Number(m[2]);
  }
  return out;
}

export interface TickOptions {
  restart?: boolean;
  dryRun?: boolean;
  /** Close a running run as `incomplete` (end of its window) without calling any model. */
  finalize?: boolean;
}

export interface TickResult {
  mode: EvalMode;
  run_id: string | null;
  period: string;
  status: EvalRunStatus | "noop" | "dry_run" | "nothing_to_run";
  processed: number;
  remaining: number;
  planned: number;
  spent_usd: number;
  cap_usd: number;
  month_spent_usd: number;
  /** True when this tick finished the run (the caller hands it to the coordinator). */
  finalized: boolean;
  /** Dry run: worst-case cost of the whole plan. */
  worst_case_usd?: number;
  state: EvalRunState | null;
}

// ── Period + ids ─────────────────────────────────────────────────────

export function utcDay(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** ISO-8601 week, e.g. 2026-W43. */
export function isoWeek(ms: number): string {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function periodFor(mode: EvalMode, ms: number): string {
  return mode === "smoke" ? utcDay(ms) : isoWeek(ms);
}

/** Deterministic [0,1) from a string (judge sampling must be reproducible). */
export function unitHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

// ── Cost ─────────────────────────────────────────────────────────────

/**
 * Worst-case USD for one call: one input token per prompt BYTE (no BPE
 * tokenizer emits more tokens than UTF-8 bytes — Vietnamese text is 2–3 bytes
 * a letter) + the image allowance + max_tokens out (the provider caps the
 * completion there). 0 for zero-priced providers.
 */
export function worstCaseCallUsd(provider: string, model: string, promptBytes: number, maxTokens: number, vision = false): number {
  const p = priceFor(provider, model);
  if (!p) return Number.POSITIVE_INFINITY; // unpriced paid model: never start it
  const inTok = Math.ceil(promptBytes) + (vision ? VISION_IMAGE_TOKENS : 0);
  return (inTok / 1_000_000) * p.in + (maxTokens / 1_000_000) * p.out;
}

function promptBytes(req: ModelCallRequest): number {
  return Buffer.byteLength(req.system) + Buffer.byteLength(req.user);
}

/** Actual USD from reported usage; estimate (chars ÷ 4) when the provider sent none. */
export function actualCallUsd(provider: string, model: string, req: ModelCallRequest, res: ModelCallResponse): number {
  const inTok = res.inputTokens ?? Math.ceil((req.system.length + req.user.length) / 4) + (req.imageBase64 ? VISION_IMAGE_TOKENS : 0);
  const outTok = res.outputTokens ?? Math.ceil((res.text?.length ?? 0) / 4);
  return costUsdFor(provider, model, inTok, outTok) ?? 0;
}

// ── Judge (different family, sampled) ────────────────────────────────

export const JUDGE_SYSTEM = [
  "You are an independent reviewer from a different model family than the writer.",
  "Score how well the ANSWER fulfils the TASK using ONLY the INPUT: faithfulness (no invented fact, figure, name or evidence id), completeness against the output contract, and the requested language.",
  'Return ONLY JSON: {"score": number between 0 and 1, "issues": string[] (at most 3, ≤ 20 words each)}.',
].join("\n");

export function renderJudgeUser(task: EvalTaskId, input: Record<string, unknown>, answer: string): string {
  const p = TASK_PROFILES[task];
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  return `TASK: ${p.label}\nCONTRACT:\n${clip(p.system, 1500)}\nINPUT:\n${clip(JSON.stringify(input), 6000)}\nANSWER:\n${clip(answer, 4000)}`;
}

export function parseJudgeScore(text: string): number | null {
  const o = parseModelJson(text);
  const s = o?.["score"];
  return typeof s === "number" && Number.isFinite(s) ? Math.max(0, Math.min(1, s)) : null;
}

// ── Planning ─────────────────────────────────────────────────────────

/** Smoke picks: the first two EN and first VI case (falls back to the first N). */
export function smokeCases(cases: readonly ModelEvalCase[], n = SMOKE_CASES_PER_TASK): ModelEvalCase[] {
  const en = cases.filter((c) => c.lang === "en").slice(0, n - 1);
  const vi = cases.filter((c) => c.lang === "vi").slice(0, 1);
  const pick = [...en, ...vi];
  return pick.length >= Math.min(n, cases.length) ? pick.slice(0, n) : cases.slice(0, n);
}

export function planRun(mode: EvalMode, deps: Pick<EvalDeps, "loadFixture" | "freeLists" | "configured" | "now">, capUsd: number): EvalRunState {
  const now = deps.now();
  const split: EvalSplit = mode === "smoke" ? "dev" : "heldout";
  const period = periodFor(mode, now);
  const freeLists = deps.freeLists();
  const candidates: Partial<Record<EvalTaskId, EvalCandidate[]>> = {};
  const skipped: EvalRunState["skipped"] = [];
  // Items per task, grouped by case — interleaved below so a capped provider
  // or a budget stop still covers every task evenly.
  const perTask: EvalWorkItem[][][] = [];
  for (const task of EVAL_TASK_IDS) {
    const profile = TASK_PROFILES[task];
    const fx = deps.loadFixture(task, split);
    if (!fx) {
      skipped.push({ task, reason: `fixture ${task}/${split} missing or invalid` });
      continue;
    }
    const cases = mode === "smoke" ? smokeCases(fx.cases) : fx.cases;
    const all = evalCandidates(profile, freeLists);
    const usable = all.filter((c) => {
      if (!isEvalCallable(c.provider, c.model)) return false;
      if (!deps.configured(c.provider)) {
        skipped.push({ task, provider: c.provider, model: c.model, reason: "provider not configured" });
        return false;
      }
      return true;
    });
    candidates[task] = usable;
    perTask.push(
      cases.map((c) =>
        usable.map((cand) => ({
          task, caseId: c.id, provider: cand.provider, model: cand.model, family: cand.family,
          judge: mode === "full" && profile.judgeSampleRate > 0 && unitHash(`${c.id}|${candidateKey(cand)}`) < profile.judgeSampleRate,
        })),
      ),
    );
  }
  const pending: EvalWorkItem[] = [];
  const maxCases = Math.max(0, ...perTask.map((t) => t.length));
  for (let i = 0; i < maxCases; i += 1) for (const t of perTask) if (t[i]) pending.push(...t[i]!);
  const iso = new Date(now).toISOString();
  return {
    version: 1,
    run_id: `${mode}-${period}-${iso.replace(/[-:.TZ]/g, "").slice(0, 14)}`,
    mode,
    split,
    period,
    started_at: iso,
    updated_at: iso,
    finished_at: null,
    status: "running",
    cap_usd: capUsd,
    spent_usd: 0,
    calls: 0,
    judge_calls: 0,
    judge_spent_usd: 0,
    candidates,
    pending,
    results: [],
    skipped,
    planned: pending.length,
    coordinated_at: null,
  };
}

// ── Tick ─────────────────────────────────────────────────────────────

function caseIndex(deps: Pick<EvalDeps, "loadFixture">, split: EvalSplit, tasks: Iterable<EvalTaskId>): Map<string, ModelEvalCase> {
  const idx = new Map<string, ModelEvalCase>();
  for (const task of tasks) {
    const fx = deps.loadFixture(task, split);
    for (const c of fx?.cases ?? []) idx.set(`${task}|${c.id}`, c);
  }
  return idx;
}

function buildRequest(item: EvalWorkItem, c: ModelEvalCase, deps: Pick<EvalDeps, "loadImage">): ModelCallRequest | { error: string } {
  const profile = TASK_PROFILES[item.task];
  let imageBase64: string | undefined;
  if (profile.vision) {
    const rel = String(c.input["image"] ?? "");
    const img = rel ? deps.loadImage(item.task, rel) : null;
    if (!img) return { error: `image missing: ${rel}` };
    imageBase64 = img;
  }
  return { provider: item.provider, model: item.model, system: profile.system, user: profile.renderUser(c.input, c.lang), maxTokens: profile.maxTokens, timeoutMs: profile.timeoutMs, imageBase64 };
}

/** Run (or resume) one tick of `mode`. */
export async function runEvalTick(mode: EvalMode, deps: EvalDeps, opts: TickOptions = {}): Promise<TickResult> {
  const startedAt = deps.now();
  const cap = deps.runCapUsd ?? RUN_COST_CAP_USD;
  const monthly = deps.monthlyBudgetUsd ?? DEFAULT_MONTHLY_EVAL_BUDGET_USD;
  const wall = deps.wallBudgetMs ?? DEFAULT_TICK_WALL_MS;
  const period = periodFor(mode, startedAt);
  const month = new Date(startedAt).toISOString().slice(0, 7);
  const prior = deps.readBudget();
  const budget: EvalBudgetLedger = prior && prior.month === month ? { ...prior } : { month, spent_usd: 0, runs: 0 };

  let state = deps.readState(mode);
  const samePeriod = state?.period === period;
  // P1-2: a run still `running` is never discarded. When its period is over, a
  // restart is asked for, or its window ends (?finalize=1), it is closed as
  // `incomplete` and handed to the coordinator THIS tick; the next tick plans anew.
  if (state && state.status === "running" && (!samePeriod || opts.restart || opts.finalize) && !opts.dryRun) {
    const nowIso = new Date(startedAt).toISOString();
    state.status = "incomplete";
    state.finished_at = nowIso;
    state.updated_at = nowIso;
    deps.writeState(mode, state);
    return { mode, run_id: state.run_id, period, status: "incomplete", processed: 0, remaining: state.pending.length, planned: state.planned, spent_usd: state.spent_usd, cap_usd: state.cap_usd, month_spent_usd: budget.spent_usd, finalized: true, state };
  }
  if (opts.finalize) {
    return { mode, run_id: state?.run_id ?? null, period, status: "noop", processed: 0, remaining: state?.pending.length ?? 0, planned: state?.planned ?? 0, spent_usd: state?.spent_usd ?? 0, cap_usd: state?.cap_usd ?? cap, month_spent_usd: budget.spent_usd, finalized: false, state };
  }
  if (state && samePeriod && state.status !== "running" && !opts.restart) {
    return { mode, run_id: state.run_id, period, status: "noop", processed: 0, remaining: state.pending.length, planned: state.planned, spent_usd: state.spent_usd, cap_usd: state.cap_usd, month_spent_usd: budget.spent_usd, finalized: false, state };
  }
  if (!state || !samePeriod || opts.restart) {
    state = planRun(mode, deps, cap);
    if (opts.dryRun) {
      const idx = caseIndex(deps, state.split, Object.keys(state.candidates) as EvalTaskId[]);
      let worst = 0;
      for (const item of state.pending) {
        const c = idx.get(`${item.task}|${item.caseId}`);
        if (!c) continue;
        const p = TASK_PROFILES[item.task];
        const bytes = Buffer.byteLength(p.system) + Buffer.byteLength(p.renderUser(c.input, c.lang));
        worst += worstCaseCallUsd(item.provider, item.model, bytes, p.maxTokens, p.vision);
        if (item.judge) {
          const j = judgeFor(item.family, deps.configured);
          // renderJudgeUser clips contract 1.5k + input 6k + answer 4k chars (≤ 3 bytes each).
          if (j) worst += worstCaseCallUsd(j.provider, j.model, Buffer.byteLength(JUDGE_SYSTEM) + (1_500 + 6_000 + 4_000) * 3, 200);
        }
      }
      return { mode, run_id: state.run_id, period, status: "dry_run", processed: 0, remaining: state.pending.length, planned: state.planned, spent_usd: 0, cap_usd: cap, month_spent_usd: budget.spent_usd, finalized: false, worst_case_usd: Math.round(worst * 1e6) / 1e6, state: null };
    }
    if (state.pending.length === 0) {
      state.status = "done";
      state.finished_at = state.started_at;
      deps.writeState(mode, state);
      return { mode, run_id: state.run_id, period, status: "nothing_to_run", processed: 0, remaining: 0, planned: 0, spent_usd: 0, cap_usd: cap, month_spent_usd: budget.spent_usd, finalized: false, state };
    }
    budget.runs += 1;
  }
  if (opts.dryRun) {
    return { mode, run_id: state.run_id, period, status: "dry_run", processed: 0, remaining: state.pending.length, planned: state.planned, spent_usd: state.spent_usd, cap_usd: state.cap_usd, month_spent_usd: budget.spent_usd, finalized: false, state: null };
  }

  const run = state;
  const idx = caseIndex(deps, run.split, Object.keys(run.candidates) as EvalTaskId[]);
  let reserved = 0;
  let stop: EvalRunStatus | null = null;
  let processed = 0;
  const done = new Set<EvalWorkItem>();

  /** Reserve worst-case spend; false (and sets `stop`) when it could cross a cap. */
  const reserve = (usd: number): boolean => {
    if (!Number.isFinite(usd)) return false;
    if (usd > 0 && deps.dailyCapReached?.()) {
      stop = stop ?? "daily_cap_reached";
      return false;
    }
    if (run.spent_usd + reserved + usd > run.cap_usd + 1e-12) {
      stop = stop ?? "budget_exhausted";
      return false;
    }
    if (budget.spent_usd + reserved + usd > monthly + 1e-12) {
      stop = stop ?? "monthly_budget_exhausted";
      return false;
    }
    reserved += usd;
    return true;
  };
  const timeLeft = () => startedAt + wall - deps.now();

  const caps = deps.providerCallCaps ?? DEFAULT_PROVIDER_CALL_CAPS[mode];
  const providerCalls = (run.provider_calls ??= {});
  const capped = new Set<string>();
  const lastCallAt = new Map<string, number>();
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const pace = async (provider: string) => {
    const gap = deps.paceMs ? deps.paceMs(provider) : 0;
    const last = lastCallAt.get(provider);
    if (gap > 0 && last !== undefined) {
      const wait = last + gap - deps.now();
      if (wait > 0) await sleep(Math.min(wait, gap));
    }
    lastCallAt.set(provider, deps.now());
  };
  /** False (and records it once) when the provider's per-run call cap is spent. */
  const underCap = (provider: string): boolean => {
    const cap = caps[provider];
    if (cap === undefined || (providerCalls[provider] ?? 0) < cap) return true;
    if (!capped.has(provider)) {
      capped.add(provider);
      run.skipped.push({ provider, reason: `per-run call cap ${cap} reached (protects the production free quota)` });
    }
    return false;
  };

  const callOnce = async (req: ModelCallRequest, worst: number): Promise<{ res: ModelCallResponse; cost: number } | null> => {
    if (!isEvalCallable(req.provider, req.model)) {
      return { res: { ok: false, text: "", latencyMs: 0, error: `refused: ${req.provider} is not an eval-callable provider` }, cost: 0 };
    }
    if (!underCap(req.provider)) return null;
    if (!reserve(worst)) return null;
    await pace(req.provider);
    providerCalls[req.provider] = (providerCalls[req.provider] ?? 0) + 1;
    let res: ModelCallResponse;
    try {
      res = await deps.call({ ...req, timeoutMs: Math.max(1_000, Math.min(req.timeoutMs, timeLeft() - WALL_MARGIN_MS)) });
    } catch (err) {
      res = { ok: false, text: "", latencyMs: 0, error: err instanceof Error ? err.message : String(err) };
    }
    reserved -= worst;
    // A failed call that reached the provider may still have been billed: charge its
    // worst case (zero on the free tiers) so the cap stays conservative.
    const cost = res.ok || res.inputTokens !== undefined ? actualCallUsd(req.provider, req.model, req, res) : res.latencyMs > 0 ? worst : 0;
    run.spent_usd = Math.round((run.spent_usd + cost) * 1e8) / 1e8;
    budget.spent_usd = Math.round((budget.spent_usd + cost) * 1e8) / 1e8;
    if (cost > 0) {
      try {
        deps.recordSpend?.(req.provider, cost);
      } catch {
        /* the ledger is best effort; the run cap + monthly budget still bind */
      }
    }
    return { res, cost };
  };

  const processItem = async (item: EvalWorkItem): Promise<boolean> => {
    const c = idx.get(`${item.task}|${item.caseId}`);
    const profile = TASK_PROFILES[item.task];
    if (!c) {
      run.skipped.push({ task: item.task, provider: item.provider, model: item.model, reason: `case ${item.caseId} vanished` });
      done.add(item);
      return true;
    }
    const req = buildRequest(item, c, deps);
    if ("error" in req) {
      run.results.push({ task: item.task, provider: item.provider, model: item.model, score: scoreModelCase(profile, c, { ok: false, text: "", latencyMs: 0, costUsd: 0, error: req.error }) });
      done.add(item);
      return true;
    }
    const worst = worstCaseCallUsd(item.provider, item.model, promptBytes(req), req.maxTokens, Boolean(req.imageBase64));
    if (!Number.isFinite(worst)) {
      // A paid model without a price row is never dialled (its spend could not be capped).
      run.skipped.push({ task: item.task, provider: item.provider, model: item.model, reason: "unpriced paid model" });
      done.add(item);
      return true;
    }
    if (!underCap(item.provider)) {
      done.add(item); // capped provider: the item is dropped from this run, not retried
      return true;
    }
    const r = await callOnce(req, worst);
    if (!r) return false;
    run.calls += 1;
    const score = scoreModelCase(profile, c, { ok: r.res.ok, text: r.res.text, latencyMs: r.res.latencyMs, costUsd: r.cost, error: r.res.error });
    if (item.judge && score.schemaOk) {
      const judge = judgeFor(item.family, deps.configured);
      if (judge) {
        const jreq: ModelCallRequest = { provider: judge.provider, model: judge.model, system: JUDGE_SYSTEM, user: renderJudgeUser(item.task, c.input, r.res.text), maxTokens: 200, timeoutMs: 60_000 };
        const jworst = worstCaseCallUsd(judge.provider, judge.model, promptBytes(jreq), jreq.maxTokens);
        const j = await callOnce(jreq, jworst);
        if (j) {
          run.judge_calls += 1;
          run.judge_spent_usd = Math.round((run.judge_spent_usd + j.cost) * 1e8) / 1e8;
          score.judgeScore = j.res.ok ? parseJudgeScore(j.res.text) : null;
        }
      }
    }
    run.results.push({ task: item.task, provider: item.provider, model: item.model, score });
    done.add(item);
    processed += 1;
    if (processed % CHECKPOINT_EVERY === 0) {
      run.pending = run.pending.filter((it) => !done.has(it));
      run.updated_at = new Date(deps.now()).toISOString();
      deps.writeState(mode, run);
      deps.writeBudget(budget);
    }
    return true;
  };

  // One sequential lane per provider (DeepInfra gets two) — providers run in parallel.
  const lanes = new Map<string, EvalWorkItem[]>();
  let diFlip = 0;
  for (const item of run.pending) {
    const key = item.provider === "deepinfra" ? `deepinfra#${(diFlip++ % 2)}` : item.provider;
    const lane = lanes.get(key) ?? [];
    lane.push(item);
    lanes.set(key, lane);
  }
  await Promise.all(
    [...lanes.values()].map(async (lane) => {
      for (const item of lane) {
        if (stop) return;
        if (timeLeft() <= WALL_MARGIN_MS) return;
        const ok = await processItem(item);
        if (!ok) return;
      }
    }),
  );

  run.pending = run.pending.filter((it) => !done.has(it));
  run.updated_at = new Date(deps.now()).toISOString();
  let finalized = false;
  if (stop) {
    run.status = stop;
    run.finished_at = run.updated_at;
    finalized = true;
  } else if (run.pending.length === 0) {
    run.status = "done";
    run.finished_at = run.updated_at;
    finalized = true;
  }
  deps.writeState(mode, run);
  deps.writeBudget(budget);
  return {
    mode, run_id: run.run_id, period, status: run.status, processed, remaining: run.pending.length, planned: run.planned,
    spent_usd: run.spent_usd, cap_usd: run.cap_usd, month_spent_usd: budget.spent_usd, finalized, state: run,
  };
}
