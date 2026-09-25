import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

import { callAI } from "@/lib/ai-client";
import { generateFinancialProjection } from "./cfo-financial-projection";

const mockCallAI = vi.mocked(callAI);

describe("generateFinancialProjection", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  it("produces exactly 12 quarters (Y1Q1..Y3Q4) in order", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "assumption text",
        commentary: "commentary text",
        investorTakeaway: "takeaway text",
      }),
      provider: "groq",
      model: "test",
    });
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 10_000,
      monthlyBurnAud: 50_000,
      cashAud: 500_000,
    });
    expect(p.quarters).toHaveLength(12);
    expect(p.quarters[0].quarter).toBe("Y1Q1");
    expect(p.quarters[11].quarter).toBe("Y3Q4");
  });

  it("computes positive Year-1 revenue when starting MRR > 0", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "a",
        commentary: "c",
        investorTakeaway: "t",
      }),
      provider: "groq",
      model: "test",
    });
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 10_000,
    });
    expect(p.totals.revenueY1).toBeGreaterThan(0);
    expect(p.totals.revenueY3).toBeGreaterThan(p.totals.revenueY1);
  });

  it("runway equals floor(cash / burn) at t0 for pre-revenue startups", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "a",
        commentary: "c",
        investorTakeaway: "t",
      }),
      provider: "groq",
      model: "test",
    });
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "pre-seed",
      cashAud: 300_000,
      monthlyBurnAud: 30_000,
    });
    expect(p.totals.runwayMonths).toBe(10);
  });

  it("extends runway by gross profit from starting MRR (net burn, not gross)", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "a",
        commentary: "c",
        investorTakeaway: "t",
      }),
      provider: "groq",
      model: "test",
    });
    // MRR 20k * gm 0.60 = 12k gross profit/mo → net burn 50k - 12k = 38k.
    // Runway = floor(500k / 38k) = 13 (vs 10 on gross burn).
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 20_000,
      grossMarginPct: 60,
      cashAud: 500_000,
      monthlyBurnAud: 50_000,
    });
    expect(p.totals.runwayMonths).toBe(13);
  });

  it("caps runway at 999 when starting MRR alone covers opex (net burn = 0)", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "a",
        commentary: "c",
        investorTakeaway: "t",
      }),
      provider: "groq",
      model: "test",
    });
    // MRR 100k * gm 0.80 = 80k gross profit/mo, opex 40k → net burn = 0.
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 100_000,
      grossMarginPct: 80,
      cashAud: 500_000,
      monthlyBurnAud: 40_000,
    });
    expect(p.totals.runwayMonths).toBe(999);
  });

  it("falls back to a deterministic narrative when the LLM throws", async () => {
    mockCallAI.mockRejectedValue(new Error("providers down"));
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 5_000,
    });
    expect(p.narrative.assumptions.length).toBeGreaterThan(0);
    expect(p.narrative.commentary.includes("Acme")).toBe(true);
    expect(p.narrative.investorTakeaway.length).toBeGreaterThan(0);
  });

  it("falls back when LLM returns unparseable JSON", async () => {
    mockCallAI.mockResolvedValue({
      text: "sorry I can't help with that",
      provider: "groq",
      model: "test",
    });
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "seed",
      mrrAud: 5_000,
    });
    // Fallback contains startup name in commentary.
    expect(p.narrative.commentary).toContain("Acme");
  });

  it("stamps AUD currency and 4 canonical benchmark sources", async () => {
    mockCallAI.mockResolvedValue({
      text: JSON.stringify({
        assumptions: "a",
        commentary: "c",
        investorTakeaway: "t",
      }),
      provider: "groq",
      model: "test",
    });
    const p = await generateFinancialProjection({
      startupName: "Acme",
      stage: "series-a",
    });
    expect(p.currency).toBe("AUD");
    expect(p.sources.length).toBeGreaterThanOrEqual(4);
  });
});

