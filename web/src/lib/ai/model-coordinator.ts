// A2 (pricing v5 §7.4, G35) — the model coordinator.
//
// Consumes a finished eval run (model-eval.ts) plus live signals and writes:
//   content/reports/ai-model-scorecard.json    latest scorecard (admin card)
//   content/reports/ai-model-scorecard.jsonl   one row per task × model per FULL run
//   content/reports/ai-routing-policy.json     free section (AUTO) + paid proposal
//   content/reports/ai-routing-policy-history.jsonl  every policy change
//
// Scorecard = aggregate (quality, cost per accepted output by provider +
// task) and detail (per section / chapter, per language, p95, schema-fail
// rate), primary vs challenger per task.
//
// Rules (plan §7.4, verbatim):
//   PROMOTE a challenger when, on the held-out set (complete FULL run only):
//     0 critical errors, AND
//     (quality ≥ primary − 0.02 AND cost/accepted ≤ 80 % of primary — and
//      strictly cheaper, so two zero-cost models never "win" on cost)
//     OR (quality ≥ primary + 0.05 AND cost/accepted ≤ 1.5 × primary),
//   on 2 CONSECUTIVE full runs. A judge veto (judge mean < primary's − 0.10
//   when both were judged) blocks a win: the LLM judge is a triage aid, never
//   the sole evidence (SOT §13.1).
//   DEMOTE when live groundedShare < 0.80 over the last 20 sections, schema
//   fail > 10 %, p95 over the profile SLO, or dead (every eval call failed /
//   a live dead-rung strike).
//   FREE models: promote / demote / re-admit AUTOMATICALLY (policy.free).
//   PAID (DeepInfra) ladders: PROPOSAL ONLY (policy.paid.proposal); an admin
//   Approve copies it into policy.paid.active, Rollback restores the
//   previous ladder (approveProposal / rollbackPaidPolicy below, called by
//   POST /api/admin/ai-health/routing-policy, audited).
//
// Pure decision functions + small file helpers (injectable paths).

import * as fs from "fs";
import path from "node:path";
import { REPORT_ADMITTED_MODELS } from "./report-admitted-models";
import { aggregateCaseScores, type CaseScore, type TaskModelScore } from "./model-eval-scoring";
import type { EvalRunState } from "./model-eval";
import {
  FREE_DEMOTION_TTL_MS,
  FREE_POLICY_PROVIDERS,
  PAID_POLICY_CLASSES,
  RoutingPolicy,
  activeDemotions,
  emptyRoutingPolicy,
  type FreeProviderPolicy,
  type PaidLadders,
  type PaidPolicyClass,
  type PaidProposal,
} from "./routing-policy";
import { EVAL_TASK_IDS, TASK_PROFILES, candidateKey, cataloguePrimary, type EvalCandidate, type EvalTaskId } from "./task-profiles";

export const SCORECARD_FILE_NAME = "ai-model-scorecard.json";
export const SCORECARD_JSONL_NAME = "ai-model-scorecard.jsonl";

/** Plan §7.4 thresholds. */
export const PROMOTE_QUALITY_TOLERANCE = 0.02;
export const PROMOTE_COST_RATIO = 0.8;
export const PROMOTE_QUALITY_GAIN = 0.05;
export const PROMOTE_GAIN_COST_RATIO = 1.5;
export const PROMOTE_CONSECUTIVE_WINS = 2;
export const JUDGE_VETO_MARGIN = 0.1;
export const DEMOTE_LIVE_GROUNDED_BELOW = 0.8;
export const DEMOTE_LIVE_MIN_SECTIONS = 20;
export const DEMOTE_SCHEMA_FAIL_ABOVE = 0.1;
/** P1-1: a free model is demoted only after this many consecutive failing complete full runs. */
export const FREE_DEMOTE_CONSECUTIVE_FAILS = 2;
/** P1-1: when more than this share of a model's calls failed transiently (429 / timeout of OUR load), the run says nothing about it. */
export const FREE_TRANSIENT_INCONCLUSIVE_SHARE = 0.2;
export { FREE_DEMOTION_TTL_MS };
/** Float tolerance for the threshold comparisons (0.91 + 0.05 must equal 0.96). */
const EPS = 1e-9;

// ── Types ────────────────────────────────────────────────────────────

export interface LiveModelSignal {
  /** Most recent sections considered (≤ 20). */
  sections: number;
  grounded: number;
  share: number | null;
  last_ts: string | null;
}

export type DecisionKind = "promote" | "demote" | "readmit" | "advisory_promote" | "advisory_demote";

export interface Decision {
  kind: DecisionKind;
  scope: "free" | "paid" | "none";
  task?: EvalTaskId;
  provider: string;
  model: string;
  reason: string;
  /** free: applied automatically; paid: written as a proposal; none: scorecard only. */
  outcome: "applied" | "proposed" | "advisory";
}

