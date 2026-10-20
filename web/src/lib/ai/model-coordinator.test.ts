import { describe, expect, it } from "vitest";
import {
  approveProposal,
  challengerWins,
  coordinate,
  demotionReasons,
  dismissProposal,
  FREE_DEMOTION_TTL_MS,
  effectivePaidLadder,
  liveSignalsFromTbr,
  rollbackPaidPolicy,
  type CoordinatorInput,
  type LiveModelSignal,
  type Scorecard,
} from "./model-coordinator";
import type { CaseScore, TaskModelScore } from "./model-eval-scoring";
import type { EvalRunState } from "./model-eval";
import { approvedPaidLadder, type RoutingPolicy } from "./routing-policy";
import type { EvalCandidate, EvalTaskId } from "./task-profiles";

const V32 = "deepseek-ai/DeepSeek-V3.2";
const QWEN = "Qwen/Qwen3-235B-A22B-Instruct-2507";
const V4F = "deepseek-ai/DeepSeek-V4-Flash";
const DEFAULTS = {
  report: [V32, QWEN, V4F],
  synthesis: [V32, V4F, "moonshotai/Kimi-K2.6"],
  classify: ["openai/gpt-oss-120b", "meta-llama/Llama-3.3-70B-Instruct-Turbo"],
};

function row(over: Partial<TaskModelScore>): TaskModelScore {
  return {
    task: "report_chapter", provider: "deepinfra", model: V32, family: "deepseek", billing: "paid", tier: "primary",
    n: 20, transportFails: 0, transientFails: 0, schemaFails: 0, schemaFailRate: 0, criticalErrors: 0, accepted: 20, acceptRate: 1, quality: 0.9,
    groundedShare: 0.9, p50LatencyMs: 10_000, p95LatencyMs: 20_000, costUsd: 0.02, costPerAccepted: 0.001,
    judge: { n: 0, mean: null }, byLanguage: {}, bySection: {}, passesProfile: true, failReasons: [], dead: false, ...over,
  };
}

describe("challengerWins (plan §7.4)", () => {
  const primary = row({ quality: 0.91, costPerAccepted: 0.001 });
  it("cheaper leg: quality ≥ primary − 0.02 at ≤ 80 % cost per accepted output", () => {
    expect(challengerWins(row({ model: V4F, quality: 0.9, costPerAccepted: 0.0008 }), primary).win).toBe(true);
    expect(challengerWins(row({ model: V4F, quality: 0.9, costPerAccepted: 0.00085 }), primary).win).toBe(false);
    expect(challengerWins(row({ model: V4F, quality: 0.88, costPerAccepted: 0.0001 }), primary).win).toBe(false);
  });
  it("quality leg: +0.05 at ≤ 1.5× cost", () => {
    expect(challengerWins(row({ model: QWEN, quality: 0.96, costPerAccepted: 0.0015 }), primary).win).toBe(true);
    expect(challengerWins(row({ model: QWEN, quality: 0.96, costPerAccepted: 0.0016 }), primary).win).toBe(false);
  });
  it("two zero-cost models never win on the cost leg", () => {
    const free = row({ billing: "free", costPerAccepted: 0, quality: 0.8 });
    expect(challengerWins(row({ billing: "free", costPerAccepted: 0, quality: 0.81 }), free).win).toBe(false);
    expect(challengerWins(row({ billing: "free", costPerAccepted: 0, quality: 0.85 }), free).win).toBe(true);
  });
  it("any critical error, a failed profile or a judge veto blocks the win", () => {
    expect(challengerWins(row({ model: V4F, quality: 0.99, costPerAccepted: 0.0001, criticalErrors: 1 }), primary).win).toBe(false);
    expect(challengerWins(row({ model: V4F, quality: 0.99, costPerAccepted: 0.0001, passesProfile: false, failReasons: ["p95"] }), primary).win).toBe(false);
    expect(challengerWins(row({ model: V4F, quality: 0.99, costPerAccepted: 0.0001, judge: { n: 5, mean: 0.5 } }), { ...primary, judge: { n: 5, mean: 0.8 } }).win).toBe(false);
  });
  it("a primary with no accepted output loses to any eligible challenger", () => {
    expect(challengerWins(row({ model: V4F, quality: 0.7, costPerAccepted: 0.002 }), row({ quality: 0, costPerAccepted: null, accepted: 0 })).win).toBe(true);
  });
});