describe("CFO narrative reference integrity", () => {
  const input = { startupName: "Acme", stage: "seed" as const, mrrAud: 10_000, cashAud: 500_000, monthlyBurnAud: 50_000, monthlyGrowthPct: 2.5, grossMarginPct: 61.25 };
  const valid = { assumptions: ["growth", "opening"], commentary: ["revenue", "net"], investorTakeaway: ["assumptions"] };
  const response = (value: unknown) => ({ text: JSON.stringify(value), provider: "deepinfra" as const, model: "test" });
  beforeEach(() => mockCallAI.mockReset());

  it("renders selected references with authoritative amounts, percentages and year labels", async () => {
    mockCallAI.mockResolvedValue(response(valid));
    const p = await generateFinancialProjection(input);
    expect(p.narrative.assumptions).toContain("2.5% monthly revenue growth and 61.25% gross margin");
    expect(p.narrative.assumptions).toContain("A$10,000");
    expect(p.narrative.assumptions).not.toContain("opex");
    for (const year of [1, 2, 3] as const) {
      expect(p.narrative.commentary).toContain(`A$${p.totals[`revenueY${year}`].toLocaleString("en-AU")} in Year ${year}`);
      expect(p.narrative.commentary).toContain(`A$${p.totals[`netY${year}`].toLocaleString("en-AU")} in Year ${year}`);
    }
    expect(mockCallAI).toHaveBeenCalledWith(expect.objectContaining({ providerPolicy: "deepinfra-only", maxTokens: 1500 }));
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it.each([
    { assumptions: "Growth is 99%", commentary: "Revenue is A$999 million in Year 1", investorTakeaway: "Raise now" },
    { assumptions: "Growth is ninety percent", commentary: "Revenue is a billion dollars", investorTakeaway: "Safe" },
    { ...valid, commentary: ["revenue", "Year 3 revenue is Year 1 revenue"] },
    { ...valid, assumptions: ["growth:99%"] },
    { ...valid, commentary: ["growth"] },
    { ...valid, commentary: ["__proto__"] },
    { ...valid, commentary: ["revenue", "revenue"] },
    { ...valid, commentary: [] },
    { ...valid, commentary: [{ id: "revenue", amount: 999 }] },
    { assumptions: ["growth"], commentary: ["revenue"] },
    { ...valid, claim: "Year 2 revenue is A$999" },
    null,
  ])("rejects unsupported, misplaced or incomplete narrative payload %#", async (payload) => {
    mockCallAI.mockRejectedValueOnce(new Error("offline"));
    const expected = await generateFinancialProjection(input);
    mockCallAI.mockResolvedValueOnce(response(payload));
    const actual = await generateFinancialProjection(input);
    expect(actual.narrative).toEqual(expected.narrative);
    expect(actual.quarters).toEqual(expected.quarters);
    expect(actual.totals).toEqual(expected.totals);
  });

  it("does not present the runway sentinel as 999 months when cash flow covers opex", async () => {
    mockCallAI.mockResolvedValue(response({ ...valid, commentary: ["runway"] }));
    const p = await generateFinancialProjection({ ...input, mrrAud: 100_000, grossMarginPct: 80, monthlyBurnAud: 40_000 });
    expect(p.totals.runwayMonths).toBe(999);
    expect(p.narrative.commentary).toContain("no finite runway is calculated");
    expect(p.narrative.commentary).not.toContain("999");
  });

  it("distinguishes a capped finite runway from nonpositive net burn", async () => {
    mockCallAI.mockResolvedValue(response({ ...valid, commentary: ["runway"] }));
    const p = await generateFinancialProjection({ ...input, mrrAud: 0, monthlyBurnAud: 1, cashAud: 2_000 });
    expect(p.totals.runwayMonths).toBe(999);
    expect(p.narrative.commentary).toContain("at least 999 months");
    expect(p.narrative.commentary).not.toContain("no finite runway");
  });

  it("does not claim growth when the supported schedule declines", async () => {
    mockCallAI.mockResolvedValue(response({ ...valid, commentary: ["revenue"] }));
    const p = await generateFinancialProjection({ ...input, monthlyGrowthPct: -5 });
    expect(p.totals.revenueY3).toBeLessThan(p.totals.revenueY1);
    expect(p.narrative.commentary).not.toContain("growing");
  });
});
