// Colocated tests for lib/agents/grant-application-drafter (T0251): prompt
// assembly carries the SVI + data-room evidence + match notes + guidance and
// word cap; drafting is serial, never throws, and a failed prompt yields ""
// (never blank rows) with ai_ok=false; preambles are stripped and the word
// cap enforced.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { callAIMock } = vi.hoisted(() => ({ callAIMock: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ callAI: (opts: unknown) => callAIMock(opts) }));

import { buildDraftPrompt, draftGrantApplication, systemPromptFor, type GrantDraftContext, type GrantDraftTarget, type ProgramDraftTarget } from "./grant-application-drafter";

const PROGRAM: ProgramDraftTarget = {
  kind: "program",
  id: "syd-startmate-accelerator",
  name: "Startmate Accelerator",
  provider: "Startmate",
  summary: "Australia's best-known accelerator; 2 cohorts/yr.",
  program_type: "accelerator",
  intake: "Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027",
  funding: "A$120,000 for ≤8%",
  cost_to_founder: "free",
  benefits: ["4,000+ mentor network", "Demo Day to 1,000+ investors"],
  length_weeks: 12,
  official_url: "https://www.startmate.com/accelerator",
};

const GRANT: GrantDraftTarget = {
  id: "nsw-mvp-ventures",
  name: "MVP Ventures Program (NSW)",
  provider: "Investment NSW",
  summary: "Matched grant for TRL 3-7 products.",
  amount_note: "A$25k–A$75k, 1:1 matched",
  co_contribution: "1:1",
  official_url: "https://www.investment.nsw.gov.au/mvp",
};

const CTX: GrantDraftContext = {
  startup: "Acme Agtech",
  description: "Soil sensors for grain farmers.",
  industry: "AgTech",
  stage: "mvp",
  state: "NSW",
  svi: { total: 62, dimensions: { FTV: 70, TRE: 40 }, summary: "Strong team, thin traction." },
  evidence: ["Pitch deck v3.pdf (IRI)", "Cap table.xlsx (CGH)"],
  matchWhy: ["Fits MVP stage in NSW."],
  eligibility: ["HQ state: pass", "TRL 3-7: unknown"],
};

const PROMPTS = [
  { id: "product", question: "Describe the MVP and its TRL.", guidance: "Name the start and end TRL.", max_words: 20 },
  { id: "budget", question: "Provide the budget.", max_words: 50 },
];

beforeEach(() => {
  callAIMock.mockReset();
});

describe("buildDraftPrompt", () => {
  it("carries grant facts, startup facts, SVI, evidence, match notes, guidance and the word cap", () => {
    const p = buildDraftPrompt(GRANT, PROMPTS[0]!, CTX);
    expect(p).toContain("Grant: MVP Ventures Program (NSW) (Investment NSW)");
    expect(p).toContain("Co-contribution: 1:1");
    expect(p).toContain("Startup: Acme Agtech");
    expect(p).toContain("What it does: Soil sensors for grain farmers.");
    expect(p).toContain("Industry: AgTech · Stage: mvp · State: NSW");
    expect(p).toContain("SVI 62/100");
    expect(p).toContain("FTV=70");
    expect(p).toContain("- Pitch deck v3.pdf (IRI)");
    expect(p).toContain("- Fits MVP stage in NSW.");
    expect(p).toContain("- TRL 3-7: unknown");
    expect(p).toContain('"Describe the MVP and its TRL."');
    expect(p).toContain("Guidance from the guidelines: Name the start and end TRL.");
    expect(p).toContain("Word cap: 20");
  });

  it("never blanks a missing context block and skips generic guidance", () => {
    const p = buildDraftPrompt(GRANT, { id: "x", question: "Q?", guidance: "generic" }, { ...CTX, svi: null, evidence: [], matchWhy: [], eligibility: [] });
    expect(p).toContain("SVI analysis: (none on file)");
    expect(p).toContain("Data-room evidence on file: (none on file)");
    expect(p).not.toContain("Guidance from the guidelines");
    expect(p).toContain("Word cap: 250");
  });

  it("S16-A program target: carries the program name, type, intake window, funding, benefits and program-flavoured labels — no grant lines", () => {
    const p = buildDraftPrompt(PROGRAM, { id: "why_startmate", question: "Why Startmate, and why now?", guidance: "Name the mentors you want.", max_words: 150 }, CTX);
    expect(p).toContain("Program: Startmate Accelerator (Startmate) — accelerator, 12 weeks");
    expect(p).toContain("About the program: Australia's best-known accelerator; 2 cohorts/yr.");
    expect(p).toContain("Intake: Applications open Sep 2026, close 8 Nov 2026; next cohort 25 Jan 2027");
    expect(p).toContain("Funding on offer: A$120,000 for ≤8%");
    expect(p).toContain("Cost to founder: free");
    expect(p).toContain("What the program offers:\n- 4,000+ mentor network\n- Demo Day to 1,000+ investors");
    expect(p).toContain("Why the Money Finder matched this program");
    expect(p).toContain("Guidance from the program: Name the mentors you want.");
    expect(p).toContain("Startup: Acme Agtech");
    expect(p).toContain("SVI 62/100");
    expect(p).toContain("- Pitch deck v3.pdf (IRI)");
    expect(p).toContain("Word cap: 150");
    expect(p).not.toContain("Grant:");
    expect(p).not.toContain("Co-contribution");
    expect(p).not.toContain("Guidance from the guidelines");
  });

  it("systemPromptFor: accelerator voice for programs (concise, evidence-led, no hype), grant coach otherwise", () => {
    const program = systemPromptFor(PROGRAM);
    expect(program).toMatch(/accelerator-application coach/);
    expect(program).toMatch(/No hype, no superlatives/);
    expect(program).toMatch(/Never invent/);
    expect(program).toMatch(/Lead with the strongest fact/);
    const grant = systemPromptFor(GRANT);
    expect(grant).toMatch(/grant-application coach/);
    expect(grant).not.toMatch(/accelerator/);
  });
});