describe("demotionReasons (plan §7.4)", () => {
  const live = (share: number, sections = 20): LiveModelSignal => ({ sections, grounded: Math.round(share * sections), share, last_ts: null });
  it("live groundedShare < 0.80 over 20 sections", () => {
    expect(demotionReasons(null, 1e9, live(0.75), false)[0]).toMatch(/live groundedShare 0.75/);
    expect(demotionReasons(null, 1e9, live(0.5, 19), false)).toEqual([]);
    expect(demotionReasons(null, 1e9, live(0.8), false)).toEqual([]);
  });
  it("schema fail > 10 %, p95 over the SLO, dead", () => {
    expect(demotionReasons(row({ schemaFailRate: 0.15 }), 90_000, undefined, false)[0]).toMatch(/schema fail 15%/);
    expect(demotionReasons(row({ schemaFailRate: 0.1 }), 90_000, undefined, false)).toEqual([]);
    expect(demotionReasons(row({ p95LatencyMs: 95_000 }), 90_000, undefined, false)[0]).toMatch(/p95 95s > SLO 90s/);
    expect(demotionReasons(row({ dead: true }), 90_000, undefined, false)[0]).toMatch(/dead/);
    expect(demotionReasons(null, 90_000, undefined, true)).toEqual(["dead (live strike table)"]);
  });
  it("partial runs do not judge schema / latency", () => {
    expect(demotionReasons(row({ schemaFailRate: 0.5, p95LatencyMs: 1e9 }), 90_000, undefined, false, { useEvalQuality: false })).toEqual([]);
  });
});

// ── coordinate() fixtures ────────────────────────────────────────────

interface Spec {
  task: EvalTaskId;
  provider: string;
  model: string;
  family: string;
  billing?: "paid" | "free";
  tier?: EvalCandidate["tier"];
  n?: number;
  quality: number;
  cost?: number;
  latency?: number;
  transportFail?: boolean;
  error?: string;
}

function mkRun(runId: string, mode: "smoke" | "full", specs: Spec[], status: EvalRunState["status"] = "done"): EvalRunState {
  const candidates: EvalRunState["candidates"] = {};
  const results: EvalRunState["results"] = [];
  for (const s of specs) {
    const cand: EvalCandidate = { provider: s.provider, model: s.model, family: s.family, billing: s.billing ?? (s.provider === "deepinfra" ? "paid" : "free"), tier: s.tier ?? "challenger", vision: false };
    (candidates[s.task] ??= []).push(cand);
    for (let i = 0; i < (s.n ?? 10); i += 1) {
      const score: CaseScore = s.transportFail
        ? { caseId: `${i}`, lang: i % 2 ? "vi" : "en", section: "traction", ok: false, schemaOk: false, critical: [], groundedShare: null, numericOk: null, quality: 0, accepted: false, latencyMs: 0, costUsd: 0, error: s.error ?? "HTTP 404: model not found" }
        : { caseId: `${i}`, lang: i % 2 ? "vi" : "en", section: "traction", ok: true, schemaOk: true, critical: [], groundedShare: s.task === "report_chapter" ? 0.95 : null, numericOk: true, quality: s.quality, accepted: s.quality >= 0.6, latencyMs: s.latency ?? 5_000, costUsd: s.cost ?? 0 };
      results.push({ task: s.task, provider: s.provider, model: s.model, score });
    }
  }
  return {
    version: 1, run_id: runId, mode, split: mode === "smoke" ? "dev" : "heldout", period: runId, started_at: "2026-10-25T05:00:00Z", updated_at: "2026-10-25T06:00:00Z",
    finished_at: "2026-10-25T06:00:00Z", status, cap_usd: 1, spent_usd: 0.1, calls: results.length, judge_calls: 0, judge_spent_usd: 0, candidates, pending: [], results, skipped: [], planned: results.length,
  };
}