export interface TaskCard {
  task: EvalTaskId;
  label: string;
  dispatcherClass: string | null;
  reportScope: boolean;
  primary: { provider: string; model: string; source: "approved_policy" | "catalogue" | "free_policy" } | null;
  challenger: { provider: string; model: string; wins: number } | null;
  /** Latest FULL-run rows (held-out). */
  models: TaskModelScore[];
  /** Latest SMOKE rows (3 dev cases) — liveness only. */
  smoke: Array<Pick<TaskModelScore, "provider" | "model" | "n" | "quality" | "schemaFailRate" | "p95LatencyMs" | "dead" | "costUsd">>;
  last_full_eval: string | null;
  last_smoke_eval: string | null;
}

export interface ProviderTaskRollup {
  task: EvalTaskId;
  provider: string;
  models: number;
  cases: number;
  accepted: number;
  quality: number;
  costUsd: number;
  costPerAccepted: number | null;
}

export interface RunSummary {
  run_id: string;
  mode: "smoke" | "full";
  status: string;
  finished_at: string | null;
  spent_usd: number;
  judge_spent_usd: number;
  calls: number;
  judge_calls: number;
  complete: boolean;
}

export interface Scorecard {
  version: 1;
  updated_at: string;
  last_full: RunSummary | null;
  last_smoke: RunSummary | null;
  tasks: Partial<Record<EvalTaskId, TaskCard>>;
  providers: ProviderTaskRollup[];
  live: Record<string, LiveModelSignal>;
  /** Consecutive full-run wins: `task|provider:model` and `free|provider|model`. */
  streaks: Record<string, { wins: number; last_run: string }>;
  decisions: Decision[];
  /** P2-2: challengers that won but are not in the dispatcher's class ladder (founder: catalogue + price policy first). */
  needs_admission: Array<{ task: EvalTaskId; cls: string; model: string; reason: string }>;
}

export interface CoordinatorInput {
  run: EvalRunState;
  prior: Scorecard | null;
  policy: RoutingPolicy | null;
  /** Live grounding per `provider:model` (tbr-quality sections). */
  live: Record<string, LiveModelSignal>;
  /** True when the live strike table marks provider:model dead. */
  isDead(provider: string, model: string): boolean;
  /** Free ladders the dispatcher dials today (ai-free-models.json + curated defaults). */
  freeLadders: Record<string, readonly string[]>;
  /** DeepInfra default ladders per dispatcher class (ai-client DEEPINFRA_MODELS_BY_CLASS). */
  defaultPaidLadders: Record<PaidPolicyClass, readonly string[]>;
  now: Date;
}

export interface CoordinatorOutput {
  scorecard: Scorecard;
  policy: RoutingPolicy;
  /** Rows to append to ai-model-scorecard.jsonl (full runs only). */
  jsonl: Array<Record<string, unknown>>;
  /** Policy changes to append to the history ledger. */
  history: Array<Record<string, unknown>>;
  decisions: Decision[];
}

// ── Live signal (tbr-quality.jsonl `sections`) ───────────────────────

interface TbrRowLike {
  ts?: string;
  sections?: Array<{ id?: string; model?: string | null; grounded?: boolean }>;
}

/** Last ≤ 20 audited sections per `provider:model`, newest rows first. Pure. */
export function liveSignalsFromTbr(rows: readonly TbrRowLike[], window = DEMOTE_LIVE_MIN_SECTIONS): Record<string, LiveModelSignal> {
  const out: Record<string, LiveModelSignal> = {};
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const r = rows[i]!;
    for (const s of r.sections ?? []) {
      const m = s?.model;
      if (!m || m === "deterministic" || m === "cache" || !m.includes(":")) continue;
      const cur = out[m] ?? { sections: 0, grounded: 0, share: null, last_ts: r.ts ?? null };
      if (cur.sections >= window) continue;
      cur.sections += 1;
      if (s.grounded) cur.grounded += 1;
      out[m] = cur;
    }
  }
  for (const v of Object.values(out)) v.share = v.sections ? Math.round((v.grounded / v.sections) * 1000) / 1000 : null;
  return out;
}

// ── Rules ────────────────────────────────────────────────────────────

const cpa = (r: Pick<TaskModelScore, "costPerAccepted">) => (r.costPerAccepted === null ? Number.POSITIVE_INFINITY : r.costPerAccepted);

