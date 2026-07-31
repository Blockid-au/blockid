/**
 * Prompt-eval runner — v3 Master Upgrade Plan §6.3 + §15.5.
 *
 * `runEval(fixture, promptVersion, opts)` walks every case in a golden
 * fixture, invokes the model (through an injectable `runCase` — the
 * nightly cron passes a `callStructured` wrapper; tests pass a mock),
 * and scores the model's output against the fixture's declared
 * `expected` constraints.
 *
 * Scoring per case (mirrors the sub-Q2 brief exactly):
 *   proposed_score in range        → +1 accuracy point, else 0
 *   confidence above (min|min..max)→ +1 accuracy point, else 0
 *   each must_have_gaps string     → present → +1, absent → -1
 *   each must_not_hallucinate str  → absent  → +1, present → -3
 *                                    (a present forbidden term also
 *                                     flags the case as a hard-fail)
 *
 * Aggregation:
 *   accuracy_pct    = clamp01(positive_points / possible_points)
 *   hallucination_pct = forbidden_hits / total_forbidden_checks
 *   avg_confidence  = mean(case.output.confidence)
 *   latency_p50_ms  = p50(case.latencyMs)
 *   cost_usd_total  = sum(case.costUsd)
 *
 * shouldPromote(result):
 *   accuracy ≥ 0.80  AND
 *   hallucination ≤ 0.02  AND
 *   no case has a hard-fail signal
 *
 * The runner never throws for model / schema failures — every case
 * still lands in the aggregate as a zero-accuracy row so the nightly
 * cron can persist a stable `evaluation_result` shape.
 */

import { z } from "zod";

import type { PromptVersion } from "./prompt-registry";

// ── Fixture Zod schemas ──────────────────────────────────────────────

export const ExpectedConstraints = z
  .object({
    proposed_score: z
      .object({
        min: z.number().min(0).max(100).optional(),
        max: z.number().min(0).max(100).optional(),
      })
      .optional(),
    confidence: z
      .object({
        min: z.number().min(0).max(1).optional(),
        max: z.number().min(0).max(1).optional(),
      })
      .optional(),
    must_have_gaps: z.array(z.string().min(1)).default([]),
    must_not_hallucinate: z.array(z.string().min(1)).default([]),
  })
  .default({ must_have_gaps: [], must_not_hallucinate: [] });
export type ExpectedConstraints = z.infer<typeof ExpectedConstraints>;

export const FixtureCase = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  input: z.record(z.unknown()),
  expected: ExpectedConstraints,
});
export type FixtureCase = z.infer<typeof FixtureCase>;

export const PromptEvalFixture = z.object({
  agent: z.string().min(1),
  version: z.string().min(1),
  purpose: z.string().min(1),
  cases: z.array(FixtureCase).min(1),
});
export type PromptEvalFixture = z.infer<typeof PromptEvalFixture>;

// ── Case runner (dependency-injected) ────────────────────────────────
//
// The concrete implementation lives in the caller (nightly cron passes
// a callStructured-based wrapper; tests pass a mock). This indirection
// keeps eval-runner.ts pure: no fetch, no db, no env — trivially
// testable and reusable outside the cron (e.g. a manual `eval:agent`
// CLI).

export interface CaseRunOk {
  ok: true;
  data: Record<string, unknown>;
  latencyMs: number;
  costUsd: number;
  runId: string;
}
export interface CaseRunFail {
  ok: false;
  reason: string;
  latencyMs: number;
  costUsd: number;
  runId: string;
}
export type CaseRunResult = CaseRunOk | CaseRunFail;
export type CaseRunner = (
  fixtureCase: FixtureCase,
  promptVersion: PromptVersion,
) => Promise<CaseRunResult>;

// ── Result schemas ───────────────────────────────────────────────────

export const CaseEvalResult = z.object({
  caseId: z.string(),
  ok: z.boolean(),
  reason: z.string().nullable(),
  hardFail: z.boolean(),
  positivePoints: z.number(),
  possiblePoints: z.number(),
  forbiddenChecks: z.number(),
  forbiddenHits: z.number(),
  confidence: z.number().nullable(),
  latencyMs: z.number(),
  costUsd: z.number(),
  runId: z.string(),
});
export type CaseEvalResult = z.infer<typeof CaseEvalResult>;

export const EvalResult = z.object({
  agent: z.string(),
  version: z.string(),
  cases: z.number(),
  accuracy_pct: z.number(),
  hallucination_pct: z.number(),
  avg_confidence: z.number(),
  latency_p50_ms: z.number(),
  cost_usd_total: z.number(),
  hard_fail: z.boolean(),
  per_case: z.array(CaseEvalResult),
});
export type EvalResult = z.infer<typeof EvalResult>;

// ── Options ──────────────────────────────────────────────────────────

export interface RunEvalOptions {
  runCase: CaseRunner;
}

// ── Scoring internals ────────────────────────────────────────────────

function isNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

/**
 * Score a single case's output against its expected constraints.
 * Never throws — a missing field just fails the corresponding point.
 */
