import { describe, expect, it, vi } from "vitest";

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  GROUNDED_SHARE_THRESHOLD,
  PromptEvalFixture,
  groundedShareOf,
  runEval,
  shouldDemote,
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

// ─── G13-W2-R2: TBR chapter constraints (must_cite, primary_visual) ────────

describe("must_cite / primary_visual (TBR-<dim>-v2.0.0 fixtures)", () => {
  const tbrExpected = {
    proposed_score: { min: 37, max: 67 },
    confidence: { min: 0.5 },
    must_have_gaps: ["cohort"],
    must_not_hallucinate: ["IPO"],
    must_cite: 1,
    primary_visual: { kind: "sparkline" },
  };

  it("awards the citation point for an [ev:] marker or a citations[] entry and the visual point for the matching kind", async () => {
    const fx = fixture([{ expected: tbrExpected }]);
    const runner = mockRunner([
      { proposed_score: 52, confidence: 0.7, gaps: ["no cohort data [unevidenced]"], verdict: "Traction is early [ev:ev-rev-01].", primary_visual: { kind: "sparkline", series: [] } },
    ]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    // score + confidence + 1 gap + 1 forbidden + must_cite + visual = 6 / 6
    expect(res.per_case[0].possiblePoints).toBe(6);
    expect(res.per_case[0].positivePoints).toBe(6);
    expect(res.accuracy_pct).toBe(1);
  });

  it("penalises a chapter with no citation (-1) and gives 0 for a different visual kind", async () => {
    const fx = fixture([{ expected: tbrExpected }]);
    const runner = mockRunner([
      { proposed_score: 52, confidence: 0.7, gaps: ["no cohort data"], verdict: "Traction is early.", citations: [], primary_visual: { kind: "bar" } },
    ]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    // 1 + 1 + 1 + 1 - 1 (cite) + 0 (visual) = 3 / 6
    expect(res.per_case[0].positivePoints).toBe(3);
    expect(res.per_case[0].hardFail).toBe(false);
  });

  it("must_cite: 0 never penalises an uncited output (idea-stage cases without evidence rows)", async () => {
    const fx = fixture([{ expected: { ...tbrExpected, must_cite: 0 } }]);
    const runner = mockRunner([{ proposed_score: 52, confidence: 0.7, gaps: ["cohort"], primary_visual: { kind: "sparkline" } }]);
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.per_case[0].positivePoints).toBe(6);
  });
});

// ── S-R5: grounded share, demotion gate, nightly dry-run over the 24 TBR fixtures ──

describe("grounded share (S-R5 §C.9 gate in the eval)", () => {
  const withEvidence = { input: { dim: "tre", evidenceRows: [{ evidence_id: "ev-rev-01", source: "stripe", label: "Stripe", status: "evidenced", dims: ["tre"] }] } };

  it("groundedShareOf counts [ev:] markers on strengths / gaps / verdict and citations on criterion cards; null without evidence rows", () => {
    const fx = fixture([withEvidence]).cases[0];
    expect(groundedShareOf(fx, { verdict: "Early [ev:ev-rev-01]", strengths: ["MRR grows [ev:ev-rev-01]"], gaps: ["No cohort"], criterion_cards: [{ verdict: "x", citations: [{ evidence_id: "ev-rev-01", quote: "q" }] }, { verdict: "y", citations: [] }] })).toBe(0.6);
    expect(groundedShareOf(fixture([{}]).cases[0], { verdict: "anything" })).toBeNull();
    expect(groundedShareOf(fx, {})).toBe(0);
  });

  it("grounded_share_min scores ±1, the run reports grounded_share / grounded_cases, and shouldPromote enforces the 80 % threshold", async () => {
    const expected = { proposed_score: { min: 40, max: 80 }, confidence: { min: 0.5 }, must_have_gaps: [], must_not_hallucinate: [], grounded_share_min: GROUNDED_SHARE_THRESHOLD };
    const good = await runEval(fixture([{ ...withEvidence, expected }]), promptVersion, { runCase: mockRunner([{ proposed_score: 60, confidence: 0.7, verdict: "ok [ev:ev-rev-01]", strengths: ["a [ev:ev-rev-01]"], gaps: [] }]) });
    expect(good.per_case[0].groundedShare).toBe(1);
    expect(good.grounded_share).toBe(1);
    expect(good.grounded_cases).toBe(1);
    expect(good.accuracy_pct).toBe(1);
    expect(shouldPromote(good)).toBe(true);

    const weak = await runEval(fixture([{ ...withEvidence, expected }]), promptVersion, { runCase: mockRunner([{ proposed_score: 60, confidence: 0.7, verdict: "ok [ev:ev-rev-01]", strengths: ["a", "b", "c"], gaps: [] }]) });
    expect(weak.per_case[0].groundedShare).toBe(0.25);
    expect(weak.per_case[0].positivePoints).toBe(1); // score + confidence - grounded
    expect(shouldPromote(weak)).toBe(false);
    // accuracy alone would pass — the grounded gate is what blocks it
    expect(shouldPromote({ ...weak, accuracy_pct: 0.95 })).toBe(false);
    expect(shouldPromote({ ...weak, accuracy_pct: 0.95, grounded_share: 0.8 })).toBe(true);
    // cases without evidence never block promotion
    expect(shouldPromote({ ...weak, accuracy_pct: 0.95, grounded_cases: 0, grounded_share: null })).toBe(true);
  });
});

describe("shouldDemote (S-R5 §C.10 'fail → canary demoted')", () => {
  const base: EvalResult = { agent: "TBR-tre", version: "2.0.0", cases: 3, accuracy_pct: 0.9, hallucination_pct: 0, avg_confidence: 0.7, latency_p50_ms: 100, cost_usd_total: 0.01, hard_fail: false, grounded_share: 0.9, grounded_cases: 2, per_case: [] };
  it("demotes on hard fail, > 5 % hallucination, < 50 % accuracy, < 60 % grounded; holds a near miss", () => {
    expect(shouldDemote(base)).toEqual({ demote: false, reason: null });
    expect(shouldDemote({ ...base, hard_fail: true })).toEqual({ demote: true, reason: "hard_fail" });
    expect(shouldDemote({ ...base, hallucination_pct: 0.1 }).reason).toBe("hallucination 10 %");
    expect(shouldDemote({ ...base, accuracy_pct: 0.4 }).reason).toBe("accuracy 40 %");
    expect(shouldDemote({ ...base, grounded_share: 0.5 }).reason).toBe("grounded share 50 %");
    expect(shouldDemote({ ...base, accuracy_pct: 0.7 })).toEqual({ demote: false, reason: null });
    expect(shouldDemote({ ...base, grounded_share: 0.7 })).toEqual({ demote: false, reason: null });
    expect(shouldDemote({ ...base, cases: 0, hard_fail: true }).demote).toBe(false);
  });
});

describe("nightly dry-run — the 24 TBR fixture cases (3 stages × 8 dims), no LLM", () => {
  const dir = path.join(process.cwd(), "test-fixtures", "prompt-eval");
  const files = readdirSync(dir).filter((f) => /^TBR-[a-z]{3}-v2\.0\.0\.json$/.test(f)).sort();

  it("8 fixtures × 3 cases parse, and a deterministic in-band runner passes every gate (promote, no demotion)", async () => {
    expect(files).toHaveLength(8);
    let cases = 0;
    for (const f of files) {
      const fx = PromptEvalFixture.parse(JSON.parse(readFileSync(path.join(dir, f), "utf8")));
      expect(fx.cases).toHaveLength(3);
      cases += fx.cases.length;
      // Synthetic owner output built FROM the fixture: in-band score, the required gaps, one citation per evidence row, the expected visual.
      const runner: CaseRunner = async (c) => {
        const ev = Array.isArray(c.input.evidenceRows) ? (c.input.evidenceRows as Array<{ evidence_id: string }>) : [];
        const cite = ev.length ? ` [ev:${ev[0].evidence_id}]` : "";
        const mid = ((c.expected.proposed_score?.min ?? 40) + (c.expected.proposed_score?.max ?? 60)) / 2;
        return {
          ok: true,
          data: { dim: c.input.dim, proposed_score: mid, confidence: 0.75, verdict: `Deterministic dry-run verdict.${cite}`, strengths: [`Strength${cite}`], gaps: c.expected.must_have_gaps.map((g) => `${g}${cite}`), citations: ev.slice(0, 1).map((e) => ({ evidence_id: e.evidence_id, quote: "q" })), primary_visual: { kind: c.expected.primary_visual?.kind ?? "bar", series: [] } },
          latencyMs: 1,
          costUsd: 0,
          runId: `dry-${c.id}`,
        };
      };
      const res = await runEval(fx, promptVersion, { runCase: runner });
      expect(res.cases).toBe(3);
      expect(res.hard_fail).toBe(false);
      expect(res.hallucination_pct).toBe(0);
      expect(res.accuracy_pct).toBeGreaterThanOrEqual(0.8);
      if ((res.grounded_cases ?? 0) > 0) expect(res.grounded_share).toBeGreaterThanOrEqual(GROUNDED_SHARE_THRESHOLD);
      expect(shouldPromote(res), `${f}: ${JSON.stringify(res.per_case.map((c) => [c.caseId, c.positivePoints, c.possiblePoints]))}`).toBe(true);
      expect(shouldDemote(res).demote).toBe(false);
    }
    expect(cases).toBe(24);
  });

  it("a hallucinating runner fails every fixture's gate and would be demoted", async () => {
    const fx = PromptEvalFixture.parse(JSON.parse(readFileSync(path.join(dir, files[0]), "utf8")));
    const forbidden = fx.cases[0].expected.must_not_hallucinate[0] ?? "Sequoia";
    const runner: CaseRunner = async (c) => ({ ok: true, data: { proposed_score: 50, confidence: 0.7, verdict: `Claims ${forbidden}.`, gaps: c.expected.must_have_gaps }, latencyMs: 1, costUsd: 0, runId: "x" });
    const res = await runEval(fx, promptVersion, { runCase: runner });
    expect(res.hard_fail).toBe(true);
    expect(shouldPromote(res)).toBe(false);
    expect(shouldDemote(res)).toEqual({ demote: true, reason: "hard_fail" });
  });
});
