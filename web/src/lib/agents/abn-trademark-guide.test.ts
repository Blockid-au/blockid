import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

vi.mock("@/lib/compliance/abn", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/compliance/abn")>(
      "@/lib/compliance/abn",
    );
  return {
    ...actual,
    lookupAbnLive: vi.fn(),
  };
});

import { callAI } from "@/lib/ai-client";
import { lookupAbnLive } from "@/lib/compliance/abn";
import { generateAbnTrademarkGuide } from "./abn-trademark-guide";

const mockCallAI = vi.mocked(callAI);
const mockLookupAbnLive = vi.mocked(lookupAbnLive);

describe("generateAbnTrademarkGuide", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
    mockLookupAbnLive.mockReset();
  });

  it("returns a full guide with all 5 ABN steps + timeline + sources on happy path", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        strategicRecommendations: [
          "File TM Headstart first.",
          "Bundle Class 9 + Class 42.",
        ],
        commonPitfalls: [
          "Descriptive marks refused under s41.",
          "Missing phonetic prior art search.",
        ],
      }),
      provider: "groq",
      model: "test",
    });

    const g = await generateAbnTrademarkGuide({
      startupName: "Acme SaaS",
      proposedTradingName: "Acme",
      sector: "SaaS",
    });

    expect(g.startupName).toBe("Acme SaaS");
    expect(g.proposedTradingName).toBe("Acme");
    expect(g.abnSteps.length).toBe(5);
    expect(g.businessNameSteps.length).toBe(3);
    expect(g.timeline.length).toBe(2);
    expect(g.sources.length).toBeGreaterThanOrEqual(4);
    expect(g.trademarkSearchUrl).toContain("search.ipaustralia.gov.au");
    expect(g.strategicRecommendations).toEqual([
      "File TM Headstart first.",
      "Bundle Class 9 + Class 42.",
    ]);
    expect(g.commonPitfalls[0]).toContain("Descriptive");
    expect(g.abnLookup).toBeNull();
  });

  it("recommends Class 9 + Class 42 for SaaS by default", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      sector: "SaaS",
    });
    const rec = g.niceClasses.filter((c) => c.priority === "recommended");
    const nums = rec.map((r) => r.classNumber).sort((a, b) => a - b);
    expect(nums).toEqual([9, 42]);
  });

  it("bumps Class 35 to recommended for marketplace sectors", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      sector: "Marketplace",
    });
    const c35 = g.niceClasses.find((c) => c.classNumber === 35);
    expect(c35?.priority).toBe("recommended");
  });

  it("falls back to deterministic defaults when the LLM throws", async () => {
    mockCallAI.mockRejectedValue(new Error("providers down"));
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      sector: "SaaS",
    });
    expect(g.strategicRecommendations.length).toBeGreaterThan(0);
    expect(g.commonPitfalls.length).toBeGreaterThan(0);
    // Deterministic default contains this canonical phrasing.
    expect(g.commonPitfalls.some((p) => p.includes("generic"))).toBe(true);
  });

  it("falls back when LLM returns unparseable JSON", async () => {
    mockCallAI.mockResolvedValue({
      text: "sorry can't help",
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      sector: "SaaS",
    });
    expect(g.strategicRecommendations.length).toBeGreaterThan(0);
    expect(g.commonPitfalls.length).toBeGreaterThan(0);
  });

  it("skips ABR lookup when ABN candidate is empty", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      abnCandidate: "",
    });
    expect(g.abnLookup).toBeNull();
    expect(mockLookupAbnLive).not.toHaveBeenCalled();
  });

  it("flags invalid-checksum ABN without calling ABR", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      abnCandidate: "12345678901", // fails modulus-89
    });
    expect(g.abnLookup?.checked).toBe(true);
    expect(g.abnLookup?.valid_checksum).toBe(false);
    expect(g.abnLookup?.live).toBeNull();
    expect(mockLookupAbnLive).not.toHaveBeenCalled();
  });

  it("surfaces live ABR result when checksum-valid ABN is provided", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    mockLookupAbnLive.mockResolvedValue({
      live: {
        entity_name: "ACME PTY LTD",
        entity_type_name: "Australian Private Company",
        abn_status: "Active",
        abn_status_effective_from: "2020-01-01",
        gst_registered: true,
        gst_effective_from: "2020-01-01",
        business_state: "NSW",
        business_postcode: "2000",
        acn: "123456789",
      },
      live_error: null,
    });

    // Use a checksum-valid ABN (11111111111 → not valid; use a known-good one).
    // 51 824 753 556 is the ABR's own published example — passes modulus-89.
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      abnCandidate: "51 824 753 556",
    });
    expect(g.abnLookup?.valid_checksum).toBe(true);
    expect(g.abnLookup?.live?.entity_name).toBe("ACME PTY LTD");
    expect(mockLookupAbnLive).toHaveBeenCalledTimes(1);
  });

  it("gracefully handles ABR lookup throwing", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    mockLookupAbnLive.mockRejectedValue(new Error("ABR down"));
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      abnCandidate: "51 824 753 556",
    });
    expect(g.abnLookup?.valid_checksum).toBe(true);
    expect(g.abnLookup?.live).toBeNull();
    expect(g.abnLookup?.live_error).toContain("ABR down");
  });

  it("URL-encodes the trademark search prefill with the proposed name", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({ strategicRecommendations: [], commonPitfalls: [] }),
      provider: "groq",
      model: "test",
    });
    const g = await generateAbnTrademarkGuide({
      startupName: "Acme",
      proposedTradingName: "Acme Loop",
    });
    expect(g.trademarkSearchUrl).toMatch(/[?&]s=Acme(\+|%20)Loop/);
  });
});
