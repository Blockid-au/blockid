import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Colocated vitest for the previously-untested server-only
// `web/src/lib/rnd-analysis.ts` — the R&D report generation engine that
// powers the /rnd flow (10-page narrative essay + Deep-Dive extended
// sections + modular per-section purchase) and consumes callAI() through a
// batched, retry-with-backoff, JSON-parsed pipeline. This lib is one of the
// highest-blast-radius surfaces in the codebase because a silent regression
// (e.g. dropping the tier→system-prompt switch so a Deep-Dive user gets the
// free-tier prompt; letting parseAIResponse return the WRONG array shape so
// every generated page falls back to the placeholder; forgetting to clamp
// page.score into [0,100] so a hallucinated `score: 999` corrupts the
// overallScore average; forgetting to preserve locale=vi title translations
// so a Vietnamese user gets English page titles) breaks the paid-report
// contract every founder just credits-charged for.
//
// Every callAI-hitting helper is exercised via `vi.mock('./ai-client')` so
// the test is hermetic — no network, no OAuth, no provider fallback. The
// heavier sibling libs (`./svi-analysis`, `./credits`, `./rnd-input`) are
// also mocked so this file's assertions target the rnd-analysis contract in
// isolation from unrelated svi-scoring / credit-pricing drift. The 3s
// `setTimeout` delays inside `generateRndReport` + `runBatch` retry backoff
// are collapsed via `vi.stubGlobal('setTimeout', immediate-cb)` so the full
// 10-page pipeline runs in one tick.

const mocks = vi.hoisted(() => {
  const callAIMock = vi.fn();
  const detectSectorMock = vi.fn();
  const calculateReportCostMock = vi.fn();
  return { callAIMock, detectSectorMock, calculateReportCostMock };
});
const { callAIMock, detectSectorMock, calculateReportCostMock } = mocks;

vi.mock("./ai-client", () => ({
  callAI: mocks.callAIMock,
}));

vi.mock("./svi-analysis", () => ({
  SVI_STAGE_LABELS: [
    "Concept",
    "Validated Idea",
    "MVP / Prototype",
    "Early Traction",
    "Revenue",
    "Growth",
    "Scale",
    "Corporation",
  ],
  detectSector: mocks.detectSectorMock,
}));

const SECTION_DEPTH_CONFIG_FIXTURE = {
  scan: { label: "Scan", words: 100, credits: 0.1, description: "" },
  summary: { label: "Summary", words: 300, credits: 0.25, description: "" },
  standard: { label: "Standard", words: 500, credits: 0.5, description: "" },
  deep: { label: "Deep", words: 1000, credits: 1, description: "" },
  expert: { label: "Expert", words: 2000, credits: 2, description: "" },
  maximum: { label: "Maximum", words: 3000, credits: 3, description: "" },
} as const;

vi.mock("./credits", () => ({
  SECTION_DEPTH_CONFIG: SECTION_DEPTH_CONFIG_FIXTURE,
  calculateReportCost: mocks.calculateReportCostMock,
}));

vi.mock("./rnd-input", () => ({}));

import {
  PAGE_DEFS,
  generateRndReport,
  generateSectionReport,
  type SectionRequest,
  type CompetitiveResearchData,
} from "./rnd-analysis";
import type { SVIAnalysis } from "./svi-analysis";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeSVI(overrides: Partial<SVIAnalysis> = {}): SVIAnalysis {
  return {
    version: "2.0.0",
    totalSVI: 140,
    baselineSVI: 100,
    netAdjustment: 40,
    confidenceMultiplier: 0.75,
    subs: [
      { key: "PTD", label: "Problem-Solution Fit", value: 60, adjustment: 5, rationale: "clear pain" },
      { key: "SVM", label: "Market", value: 70, adjustment: 10, rationale: "large TAM" },
    ] as SVIAnalysis["subs"],
    riskPenalties: [
      { key: "regulation", label: "Regulatory risk", points: 4, reason: "AFSL" },
    ] as SVIAnalysis["riskPenalties"],
    evidenceGaps: [
      { key: "cap", label: "Cap table", priority: "P0", action: "Upload cap table", impact: 8 },
      { key: "deck", label: "Pitch deck", priority: "P1", action: "Upload deck", impact: 5 },
    ] as SVIAnalysis["evidenceGaps"],
    nextActions: [],
    signals: {} as SVIAnalysis["signals"],
    summary: "",
    stage: 3,
    stageLabel: "Early Traction",
    stageBonus: 12,
    ...overrides,
  };
}

