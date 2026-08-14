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

  it("runway equals floor(cash / burn) at t0", async () => {
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