/** Plan §7.4 promotion test for ONE run (the streak makes it two). Pure. */
export function challengerWins(ch: TaskModelScore, pr: TaskModelScore): { win: boolean; reason: string } {
  if (ch.criticalErrors > 0) return { win: false, reason: `${ch.criticalErrors} critical error(s) on held-out` };
  if (!ch.passesProfile) return { win: false, reason: `fails profile: ${ch.failReasons.join("; ")}` };
  if (ch.judge.mean !== null && pr.judge.mean !== null && ch.judge.mean < pr.judge.mean - JUDGE_VETO_MARGIN) {
    return { win: false, reason: `judge veto ${ch.judge.mean} vs ${pr.judge.mean}` };
  }
  const cC = cpa(ch);
  const cP = cpa(pr);
  const cheaper = Number.isFinite(cC) && cC < cP && cC <= PROMOTE_COST_RATIO * cP + EPS;
  if (ch.quality >= pr.quality - PROMOTE_QUALITY_TOLERANCE - EPS && cheaper) {
    return { win: true, reason: `quality ${ch.quality} ≥ ${pr.quality} − ${PROMOTE_QUALITY_TOLERANCE} at ≤ ${PROMOTE_COST_RATIO * 100}% cost/accepted` };
  }
  if (ch.quality >= pr.quality + PROMOTE_QUALITY_GAIN - EPS && Number.isFinite(cC) && (cC <= PROMOTE_GAIN_COST_RATIO * cP + EPS || !Number.isFinite(cP))) {
    return { win: true, reason: `quality ${ch.quality} ≥ ${pr.quality} + ${PROMOTE_QUALITY_GAIN} at ≤ ${PROMOTE_GAIN_COST_RATIO}× cost/accepted` };
  }
  return { win: false, reason: `quality ${ch.quality} vs ${pr.quality}, cost/accepted ${Number.isFinite(cC) ? cC.toFixed(5) : "—"} vs ${Number.isFinite(cP) ? cP.toFixed(5) : "—"}` };
}

/** Plan §7.4 demotion signals for one model. Pure; empty = keep. */
export function demotionReasons(
  row: Pick<TaskModelScore, "schemaFailRate" | "p95LatencyMs" | "dead" | "n" | "transportFails"> | null,
  p95CeilingMs: number,
  live: LiveModelSignal | undefined,
  struckDead: boolean,
  opts: { useEvalQuality: boolean } = { useEvalQuality: true },
): string[] {
  const out: string[] = [];
  if (live && live.sections >= DEMOTE_LIVE_MIN_SECTIONS && live.share !== null && live.share < DEMOTE_LIVE_GROUNDED_BELOW) {
    out.push(`live groundedShare ${live.share} < ${DEMOTE_LIVE_GROUNDED_BELOW} over ${live.sections} sections`);
  }
  if (struckDead) out.push("dead (live strike table)");
  if (row) {
    if (row.dead) out.push(`dead (0/${row.n} eval calls answered)`);
    if (opts.useEvalQuality && row.schemaFailRate > DEMOTE_SCHEMA_FAIL_ABOVE) out.push(`schema fail ${Math.round(row.schemaFailRate * 100)}% > 10%`);
    if (opts.useEvalQuality && row.p95LatencyMs !== null && row.p95LatencyMs > p95CeilingMs) out.push(`p95 ${Math.round(row.p95LatencyMs / 1000)}s > SLO ${Math.round(p95CeilingMs / 1000)}s`);
  }
  return out;
}

// ── Helpers ──────────────────────────────────────────────────────────

function rowsForRun(run: EvalRunState): Partial<Record<EvalTaskId, TaskModelScore[]>> {
  const out: Partial<Record<EvalTaskId, TaskModelScore[]>> = {};
  for (const task of EVAL_TASK_IDS) {
    const cands = run.candidates[task] ?? [];
    const rows: TaskModelScore[] = [];
    for (const cand of cands) {
      const scores: CaseScore[] = run.results.filter((r) => r.task === task && r.provider === cand.provider && r.model === cand.model).map((r) => r.score);
      if (scores.length === 0) continue;
      rows.push(aggregateCaseScores(TASK_PROFILES[task], cand, scores));
    }
    if (rows.length) out[task] = rows;
  }
  return out;
}

function rollup(rows: Partial<Record<EvalTaskId, TaskModelScore[]>>): ProviderTaskRollup[] {
  const out: ProviderTaskRollup[] = [];
  for (const task of EVAL_TASK_IDS) {
    const byProv = new Map<string, TaskModelScore[]>();
    for (const r of rows[task] ?? []) byProv.set(r.provider, [...(byProv.get(r.provider) ?? []), r]);
    for (const [provider, rs] of byProv) {
      const cases = rs.reduce((s, r) => s + r.n, 0);
      const accepted = rs.reduce((s, r) => s + r.accepted, 0);
      const costUsd = Math.round(rs.reduce((s, r) => s + r.costUsd, 0) * 1e8) / 1e8;
      out.push({
        task, provider, models: rs.length, cases, accepted,
        quality: cases ? Math.round((rs.reduce((s, r) => s + r.quality * r.n, 0) / cases) * 1000) / 1000 : 0,
        costUsd, costPerAccepted: accepted ? Math.round((costUsd / accepted) * 1e8) / 1e8 : null,
      });
    }
  }
  return out;
}

function summary(run: EvalRunState): RunSummary {
  return {
    run_id: run.run_id, mode: run.mode, status: run.status, finished_at: run.finished_at, spent_usd: run.spent_usd,
    judge_spent_usd: run.judge_spent_usd, calls: run.calls, judge_calls: run.judge_calls, complete: run.status === "done",
  };
}

/** Consecutive-win counter; idempotent when the same run is coordinated twice. */
function bumpStreak(streaks: Scorecard["streaks"], key: string, win: boolean, runId: string): void {
  if (streaks[key]?.last_run === runId) return;
  streaks[key] = { wins: win ? (streaks[key]?.wins ?? 0) + 1 : 0, last_run: runId };
}

