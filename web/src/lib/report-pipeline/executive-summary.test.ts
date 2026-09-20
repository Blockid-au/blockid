// G19-S47 — the CEO executive summary JSON contract: the OUTPUT_SCHEMA slot,
// the input the call is hashed on, and the one-call budget rule (a prose
// answer is kept as the thesis with NO repair pass; a JSON attempt may be
// repaired once when the budget allows; a failed call yields null).

import { describe, expect, it, vi } from "vitest";
import type { StructuredModelCaller } from "@/lib/ai/call-structured";
import { hasMarkdownSyntax } from "@/lib/report-v2/schema";
import { demoReportV2 } from "@/lib/report-v2/fixtures";
import { dispatchExecutiveSummary, draftFromPayload, executiveOutputContract, executiveSummaryInput, ExecutiveSummaryInput, ExecutiveSummaryPayload, renderExecutiveUser } from "./executive-summary";
import { DIM_ORDER } from "./dimension-owners";
import type { AgentAnalysisResult, ReportContext } from "./types";

vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));
vi.mock("@/lib/ai/prompt-registry", () => ({ readCurrentPrompt: vi.fn(async () => null) }));

function makeContext(): ReportContext {
  const demo = demoReportV2();
  const chapters = new Map(demo.dimensions.map((d) => [d.dim, d] as const));
  const criterionResults = new Map<string, AgentAnalysisResult>();
  criterionResults.set("traction", { criterion: "traction", agentRole: "cro", score: 46, highlights: ["MRR A$12,000", "Expansion thin"], content: "", confidence: 0.7 } as unknown as AgentAnalysisResult);
  return {
    accountId: "acc",
    userId: "user",
    startupName: "Acme",
    rawText: "",
    sviAnalysis: { totalSVI: 74, stageLabel: "Seed", stage: 2 } as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: {} as ReportContext["criteriaData"],
    stage: 2,
    locale: "en",
    gatherResults: {} as ReportContext["gatherResults"],
    criterionResults: criterionResults as ReportContext["criterionResults"],
    consistencyIssues: ["Market signal and product maturity diverge"],
    phaseGate: demo.executive.phaseNow,
    dimensionChapters: chapters as ReportContext["dimensionChapters"],
    valuationChapter: demo.valuation,
  };
}

const GOOD_JSON = JSON.stringify({
  headline: "Acme: compliance SaaS with real revenue and a thin expansion motion",
  summary: ["Acme sells compliance workflow software to Australian SMEs. Stripe shows A$12,000 MRR from nine customers [ev:ev-stripe-mrr-01].", "The team has two exits and the register is clean."],
  key_insight: "Retention, not acquisition, decides the next round.",
  reasons_to_back: [
    { title: "Proven founders", body: "Two prior exits [ev:ev-linkedin-01].", dim: "ftv" },
    { title: "Renewing pilots", body: "Pilot customers renewed.", dim: "MPC" },
    { title: "Clean register", body: "ESOP and vesting in place.", dim: "cgh" },
  ],
  critical_gaps: [
    { title: "Traction below the gate", body: "TRE scores 46; the phase needs 55.", dim: "tre", lift: 6 },
    { title: "Expansion thin", body: "Expansion revenue only 6 % of NRR.", dim: "tre" },
    { title: "Moat unproven", body: "Network effects not yet demonstrated.", dim: "svm" },
  ],
  benchmarks: DIM_ORDER.map((d) => ({ dim: d, score: 70, band: "strong" })),
  phase_now: { phase_id: "investor_review", label: "Investor Progress Review", blocker: "TRE scores 46 — the gate needs 55.", what_it_takes: "Publish a cohort retention table." },
  verdict: { label: "back_with_conditions", condition: "Retention table published within 30 days.", confidence: 0.7 },
  actions: [
    { title: "Publish the retention table", detail: "Cohort table from Stripe.", window: "this_week", dim: "tre" },
    { title: "Quantify the serviceable market", detail: "Bottom-up SAM.", window: "30d", dim: "mpc" },
  ],
});

function caller(script: string[]): { fn: StructuredModelCaller; requests: Array<{ messages: number }> } {
  const requests: Array<{ messages: number }> = [];
  const fn: StructuredModelCaller = async (req) => {
    requests.push({ messages: req.messages.length });
    const next = script.shift();
    if (next === undefined) return { ok: false, status: "model_error", reason: "script exhausted" };
    if (next === "__throw__") throw new Error("model outage");
    return { ok: true, text: next };
  };
  return { fn, requests };
}

describe("executiveSummaryInput / renderExecutiveUser / executiveOutputContract", () => {
  it("the input validates against its schema, names the lowest dimension and the valuation consensus, and the user turn threads the consistency issues", () => {
    const input = executiveSummaryInput(makeContext());
    expect(ExecutiveSummaryInput.safeParse(input).success).toBe(true);
    expect(input.lowestDim).toBe("svm");
    expect(input.chapters).toHaveLength(8);
    expect(input.valuation?.confidence).toBe(0.85);
    const user = renderExecutiveUser(input);
    expect(user).toContain("Consistency Issues");
    expect(user).toContain("Market signal and product maturity diverge");
    expect(user).toContain("SVI Score: 74");
    expect(user).toContain("Lowest dimension: SVM");
    expect(user).toContain("Phase now: Investor Progress Review");
  });

  it("the contract names every field of the structured shape, the caps, the verdict labels and forbids markdown", () => {
    const c = executiveOutputContract();
    for (const key of ["headline", "summary", "key_insight", "reasons_to_back", "critical_gaps", "benchmarks", "phase_now", "verdict", "actions", "what_it_takes"]) expect(c).toContain(`"${key}"`);
    expect(c).toContain("back | back_with_conditions | watch | not_yet");
    expect(c).toContain("this_week | 30d | 90d");
    expect(c).toContain("at most 14 words");
    expect(c).toContain("at most 60 words");
    expect(c).toMatch(/no markdown syntax inside strings/);
    expect(c).toContain("[ev:«id»]");
  });
});

