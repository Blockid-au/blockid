import { describe, expect, it, vi } from "vitest";

// Mock heavy deps BEFORE importing the module under test.
vi.mock("@/lib/rnd-input", async () => {
  const actual = await vi.importActual<typeof import("@/lib/rnd-input")>("@/lib/rnd-input");
  return {
    ...actual,
    scrapeUrl: vi.fn(async (url: string) => ({
      title: `Title for ${url}`,
      description: "Test description",
      text: "Body text with product features, customers, pricing, and team.",
      techHints: ["React", "Stripe"],
    })),
  };
});

vi.mock("./website-corpus", () => ({
  acquireWebsiteCorpus: vi.fn(async (url: string) => ({
    version: "website-corpus-v1",
    seedUrl: url.startsWith("http") ? url : `https://${url}`,
    pages: [
      { id: "page:root", requestedUrl: url, finalUrl: url, status: "available", httpStatus: 200, title: `Title for ${url}`, description: "Test description", text: "Body text with product features, customers, pricing, and team.", observedAt: "2026-09-23T00:00:00.000Z", truncated: false, error: null },
      { id: "page:1", requestedUrl: `${url}/pricing`, finalUrl: `${url}/pricing`, status: "available", httpStatus: 200, title: "Pricing", description: "", text: "A$50 per month", observedAt: "2026-09-23T00:00:00.000Z", truncated: false, error: null },
    ],
    combinedText: `Title for ${url}\n\nBody text with product features, customers, pricing, and team.\n\nA$50 per month`,
    complete: true,
    limits: { maxPages: 6, pageChars: 12000, corpusChars: 60000 },
  })),
}));

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(async (opts: { user: string }) => {
    // Return an existing-company answer for prompts that clearly describe one,
    // otherwise default to idea_text. Matches the classifier's ambiguity path.
    const isExisting = /founded in \d{4}|paying customers|mrr|arr|employees|raised/i.test(opts.user);
    return {
      text: JSON.stringify({
        kind: isExisting ? "existing_company_text" : "idea_text",
        confidence: 0.7,
        reason: isExisting ? "detected real company signals" : "short pre-revenue statement",
      }),
      provider: "gemini",
      model: "test",
    };
  }),
}));

vi.mock("@/lib/guest-analysis/runner", () => ({
  extractFileText: vi.fn(async () => "Slide 1 problem\n\nSlide 2 solution\n\nSlide 3 team"),
}));

vi.mock("@/lib/pdf/extract-text", () => ({
  extractPdfTextFromBuffer: vi.fn(async () => ({ text: "Problem\n\nSolution", pages: 3, engine: "pdf-parse-v2", pageTexts: [{ page: 1, text: "Problem" }, { page: 2, text: "" }, { page: 3, text: "Solution" }] })),
}));
vi.mock("node-pptx-parser", () => ({ default: class {
  async extractText() { return [{ path: "ppt/slides/slide7.xml", text: ["Problem", "Customer friction"] }, { path: "ppt/slides/slide2.xml", text: [] }]; }
} }));

vi.mock("./deck-sections", async () => {
  const actual = await vi.importActual<typeof import("./deck-sections")>("./deck-sections");
  return {
    ...actual,
    splitDeckToSections: vi.fn(async (slides: string[]) => ({
      problem: slides.filter(s => /problem/i.test(s)),
      solution: slides.filter(s => /solution/i.test(s)),
      market: [],
      product: [],
      traction: [],
      team: slides.filter(s => /team/i.test(s)),
      ask: [],
      other: [],
    })),
  };
});

vi.mock("./visual-transcript", () => ({
  extractVisualTranscript: vi.fn(async () => ({ text: "Business revenue stated as AUD 100000 for FY2025, unaudited", source: { originalSha256: "a".repeat(64), derivativeSha256: "b".repeat(64), width: 800, height: 600, transformVersion: "upright-png-v1", status: "transcribed_unverified", visualAnalysis: "not_performed" } })),
  visualTranscriptContext: (text: string) => `[Image transcription — unverified]\n${text}`,
  VISUAL_TRANSCRIPT_WARNING: "OCR is unverified; charts are not interpreted.",
}));

vi.mock("./visual-document", () => ({ extractDocumentVisuals: vi.fn(async () => ({ documentSha256: "c".repeat(64), text: "", units: [], warnings: [] })) }));
import { analyzeInput } from "./analyze-input";