const sameList = (a: readonly string[] | undefined, b: readonly string[] | undefined) => JSON.stringify(a ?? []) === JSON.stringify(b ?? []);

/** The DeepInfra ladder in force for a class: approved policy, else the dispatcher default. */
export function effectivePaidLadder(policy: RoutingPolicy | null, cls: PaidPolicyClass, defaults: Record<PaidPolicyClass, readonly string[]>): string[] {
  const def = [...(defaults[cls] ?? [])];
  const active = policy?.paid.active?.[cls];
  if (!active || active.length === 0) return def;
  // P2-2: only ids the dispatcher would actually dial for this class (DEEPINFRA_MODELS_BY_CLASS).
  const head = active.filter((m, i, a) => def.includes(m) && a.indexOf(m) === i);
  return [...head, ...def.filter((m) => !head.includes(m))];
}

/** Eval-based free-model failures on one complete full run (dead = definitive errors only). Pure. */
export function freeEvalFailures(rs: readonly TaskModelScore[]): string[] {
  const out: string[] = [];
  if (rs.length === 0) return out;
  const answered = rs.reduce((s, r) => s + (r.n - r.transportFails), 0);
  if (rs.every((r) => r.dead)) out.push("dead (every eval call failed with a definitive error)");
  const schemaFails = rs.reduce((s, r) => s + r.schemaFails, 0);
  if (answered > 0 && schemaFails / answered > DEMOTE_SCHEMA_FAIL_ABOVE) out.push(`schema fail ${Math.round((schemaFails / answered) * 100)}% > 10%`);
  // A free model serves many tasks: an SLO miss counts when it misses on at least half of them.
  const sloMisses = rs.filter((r) => r.p95LatencyMs !== null && r.p95LatencyMs > TASK_PROFILES[r.task].criteria.p95LatencyMs).length;
  if (sloMisses * 2 >= rs.length && sloMisses > 0) out.push(`p95 over the SLO on ${sloMisses}/${rs.length} task(s)`);
  return out;
}

/** Head of a free provider's ladder after the current free policy. */
function freeHead(p: FreeProviderPolicy, ladder: readonly string[], nowMs: number): string | null {
  const demoted = new Set(activeDemotions(p, nowMs));
  for (const m of p.promoted) if (ladder.includes(m) && !demoted.has(m)) return m;
  return ladder.find((m) => !demoted.has(m)) ?? null;
}

// ── The coordinator ──────────────────────────────────────────────────

