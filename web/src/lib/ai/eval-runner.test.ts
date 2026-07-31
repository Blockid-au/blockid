import { describe, expect, it, vi } from "vitest";

import {
  PromptEvalFixture,
  runEval,
  shouldPromote,
  type CaseRunner,
  type EvalResult,
  type FixtureCase,
} from "./eval-runner";
import type { PromptVersion } from "./prompt-registry";

// ── Test doubles ─────────────────────────────────────────────────────

const promptVersion: PromptVersion = {
  id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  agent: "AIR-003",
  version: "1.0.0",
  purpose: "test",
  model: "claude-sonnet-5",
  variables: {},
  output_schema: {},
  guardrails: [],
  test_set_id: null,
  evaluation_result: null,
  status: "canary",
  released_at: null,
  rollback_from: null,
  created_at: new Date().toISOString(),
};

function fixture(cases: Array<Partial<FixtureCase>>): ReturnType<typeof PromptEvalFixture.parse> {
  return PromptEvalFixture.parse({
    agent: "AIR-003",
    version: "1.0.0",
    purpose: "unit test fixture",
    cases: cases.map((c, i) => ({
      id: c.id ?? `case_${i + 1}`,
      name: c.name ?? `case ${i + 1}`,
      input: c.input ?? { businessId: "x" },
      expected: c.expected ?? {
        proposed_score: { min: 50, max: 80 },
        confidence: { min: 0.5 },
        must_have_gaps: [],
        must_not_hallucinate: [],
      },
    })),
  });
}

/**
 * Build a CaseRunner that returns the supplied outputs in order. If
 * `outputs[i]` is a function it is called with the case; otherwise it
 * is returned as data.
 */
function mockRunner(
  outputs: Array<
    | Record<string, unknown>
    | { __fail: true; reason: string }
    | ((c: FixtureCase) => Record<string, unknown>)
  >,
  meta: { latencyMs?: number[]; costUsd?: number[] } = {},
): CaseRunner {
  let i = 0;
  const impl: CaseRunner = async (c: FixtureCase) => {
    const idx = i++;
    const out = outputs[idx];
    const latencyMs = meta.latencyMs?.[idx] ?? 100;
    const costUsd = meta.costUsd?.[idx] ?? 0.001;
    const runId = `run-${idx + 1}`;
    if (out && typeof out === "object" && "__fail" in out) {
      const reason = typeof (out as { reason?: unknown }).reason === "string"
        ? ((out as { reason: string }).reason)
        : "unknown";
      return { ok: false, reason, latencyMs, costUsd, runId };
    }
    const data = typeof out === "function" ? out(c) : (out ?? {});
    return { ok: true, data: data as Record<string, unknown>, latencyMs, costUsd, runId };
  };
  return vi.fn(impl) as unknown as CaseRunner;
}

// ── Tests ────────────────────────────────────────────────────────────

describe("runEval — happy path (would promote)", () => {
  it("scores accuracy 1.0 when every case satisfies every constraint", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 60, max: 80 },
          confidence: { min: 0.6 },
          must_have_gaps: ["runway_12mo"],
          must_not_hallucinate: ["specific_investor_names"],
        },
      },
      {
        expected: {
          proposed_score: { min: 70, max: 90 },
          confidence: { min: 0.7 },
          must_have_gaps: ["cap_table_clean"],
          must_not_hallucinate: ["fund_names"],
        },
      },
    ]);
    const runner = mockRunner(
      [
        { proposed_score: 72, confidence: 0.75, gaps: ["runway_12mo"] },
        { proposed_score: 80, confidence: 0.85, gaps: ["cap_table_clean"] },
      ],
      { latencyMs: [100, 200], costUsd: [0.001, 0.002] },
    );
    const res = await runEval(fx, promptVersion, { runCase: runner });

    expect(res.cases).toBe(2);
    expect(res.accuracy_pct).toBe(1);
    expect(res.hallucination_pct).toBe(0);
    expect(res.avg_confidence).toBeCloseTo(0.8, 5);
    expect(res.latency_p50_ms).toBe(150);
    expect(res.cost_usd_total).toBeCloseTo(0.003, 6);
    expect(res.hard_fail).toBe(false);
    expect(shouldPromote(res)).toBe(true);
  });
});

describe("runEval — hallucination hard-fail", () => {
  it("flags hard_fail and refuses promotion when a forbidden term appears anywhere in output", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 60, max: 90 },
          confidence: { min: 0.6 },
          must_have_gaps: [],
          must_not_hallucinate: ["Sequoia Capital"],
        },
      },
    ]);
    const runner = mockRunner([
      {
        proposed_score: 75,
        confidence: 0.7,
        gaps: [],
        detail: "The founder previously pitched to Sequoia Capital in 2024.",
      },
    ]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.hard_fail).toBe(true);
    expect(res.hallucination_pct).toBe(1);
    expect(shouldPromote(res)).toBe(false);
  });

  it("passes when forbidden term is absent", async () => {
    const fx = fixture([
      {
        expected: {
          must_have_gaps: [],
          must_not_hallucinate: ["Sequoia Capital"],
        },
      },
    ]);
    const runner = mockRunner([{ proposed_score: 75, confidence: 0.7, gaps: [], detail: "clean" }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.hard_fail).toBe(false);
    expect(res.hallucination_pct).toBe(0);
  });
});

