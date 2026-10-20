// A2 (pricing v5 §7.4, G35) — wiring for POST /api/cron/model-eval.
//
// Builds the real deps (fixtures from the live checkout, runtime state
// under content/reports via runtime-paths, the eval transport, env keys),
// runs one eval tick and — when the tick finishes a run — hands it to the
// model coordinator, which writes the scorecard + routing policy.
//
// Runtime files (all `runtimeReportsPath`, never the release dir):
//   model-eval-state-smoke.json / model-eval-state-full.json   resumable run state
//   model-eval-budget.json                                     own monthly budget ledger
//   model-eval-history.jsonl                                   one line per finished run
//   ai-model-scorecard.json / .jsonl, ai-routing-policy.json, ai-routing-policy-history.jsonl

import * as fs from "fs";
import path from "node:path";
import { getRuntimeWebDir, runtimeReportsPath } from "@/lib/runtime-paths";
import { readJsonlTail, getStatusRoot } from "@/lib/status/jsonl";
import { ModelEvalFixture, type ModelEvalFixture as ModelEvalFixtureT } from "./model-eval-scoring";
import { DEFAULT_MONTHLY_EVAL_BUDGET_USD, DEFAULT_PACE_MS, RUN_COST_CAP_USD, runEvalTick, type EvalDeps, type EvalMode, type EvalRunState, type EvalSplit, type TickResult } from "./model-eval";
import { createEvalTransport, evalProviderConfigured } from "./model-eval-transport";
import {
  SCORECARD_FILE_NAME,
  SCORECARD_JSONL_NAME,
  appendJsonl,
  coordinate,
  liveSignalsFromTbr,
  readJsonFile,
  writeJsonAtomic,
  type Scorecard,
} from "./model-coordinator";
import { _resetRoutingPolicyCache, readRoutingPolicyFresh, routingPolicyFile, routingPolicyHistoryFile } from "./routing-policy";
import { isDeadRung, readStrikes } from "./model-strikes";
import type { EvalTaskId } from "./task-profiles";
import { EVAL_FREE_PROVIDERS } from "./task-profiles";

export const EVAL_STATE_FILE = (mode: EvalMode) => `model-eval-state-${mode}.json`;
export const EVAL_BUDGET_FILE = "model-eval-budget.json";
export const EVAL_HISTORY_FILE = "model-eval-history.jsonl";

/** Fixtures live in the git checkout, not the standalone release dir (which ships no test-fixtures). */
export function modelEvalFixtureDir(): string {
  const live = path.join(getRuntimeWebDir(), "test-fixtures", "model-eval");
  if (fs.existsSync(live)) return live;
  return path.join(process.cwd(), "test-fixtures", "model-eval");
}

function monthlyBudget(): number {
  const n = Number(process.env.MODEL_EVAL_MONTHLY_BUDGET_USD);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_EVAL_BUDGET_USD;
}

function runCap(): number {
  // The per-run cap can be LOWERED by env, never raised above US$1 (plan §7.4).
  const n = Number(process.env.MODEL_EVAL_RUN_CAP_USD);
  return Number.isFinite(n) && n > 0 ? Math.min(n, RUN_COST_CAP_USD) : RUN_COST_CAP_USD;
}

export interface CronParams {
  mode: EvalMode;
  restart?: boolean;
  dryRun?: boolean;
}

export interface CronOverrides {
  deps?: Partial<EvalDeps>;
  freeModelsFile?: string;
  defaultPaidLadders?: { report: readonly string[]; synthesis: readonly string[]; classify: readonly string[] };
}

export interface CronResult extends Omit<TickResult, "state"> {
  coordinated: boolean;
  decisions: number;
  skipped: number;
}

function readFreeLists(file: string): Record<string, string[]> {
  const raw = readJsonFile<Record<string, unknown>>(file) ?? {};
  const out: Record<string, string[]> = {};
  for (const p of EVAL_FREE_PROVIDERS) {
    const v = raw[p];
    if (Array.isArray(v)) out[p] = v.filter((x): x is string => typeof x === "string");
  }
  return out;
}

export function buildEvalDeps(overrides: CronOverrides = {}, thinkingOff?: ReadonlySet<string>, freeModelsFile?: string): EvalDeps {
  const dir = modelEvalFixtureDir();
  const fixtureCache = new Map<string, ModelEvalFixtureT | null>();
  const deps: EvalDeps = {
    now: () => Date.now(),
    loadFixture: (task: EvalTaskId, split: EvalSplit) => {
      const k = `${task}/${split}`;
      if (!fixtureCache.has(k)) {
        const parsed = ModelEvalFixture.safeParse(readJsonFile(path.join(dir, task, `${split}.json`)));
        fixtureCache.set(k, parsed.success && parsed.data.task === task && parsed.data.split === split ? parsed.data : null);
      }
      return fixtureCache.get(k) ?? null;
    },
    loadImage: (task: EvalTaskId, rel: string) => {
      const abs = path.resolve(dir, task, rel);
      if (!abs.startsWith(path.resolve(dir, task) + path.sep)) return null; // no path escape from the fixture dir
      try {
        return fs.readFileSync(abs).toString("base64");
      } catch {
        return null;
      }
    },
    freeLists: () => (freeModelsFile ? readFreeLists(freeModelsFile) : {}),
    configured: (p: string) => evalProviderConfigured(p),
    call: createEvalTransport({ thinkingOff }),
    readState: (mode) => readJsonFile<EvalRunState>(runtimeReportsPath(EVAL_STATE_FILE(mode))),
    writeState: (mode, state) => writeJsonAtomic(runtimeReportsPath(EVAL_STATE_FILE(mode)), state),
    readBudget: () => readJsonFile(runtimeReportsPath(EVAL_BUDGET_FILE)),
    writeBudget: (b) => writeJsonAtomic(runtimeReportsPath(EVAL_BUDGET_FILE), b),
    runCapUsd: runCap(),
    monthlyBudgetUsd: monthlyBudget(),
    paceMs: (p: string) => DEFAULT_PACE_MS[p] ?? 0,
  };
  return { ...deps, ...(overrides.deps ?? {}) };
}