export function coordinate(input: CoordinatorInput): CoordinatorOutput {
  const { run, now } = input;
  const iso = now.toISOString();
  const prior = input.prior;
  const policy: RoutingPolicy = RoutingPolicy.parse(JSON.parse(JSON.stringify(input.policy ?? emptyRoutingPolicy(now))));
  const rows = rowsForRun(run);
  const isFull = run.mode === "full";
  const complete = isFull && run.status === "done";
  const decisions: Decision[] = [];
  const history: Array<Record<string, unknown>> = [];
  const streaks: Scorecard["streaks"] = { ...(prior?.streaks ?? {}) };

  // ── Task cards ──
  const tasks: Partial<Record<EvalTaskId, TaskCard>> = { ...(prior?.tasks ?? {}) };
  const paidProposalLadders: PaidLadders = {};
  const paidReasons: string[] = [];
  /** `${class}|${model}` already demoted in this pass. */
  const demotedKeys = new Set<string>();
  /** P2-2: winners the dispatcher cannot dial for their class (shown, never proposed). */
  const needsAdmission: Scorecard["needs_admission"] = [];

  for (const task of EVAL_TASK_IDS) {
    const profile = TASK_PROFILES[task];
    const taskRows = rows[task];
    const prev = tasks[task];
    const card: TaskCard = prev
      ? { ...prev }
      : { task, label: profile.label, dispatcherClass: profile.dispatcherClass, reportScope: profile.reportScope, primary: null, challenger: null, models: [], smoke: [], last_full_eval: null, last_smoke_eval: null };
    card.label = profile.label;
    card.dispatcherClass = profile.dispatcherClass;
    card.reportScope = profile.reportScope;
    if (!taskRows) {
      tasks[task] = card;
      continue;
    }
    if (!isFull) {
      card.smoke = taskRows.map((r) => ({ provider: r.provider, model: r.model, n: r.n, quality: r.quality, schemaFailRate: r.schemaFailRate, p95LatencyMs: r.p95LatencyMs, dead: r.dead, costUsd: r.costUsd }));
      card.last_smoke_eval = run.finished_at ?? iso;
      tasks[task] = card;
      continue;
    }
    card.models = taskRows;
    card.last_full_eval = run.finished_at ?? iso;

    // Primary in force for this task.
    const cls = profile.dispatcherClass;
    const catPrimary = cataloguePrimary(profile);
    let primaryKey: string | null = null;
    let source: "approved_policy" | "catalogue" | "free_policy" = "catalogue";
    if (cls && catPrimary?.provider === "deepinfra") {
      const ladder = effectivePaidLadder(input.policy, cls, input.defaultPaidLadders);
      const head = ladder.find((m) => taskRows.some((r) => r.provider === "deepinfra" && r.model === m));
      if (head) {
        primaryKey = `deepinfra:${head}`;
        source = input.policy?.paid.active?.[cls]?.length ? "approved_policy" : "catalogue";
      }
    }
    if (!primaryKey && catPrimary) primaryKey = `${catPrimary.provider}:${catPrimary.id}`;
    let primary = taskRows.find((r) => `${r.provider}:${r.model}` === primaryKey) ?? null;
    if (!primary) primary = [...taskRows].sort((a, b) => b.quality - a.quality)[0] ?? null;
    card.primary = primary ? { provider: primary.provider, model: primary.model, source } : null;

    // Challenger: best other row (passing first, then quality, then cheaper).
    const others = taskRows.filter((r) => r !== primary);
    const ranked = [...others].sort((a, b) => Number(b.passesProfile) - Number(a.passesProfile) || b.quality - a.quality || cpa(a) - cpa(b));
    const challenger = ranked[0] ?? null;
    card.challenger = null;

    // Streaks only move on a COMPLETE full run.
    if (complete && primary) {
      for (const r of others) {
        const key = `${task}|${r.provider}:${r.model}`;
        const verdict = challengerWins(r, primary);
        bumpStreak(streaks, key, verdict.win, run.run_id);
        if (verdict.win && streaks[key]!.wins >= PROMOTE_CONSECUTIVE_WINS) {
          const reason = `${task}: ${verdict.reason} (${streaks[key]!.wins} consecutive full runs)`;
          if (r.billing === "paid" && cls && r.provider === "deepinfra" && primary.provider === "deepinfra" && !(input.defaultPaidLadders[cls] ?? []).includes(r.model)) {
            // P2-2: the dispatcher would never dial it for this class — an approve could not
            // change routing. Founder: catalogue + price policy (and the class ladder) first.
            const why = `${reason} — not in the dispatcher's ${cls} ladder: needs admission (catalogue + price policy, founder) before it can be proposed`;
            needsAdmission.push({ task, cls, model: r.model, reason: why });
            decisions.push({ kind: "advisory_promote", scope: "none", task, provider: r.provider, model: r.model, reason: why, outcome: "advisory" });
          } else if (r.billing === "paid" && cls && r.provider === "deepinfra" && primary.provider === "deepinfra") {
            const base = paidProposalLadders[cls] ?? effectivePaidLadder(input.policy, cls, input.defaultPaidLadders);
            paidProposalLadders[cls] = [r.model, ...base.filter((m) => m !== r.model)];
            paidReasons.push(`promote ${r.model} → head of ${cls} ladder: ${reason}`);
            decisions.push({ kind: "promote", scope: "paid", task, provider: r.provider, model: r.model, reason, outcome: "proposed" });
          } else if (r.billing === "free") {
            // Free promotions are decided per provider ladder below (task wins feed it).
            decisions.push({ kind: "advisory_promote", scope: "none", task, provider: r.provider, model: r.model, reason: `${reason} — free ladders are ordered per provider`, outcome: "advisory" });
          } else {
            decisions.push({ kind: "advisory_promote", scope: "none", task, provider: r.provider, model: r.model, reason: `${reason} — no dispatcher ladder for this task (scorecard only)`, outcome: "advisory" });
          }
        }
      }
    }
    if (challenger) {
      const wins = streaks[`${task}|${challenger.provider}:${challenger.model}`]?.wins ?? 0;
      card.challenger = { provider: challenger.provider, model: challenger.model, wins };
    }

    // Paid demotions (proposal): every DeepInfra rung of the class ladder that was evaluated here.
    if (cls) {
      const start = paidProposalLadders[cls] ?? effectivePaidLadder(input.policy, cls, input.defaultPaidLadders);
      for (const m of start) {
        const r = taskRows.find((x) => x.provider === "deepinfra" && x.model === m) ?? null;
        if (!r) continue;
        const useLive = profile.reportScope ? input.live[`deepinfra:${m}`] : undefined;
        const reasons = demotionReasons(r, profile.criteria.p95LatencyMs, useLive, input.isDead("deepinfra", m), { useEvalQuality: complete });
        const ladder = paidProposalLadders[cls] ?? start;
        if (reasons.length === 0 || ladder[ladder.length - 1] === m) continue;
        paidProposalLadders[cls] = [...ladder.filter((x) => x !== m), m];
        demotedKeys.add(`${cls}|${m}`);
        const reason = `${task}: ${reasons.join("; ")}`;
        paidReasons.push(`demote ${m} → back of ${cls} ladder: ${reason}`);
        decisions.push({ kind: "demote", scope: "paid", task, provider: "deepinfra", model: m, reason, outcome: "proposed" });
      }
    }
    tasks[task] = card;
  }

  // Live-only demotion of report ladders (runs on smoke too: production evidence, not eval).
  for (const cls of ["report", "synthesis"] as const) {
    const start = paidProposalLadders[cls] ?? effectivePaidLadder(input.policy, cls, input.defaultPaidLadders);
    for (const m of start) {
      if (demotedKeys.has(`${cls}|${m}`)) continue;
      const reasons = demotionReasons(null, Number.POSITIVE_INFINITY, input.live[`deepinfra:${m}`], false);
      const ladder = paidProposalLadders[cls] ?? start;
      if (reasons.length === 0 || ladder[ladder.length - 1] === m) continue;
      paidProposalLadders[cls] = [...ladder.filter((x) => x !== m), m];
      demotedKeys.add(`${cls}|${m}`);
      paidReasons.push(`demote ${m} → back of ${cls} ladder: ${reasons.join("; ")}`);
      decisions.push({ kind: "demote", scope: "paid", provider: "deepinfra", model: m, reason: `${cls}: ${reasons.join("; ")}`, outcome: "proposed" });
    }
  }

  // ── Paid proposal (never applied here) ──
  const changed = (Object.keys(paidProposalLadders) as PaidPolicyClass[]).filter((cls) => !sameList(paidProposalLadders[cls], effectivePaidLadder(input.policy, cls, input.defaultPaidLadders)));
  if (changed.length > 0) {
    const ladders: PaidLadders = {};
    for (const cls of changed) ladders[cls] = paidProposalLadders[cls];
    const existing = policy.paid.proposal;
    if (!existing || JSON.stringify(existing.ladders) !== JSON.stringify(ladders)) {
      // Ids the scoped (customer report) ladder still ignores until admitted, plus
      // winners outside the class ladder — information only, never in `ladders`.
      const needs = new Set<string>(needsAdmission.map((n) => n.model));
      for (const cls of changed) if (cls !== "classify") for (const m of ladders[cls] ?? []) if (!REPORT_ADMITTED_MODELS.has(m)) needs.add(m);
      const proposal: PaidProposal = {
        id: `prop-${run.run_id}`,
        proposed_at: iso,
        ladders,
        reasons: paidReasons,
        needs_admission: [...needs],
        evidence_runs: [run.run_id],
      };
      policy.paid.proposal = proposal;
      history.push({ ts: iso, action: "propose", actor: "model-coordinator", proposal_id: proposal.id, ladders, reasons: paidReasons });
    } else {
      existing.evidence_runs = [...new Set([...existing.evidence_runs, run.run_id])].slice(-6);
    }
  }

  // ── Free section (AUTO) ──
  // P1-1: eval-based demotions only on COMPLETE full runs and only after
  // FREE_DEMOTE_CONSECUTIVE_FAILS consecutive failing runs; failures caused by
  // the eval's own load (429 / timeouts) are inconclusive; live strikes are not
  // copied (the dispatcher already skips dead rungs); every demotion expires
  // after FREE_DEMOTION_TTL_MS; ids that left the RAW ladder are pruned.
  // Smoke runs never demote and never refresh the section's age.
  const nowMs = now.getTime();
  const prevFree = policy.free;
  const providersOut: Record<string, FreeProviderPolicy> = {};
  const freeReasons: string[] = [];
  let freeChanged = false;
  const freeRows = new Map<string, TaskModelScore[]>();
  for (const task of EVAL_TASK_IDS) for (const r of rows[task] ?? []) if (r.billing === "free" && (FREE_POLICY_PROVIDERS as readonly string[]).includes(r.provider)) {
    const k = `${r.provider}|${r.model}`;
    freeRows.set(k, [...(freeRows.get(k) ?? []), r]);
  }
  for (const provider of FREE_POLICY_PROVIDERS) {
    const ladder = [...(input.freeLadders[provider] ?? [])];
    for (const k of freeRows.keys()) if (k.startsWith(`${provider}|`) && !ladder.includes(k.slice(provider.length + 1))) ladder.push(k.slice(provider.length + 1));
    const cur: FreeProviderPolicy = prevFree?.providers[provider] ?? { promoted: [], demoted: [], demoted_until: {} };
    const next: FreeProviderPolicy = { promoted: [...cur.promoted], demoted: [...cur.demoted], demoted_until: { ...(cur.demoted_until ?? {}) } };

    // Prune: expired demotions lapse; ids that left the raw ladder go.
    const live = new Set(activeDemotions(next, nowMs));
    for (const m of [...next.demoted]) {
      if (live.has(m) && ladder.includes(m)) continue;
      next.demoted = next.demoted.filter((x) => x !== m);
      if (ladder.includes(m)) {
        const reason = `${provider}/${m}: demotion expired`;
        freeReasons.push(`readmit ${reason}`);
        decisions.push({ kind: "readmit", scope: "free", provider, model: m, reason, outcome: "applied" });
      }
    }
    for (const m of Object.keys(next.demoted_until)) if (!next.demoted.includes(m)) delete next.demoted_until[m];
    next.promoted = next.promoted.filter((m, i, a) => ladder.includes(m) && a.indexOf(m) === i);

    if (complete) {
      for (const model of ladder) {
        const rs = freeRows.get(`${provider}|${model}`) ?? [];
        if (rs.length === 0) continue;
        const n = rs.reduce((s, r) => s + r.n, 0);
        const transient = rs.reduce((s, r) => s + r.transientFails, 0);
        // Mostly rate-limited / timed out by our own load: inconclusive — neither counts nor resets.
        if (n === 0 || transient / n > FREE_TRANSIENT_INCONCLUSIVE_SHARE) continue;
        const key = `freefail|${provider}|${model}`;
        const reasons = freeEvalFailures(rs);
        bumpStreak(streaks, key, reasons.length > 0, run.run_id);
        const isDemoted = next.demoted.includes(model);
        if (reasons.length > 0 && streaks[key]!.wins >= FREE_DEMOTE_CONSECUTIVE_FAILS) {
          const until = new Date(nowMs + FREE_DEMOTION_TTL_MS).toISOString();
          if (!isDemoted) next.demoted.push(model);
          next.demoted_until[model] = until;
          next.promoted = next.promoted.filter((m) => m !== model);
          const reason = `${provider}/${model}: ${reasons.join("; ")} (${streaks[key]!.wins} consecutive full runs; lapses ${until.slice(0, 10)})`;
          freeReasons.push(`${isDemoted ? "renew" : "demote"} ${reason}`);
          decisions.push({ kind: "demote", scope: "free", provider, model, reason, outcome: "applied" });
        } else if (reasons.length === 0 && isDemoted && rs.every((r) => r.passesProfile)) {
          next.demoted = next.demoted.filter((m) => m !== model);
          delete next.demoted_until[model];
          const reason = `${provider}/${model}: passes every profile on a complete full run`;
          freeReasons.push(`readmit ${reason}`);
          decisions.push({ kind: "readmit", scope: "free", provider, model, reason, outcome: "applied" });
        }
      }
      // Promotion: challenger vs the provider's current head, mean over the tasks both ran.
      const head = freeHead(next, ladder, nowMs);
      const headRows = head ? freeRows.get(`${provider}|${head}`) ?? [] : [];
      const demotedNow = new Set(activeDemotions(next, nowMs));
      for (const model of ladder) {
        if (model === head || demotedNow.has(model)) continue;
        const rs = freeRows.get(`${provider}|${model}`) ?? [];
        if (rs.length === 0) continue;
        const key = `free|${provider}|${model}`;
        const shared = rs.filter((r) => headRows.some((h) => h.task === r.task));
        let win = false;
        let why = "no shared tasks with the head";
        if (shared.length > 0 && headRows.length > 0) {
          const qC = shared.reduce((s, r) => s + r.quality, 0) / shared.length;
          const hs = headRows.filter((h) => shared.some((r) => r.task === h.task));
          const qH = hs.reduce((s, r) => s + r.quality, 0) / hs.length;
          const eligible = shared.every((r) => r.passesProfile && r.criticalErrors === 0);
          // Zero cost on both sides: only the "+0.05 quality" leg can win.
          win = eligible && qC >= qH + PROMOTE_QUALITY_GAIN - EPS;
          why = `mean quality ${qC.toFixed(3)} vs head ${head} ${qH.toFixed(3)} over ${shared.length} task(s)${eligible ? "" : " (fails a profile)"}`;
        } else if (headRows.length === 0 && rs.every((r) => r.passesProfile)) {
          win = true;
          why = `head ${head} was not evaluated; challenger passes every profile`;
        }
        bumpStreak(streaks, key, win, run.run_id);
        if (win && streaks[key]!.wins >= PROMOTE_CONSECUTIVE_WINS && next.promoted[0] !== model) {
          next.promoted = [model, ...next.promoted.filter((m) => m !== model)];
          const reason = `${provider}/${model}: ${why} (${streaks[key]!.wins} consecutive full runs)`;
          freeReasons.push(`promote ${reason}`);
          decisions.push({ kind: "promote", scope: "free", provider, model, reason, outcome: "applied" });
          break; // one promotion per provider per run
        }
      }
    }
    if (!sameList(next.promoted, cur.promoted) || !sameList(next.demoted, cur.demoted) || JSON.stringify(next.demoted_until) !== JSON.stringify(cur.demoted_until ?? {})) {
      freeChanged = true;
      history.push({ ts: iso, action: "free_auto", actor: "model-coordinator", provider, before: cur, after: next, run_id: run.run_id });
    }
    if (next.promoted.length || next.demoted.length) providersOut[provider] = next;
  }
  if (complete || freeChanged || prevFree) {
    policy.free = {
      // Only a complete full run re-confirms the section (its age gates the dispatcher).
      updated_at: complete ? iso : prevFree?.updated_at ?? iso,
      providers: providersOut,
      reasons: freeReasons.length ? freeReasons : prevFree?.reasons ?? [],
    };
  }
  if (complete || freeChanged || history.length) policy.updated_at = iso;

  // ── Scorecard + jsonl ──
  const scorecard: Scorecard = {
    version: 1,
    updated_at: iso,
    last_full: isFull ? summary(run) : prior?.last_full ?? null,
    last_smoke: isFull ? prior?.last_smoke ?? null : summary(run),
    tasks,
    providers: isFull ? rollup(rows) : prior?.providers ?? [],
    live: input.live,
    streaks,
    decisions,
    needs_admission: isFull ? needsAdmission : prior?.needs_admission ?? [],
  };
  const jsonl: Array<Record<string, unknown>> = [];
  if (isFull) {
    for (const task of EVAL_TASK_IDS) {
      for (const r of rows[task] ?? []) {
        jsonl.push({
          ts: iso, run_id: run.run_id, complete, task, provider: r.provider, model: r.model, tier: r.tier, n: r.n,
          quality: r.quality, acceptRate: r.acceptRate, schemaFailRate: r.schemaFailRate, criticalErrors: r.criticalErrors,
          groundedShare: r.groundedShare, p95LatencyMs: r.p95LatencyMs, costUsd: r.costUsd, costPerAccepted: r.costPerAccepted,
          judge: r.judge.mean, passes: r.passesProfile,
        });
      }
    }
  }
  return { scorecard, policy, jsonl, history, decisions };
}