describe("runEval — accuracy floor", () => {
  it("blocks promotion when accuracy drops below 0.80", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 60, max: 80 },
          confidence: { min: 0.6 },
          must_have_gaps: ["gap_a", "gap_b", "gap_c"],
          must_not_hallucinate: [],
        },
      },
    ]);
    // Score way out of range, no gaps → mostly missing points.
    const runner = mockRunner([{ proposed_score: 15, confidence: 0.2, gaps: [] }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.accuracy_pct).toBeLessThan(0.8);
    expect(shouldPromote(res)).toBe(false);
  });
});

describe("runEval — score & confidence range checks", () => {
  it("credits score-in-range and confidence-above-min", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 40, max: 60 },
          confidence: { min: 0.5 },
          must_have_gaps: [],
          must_not_hallucinate: [],
        },
      },
    ]);
    const runner = mockRunner([{ proposed_score: 50, confidence: 0.6, gaps: [] }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.per_case[0]!.positivePoints).toBe(2);
    expect(res.per_case[0]!.possiblePoints).toBe(2);
    expect(res.accuracy_pct).toBe(1);
  });

  it("does not credit score-out-of-range", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 40, max: 60 },
          confidence: { min: 0.5 },
          must_have_gaps: [],
          must_not_hallucinate: [],
        },
      },
    ]);
    const runner = mockRunner([{ proposed_score: 95, confidence: 0.6, gaps: [] }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    // 1 of 2 points (confidence only)
    expect(res.per_case[0]!.positivePoints).toBe(1);
    expect(res.accuracy_pct).toBe(0.5);
  });
});

describe("runEval — must-have gaps", () => {
  it("gives +1 for each present gap, -1 for each missing", async () => {
    const fx = fixture([
      {
        expected: {
          must_have_gaps: ["a", "b", "c"],
          must_not_hallucinate: [],
        },
      },
    ]);
    // present: a, b — missing: c
    const runner = mockRunner([{ proposed_score: 50, confidence: 0.5, gaps: ["a", "b"] }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    // positive = 2 -1 = 1; possible = 3
    expect(res.per_case[0]!.positivePoints).toBe(1);
    expect(res.per_case[0]!.possiblePoints).toBe(3);
  });
});

describe("runEval — run failures", () => {
  it("treats a callStructured failure as hard-fail with zero credit", async () => {
    const fx = fixture([
      {
        expected: {
          proposed_score: { min: 60, max: 80 },
          confidence: { min: 0.6 },
          must_have_gaps: ["gap_x"],
          must_not_hallucinate: ["forbidden"],
        },
      },
    ]);
    const runnerImpl: CaseRunner = async () => ({
      ok: false,
      reason: "schema_fail: missing proposed_score",
      latencyMs: 42,
      costUsd: 0.0001,
      runId: "run-x",
    });
    const runner = vi.fn(runnerImpl) as unknown as CaseRunner;
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.hard_fail).toBe(true);
    expect(res.per_case[0]!.ok).toBe(false);
    expect(res.per_case[0]!.reason).toMatch(/schema_fail/);
    expect(res.accuracy_pct).toBe(0);
    expect(shouldPromote(res)).toBe(false);
  });
});

describe("runEval — aggregation (mean + p50)", () => {
  it("computes p50 latency across odd-sized set", async () => {
    const fx = fixture([{}, {}, {}]);
    const runner = mockRunner(
      [
        { proposed_score: 60, confidence: 0.6, gaps: [] },
        { proposed_score: 65, confidence: 0.7, gaps: [] },
        { proposed_score: 70, confidence: 0.8, gaps: [] },
      ],
      { latencyMs: [50, 200, 500], costUsd: [0.001, 0.002, 0.003] },
    );
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.latency_p50_ms).toBe(200);
    expect(res.cost_usd_total).toBeCloseTo(0.006, 6);
    expect(res.avg_confidence).toBeCloseTo(0.7, 5);
  });

  it("computes p50 latency across even-sized set (mean of two middles)", async () => {
    const fx = fixture([{}, {}]);
    const runner = mockRunner(
      [
        { proposed_score: 60, confidence: 0.6, gaps: [] },
        { proposed_score: 70, confidence: 0.8, gaps: [] },
      ],
      { latencyMs: [100, 300] },
    );
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.latency_p50_ms).toBe(200);
  });
});

describe("runEval — empty fixture guard", () => {
  it("PromptEvalFixture parse rejects empty cases[]", () => {
    expect(() =>
      PromptEvalFixture.parse({
        agent: "X",
        version: "1.0.0",
        purpose: "p",
        cases: [],
      }),
    ).toThrow();
  });
});

describe("shouldPromote — gate matrix", () => {
  const base: EvalResult = {
    agent: "AIR-003",
    version: "1.0.0",
    cases: 3,
    accuracy_pct: 0.9,
    hallucination_pct: 0,
    avg_confidence: 0.7,
    latency_p50_ms: 100,
    cost_usd_total: 0.01,
    hard_fail: false,
    per_case: [],
  };

  it("promotes on the happy row", () => {
    expect(shouldPromote(base)).toBe(true);
  });

  it("blocks when accuracy < 0.80", () => {
    expect(shouldPromote({ ...base, accuracy_pct: 0.79 })).toBe(false);
  });

  it("blocks when hallucination > 0.02", () => {
    expect(shouldPromote({ ...base, hallucination_pct: 0.03 })).toBe(false);
  });

  it("blocks on any hard_fail even if aggregate metrics look fine", () => {
    expect(shouldPromote({ ...base, hard_fail: true })).toBe(false);
  });

  it("blocks when the eval saw zero cases (defensive)", () => {
    expect(shouldPromote({ ...base, cases: 0 })).toBe(false);
  });
});
