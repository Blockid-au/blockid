import { describe, expect, it } from "vitest";
import { evaluateAntlerSignals } from "./antler-signals";
import type { SVIAnalysis, SVIExtractedSignals } from "@/lib/svi-analysis";

function mkSignals(over: Partial<SVIExtractedSignals> & { teamSize?: number } = {}): SVIExtractedSignals {
  return {
    founderExperience: "first_time",
    hasCoFounder: false,
    hasAdvisors: false,
    teamSize: 1,
    problemClarity: "vague",
    marketSize: "small",
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasRevenue: false,
    hasCustomers: false,
    hasAnalytics: false,
    revenueBand: "none",
    hasCapTable: false,
    hasShareholdersAgreement: false,
    hasVesting: false,
    hasPitchDeck: false,
    hasFinancialModel: false,
    hasDataRoom: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    evidenceLevel: "self_declared",
    sector: "default",
    ...over,
  } as unknown as SVIExtractedSignals;
}

function mkAnalysis(over: Partial<SVIAnalysis> = {}): SVIAnalysis {
  return {
    totalSVI: 100,
    stage: 0,
    stageLabel: "Concept",
    subs: [],
    ...over,
  } as unknown as SVIAnalysis;
}

describe("evaluateAntlerSignals", () => {
  it("returns 5 signals with correct keys + label", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis(),
      signals: mkSignals(),
      rawText: "An idea.",
    });
    expect(result.signals.map((s) => s.key)).toEqual([
      "team", "progress", "invention", "vision", "product_10x",
    ]);
    expect(result.signals.every((s) => typeof s.score === "number")).toBe(true);
  });

  it("idea-stage solo founder gets low progression score", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis({ stage: 0 }),
      signals: mkSignals(),
      rawText: "I want to build a marketplace.",
    });
    expect(result.progressionScore).toBeLessThan(50);
    expect(result.weakestLink).not.toBeNull();
  });

  it("recognises serial founder + co-founder + revenue → strong Team and Progress", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis({ stage: 3 }),
      signals: mkSignals({
        founderExperience: "serial",
        hasCoFounder: true,
        hasAdvisors: true,
        teamSize: 5,
        hasRevenue: true,
        hasCustomers: true,
        hasAnalytics: true,
        hasSourceCode: true,
        hasProduct: true,
      }),
      rawText: "Ex-Stripe founder. Co-founding team. Built shipping product. Revenue from 12 customers. Partnership with major retailer.",
    });
    expect(result.signals.find((s) => s.key === "team")?.score).toBeGreaterThanOrEqual(60);
    expect(result.signals.find((s) => s.key === "progress")?.score).toBeGreaterThanOrEqual(70);
    expect(result.progressionScore).toBeGreaterThanOrEqual(50);
  });

  it("detects 10x speed claim explicitly", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis(),
      signals: mkSignals({ hasDemo: true, hasProduct: true }),
      rawText: "Our platform is 10x faster than incumbents — sub-second response.",
    });
    const product = result.signals.find((s) => s.key === "product_10x");
    expect(product?.score).toBeGreaterThan(35);
    expect(product?.whatWeSee.some((w) => /speed/i.test(w))).toBe(true);
  });

  it("detects invention signals (LLM + patent)", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis(),
      signals: mkSignals({ hasSourceCode: true }),
      rawText: "Novel transformer architecture, provisional patent filed, paper on arXiv.",
    });
    const invention = result.signals.find((s) => s.key === "invention");
    expect(invention?.score).toBeGreaterThanOrEqual(60);
  });

  it("produces a non-empty oneLine summary", () => {
    const result = evaluateAntlerSignals({
      analysis: mkAnalysis(),
      signals: mkSignals(),
      rawText: "x",
    });
    expect(result.oneLine.length).toBeGreaterThan(20);
    expect(result.sourceNote).toMatch(/Antler/);
  });
});