// ── Admin actions (pure) ─────────────────────────────────────────────

export type PolicyActionResult = { ok: true; policy: RoutingPolicy; history: Record<string, unknown> } | { ok: false; error: string; status: number };

/** Approve the pending paid proposal (must match `proposalId`). */
export function approveProposal(
  current: RoutingPolicy | null,
  proposalId: string,
  actor: string,
  now: Date = new Date(),
  /** P2-2: per class, the ids the dispatcher dials (DEEPINFRA_MODELS_BY_CLASS). Others never become `paid.active`. */
  dialable?: Partial<Record<PaidPolicyClass, readonly string[]>>,
): PolicyActionResult {
  const policy = RoutingPolicy.parse(JSON.parse(JSON.stringify(current ?? emptyRoutingPolicy(now))));
  const prop = policy.paid.proposal;
  if (!prop) return { ok: false, error: "No pending proposal", status: 409 };
  if (prop.id !== proposalId) return { ok: false, error: "Proposal changed — reload the page", status: 409 };
  const before = policy.paid.active;
  const active: PaidLadders = { ...(before ?? {}) };
  let applied = 0;
  for (const cls of PAID_POLICY_CLASSES) {
    const ladder = (prop.ladders[cls] ?? []).filter((m, i, a) => a.indexOf(m) === i && (!dialable || (dialable[cls] ?? []).includes(m)));
    if (ladder.length) {
      active[cls] = ladder;
      applied += 1;
    }
  }
  if (applied === 0) return { ok: false, error: "The proposal names no model the dispatcher dials for its class — needs admission first", status: 409 };
  const iso = now.toISOString();
  policy.paid = { active, approved_at: iso, approved_by: actor, approved_proposal_id: prop.id, previous: before ?? null, proposal: null };
  policy.updated_at = iso;
  return { ok: true, policy, history: { ts: iso, action: "approve", actor, proposal_id: prop.id, before, after: active, reasons: prop.reasons, needs_admission: prop.needs_admission } };
}