/** Coordinate a finished run: scorecard + policy + history. Returns the decision count. */
export async function coordinateRun(
  run: EvalRunState,
  opts: { freeLadders: Record<string, readonly string[]>; defaultPaidLadders: { report: readonly string[]; synthesis: readonly string[]; classify: readonly string[] }; now?: Date },
): Promise<number> {
  const tbr = await readJsonlTail<{ ts?: string; sections?: Array<{ id?: string; model?: string | null; grounded?: boolean }> }>(getStatusRoot(), "tbr-quality.jsonl", 400);
  const strikes = readStrikes();
  const now = opts.now ?? new Date();
  // Read the policy fresh and write it back with no await in between (an admin
  // Approve in the same process cannot interleave).
  const scorecardFile = runtimeReportsPath(SCORECARD_FILE_NAME);
  const out = coordinate({
    run,
    prior: readJsonFile<Scorecard>(scorecardFile),
    policy: readRoutingPolicyFresh(),
    live: liveSignalsFromTbr(tbr),
    isDead: (p, m) => isDeadRung(strikes, p, m, now),
    freeLadders: opts.freeLadders,
    defaultPaidLadders: opts.defaultPaidLadders,
    now,
  });
  writeJsonAtomic(routingPolicyFile(), out.policy);
  appendJsonl(routingPolicyHistoryFile(), out.history);
  writeJsonAtomic(scorecardFile, out.scorecard);
  appendJsonl(runtimeReportsPath(SCORECARD_JSONL_NAME), out.jsonl);
  _resetRoutingPolicyCache();
  return out.decisions.length;
}

/** One cron invocation. */
export async function runModelEvalCron(params: CronParams, overrides: CronOverrides = {}): Promise<CronResult> {
  // ai-client is loaded lazily: its constants are the dispatcher's own ladders.
  const ai = await import("@/lib/ai-client");
  const freeModelsFile = overrides.freeModelsFile ?? ai.FREE_MODELS_CONFIG;
  const deps = buildEvalDeps(overrides, ai.DEEPINFRA_THINKING_OFF, freeModelsFile);
  const tick = await runEvalTick(params.mode, deps, { restart: params.restart, dryRun: params.dryRun });
  let coordinated = false;
  let decisions = 0;
  // A finished run whose coordination never landed (the process died between the
  // last tick and the write) is coordinated by the next tick of its period.
  const uncoordinated = tick.status === "noop" && tick.state !== null && !tick.state.coordinated_at && tick.state.results.length > 0;
  if ((tick.finalized || uncoordinated) && tick.state) {
    const freeLadders: Record<string, readonly string[]> = { ...deps.freeLists() };
    for (const p of EVAL_FREE_PROVIDERS) if (!freeLadders[p]?.length) freeLadders[p] = ai.ladderFor(p as Parameters<typeof ai.ladderFor>[0]);
    const defaults = overrides.defaultPaidLadders ?? {
      report: ai.DEEPINFRA_MODELS_BY_CLASS.report,
      synthesis: ai.DEEPINFRA_MODELS_BY_CLASS.synthesis,
      classify: ai.DEEPINFRA_MODELS_BY_CLASS.classify,
    };
    decisions = await coordinateRun(tick.state, { freeLadders, defaultPaidLadders: defaults });
    coordinated = true;
    tick.state.coordinated_at = new Date().toISOString();
    deps.writeState(params.mode, tick.state);
    appendJsonl(runtimeReportsPath(EVAL_HISTORY_FILE), [
      {
        ts: tick.state.coordinated_at, run_id: tick.state.run_id, mode: tick.state.mode, status: tick.state.status,
        planned: tick.state.planned, calls: tick.state.calls, judge_calls: tick.state.judge_calls,
        spent_usd: tick.state.spent_usd, judge_spent_usd: tick.state.judge_spent_usd, cap_usd: tick.state.cap_usd,
        month_spent_usd: tick.month_spent_usd, decisions, skipped: tick.state.skipped.length,
      },
    ]);
  }
  const { state, ...rest } = tick;
  return { ...rest, coordinated, decisions, skipped: state?.skipped.length ?? 0 };
}