describe("dispatchExecutiveSummary", () => {
  it("a JSON answer → validated + clamped structured block, a plain-text thesis twin, ONE call, no markdown anywhere", async () => {
    const ctx = makeContext();
    const callAI = vi.fn(async () => "never used");
    const { fn, requests } = caller([GOOD_JSON]);
    const out = await dispatchExecutiveSummary(ctx, callAI, { systemPrompt: "sys", modelCaller: fn });
    expect(out.calls).toBe(1);
    expect(requests).toEqual([{ messages: 1 }]);
    expect(callAI).not.toHaveBeenCalled();
    expect(out.structured).not.toBeNull();
    const s = out.structured!;
    expect(s.headline).toBe("Acme: compliance SaaS with real revenue and a thin expansion motion");
    expect(s.summary).toHaveLength(2);
    expect(s.reasonsToBack.map((r) => r.dim)).toEqual(["ftv", "mpc", "cgh"]);
    expect(s.criticalGaps).toHaveLength(3);
    expect(s.criticalGaps[0]).toMatchObject({ dim: "tre", lift: 6 });
    expect(s.verdict).toEqual({ label: "back_with_conditions", condition: "Retention table published within 30 days.", confidence: 0.7 });
    expect(s.actions).toHaveLength(2);
    expect(s.benchmarks).toHaveLength(8);
    expect(s.phaseNow.whatItTakes).toBe("Publish a cohort retention table.");
    expect(out.thesis).toContain(s.headline);
    expect(out.thesis).toContain("[ev:ev-stripe-mrr-01]");
    expect(hasMarkdownSyntax(JSON.stringify(s))).toBe(false);
  });

  it("a prose answer is kept verbatim as the thesis with NO repair pass (one call) — the read-time parser structures it", async () => {
    const { fn, requests } = caller(["## Executive Summary\n\n**Acme** is strong.", "{never}"]);
    const out = await dispatchExecutiveSummary(makeContext(), vi.fn(), { systemPrompt: "sys", modelCaller: fn, allowRepair: () => true });
    expect(out.calls).toBe(1);
    expect(requests).toEqual([{ messages: 1 }]);
    expect(out.structured).toBeNull();
    expect(out.thesis).toBe("## Executive Summary\n\n**Acme** is strong.");
    expect(out.reason).toContain("no repair pass");
  });

  it("a truncated JSON attempt gets ONE repair when allowed (two calls) and none when the budget forbids it", async () => {
    const cut = GOOD_JSON.slice(0, 200);
    const allowed = caller([cut, GOOD_JSON]);
    const a = await dispatchExecutiveSummary(makeContext(), vi.fn(), { systemPrompt: "sys", modelCaller: allowed.fn, allowRepair: () => true });
    expect(a.calls).toBe(2);
    expect(allowed.requests).toEqual([{ messages: 1 }, { messages: 3 }]);
    expect(a.structured?.verdict.label).toBe("back_with_conditions");

    const forbidden = caller([cut, GOOD_JSON]);
    const b = await dispatchExecutiveSummary(makeContext(), vi.fn(), { systemPrompt: "sys", modelCaller: forbidden.fn, allowRepair: () => false });
    expect(b.calls).toBe(1);
    expect(b.structured).toBeNull();
    // The cut JSON is still the thesis (the parser falls back to the chapters on read).
    expect(b.thesis).toBe(cut);
  });

  it("a failed first call → thesis null (the orchestrator keeps its deterministic shell); the default transport is the metered callAI on the synthesis class", async () => {
    const { fn } = caller(["__throw__"]);
    const out = await dispatchExecutiveSummary(makeContext(), vi.fn(), { systemPrompt: "sys", modelCaller: fn });
    expect(out.structured).toBeNull();
    expect(out.thesis).toBeNull();
    expect(out.reason).toContain("model outage");

    const callAI = vi.fn(async (_s: string, _u: string, _m: number, taskClass?: string) => {
      expect(taskClass).toBe("synthesis");
      return GOOD_JSON;
    });
    const viaCallAI = await dispatchExecutiveSummary(makeContext(), callAI, { systemPrompt: "sys" });
    expect(callAI).toHaveBeenCalledTimes(1);
    expect(callAI.mock.calls[0][0]).toBe("sys");
    expect(callAI.mock.calls[0][1]).toContain("Executive Summary Generation");
    expect(viaCallAI.structured?.headline).toContain("Acme");
  });

  it("draftFromPayload lower-cases dims, drops unknown ones and keeps the verdict label for the finaliser", () => {
    const parsed = ExecutiveSummaryPayload.parse(JSON.parse(GOOD_JSON));
    const draft = draftFromPayload({ ...parsed, reasons_to_back: [{ title: "x", body: "y", dim: "nope" }], verdict: { label: "BUY", confidence: 0.5 } });
    expect(draft.reasonsToBack?.[0].dim).toBeUndefined();
    expect(draft.verdict?.label).toBe("BUY");
    expect(draft.benchmarks).toHaveLength(8);
  });
});