const reportSpecs = (v4fQuality: number, v4fCost: number): Spec[] => [
  { task: "report_chapter", provider: "deepinfra", model: V32, family: "deepseek", tier: "primary", quality: 0.9, cost: 0.001 },
  { task: "report_chapter", provider: "deepinfra", model: QWEN, family: "qwen", quality: 0.85, cost: 0.0012 },
  { task: "report_chapter", provider: "deepinfra", model: V4F, family: "deepseek", quality: v4fQuality, cost: v4fCost },
];

function step(run: EvalRunState, prior: Scorecard | null, policy: RoutingPolicy | null, extra: Partial<CoordinatorInput> = {}) {
  return coordinate({
    run, prior, policy, live: {}, isDead: () => false,
    freeLadders: { groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b", "openai/gpt-oss-20b"] },
    defaultPaidLadders: DEFAULTS, now: new Date("2026-10-25T06:00:00Z"), ...extra,
  });
}

describe("coordinate — paid ladder is PROPOSAL ONLY and needs 2 consecutive wins", () => {
  it("one win: no proposal; second consecutive win: proposal (active unchanged)", () => {
    const r1 = step(mkRun("full-w1", "full", reportSpecs(0.89, 0.0005)), null, null);
    expect(r1.policy.paid.proposal).toBeNull();
    expect(r1.scorecard.streaks[`report_chapter|deepinfra:${V4F}`]?.wins).toBe(1);
    expect(r1.scorecard.tasks.report_chapter?.primary).toMatchObject({ model: V32, source: "catalogue" });
    expect(r1.scorecard.tasks.report_chapter?.challenger).toMatchObject({ model: V4F, wins: 1 });

    const r2 = step(mkRun("full-w2", "full", reportSpecs(0.89, 0.0005)), r1.scorecard, r1.policy);
    expect(r2.policy.paid.proposal?.ladders.report).toEqual([V4F, V32, QWEN]);
    expect(r2.policy.paid.active).toBeNull();
    expect(approvedPaidLadder("report", DEFAULTS.report, r2.policy)).toBeNull(); // the dispatcher ignores proposals
    expect(r2.decisions).toContainEqual(expect.objectContaining({ kind: "promote", scope: "paid", model: V4F, outcome: "proposed" }));
    expect(r2.history.some((h) => h.action === "propose")).toBe(true);
  });

  it("a loss resets the streak; a partial (budget-exhausted) run neither counts nor resets", () => {
    const r1 = step(mkRun("full-a", "full", reportSpecs(0.89, 0.0005)), null, null);
    const partial = step(mkRun("full-b", "full", reportSpecs(0.89, 0.0005), "budget_exhausted"), r1.scorecard, r1.policy);
    expect(partial.scorecard.streaks[`report_chapter|deepinfra:${V4F}`]?.wins).toBe(1);
    expect(partial.policy.paid.proposal).toBeNull();
    const loss = step(mkRun("full-c", "full", reportSpecs(0.7, 0.0005)), partial.scorecard, partial.policy);
    expect(loss.scorecard.streaks[`report_chapter|deepinfra:${V4F}`]?.wins).toBe(0);
    const win = step(mkRun("full-d", "full", reportSpecs(0.89, 0.0005)), loss.scorecard, loss.policy);
    expect(win.policy.paid.proposal).toBeNull();
  });

  it("re-coordinating the same run is idempotent", () => {
    const run = mkRun("full-x", "full", reportSpecs(0.89, 0.0005));
    const a = step(run, null, null);
    const b = step(run, a.scorecard, a.policy);
    expect(b.scorecard.streaks[`report_chapter|deepinfra:${V4F}`]?.wins).toBe(1);
  });

  it("smoke runs never promote", () => {
    let prior: Scorecard | null = null;
    let policy: RoutingPolicy | null = null;
    for (const id of ["s1", "s2", "s3"]) {
      const r = step(mkRun(id, "smoke", reportSpecs(0.89, 0.0005)), prior, policy);
      prior = r.scorecard;
      policy = r.policy;
    }
    expect(policy!.paid.proposal).toBeNull();
    expect(prior!.tasks.report_chapter?.smoke.length).toBe(3);
    expect(prior!.last_full).toBeNull();
  });

  it("live groundedShare < 0.80 over 20 sections proposes moving the rung to the back (even on smoke)", () => {
    const live = { [`deepinfra:${V32}`]: { sections: 20, grounded: 14, share: 0.7, last_ts: null } };
    const r = step(mkRun("s-live", "smoke", []), null, null, { live });
    expect(r.policy.paid.proposal?.ladders.report).toEqual([QWEN, V4F, V32]);
    expect(r.policy.paid.proposal?.ladders.synthesis).toEqual([V4F, "moonshotai/Kimi-K2.6", V32]);
    expect(r.policy.paid.active).toBeNull();
    expect(r.decisions.filter((d) => d.kind === "demote" && d.scope === "paid")).toHaveLength(2);
  });

  it("schema fail > 10 % on a complete full run proposes a demotion", () => {
    const run = mkRun("full-s", "full", reportSpecs(0.9, 0.001));
    for (const res of run.results.filter((x) => x.model === QWEN).slice(0, 3)) res.score = { ...res.score, schemaOk: false, quality: 0, accepted: false };
    const r = step(run, null, null);
    expect(r.policy.paid.proposal?.ladders.report).toEqual([V32, V4F, QWEN]);
    expect(r.policy.paid.proposal?.reasons.join(" ")).toMatch(/schema fail 30%/);
  });
});

describe("coordinate — FREE ladders change automatically (P1-1 rules)", () => {
  const freeSpecs = (q120: number, failSmall: false | string = false): Spec[] => [
    { task: "classify", provider: "groq", model: "qwen/qwen3.8-27b", family: "qwen", tier: "free_fallback", quality: 0.8 },
    { task: "classify", provider: "groq", model: "openai/gpt-oss-120b", family: "gpt-oss", tier: "free_fallback", quality: q120 },
    { task: "classify", provider: "groq", model: "openai/gpt-oss-20b", family: "gpt-oss", tier: "free_fallback", quality: 0.7, transportFail: Boolean(failSmall), error: failSmall || undefined },
  ];
  const at = (iso: string) => ({ now: new Date(iso) });
  const demoted = (p: RoutingPolicy | null) => p?.free?.providers.groq?.demoted ?? [];

  it("3 failed smoke calls → no demotion (smoke never demotes)", () => {
    const r = step(mkRun("s-dead", "smoke", freeSpecs(0.8, "HTTP 404: model not found")), null, null);
    expect(demoted(r.policy)).toEqual([]);
    expect(r.decisions.some((d) => d.scope === "free" && d.kind === "demote")).toBe(false);
  });

  it("a definitively dead model is demoted only after 2 consecutive COMPLETE full runs, with a 14-day expiry; a clean run re-admits it", () => {
    const r1 = step(mkRun("f-1", "full", freeSpecs(0.8, "HTTP 404: model not found")), null, null);
    expect(demoted(r1.policy)).toEqual([]);
    const partial = step(mkRun("f-p", "full", freeSpecs(0.8, "HTTP 404: model not found"), "budget_exhausted"), r1.scorecard, r1.policy);
    expect(demoted(partial.policy)).toEqual([]);
    const r2 = step(mkRun("f-2", "full", freeSpecs(0.8, "HTTP 404: model not found")), partial.scorecard, partial.policy);
    expect(demoted(r2.policy)).toEqual(["openai/gpt-oss-20b"]);
    expect(r2.policy.free?.providers.groq?.demoted_until["openai/gpt-oss-20b"]).toBe(new Date(Date.parse("2026-10-25T06:00:00Z") + FREE_DEMOTION_TTL_MS).toISOString());
    expect(r2.decisions).toContainEqual(expect.objectContaining({ kind: "demote", scope: "free", outcome: "applied" }));
    const r3 = step(mkRun("f-3", "full", freeSpecs(0.8)), r2.scorecard, r2.policy);
    expect(demoted(r3.policy)).toEqual([]);
    expect(r3.decisions).toContainEqual(expect.objectContaining({ kind: "readmit", scope: "free" }));
  });

  it("failures from our own load (429 / timeouts) never demote, however often", () => {
    let prior: Scorecard | null = null;
    let policy: RoutingPolicy | null = null;
    for (const id of ["t1", "t2", "t3"]) {
      const r = step(mkRun(id, "full", freeSpecs(0.8, "HTTP 429: rate limit reached")), prior, policy);
      prior = r.scorecard;
      policy = r.policy;
    }
    expect(demoted(policy)).toEqual([]);
  });

  it("a demotion lapses after its expiry (even on a smoke run) and ids that left the raw ladder are pruned", () => {
    const r1 = step(mkRun("f-1", "full", freeSpecs(0.8, "HTTP 404: model not found")), null, null);
    const r2 = step(mkRun("f-2", "full", freeSpecs(0.8, "HTTP 404: model not found")), r1.scorecard, r1.policy);
    expect(demoted(r2.policy)).toEqual(["openai/gpt-oss-20b"]);
    const later = step(mkRun("s-late", "smoke", []), r2.scorecard, r2.policy, at("2026-11-09T07:00:00Z"));
    expect(demoted(later.policy)).toEqual([]);
    expect(later.decisions).toContainEqual(expect.objectContaining({ kind: "readmit", reason: expect.stringMatching(/expired/) }));
    const gone = step(mkRun("s-gone", "smoke", []), r2.scorecard, r2.policy, { freeLadders: { groq: ["qwen/qwen3.8-27b", "openai/gpt-oss-120b"] } });
    expect(demoted(gone.policy)).toEqual([]);
  });

  it("a free challenger needs +0.05 over the ladder head on 2 consecutive full runs", () => {
    const r1 = step(mkRun("f1", "full", freeSpecs(0.9)), null, null);
    expect(r1.policy.free?.providers.groq?.promoted ?? []).toEqual([]);
    const r2 = step(mkRun("f2", "full", freeSpecs(0.9)), r1.scorecard, r1.policy);
    expect(r2.policy.free?.providers.groq?.promoted).toEqual(["openai/gpt-oss-120b"]);
    expect(r2.decisions).toContainEqual(expect.objectContaining({ kind: "promote", scope: "free", model: "openai/gpt-oss-120b", outcome: "applied" }));
    // +0.03 is not enough
    const s1 = step(mkRun("g1", "full", freeSpecs(0.83)), null, null);
    const s2 = step(mkRun("g2", "full", freeSpecs(0.83)), s1.scorecard, s1.policy);
    expect(s2.policy.free?.providers.groq?.promoted ?? []).toEqual([]);
  });

  it("only a complete full run refreshes the free section's age (smoke cannot defeat the 15-day staleness)", () => {
    const full = step(mkRun("f-age", "full", freeSpecs(0.8)), null, null, at("2026-10-01T06:00:00Z"));
    expect(full.policy.free?.updated_at).toBe("2026-10-01T06:00:00.000Z");
    const smoke = step(mkRun("s-age", "smoke", freeSpecs(0.8)), full.scorecard, full.policy, at("2026-10-20T06:00:00Z"));
    expect(smoke.policy.free?.updated_at).toBe("2026-10-01T06:00:00.000Z");
    const none = step(mkRun("s-none", "smoke", freeSpecs(0.8)), null, null);
    expect(none.policy.free).toBeNull();
  });
});

describe("coordinate — paid proposals only name dialable models (P2-2)", () => {
  const GLM = "zai-org/GLM-5.3-Flash";
  const synthSpecs = (glmQuality: number): Spec[] => [
    { task: "ceo_synthesis", provider: "deepinfra", model: V32, family: "deepseek", tier: "primary", quality: 0.9, cost: 0.001 },
    { task: "ceo_synthesis", provider: "deepinfra", model: GLM, family: "glm", quality: glmQuality, cost: 0.0004 },
  ];

  it("a winner outside DEEPINFRA_MODELS_BY_CLASS is shown as needs-admission, never proposed", () => {
    const r1 = step(mkRun("full-g1", "full", synthSpecs(0.9)), null, null);
    const r2 = step(mkRun("full-g2", "full", synthSpecs(0.9)), r1.scorecard, r1.policy);
    expect(r2.policy.paid.proposal).toBeNull();
    expect(r2.scorecard.needs_admission).toContainEqual(expect.objectContaining({ cls: "synthesis", model: GLM }));
    expect(r2.decisions).toContainEqual(expect.objectContaining({ kind: "advisory_promote", model: GLM, outcome: "advisory" }));
  });

  it("effectivePaidLadder ignores approved ids the dispatcher would not dial", () => {
    const p = { version: 1 as const, updated_at: "x", free: null, paid: { active: { report: ["openai/gpt-oss-120b", V4F] }, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: null } };
    expect(effectivePaidLadder(p, "report", DEFAULTS)).toEqual([V4F, V32, QWEN]);
  });

  it("approve keeps only dialable ids; a proposal with none is refused", () => {
    const withProp = (ladders: Record<string, string[]>): RoutingPolicy => ({ version: 1, updated_at: "x", free: null, paid: { active: null, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: { id: "p", proposed_at: "x", ladders, reasons: [], needs_admission: [], evidence_runs: [] } } });
    const ok = approveProposal(withProp({ classify: ["deepseek-ai/DeepSeek-V4-Flash", "openai/gpt-oss-120b"] }), "p", "admin-1", new Date(), DEFAULTS);
    if (!ok.ok) throw new Error(ok.error);
    expect(ok.policy.paid.active?.classify).toEqual(["openai/gpt-oss-120b"]);
    expect(approveProposal(withProp({ classify: ["deepseek-ai/DeepSeek-V4-Flash"] }), "p", "admin-1", new Date(), DEFAULTS)).toMatchObject({ ok: false, status: 409 });
  });
});

describe("coordinate — scorecard", () => {
  it("aggregate + detail: primary/challenger per task, provider rollup, jsonl rows on full runs only", () => {
    const run = mkRun("full-sc", "full", reportSpecs(0.85, 0.0009));
    const r = step(run, null, null);
    const card = r.scorecard.tasks.report_chapter!;
    expect(card.models).toHaveLength(3);
    expect(card.models[0]!.byLanguage.en?.n).toBe(5);
    expect(card.models[0]!.bySection.traction?.n).toBe(10);
    expect(r.scorecard.providers).toContainEqual(expect.objectContaining({ task: "report_chapter", provider: "deepinfra", models: 3, cases: 30 }));
    expect(r.jsonl).toHaveLength(3);
    expect(r.scorecard.last_full?.complete).toBe(true);
    const smoke = step(mkRun("s-sc", "smoke", reportSpecs(0.85, 0.0009)), r.scorecard, r.policy);
    expect(smoke.jsonl).toHaveLength(0);
    expect(smoke.scorecard.last_full?.run_id).toBe("full-sc");
    expect(smoke.scorecard.tasks.report_chapter?.models).toHaveLength(3); // full rows kept
  });

  it("an approved paid ladder is the primary the challenger is compared against", () => {
    const policy = approveProposal(
      { version: 1, updated_at: "x", free: null, paid: { active: null, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: { id: "p1", proposed_at: "x", ladders: { report: [V4F] }, reasons: [], needs_admission: [], evidence_runs: [] } } },
      "p1",
      "admin-1",
    );
    if (!policy.ok) throw new Error("approve failed");
    expect(effectivePaidLadder(policy.policy, "report", DEFAULTS)).toEqual([V4F, V32, QWEN]);
    const r = step(mkRun("full-ap", "full", reportSpecs(0.89, 0.0005)), null, policy.policy);
    expect(r.scorecard.tasks.report_chapter?.primary).toMatchObject({ model: V4F, source: "approved_policy" });
  });
});

describe("admin actions (pure)", () => {
  const base = (): RoutingPolicy => ({
    version: 1, updated_at: "x", free: null,
    paid: { active: null, approved_at: null, approved_by: null, approved_proposal_id: null, previous: null, proposal: { id: "p1", proposed_at: "x", ladders: { report: [V4F, V32, QWEN] }, reasons: ["r"], needs_admission: [], evidence_runs: ["full-1"] } },
  });
  const now = new Date("2026-10-26T00:00:00Z");

  it("approve: proposal id must match; proposal → active, previous kept, proposal cleared, history line", () => {
    expect(approveProposal(base(), "stale", "admin-1", now)).toMatchObject({ ok: false, status: 409 });
    expect(approveProposal(null, "p1", "admin-1", now)).toMatchObject({ ok: false, status: 409 });
    const a = approveProposal(base(), "p1", "admin-1", now);
    if (!a.ok) throw new Error();
    expect(a.policy.paid).toMatchObject({ active: { report: [V4F, V32, QWEN] }, previous: null, proposal: null, approved_by: "admin-1", approved_proposal_id: "p1" });
    expect(a.history).toMatchObject({ action: "approve", actor: "admin-1", proposal_id: "p1" });
  });

  it("rollback restores the ladder before the last approve; nothing to roll back → 409", () => {
    const a = approveProposal(base(), "p1", "admin-1", now);
    if (!a.ok) throw new Error();
    a.policy.paid.proposal = { id: "p2", proposed_at: "y", ladders: { report: [QWEN] }, reasons: [], needs_admission: [], evidence_runs: [] };
    const b = approveProposal(a.policy, "p2", "admin-1", now);
    if (!b.ok) throw new Error();
    expect(b.policy.paid.active?.report).toEqual([QWEN]);
    expect(b.policy.paid.previous?.report).toEqual([V4F, V32, QWEN]);
    const rb = rollbackPaidPolicy(b.policy, "admin-1", now);
    if (!rb.ok) throw new Error();
    expect(rb.policy.paid.active?.report).toEqual([V4F, V32, QWEN]);
    const rb2 = rollbackPaidPolicy(rb.policy, "admin-1", now);
    if (!rb2.ok) throw new Error();
    expect(rb2.policy.paid.active).toBeNull(); // dispatcher defaults
    expect(rollbackPaidPolicy(rb2.policy, "admin-1", now)).toMatchObject({ ok: false, status: 409 });
  });

  it("dismiss drops the proposal and leaves routing alone", () => {
    const d = dismissProposal(base(), "p1", "admin-1", now);
    if (!d.ok) throw new Error();
    expect(d.policy.paid.proposal).toBeNull();
    expect(d.policy.paid.active).toBeNull();
    expect(dismissProposal(base(), "nope", "admin-1", now)).toMatchObject({ ok: false });
  });
});

describe("liveSignalsFromTbr", () => {
  it("newest sections first, ≤ 20 per model, deterministic / cache / unknown skipped", () => {
    const old = { ts: "1", sections: Array.from({ length: 15 }, () => ({ id: "s", model: `deepinfra:${V32}`, grounded: true })) };
    const recent = { ts: "2", sections: [...Array.from({ length: 10 }, () => ({ id: "s", model: `deepinfra:${V32}`, grounded: false })), { id: "d", model: "deterministic", grounded: true }, { id: "c", model: "cache", grounded: true }, { id: "n", model: null, grounded: true }] };
    const live = liveSignalsFromTbr([old, recent]);
    expect(Object.keys(live)).toEqual([`deepinfra:${V32}`]);
    expect(live[`deepinfra:${V32}`]).toMatchObject({ sections: 20, grounded: 10, share: 0.5 });
  });
});