describe("analyzeInput — regex fast-path", () => {
  it("classifies URL strings as website", async () => {
    const result = await analyzeInput({ text: "https://stripe.com" });
    expect(result.inputKind).toBe("website");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.classifierMode).toBe("regex");
    expect(result.inputSnapshot?.sourceUnits).toHaveLength(2);
    expect(result.inputSnapshot?.sourceUnits[0]).toMatchObject({ id: "page:root", status: "available" });
    expect(result.investorIntent?.requestedOutputs).toEqual([{ output: "investment_view", provenance: "inferred", spans: [] }]);
    expect(result.rawText).toContain("A$50 per month");
    expect(result.structured.pages).toEqual([
      expect.objectContaining({ url: "https://stripe.com", status: "available" }),
      expect.objectContaining({ url: "https://stripe.com/pricing", status: "available", title: "Pricing" }),
    ]);
  });

  it("classifies bare domains as website", async () => {
    const result = await analyzeInput({ text: "atlassian.com" });
    expect(result.inputKind).toBe("website");
    expect(result.rawText.length).toBeGreaterThan(0);
  });

  it("classifies short pre-revenue phrases as idea_text (via LLM fallback)", async () => {
    const result = await analyzeInput({
      text: "AI copilot for AU accountants, pre-revenue.",
    });
    expect(result.inputKind).toBe("idea_text");
  });

  it("classifies clearly-existing-company text as existing_company_text", async () => {
    const result = await analyzeInput({
      text:
        "We founded in 2020, our platform is live with 1200 paying customers producing A$45k MRR. Team of 12 employees. Raised $2M in seed.",
    });
    expect(result.inputKind).toBe("existing_company_text");
    expect(result.inputSnapshot?.inputKind).toBe("existing_company_text");
    expect(JSON.stringify(result.inputSnapshot)).not.toContain("1200 paying customers");
  });

  it("captures the user's investor request separately from business input", async () => {
    const result = await analyzeInput({
      text: "We sell workflow software to clinics. Analyse valuation, risks and competitors for an investor.",
    });
    expect(result.investorIntent?.requestedOutputs.map((x) => x.output)).toEqual(expect.arrayContaining([
      "investment_view", "valuation", "risks", "competitors",
    ]));
    expect(result.inputSnapshot?.sourceUnits[0]?.textSha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("handles the ambiguous 'we built a fintech app' fixture without erroring", async () => {
    const result = await analyzeInput({ text: "we built a fintech app" });
    // Short input + no explicit existing markers → shortText heuristic
    // classifies as idea_text through the regex path; the LLM ambiguity
    // path is exercised by longer fixtures. What matters is we return
    // one of the four canonical kinds with non-zero confidence.
    expect(["idea_text", "existing_company_text"]).toContain(result.inputKind);
    expect(result.confidence).toBeGreaterThan(0);
    expect(["regex", "llm", "hybrid"]).toContain(result.classifierMode);
  });

  it("returns idea_text with empty rawText when no input given", async () => {
    const result = await analyzeInput({});
    expect(result.inputKind).toBe("idea_text");
    expect(result.rawText).toBe("");
    expect(result.confidence).toBe(0);
  });
});

describe("analyzeInput — file path", () => {
  it("keeps image observations in narrative but excludes them and filename claims from scoring", async () => {
    const result = await analyzeInput({ file: { filename: "MRR AUD 100000 customers team.png", buffer: Buffer.from("image") } });
    expect(result.rawText).toContain("AUD 100000");
    expect(result.scoringSourceText).toBe("");
    expect(result.signals.mrrAud).toBeUndefined();
    expect(result.signals.arrAud).toBeUndefined();
  });
  it("classifies a PDF buffer as pitch_deck", async () => {
    const buffer = Buffer.from("%PDF-1.4 fake pdf content");
    const result = await analyzeInput({
      file: { filename: "deck.pdf", buffer },
    });
    expect(result.inputKind).toBe("pitch_deck");
    expect(result.structured.slides).toEqual(["Problem", "", "Solution"]);
    expect(result.inputSnapshot?.sourceUnits.map(s => [s.locator, s.status])).toEqual([
      ["deck.pdf#page=1", "available"], ["deck.pdf#page=2", "unsupported"], ["deck.pdf#page=3", "available"],
    ]);
    expect(result.classifierMode).toBe("file");
  });

  it("classifies a PPTX buffer as pitch_deck (deck detection by extension)", async () => {
    // Real PPTX starts with PK\x03\x04
    const header = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
    const filler = Buffer.from("fake pptx bytes ".repeat(20));
    const buffer = Buffer.concat([header, filler]);
    const result = await analyzeInput({
      file: { filename: "pitch.pptx", buffer },
    });
    expect(result.inputKind).toBe("pitch_deck");
    expect(result.rawText).toContain("Problem\nCustomer friction");
    expect(result.inputSnapshot?.sourceUnits[0].locator).toBe("pitch.pptx#ppt/slides/slide7.xml");
  });

  it("requests input when both native and visual PDF extraction are empty", async () => {
    const { extractPdfTextFromBuffer } = await import("@/lib/pdf/extract-text");
    vi.mocked(extractPdfTextFromBuffer).mockResolvedValueOnce({ text: "", pages: 0, engine: "none" });
    await expect(analyzeInput({ file: { filename: "empty.pdf", buffer: Buffer.from("%PDF-1.4 empty") } })).rejects.toThrow("needs_input");
  });
});

describe("image intake provenance", () => {
  it("keeps OCR evidence separate from user intent and records its limitation", async () => {
    const result = await analyzeInput({ file: { filename: "financials.png", buffer: Buffer.from("image"), mimeType: "image/png" }, text: "What needs verification?" });
    expect(result.structured.imageSource?.status).toBe("transcribed_unverified");
    expect(result.rawText).toContain("unverified");
    expect(result.inputSnapshot?.sourceUnits[0].locator).toBe("financials.png#image=1");
    expect(result.warnings?.[0]).toContain("charts");
  });
});