/** Restore the paid ladder in force before the last approve (null = dispatcher defaults). */
export function rollbackPaidPolicy(current: RoutingPolicy | null, actor: string, now: Date = new Date()): PolicyActionResult {
  if (!current?.paid.active) return { ok: false, error: "Nothing to roll back — the dispatcher defaults are in force", status: 409 };
  const policy = RoutingPolicy.parse(JSON.parse(JSON.stringify(current)));
  const before = policy.paid.active;
  const iso = now.toISOString();
  policy.paid = { ...policy.paid, active: policy.paid.previous ?? null, previous: null, approved_at: iso, approved_by: actor, approved_proposal_id: null };
  policy.updated_at = iso;
  return { ok: true, policy, history: { ts: iso, action: "rollback", actor, before, after: policy.paid.active } };
}

/** Discard the pending proposal without changing routing. */
export function dismissProposal(current: RoutingPolicy | null, proposalId: string, actor: string, now: Date = new Date()): PolicyActionResult {
  const prop = current?.paid.proposal;
  if (!current || !prop) return { ok: false, error: "No pending proposal", status: 409 };
  if (prop.id !== proposalId) return { ok: false, error: "Proposal changed — reload the page", status: 409 };
  const policy = RoutingPolicy.parse(JSON.parse(JSON.stringify(current)));
  const iso = now.toISOString();
  policy.paid.proposal = null;
  policy.updated_at = iso;
  return { ok: true, policy, history: { ts: iso, action: "dismiss", actor, proposal_id: prop.id, ladders: prop.ladders } };
}

// ── File helpers ─────────────────────────────────────────────────────

/** Atomic JSON write (tmp + rename) so a reader never sees half a file. */
export function writeJsonAtomic(file: string, data: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function appendJsonl(file: string, rows: ReadonlyArray<Record<string, unknown>>): void {
  if (rows.length === 0) return;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
}

export function readJsonFile<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8")) as T;
  } catch {
    return null;
  }
}

export { candidateKey };
export type { EvalCandidate };
