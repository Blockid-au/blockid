import { describe, expect, it, vi } from "vitest";
import { DEFAULT_PROVIDER_CALL_CAPS, isoWeek, parseCallCaps, periodFor, planRun, runEvalTick, smokeCases, unitHash, worstCaseCallUsd, type EvalBudgetLedger, type EvalDeps, type EvalRunState, type ModelCallRequest, type ModelCallResponse } from "./model-eval";
import type { ModelEvalCase, ModelEvalFixture } from "./model-eval-scoring";
import { familyOf, isEvalCallable, judgeFor, type EvalTaskId } from "./task-profiles";

const T0 = Date.parse("2026-10-25T05:00:00Z"); // a Sunday

const EVIDENCE = [
  { id: "e1", label: "Stripe", text: "Monthly recurring revenue was A$42,300 in September 2026." },
  { id: "e2", label: "CRM", text: "118 paying customers as of 30 September 2026." },
];

function cases(task: EvalTaskId, split: string, n: number, padBytes = 0): ModelEvalCase[] {
  const evidence = padBytes ? [...EVIDENCE, { id: "e3", label: "Notes", text: "x".repeat(padBytes) }] : EVIDENCE;
  return Array.from({ length: n }, (_, i) => {
    const lang = i % 2 === 0 ? "en" : "vi";
    const base = { id: `${task}-${split}-${i}`, lang, section: "s", expected: { must_keep: [], must_mention_any: [], must_not_mention: [], critical_claims: [] } } as ModelEvalCase;
    if (task === "classify") return { ...base, input: { text: "B2B software" }, expected: { ...base.expected, label: { sector: "saas", stage: "seed" } } };
    return { ...base, input: { company: "Wattle", section: "traction", evidence }, expected: { ...base.expected, min_citations: 1 } };
  });
}

function fixtures(nDev = 6, nHeld = 8, padBytes = 0): (task: EvalTaskId, split: "dev" | "heldout") => ModelEvalFixture | null {
  const memo = new Map<string, ModelEvalFixture>();
  return (task, split) => {
    if (task !== "classify" && task !== "report_chapter") return null;
    const k = `${task}/${split}`;
    if (!memo.has(k)) memo.set(k, { task, split, version: "t", source: "synthetic test", cases: cases(task, split, split === "dev" ? nDev : nHeld, padBytes) });
    return memo.get(k)!;
  };
}

const ANSWERS: Record<string, unknown> = {
  classify: { sector: "saas", stage: "seed" },
  report: { verdict: "MRR A$42,300 [ev:e1].", strengths: ["118 customers [ev:e2]"], gaps: [], criterion_cards: [{ criterion: "Revenue", verdict: "MRR A$42,300.", citations: ["e1"] }] },
  judge: { score: 0.9, issues: [] },
};

function makeDeps(over: Partial<EvalDeps> & { latency?: number; usage?: { in: number; out: number } | "worst" } = {}) {
  let t = T0;
  const store: Partial<Record<string, EvalRunState>> = {};
  let budget: EvalBudgetLedger | null = null;
  const calls: ModelCallRequest[] = [];
  const latency = over.latency ?? 1_000;
  const call = vi.fn(async (req: ModelCallRequest): Promise<ModelCallResponse> => {
    calls.push(req);
    t += latency;
    const body = req.system.startsWith("You are an independent reviewer") ? ANSWERS.judge : req.system.includes("Classify the startup") ? ANSWERS.classify : ANSWERS.report;
    const usage = over.usage === "worst"
      ? { in: Buffer.byteLength(req.system) + Buffer.byteLength(req.user), out: req.maxTokens } // the most a provider can bill
      : over.usage ?? { in: 500, out: 300 };
    return { ok: true, text: JSON.stringify(body), latencyMs: latency, inputTokens: usage.in, outputTokens: usage.out };
  });
  const deps: EvalDeps = {
    now: () => t,
    loadFixture: fixtures(),
    loadImage: () => null,
    freeLists: () => ({}),
    configured: () => true,
    call,
    readState: (mode) => (store[mode] ? JSON.parse(JSON.stringify(store[mode])) : null),
    writeState: (mode, s) => { store[mode] = JSON.parse(JSON.stringify(s)); },
    readBudget: () => budget,
    writeBudget: (b) => { budget = { ...b }; },
    wallBudgetMs: 10_000_000,
    ...over,
  };
  return { deps, calls, call, store, getBudget: () => budget, advance: (ms: number) => { t += ms; } };
}

