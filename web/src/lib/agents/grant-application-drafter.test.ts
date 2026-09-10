// Colocated tests for lib/agents/grant-application-drafter (T0251): prompt
// assembly carries the SVI + data-room evidence + match notes + guidance and
// word cap; drafting is serial, never throws, and a failed prompt yields ""
// (never blank rows) with ai_ok=false; preambles are stripped and the word
// cap enforced.

import { beforeEach, describe, expect, it, vi } from "vitest";

const { callAIMock } = vi.hoisted(() => ({ callAIMock: vi.fn() }));
vi.mock("@/lib/ai-client", () => ({ callAI: (opts: unknown) => callAIMock(opts) }));

import { buildDraftPrompt, draftGrantApplication, type GrantDraftContext, type GrantDraftTarget } from "./grant-application-drafter";

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
});