// A minimal ai-response builder — pageIds is the ordered list of pages
// the runBatch generator asked the model to fill. The mock returns one
// page object per id with a deterministic content + score + highlights.
function pageResponse(
  pageIds: string[],
  overrides: Record<string, Record<string, unknown>> = {},
): string {
  const pages = pageIds.map((id) => ({
    pageId: id,
    content: `# ${id}\n\nNarrative essay body for ${id}.`,
    score: 72,
    highlights: [`insight-1-${id}`, `insight-2-${id}`],
    dataPoints: { generatedFor: id },
    ...overrides[id],
  }));
  return JSON.stringify({ pages });
}

// callAI mock helper — returns the shape rnd-analysis expects.
function aiOk(text: string) {
  return { text, provider: "claude", model: "claude-opus-4-7" };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  callAIMock.mockReset();
  detectSectorMock.mockReset();
  calculateReportCostMock.mockReset();
  calculateReportCostMock.mockReturnValue({ totalWords: 1234, totalCredits: 5.5, perPage: [] });
  // Collapse setTimeout so the 3s inter-page delay + retry backoff runs at
  // native speed under the fake clock — nothing else in the module uses
  // setTimeout for correctness (the ai-client timeoutMs is mocked out).
  vi.stubGlobal(
    "setTimeout",
    ((cb: (...args: unknown[]) => void) => {
      cb();
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// PAGE_DEFS — public shape
// ---------------------------------------------------------------------------

describe("PAGE_DEFS", () => {
  it("ships exactly 10 pages numbered 1..10 in order", () => {
    expect(PAGE_DEFS).toHaveLength(10);
    for (let i = 0; i < PAGE_DEFS.length; i++) {
      expect(PAGE_DEFS[i].num).toBe(i + 1);
    }
  });

  it("every page has unique id + non-empty title/subtitle in both locales", () => {
    const ids = new Set(PAGE_DEFS.map((p) => p.id));
    expect(ids.size).toBe(PAGE_DEFS.length);
    for (const p of PAGE_DEFS) {
      expect(p.title.length).toBeGreaterThan(0);
      expect(p.subtitle.length).toBeGreaterThan(0);
      expect(p.titleVi.length).toBeGreaterThan(0);
      expect(p.subtitleVi.length).toBeGreaterThan(0);
    }
  });

  it("carries the 10 canonical page ids in the shipped order", () => {
    expect(PAGE_DEFS.map((p) => p.id)).toEqual([
      "executive",
      "market",
      "product",
      "business",
      "competition",
      "traction",
      "team",
      "financial",
      "risk",
      "recommendations",
    ]);
  });
});

// ---------------------------------------------------------------------------
// generateRndReport — happy path
// ---------------------------------------------------------------------------

describe("generateRndReport", () => {
  it("assembles a 10-page report using AI content when parsing succeeds on every batch", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });

    const report = await generateRndReport(
      "an AI startup that reinvents auditing",
      makeSVI(),
      "idea",
    );

    expect(report.version).toBe("2.0.0");
    expect(report.pages).toHaveLength(10);
    expect(report.tier).toBe("standard");
    expect(report.inputType).toBe("idea");
    expect(report.inputUrl).toBeUndefined();
    for (const p of report.pages) {
      // AI happy path — content is the mock body, not the "could not be
      // generated" fallback string.
      expect(p.content).toMatch(/Narrative essay body/);
      expect(p.score).toBe(72);
    }
  });

  it("overallScore averages the per-page scores across the 10 pages", async () => {
    // Force each page's score to a distinct known value so the average is
    // deterministic — (10+20+30+…+100)/10 = 55.
    const scores: Record<string, number> = {};
    PAGE_DEFS.forEach((def, i) => {
      scores[def.id] = (i + 1) * 10;
    });
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {};
      for (const id of ids) overrides[id] = { score: scores[id] };
      return aiOk(pageResponse(ids, overrides));
    });

    const report = await generateRndReport("a startup", makeSVI(), "idea");
    expect(report.overallScore).toBe(55);
  });

  it("clamps out-of-range AI scores into [0,100]", async () => {
    // AI hallucinates score: 999 on page 1 and score: -50 on page 2 — both
    // must be clamped before landing in the report.
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {
        executive: { score: 999 },
        market: { score: -50 },
      };
      return aiOk(pageResponse(ids, overrides));
    });

    const report = await generateRndReport("a startup", makeSVI(), "idea");
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    const market = report.pages.find((p) => p.pageId === "market")!;
    expect(exec.score).toBe(100);
    expect(market.score).toBe(0);
  });

  it("falls back to the placeholder page when a batch response has no matching pageId", async () => {
    // Model returns a bogus id that runBatch discards — the page must fall
    // through to `makeFallbackPage`, showing the "could not be generated"
    // copy prefixed with the truncated raw input.
    callAIMock.mockResolvedValue(aiOk(JSON.stringify({ pages: [{ pageId: "wrong-id", content: "junk" }] })));

    const report = await generateRndReport("a startup input text", makeSVI(), "idea");
    for (const p of report.pages) {
      expect(p.content).toMatch(/Analysis could not be fully generated/);
      expect(p.content).toMatch(/a startup input text/);
      expect(p.score).toBeUndefined();
      expect(p.highlights).toEqual([]);
    }
  });

  it("uses SVI totalSVI as overallScore when no page has a numeric score", async () => {
    // Every page falls back to the placeholder (no score) → overallScore
    // must degrade to sviAnalysis.totalSVI per the fallback branch at
    // rnd-analysis.ts:656.
    callAIMock.mockResolvedValue(aiOk(JSON.stringify({ pages: [] })));
    const svi = makeSVI({ totalSVI: 217 });
    const report = await generateRndReport("startup", svi, "idea");
    expect(report.overallScore).toBe(217);
  });

  it("computes potentialSVI as totalSVI + round(gapPoints * 0.7), capped at 300", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const svi = makeSVI({
      totalSVI: 290,
      evidenceGaps: [
        { key: "a", label: "A", priority: "P0", action: "act", impact: 20 },
        { key: "b", label: "B", priority: "P1", action: "act", impact: 20 },
      ] as SVIAnalysis["evidenceGaps"],
    });
    const report = await generateRndReport("startup", svi, "idea");
    // gapPoints = 40, +round(40*0.7) = +28 → 318, clamped to 300.
    expect(report.potentialSVI).toBe(300);
  });

  it("defaults potentialSVI without capping when totalSVI + gap-boost stays under 300", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const svi = makeSVI({
      totalSVI: 100,
      evidenceGaps: [
        { key: "a", label: "A", priority: "P0", action: "act", impact: 10 },
        { key: "b", label: "B", priority: "P1", action: "act", impact: 10 },
      ] as SVIAnalysis["evidenceGaps"],
    });
    const report = await generateRndReport("startup", svi, "idea");
    // gapPoints = 20, +round(20*0.7)=+14 → 114.
    expect(report.potentialSVI).toBe(114);
  });

  it("uses the +5 default impact when an evidence gap omits impact", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const svi = makeSVI({
      totalSVI: 100,
      evidenceGaps: [
        { key: "a", label: "A", priority: "P0", action: "act" } as unknown as SVIAnalysis["evidenceGaps"][number],
      ],
    });
    const report = await generateRndReport("startup", svi, "idea");
    // Missing impact → default 5 → 100 + round(5*0.7)=+4 → 104.
    expect(report.potentialSVI).toBe(104);
  });

  it("populates inputUrl only when inputType='url' and trims whitespace", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const report = await generateRndReport("   https://example.com   ", makeSVI(), "url");
    expect(report.inputUrl).toBe("https://example.com");
    expect(report.inputType).toBe("url");
  });

  it("omits inputUrl when inputType='document'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const report = await generateRndReport("doc text", makeSVI(), "document");
    expect(report.inputUrl).toBeUndefined();
  });

  it("forwards calculated word count + credit cost from calculateReportCost", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    calculateReportCostMock.mockReturnValue({ totalWords: 4321, totalCredits: 8.65, perPage: [] });
    const report = await generateRndReport("startup", makeSVI(), "idea");
    expect(report.wordCount).toBe(4321);
    expect(report.creditCost).toBe(8.65);
    // calculateReportCost must receive the finalised 10-page array so a
    // later dashboard "you were charged for X words" line matches what
    // was actually generated. Assert both the shape and cardinality.
    expect(calculateReportCostMock).toHaveBeenCalledTimes(1);
    const arg = calculateReportCostMock.mock.calls[0][0] as Array<{ content: string }>;
    expect(arg).toHaveLength(10);
    expect(typeof arg[0].content).toBe("string");
  });

  it("emits progress via onStatus at the start and end of the pipeline", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const seen: string[] = [];
    await generateRndReport("startup", makeSVI(), "idea", undefined, (m) => seen.push(m));
    expect(seen[0]).toMatch(/Starting R&D analysis pipeline/);
    expect(seen[seen.length - 1]).toMatch(/R&D report complete/);
    // Per-page "Generating <title>..." status should have fired 10 times
    // (one per PAGE_DEFS entry) — one for each batch label.
    const generating = seen.filter((s) => s.startsWith("Generating "));
    expect(generating).toHaveLength(10);
  });

  it("emits the Vietnamese starting message when locale='vi'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const seen: string[] = [];
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      (m) => seen.push(m),
      "standard",
      undefined,
      "vi",
    );
    expect(seen[0]).toBe("Bắt đầu phân tích R&D...");
  });

  it("swaps page titles + subtitles to Vietnamese when locale='vi'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const report = await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "standard",
      undefined,
      "vi",
    );
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.title).toBe("Tóm Tắt Điều Hành");
    expect(exec.subtitle).toBe("Đánh giá tổng quan startup");
  });

  it("keeps English page titles when locale='en' (default)", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const report = await generateRndReport("startup", makeSVI(), "idea");
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.title).toBe("Executive Summary");
  });

  it("passes the Vietnamese instruction addendum to callAI when locale='vi'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "standard",
      undefined,
      "vi",
    );
    const call = callAIMock.mock.calls[0][0] as { system: string };
    expect(call.system).toMatch(/tiếng Việt/);
  });

  it("does not add the Vietnamese instruction addendum when locale='en'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport("startup", makeSVI(), "idea");
    const call = callAIMock.mock.calls[0][0] as { system: string };
    expect(call.system).not.toMatch(/tiếng Việt/);
  });

  it("uses the standard tier system prompt when tier is unspecified", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport("startup", makeSVI(), "idea");
    const call = callAIMock.mock.calls[0][0] as { system: string; maxTokens: number };
    // The free / no-tier path uses SYSTEM_STANDARD which carries the
    // "Free users: 200-350 words/page with lockedPreview…" copy.
    expect(call.system).toMatch(/Free users: 200-350/);
    // 2000 tokens/page * 1 page = 2000
    expect(call.maxTokens).toBe(2000);
  });

  it("uses the Deep-Dive system prompt + 4096 tokens/page when tier='deep_dive'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "deep_dive",
    );
    // First non-deep-dive-extended call is a per-page batch — assert it
    // used the deep-dive prompt + 4096 max tokens (per-page * 1 page).
    const firstBatchCall = callAIMock.mock.calls[0][0] as { system: string; maxTokens: number };
    expect(firstBatchCall.system).toMatch(/consultant-grade NARRATIVE ANALYSIS/);
    expect(firstBatchCall.maxTokens).toBe(4096);
  });

  it("uses the standard tier system prompt + 3000 tokens/page when tier='standard'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "standard",
    );
    // Standard tier routes to SYSTEM_DEEP_DIVE (the isPaid branch) with
    // 3000 tokens/page — matches rnd-analysis.ts:417-420.
    const firstCall = callAIMock.mock.calls[0][0] as { system: string; maxTokens: number };
    expect(firstCall.system).toMatch(/consultant-grade NARRATIVE ANALYSIS/);
    expect(firstCall.maxTokens).toBe(3000);
  });

  it("adds the extendedSections block on deep-dive pages that have extended output", async () => {
    callAIMock.mockImplementation(async (opts: { system: string; user: string }) => {
      // The Deep-Dive extended batch uses SYSTEM_DEEP_DIVE_EXTENDED which
      // returns `extendedSections`; every other call returns pages.
      if (opts.system.includes("R&D analyst, management consultant")) {
        return aiOk(
          JSON.stringify({
            extendedSections: [
              {
                pageId: "market",
                sections: [
                  {
                    title: "TAM/SAM/SOM",
                    content: "**Deep-dive market body**",
                    type: "market_data",
                  },
                ],
              },
            ],
          }),
        );
      }
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });

    const report = await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "deep_dive",
    );
    const market = report.pages.find((p) => p.pageId === "market")!;
    expect(market.extendedSections).toHaveLength(1);
    expect(market.extendedSections![0].type).toBe("market_data");
    // A page without a matching pageId in extendedSections must not carry
    // the block at all.
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.extendedSections).toBeUndefined();
  });

  it("does not run the deep-dive extended batch for tier='standard'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "standard",
    );
    // 10 per-page batches, no extended batch → 10 total calls.
    expect(callAIMock).toHaveBeenCalledTimes(10);
  });

  it("runs one extra extended-batch call for tier='deep_dive'", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "deep_dive",
    );
    // 10 per-page batches + 1 extended-batch call.
    expect(callAIMock).toHaveBeenCalledTimes(11);
  });

  it("survives a callAI failure — the pipeline keeps running and returns fallbacks", async () => {
    // The retry loop is 2 attempts — throw on both so the page falls back.
    callAIMock.mockRejectedValue(new Error("provider down"));
    const report = await generateRndReport("startup", makeSVI(), "idea");
    expect(report.pages).toHaveLength(10);
    for (const p of report.pages) {
      expect(p.content).toMatch(/Analysis could not be fully generated/);
    }
    // Each of 10 batches retries twice = 20 total invocations.
    expect(callAIMock).toHaveBeenCalledTimes(20);
  });

  it("recovers on the second retry attempt when the first throws", async () => {
    // Fail every FIRST attempt, succeed on second — the page must land AI
    // content, not the fallback. Track per-call state so the retry logic
    // is exercised on real branches instead of a coincidental short-circuit.
    let call = 0;
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      call++;
      if (call % 2 === 1) throw new Error("first attempt fails");
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });

    const report = await generateRndReport("startup", makeSVI(), "idea");
    for (const p of report.pages) {
      expect(p.content).toMatch(/Narrative essay body/);
    }
  });

  it("passes scrapedData context into the callAI user prompt", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport(
      "startup",
      makeSVI(),
      "url",
      { title: "Acme Ltd", description: "Best product", text: "hero copy", techHints: ["React", "Vercel"] },
    );
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toContain("Acme Ltd");
    expect(call.user).toContain("Best product");
    expect(call.user).toContain("React");
    expect(call.user).toContain("Vercel");
  });

  it("injects industry-specific guidance when the SVI has a known sector", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const svi = makeSVI({ sector: "saas" });
    await generateRndReport("saas startup", svi, "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toMatch(/Industry Vertical: SAAS/);
    expect(call.user).toMatch(/Bessemer Cloud Index/);
    // detectSector must NOT be called when the SVI already carries a sector.
    expect(detectSectorMock).not.toHaveBeenCalled();
  });

  it("falls back to detectSector for industry guidance when SVI lacks a sector", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    detectSectorMock.mockReturnValue("fintech");
    await generateRndReport("startup", makeSVI({ sector: undefined }), "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toMatch(/Industry Vertical: FINTECH/);
    expect(call.user).toMatch(/AFSL, ASIC/);
  });

  it("omits industry guidance when neither SVI sector nor detectSector produces a hit", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    detectSectorMock.mockReturnValue(undefined);
    await generateRndReport("startup", makeSVI({ sector: undefined }), "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).not.toMatch(/Industry Vertical/);
  });

  it("adds the stage-0/1/2 idea-stage guidance block to the AI user prompt", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport("startup", makeSVI({ stage: 1 }), "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toMatch(/IDEA\/EARLY-STAGE startup \(Stage 1\)/);
    // The stage-<=2 branch reinterprets page titles ("Business Model" →
    // "Revenue Model Options"), so that override text must ship too.
    expect(call.user).toMatch(/Revenue Model Options/);
  });

  it("adds the stage-3/4 early-revenue guidance block to the AI user prompt", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport("startup", makeSVI({ stage: 4 }), "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toMatch(/EARLY-REVENUE startup \(Stage 4\)/);
    // Idea-stage override text ("Revenue Model Options") must NOT ship
    // for early-revenue stages.
    expect(call.user).not.toMatch(/Revenue Model Options/);
  });

  it("omits stage-adaptive guidance for stage 5+ startups", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    await generateRndReport("startup", makeSVI({ stage: 6 }), "idea");
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).not.toMatch(/IDEA\/EARLY-STAGE startup/);
    expect(call.user).not.toMatch(/EARLY-REVENUE startup/);
  });

  it("carries CompetitiveResearchData into the context when supplied", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const research: CompetitiveResearchData = {
      competitors: [
        { name: "Rivalcorp", url: "https://rivalcorp.io", description: "SaaS rival", threat: "High" },
      ],
      marketInsights: ["market is growing 20% YoY"],
      competitiveInsights: ["most rivals lack AU compliance"],
      summary: "strong opening",
    };
    await generateRndReport(
      "startup",
      makeSVI(),
      "idea",
      undefined,
      undefined,
      "standard",
      undefined,
      "en",
      research,
    );
    const call = callAIMock.mock.calls[0][0] as { user: string };
    expect(call.user).toContain("Rivalcorp");
    expect(call.user).toContain("https://rivalcorp.io");
    expect(call.user).toContain("market is growing 20% YoY");
    expect(call.user).toContain("most rivals lack AU compliance");
    expect(call.user).toContain("strong opening");
  });

  it("parses AI text wrapped in a ```json code block", async () => {
    const ids = PAGE_DEFS.map((p) => p.id);
    const wrapped = "```json\n" + pageResponse(ids) + "\n```";
    callAIMock.mockResolvedValue(aiOk(wrapped));
    const report = await generateRndReport("startup", makeSVI(), "idea");
    // All pages must carry the AI content — parseAIResponse rescued the
    // code-block-wrapped payload rather than falling back to placeholders.
    for (const p of report.pages) {
      expect(p.content).toMatch(/Narrative essay body/);
    }
  });

  it("parses AI text where JSON is embedded in extra prose", async () => {
    const ids = PAGE_DEFS.map((p) => p.id);
    const embedded = `Here is the answer:\n${pageResponse(ids)}\nEnd of response.`;
    callAIMock.mockResolvedValue(aiOk(embedded));
    const report = await generateRndReport("startup", makeSVI(), "idea");
    for (const p of report.pages) {
      expect(p.content).toMatch(/Narrative essay body/);
    }
  });

  it("carries lockedPreview + lockedSections through when the AI returns them", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {};
      for (const id of ids) {
        overrides[id] = {
          lockedPreview: `preview for ${id}`,
          lockedSections: [`sect1-${id}`, `sect2-${id}`],
        };
      }
      return aiOk(pageResponse(ids, overrides));
    });
    const report = await generateRndReport("startup", makeSVI(), "idea");
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.lockedPreview).toBe("preview for executive");
    expect(exec.lockedSections).toEqual(["sect1-executive", "sect2-executive"]);
  });

  it("coerces a non-array highlights field to an empty array on the page", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {
        executive: { highlights: "not an array" },
      };
      return aiOk(pageResponse(ids, overrides));
    });
    const report = await generateRndReport("startup", makeSVI(), "idea");
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.highlights).toEqual([]);
  });

  it("coerces a non-object dataPoints field to an empty object on the page", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {
        executive: { dataPoints: "not an object" as unknown as Record<string, string> },
      };
      return aiOk(pageResponse(ids, overrides));
    });
    const report = await generateRndReport("startup", makeSVI(), "idea");
    const exec = report.pages.find((p) => p.pageId === "executive")!;
    expect(exec.dataPoints).toEqual({});
  });

  it("stamps a valid ISO createdAt timestamp", async () => {
    callAIMock.mockResolvedValue(aiOk(pageResponse(PAGE_DEFS.map((p) => p.id))));
    const before = Date.now();
    const report = await generateRndReport("startup", makeSVI(), "idea");
    const after = Date.now();
    const t = new Date(report.createdAt).getTime();
    expect(Number.isFinite(t)).toBe(true);
    expect(t).toBeGreaterThanOrEqual(before);
    expect(t).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// generateSectionReport — modular per-section flow
// ---------------------------------------------------------------------------

describe("generateSectionReport", () => {
  it("returns only the requested sections in the requested order", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    const sections: SectionRequest[] = [
      { sectionId: "market", depth: "standard" },
      { sectionId: "financial", depth: "deep" },
    ];
    const pages = await generateSectionReport("startup", makeSVI(), "idea", sections);
    expect(pages).toHaveLength(2);
    expect(pages[0].pageId).toBe("market");
    expect(pages[1].pageId).toBe("financial");
  });

  it("stamps depth + targetWords onto every returned page's dataPoints", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    const sections: SectionRequest[] = [
      { sectionId: "market", depth: "expert" },
    ];
    const [page] = await generateSectionReport("startup", makeSVI(), "idea", sections);
    expect(page.dataPoints?.depth).toBe("expert");
    expect(page.dataPoints?.targetWords).toBe("2000");
    // Original data payload from the AI response must still be preserved.
    expect(page.dataPoints?.generatedFor).toBe("market");
  });

  it("silently drops sections whose sectionId isn't in PAGE_DEFS", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    const sections: SectionRequest[] = [
      { sectionId: "market", depth: "standard" },
      { sectionId: "not-a-real-page", depth: "standard" },
    ];
    const pages = await generateSectionReport("startup", makeSVI(), "idea", sections);
    expect(pages).toHaveLength(1);
    expect(pages[0].pageId).toBe("market");
  });

  it("uses the DEEP-tier system prompt + 8192 max tokens for depth='deep'", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "deep" },
    ]);
    const call = callAIMock.mock.calls[0][0] as { system: string; maxTokens: number };
    expect(call.system).toMatch(/consultant-grade NARRATIVE ANALYSIS/);
    expect(call.maxTokens).toBe(8192);
  });

  it("uses the STANDARD-tier system prompt + 1024 max tokens for depth='scan'", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "scan" },
    ]);
    const call = callAIMock.mock.calls[0][0] as { system: string; maxTokens: number };
    expect(call.system).toMatch(/Free users: 200-350/);
    expect(call.maxTokens).toBe(1024);
  });

  it("batches sections that share a depth into a single callAI request", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "standard" },
      { sectionId: "financial", depth: "standard" },
      { sectionId: "risk", depth: "deep" },
    ]);
    // 2 depths (standard + deep) → 2 calls, not 3.
    expect(callAIMock).toHaveBeenCalledTimes(2);
  });

  it("clamps out-of-range scores in section-report pages as well", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      const overrides: Record<string, Record<string, unknown>> = {
        market: { score: -20 },
      };
      return aiOk(pageResponse(ids, overrides));
    });
    const [page] = await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "standard" },
    ]);
    expect(page.score).toBe(0);
  });

  it("falls back to the placeholder body when the AI response has no matching page", async () => {
    callAIMock.mockResolvedValue(
      aiOk(JSON.stringify({ pages: [{ pageId: "wrong", content: "junk" }] })),
    );
    const [page] = await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "standard" },
    ]);
    expect(page.content).toMatch(/Analysis could not be fully generated/);
  });

  it("emits an onStatus with plural 'sections' when >1 section is generated", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    const seen: string[] = [];
    await generateSectionReport(
      "startup",
      makeSVI(),
      "idea",
      [
        { sectionId: "market", depth: "standard" },
        { sectionId: "financial", depth: "standard" },
      ],
      undefined,
      (m) => seen.push(m),
    );
    expect(seen[seen.length - 1]).toBe("2 sections generated.");
  });

  it("emits an onStatus with singular 'section' when exactly 1 section is generated", async () => {
    callAIMock.mockImplementation(async (opts: { user: string }) => {
      const match = opts.user.match(/pageId: "(\w+)"/g) ?? [];
      const ids = match.map((m) => m.replace(/pageId: "|"/g, ""));
      return aiOk(pageResponse(ids));
    });
    const seen: string[] = [];
    await generateSectionReport(
      "startup",
      makeSVI(),
      "idea",
      [{ sectionId: "market", depth: "standard" }],
      undefined,
      (m) => seen.push(m),
    );
    expect(seen[seen.length - 1]).toBe("1 section generated.");
  });

  it("still returns fallback pages when the callAI batch throws", async () => {
    callAIMock.mockRejectedValue(new Error("provider offline"));
    const pages = await generateSectionReport("startup", makeSVI(), "idea", [
      { sectionId: "market", depth: "standard" },
      { sectionId: "financial", depth: "standard" },
    ]);
    expect(pages).toHaveLength(2);
    for (const p of pages) {
      expect(p.content).toMatch(/Analysis could not be fully generated/);
    }
  });
});
