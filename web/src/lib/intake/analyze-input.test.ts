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

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(async () => ({
    text: JSON.stringify({ kind: "idea_text", confidence: 0.7, reason: "short pre-revenue statement" }),
    provider: "gemini",
    model: "test",
  })),
}));

vi.mock("@/lib/guest-analysis/runner", () => ({
  extractFileText: vi.fn(async () => "Slide 1 problem\n\nSlide 2 solution\n\nSlide 3 team"),
}));

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

import { analyzeInput } from "./analyze-input";

describe("analyzeInput — regex fast-path", () => {
  it("classifies URL strings as website", async () => {
    const result = await analyzeInput({ text: "https://stripe.com" });
    expect(result.inputKind).toBe("website");
    expect(result.confidence).toBeGreaterThan(0.5);
    expect(result.classifierMode).toBe("regex");
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
  });

  it("returns idea_text with empty rawText when no input given", async () => {
    const result = await analyzeInput({});
    expect(result.inputKind).toBe("idea_text");
    expect(result.rawText).toBe("");
    expect(result.confidence).toBe(0);
  });
});

describe("analyzeInput — file path", () => {
  it("classifies a PDF buffer as pitch_deck", async () => {
    const buffer = Buffer.from("%PDF-1.4 fake pdf content");
    const result = await analyzeInput({
      file: { filename: "deck.pdf", buffer },
    });
    expect(result.inputKind).toBe("pitch_deck");
    expect(result.structured.slides?.length).toBeGreaterThanOrEqual(0);
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
  });

  it("warns when a PDF yields no extractable text", async () => {
    const { extractFileText } = await import("@/lib/guest-analysis/runner");
    (extractFileText as ReturnType<typeof vi.fn>).mockResolvedValueOnce("");
    const buffer = Buffer.from("%PDF-1.4 empty");
    const result = await analyzeInput({
      file: { filename: "empty.pdf", buffer },
    });
    expect(result.inputKind).toBe("pitch_deck");
    expect(result.warnings?.length ?? 0).toBeGreaterThan(0);
  });
});