describe("periods + helpers", () => {
  it("smoke = UTC day, full = ISO week", () => {
    expect(periodFor("smoke", T0)).toBe("2026-10-25");
    expect(isoWeek(T0)).toBe("2026-W43");
    expect(isoWeek(Date.parse("2027-01-01T00:00:00Z"))).toBe("2026-W53");
  });
  it("unitHash is deterministic in [0,1)", () => {
    expect(unitHash("a")).toBe(unitHash("a"));
    expect(unitHash("a")).toBeGreaterThanOrEqual(0);
    expect(unitHash("a")).toBeLessThan(1);
  });
  it("smokeCases takes 2 EN + 1 VI", () => {
    const picked = smokeCases(cases("classify", "dev", 6));
    expect(picked.map((c) => c.lang)).toEqual(["en", "en", "vi"]);
  });
  it("worst case: free tiers cost 0; an unpriced paid model is Infinity (never started)", () => {
    expect(worstCaseCallUsd("groq", "openai/gpt-oss-120b", 3000, 1000)).toBe(0);
    expect(worstCaseCallUsd("deepinfra", "deepseek-ai/DeepSeek-V3.2", 3000, 1000)).toBeCloseTo((3000 / 1e6) * 0.26 + (1000 / 1e6) * 0.38, 10); // 1 token per prompt byte
    expect(worstCaseCallUsd("deepinfra", "unknown/model", 3000, 1000)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("planRun", () => {
  it("smoke: 3 dev cases per task × every configured candidate, no judge", () => {
    const { deps } = makeDeps();
    const s = planRun("smoke", deps, 1);
    expect(s.split).toBe("dev");
    const classify = s.pending.filter((i) => i.task === "classify");
    const cands = s.candidates.classify ?? [];
    expect(cands.length).toBeGreaterThan(2);
    expect(classify).toHaveLength(3 * cands.length);
    expect(s.pending.some((i) => i.judge)).toBe(false);
    expect(s.skipped.filter((x) => /fixture/.test(x.reason)).length).toBe(6);
  });
  it("full: held-out cases, a deterministic judge sample on report tasks only", () => {
    const { deps } = makeDeps();
    const s = planRun("full", deps, 1);
    expect(s.split).toBe("heldout");
    expect(s.pending.filter((i) => i.task === "report_chapter")).toHaveLength(8 * (s.candidates.report_chapter ?? []).length);
    expect(s.pending.some((i) => i.judge && i.task === "report_chapter")).toBe(true);
    expect(s.pending.some((i) => i.judge && i.task === "classify")).toBe(false);
    expect(planRun("full", deps, 1).pending.map((i) => i.judge)).toEqual(s.pending.map((i) => i.judge));
  });
  it("unconfigured providers are skipped, not called", () => {
    const { deps } = makeDeps({ configured: (p) => p !== "groq" });
    const s = planRun("smoke", deps, 1);
    expect(s.pending.some((i) => i.provider === "groq")).toBe(false);
    expect(s.skipped.some((x) => x.provider === "groq" && x.reason === "provider not configured")).toBe(true);
  });
});

describe("runEvalTick", () => {
  it("smoke run completes, every call is eval-callable, results scored", async () => {
    const { deps, calls } = makeDeps();
    const r = await runEvalTick("smoke", deps);
    expect(r).toMatchObject({ status: "done", finalized: true, remaining: 0 });
    expect(calls.length).toBe(r.planned);
    expect(calls.every((c) => isEvalCallable(c.provider, c.model))).toBe(true);
    expect(r.state?.results.every((x) => x.score.schemaOk)).toBe(true);
    expect(r.state!.spent_usd).toBeGreaterThan(0); // DeepInfra rows priced
    // only DeepInfra costs money
    expect(r.state!.spent_usd).toBeLessThanOrEqual(1);
  });

  it("hard cap: never starts a call whose worst case could cross US$ cap; finalises as budget_exhausted", async () => {
    const { deps, calls } = makeDeps({ runCapUsd: 0.01, usage: "worst" });
    const r = await runEvalTick("full", deps);
    expect(r.status).toBe("budget_exhausted");
    expect(r.finalized).toBe(true);
    expect(r.spent_usd).toBeLessThanOrEqual(0.01);
    expect(r.remaining).toBeGreaterThan(0);
    const n = calls.length;
    // the finished period is a no-op afterwards — no further spend
    const again = await runEvalTick("full", deps);
    expect(again.status).toBe("noop");
    expect(calls.length).toBe(n);
  });

  it("the default per-run cap is US$1 and cannot be bypassed by a long run", async () => {
    // Every call billed at its maximum, many cases: the run must stop at the cap, not after it.
    // ~50 KB of evidence per report case ≈ US$0.013 a call at worst: the cap binds after ~75 calls.
    const { deps } = makeDeps({ usage: "worst", loadFixture: fixtures(6, 60, 50_000) });
    const r = await runEvalTick("full", deps);
    expect(r.status).toBe("budget_exhausted");
    expect(r.cap_usd).toBe(1);
    expect(r.spent_usd).toBeLessThanOrEqual(1);
  });

  it("own monthly budget: stops when the month's eval spend would exceed it", async () => {
    const { deps, getBudget } = makeDeps({ monthlyBudgetUsd: 5, readBudget: () => ({ month: "2026-10", spent_usd: 4.9999, runs: 3 }) });
    const r = await runEvalTick("full", deps);
    expect(r.status).toBe("monthly_budget_exhausted");
    expect(getBudget()!.spent_usd).toBeLessThanOrEqual(5);
    expect(getBudget()!.runs).toBe(4);
  });

  it("a new month resets the ledger", async () => {
    const { deps, getBudget } = makeDeps({ readBudget: () => ({ month: "2026-09", spent_usd: 4.99, runs: 9 }) });
    await runEvalTick("smoke", deps);
    expect(getBudget()!.month).toBe("2026-10");
    expect(getBudget()!.runs).toBe(1);
  });

  it("resumable: a tick stops at its wall clock, the next tick continues the same run, then no-ops; restart starts a new run", async () => {
    const h = makeDeps({ wallBudgetMs: 12_000, latency: 2_000 });
    const first = await runEvalTick("smoke", h.deps);
    expect(first.status).toBe("running");
    expect(first.finalized).toBe(false);
    expect(first.processed).toBeGreaterThan(0);
    expect(first.remaining).toBeGreaterThan(0);
    let last = first;
    for (let i = 0; i < 50 && last.status === "running"; i += 1) {
      last = await runEvalTick("smoke", h.deps);
      expect(last.run_id).toBe(first.run_id);
    }
    expect(last.status).toBe("done");
    expect(last.state!.results).toHaveLength(first.planned);
    expect((await runEvalTick("smoke", h.deps)).status).toBe("noop");
    const fresh = await runEvalTick("smoke", h.deps, { restart: true });
    expect(fresh.run_id).not.toBe(first.run_id === fresh.run_id ? "" : first.run_id);
  });

  it("judge: sampled full-run cases are re-read by a model from a DIFFERENT family", async () => {
    const { deps, calls } = makeDeps();
    const r = await runEvalTick("full", deps);
    const judgeCalls = calls.filter((c) => c.system.startsWith("You are an independent reviewer"));
    expect(judgeCalls.length).toBeGreaterThan(0);
    expect(r.state!.judge_calls).toBe(judgeCalls.length);
    const judged = r.state!.results.filter((x) => typeof x.score.judgeScore === "number");
    expect(judged.length).toBe(judgeCalls.length);
    expect(judged.every((x) => x.score.judgeScore === 0.9)).toBe(true);
    // Every judged writer got the judge judgeFor() picks for its family — never its own family.
    const expectedJudges = new Set<string>();
    for (const x of judged) {
      const wf = familyOf(x.provider, x.model);
      const j = judgeFor(wf);
      expect(j).not.toBeNull();
      expect(j!.family).not.toBe(wf);
      expectedJudges.add(`${j!.provider}:${j!.model}`);
    }
    expect(new Set(judgeCalls.map((c) => `${c.provider}:${c.model}`))).toEqual(expectedJudges);
    expect(judgeCalls.every((c) => isEvalCallable(c.provider, c.model))).toBe(true);
  });

  it("per-provider call caps protect the free quota", async () => {
    const { deps, calls } = makeDeps({ providerCallCaps: { groq: 2 } });
    const r = await runEvalTick("smoke", deps);
    expect(calls.filter((c) => c.provider === "groq")).toHaveLength(2);
    expect(r.state!.skipped.some((s) => s.provider === "groq" && /call cap/.test(s.reason))).toBe(true);
    expect(r.status).toBe("done");
  });

  it("refuses a non-callable provider before I/O even if a state file lists it", async () => {
    const h = makeDeps();
    const planned = planRun("smoke", h.deps, 1);
    const classifyCase = planned.pending.find((i) => i.task === "classify")!.caseId;
    planned.pending = [{ task: "classify", caseId: classifyCase, provider: "gemini", model: "gemini-2.5-flash", family: "gemini", judge: false }];
    planned.planned = 1;
    h.store.smoke = planned;
    const r = await runEvalTick("smoke", h.deps);
    expect(h.calls).toHaveLength(0);
    expect(r.state!.results[0]!.score.error).toMatch(/refused/);
  });

  it("dry run: plans and prices the worst case without calling or writing", async () => {
    const { deps, calls, store } = makeDeps();
    const r = await runEvalTick("full", deps, { dryRun: true });
    expect(r.status).toBe("dry_run");
    expect(r.worst_case_usd).toBeGreaterThan(0);
    expect(calls).toHaveLength(0);
    expect(store.full).toBeUndefined();
  });

  it("a transport failure on a paid call that reached the provider is charged its worst case", async () => {
    const { deps } = makeDeps({
      call: async (req) => (req.provider === "deepinfra" ? { ok: false, text: "", latencyMs: 30_000, error: "timeout" } : { ok: true, text: JSON.stringify(ANSWERS.classify), latencyMs: 10 }),
    });
    const r = await runEvalTick("smoke", deps);
    expect(r.spent_usd).toBeGreaterThan(0);
    expect(r.state!.results.filter((x) => x.provider === "deepinfra").every((x) => !x.score.ok)).toBe(true);
  });

  it("P1-2: an unfinished run is never dropped — a new period first closes it as `incomplete` (finalized, for the coordinator)", async () => {
    const h = makeDeps({ wallBudgetMs: 6_000, latency: 2_000 });
    const first = await runEvalTick("full", h.deps);
    expect(first.status).toBe("running");
    h.advance(7 * 86_400_000); // next ISO week
    const closed = await runEvalTick("full", h.deps);
    expect(closed).toMatchObject({ status: "incomplete", finalized: true, run_id: first.run_id });
    expect(closed.state!.results.length).toBe(first.processed);
    const next = await runEvalTick("full", h.deps);
    expect(next.run_id).not.toBe(first.run_id);
    expect(next.status).toBe("running");
  });

  it("P1-2: ?finalize closes a running run (end of its window) without calling a model; otherwise it is a no-op", async () => {
    const h = makeDeps({ wallBudgetMs: 6_000, latency: 2_000 });
    const first = await runEvalTick("full", h.deps);
    const n = h.calls.length;
    const fin = await runEvalTick("full", h.deps, { finalize: true });
    expect(fin).toMatchObject({ status: "incomplete", finalized: true });
    expect(h.calls.length).toBe(n);
    expect((await runEvalTick("full", h.deps, { finalize: true })).status).toBe("noop");
    expect((await runEvalTick("full", h.deps)).status).toBe("noop"); // same week, already closed
    expect(first.run_id).toBe(fin.run_id);
  });

  it("P2-3: paid spend goes to the shared ledger tagged by provider; the daily paid cap stops paid calls", async () => {
    const recordSpend = vi.fn();
    const { deps } = makeDeps({ recordSpend });
    await runEvalTick("smoke", deps);
    expect(recordSpend).toHaveBeenCalled();
    expect(recordSpend.mock.calls.every(([p, usd]) => p === "deepinfra" && usd > 0)).toBe(true);
    const capped = makeDeps({ recordSpend: vi.fn(), dailyCapReached: () => true });
    const r = await runEvalTick("smoke", capped.deps);
    expect(r.status).toBe("daily_cap_reached");
    expect(capped.calls.every((c) => c.provider !== "deepinfra")).toBe(true);
  });

  it("call caps are configurable per mode (env string) on top of the defaults", () => {
    expect(DEFAULT_PROVIDER_CALL_CAPS.full.groq).toBe(250);
    expect(parseCallCaps("groq=120, openrouter=0,bogus,x=-1", DEFAULT_PROVIDER_CALL_CAPS.full)).toMatchObject({ groq: 120, openrouter: 0, cerebras: 250 });
    expect(parseCallCaps(undefined, DEFAULT_PROVIDER_CALL_CAPS.smoke)).toEqual(DEFAULT_PROVIDER_CALL_CAPS.smoke);
  });
});