function scoreCase(
  fx: FixtureCase,
  run: CaseRunResult,
): CaseEvalResult {
  const expected = fx.expected;
  let positive = 0;
  let possible = 0;
  const forbiddenChecks = expected.must_not_hallucinate.length;
  let forbiddenHits = 0;
  let hardFail = false;
  let confidence: number | null = null;

  if (!run.ok) {
    // Any case that fails to produce parsed output is a hard fail —
    // possible-points remain zero so it drags accuracy down without
    // creating "phantom" credit.
    return {
      caseId: fx.id,
      ok: false,
      reason: run.reason,
      hardFail: true,
      positivePoints: 0,
      possiblePoints: expected.must_have_gaps.length + 2, // score + confidence + gaps
      forbiddenChecks,
      forbiddenHits: 0,
      confidence: null,
      latencyMs: run.latencyMs,
      costUsd: run.costUsd,
      runId: run.runId,
    };
  }

  const data = run.data;

  // proposed_score in range → +1
  if (expected.proposed_score) {
    possible += 1;
    const s = data["proposed_score"];
    const inRange =
      isNum(s) &&
      (expected.proposed_score.min === undefined || s >= expected.proposed_score.min) &&
      (expected.proposed_score.max === undefined || s <= expected.proposed_score.max);
    if (inRange) positive += 1;
  }

  // confidence within window → +1 (also captured for aggregate mean)
  if (expected.confidence) {
    possible += 1;
    const c = data["confidence"];
    if (isNum(c)) confidence = c;
    const ok =
      isNum(c) &&
      (expected.confidence.min === undefined || c >= expected.confidence.min) &&
      (expected.confidence.max === undefined || c <= expected.confidence.max);
    if (ok) positive += 1;
  } else {
    const c = data["confidence"];
    if (isNum(c)) confidence = c;
  }

  // must_have_gaps → present +1, absent -1
  const outputGapsRaw = data["gaps"];
  const outputGaps: string[] = Array.isArray(outputGapsRaw)
    ? outputGapsRaw.filter((x): x is string => typeof x === "string")
    : [];
  for (const need of expected.must_have_gaps) {
    possible += 1;
    if (outputGaps.some(g => g === need || g.includes(need))) {
      positive += 1;
    } else {
      positive -= 1;
    }
  }

  // must_not_hallucinate → absent +1, present -3 + hard-fail flag
  // Search the full serialised output so the term catches nested fields.
  const haystack = JSON.stringify(data).toLowerCase();
  for (const forbidden of expected.must_not_hallucinate) {
    possible += 1;
    if (haystack.includes(forbidden.toLowerCase())) {
      positive -= 3;
      forbiddenHits += 1;
      hardFail = true;
    } else {
      positive += 1;
    }
  }

  return {
    caseId: fx.id,
    ok: true,
    reason: null,
    hardFail,
    positivePoints: positive,
    possiblePoints: possible,
    forbiddenChecks,
    forbiddenHits,
    confidence,
    latencyMs: run.latencyMs,
    costUsd: run.costUsd,
    runId: run.runId,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

// ── Public API ───────────────────────────────────────────────────────

export async function runEval(
  fixture: PromptEvalFixture,
  promptVersion: PromptVersion,
  opts: RunEvalOptions,
): Promise<EvalResult> {
  const parsed = PromptEvalFixture.parse(fixture);

  const perCase: CaseEvalResult[] = [];
  for (const fxCase of parsed.cases) {
    const run = await opts.runCase(fxCase, promptVersion);
    perCase.push(scoreCase(fxCase, run));
  }

  const totalPossible = perCase.reduce((s, c) => s + c.possiblePoints, 0);
  const totalPositive = perCase.reduce((s, c) => s + Math.max(0, c.positivePoints), 0);
  const accuracy_pct = totalPossible > 0 ? Math.max(0, Math.min(1, totalPositive / totalPossible)) : 0;

  const totalForbidden = perCase.reduce((s, c) => s + c.forbiddenChecks, 0);
  const totalHits = perCase.reduce((s, c) => s + c.forbiddenHits, 0);
  const hallucination_pct = totalForbidden > 0 ? totalHits / totalForbidden : 0;

  const confidences = perCase
    .map(c => c.confidence)
    .filter((c): c is number => typeof c === "number");
  const avg_confidence =
    confidences.length > 0
      ? confidences.reduce((s, c) => s + c, 0) / confidences.length
      : 0;

  const latency_p50_ms = median(perCase.map(c => c.latencyMs));
  const cost_usd_total = perCase.reduce((s, c) => s + c.costUsd, 0);
  const hard_fail = perCase.some(c => c.hardFail);

  return {
    agent: parsed.agent,
    version: parsed.version,
    cases: parsed.cases.length,
    accuracy_pct,
    hallucination_pct,
    avg_confidence,
    latency_p50_ms,
    cost_usd_total,
    hard_fail,
    per_case: perCase,
  };
}

/**
 * Gate for canary → prod promotion. Strict AND across:
 *   accuracy    ≥ 0.80
 *   hallucination ≤ 0.02
 *   no case triggered a hard-fail signal
 *
 * Callers (nightly cron) invoke this on the `EvalResult` and only
 * promote when it returns true. A false result keeps the canary
 * canary so the next night gets another go.
 */
export function shouldPromote(result: EvalResult): boolean {
  return (
    result.accuracy_pct >= 0.8 &&
    result.hallucination_pct <= 0.02 &&
    !result.hard_fail &&
    result.cases > 0
  );
}