describe("draftGrantApplication", () => {
  it("drafts one answer per prompt, serially, stripping preambles and enforcing the word cap", async () => {
    const order: string[] = [];
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      order.push(opts.user.includes("Describe the MVP") ? "product" : "budget");
      return {
        text: opts.user.includes("Describe the MVP")
          ? 'Answer: "' + Array.from({ length: 30 }, (_, i) => `w${i}`).join(" ") + '"'
          : "We will spend A$50k on trials.",
        provider: "groq",
        model: "llama",
      };
    });
    const r = await draftGrantApplication(GRANT, PROMPTS, CTX);
    expect(order).toEqual(["product", "budget"]);
    expect(r.ai_ok).toBe(true);
    expect(r.failed).toEqual([]);
    expect(r.provider).toBe("groq");
    expect(r.model).toBe("llama");
    expect(r.answers.product.startsWith("w0 w1")).toBe(true);
    expect(r.answers.product.split(/\s+/).length).toBe(20);
    expect(r.answers.budget).toBe("We will spend A$50k on trials.");
    expect(callAIMock.mock.calls[0]![0]).toMatchObject({ agentId: "grant-drafter", temperature: 0.4 });
  });

  it("a throwing or empty AI call yields \"\" for that prompt, ai_ok=false, and never throws", async () => {
    callAIMock
      .mockRejectedValueOnce(new Error("provider down"))
      .mockResolvedValueOnce({ text: "   ", provider: "groq", model: "m" });
    const r = await draftGrantApplication(GRANT, PROMPTS, CTX);
    expect(r).toEqual({ answers: { product: "", budget: "" }, ai_ok: false, failed: ["product", "budget"], provider: null, model: null });
  });

  it("partial failure keeps the good answer and flags the bad one", async () => {
    callAIMock.mockResolvedValueOnce({ text: "Good answer.", provider: "openai", model: "gpt" }).mockRejectedValueOnce(new Error("x"));
    const r = await draftGrantApplication(GRANT, PROMPTS, CTX);
    expect(r.answers).toEqual({ product: "Good answer.", budget: "" });
    expect(r.ai_ok).toBe(false);
    expect(r.failed).toEqual(["budget"]);
  });

  it("no prompts → ai_ok false (nothing drafted), no AI calls", async () => {
    const r = await draftGrantApplication(GRANT, [], CTX);
    expect(r.ai_ok).toBe(false);
    expect(callAIMock).not.toHaveBeenCalled();
  });

  it("S16-A: a program target uses the accelerator system prompt and the program-drafter agent id", async () => {
    callAIMock.mockResolvedValue({ text: "We sell soil sensors to grain farmers.", provider: "groq", model: "m" });
    const r = await draftGrantApplication(PROGRAM, [{ id: "one_liner", question: "One sentence.", max_words: 40 }], CTX);
    expect(r.ai_ok).toBe(true);
    expect(r.answers.one_liner).toBe("We sell soil sensors to grain farmers.");
    const call = callAIMock.mock.calls[0]![0] as { system: string; user: string; agentId: string };
    expect(call.agentId).toBe("program-drafter");
    expect(call.system).toMatch(/accelerator-application coach/);
    expect(call.user).toContain("Program: Startmate Accelerator");
    expect(call.user).toContain("Intake: Applications open Sep 2026");
  });
});
