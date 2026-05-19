import { describe, it, expect } from "vitest";
import { computeScore, type ScoreInput, SCORE_VERSION } from "./score";

// ---------------------------------------------------------------------------
// Helper: build a baseline ScoreInput with overrides
// ---------------------------------------------------------------------------
function makeInput(overrides: Partial<ScoreInput> = {}): ScoreInput {
  return {
    companyName: "Test Co",
    abn: "12345678901",
    sector: "saas",
    stage: "seed",
    yearsTrading: 1,
    monthlyRevenue: 0,
    monthlyBurn: 5000,
    runwayMonths: 12,
    founders: 2,
    esopAllocated: 0,
    hasShareholdersAgreement: false,
    hasBoardMeetings: false,
    hasFinancialAudit: false,
    ...overrides,
  };
}

// ===========================================================================
// computeScore — basic structure
// ===========================================================================
describe("computeScore", () => {
  it("returns expected structure", () => {
    const result = computeScore(makeInput());
    expect(result.version).toBe(SCORE_VERSION);
    expect(typeof result.total).toBe("number");
    expect(typeof result.confidence).toBe("number");
    expect(result.subs).toHaveLength(5);
    expect(result.missingInputs).toBeInstanceOf(Array);
    expect(result.actionPlan).toBeInstanceOf(Array);
    expect(result.benchmark).toBeDefined();
  });

  it("total score is 0-100", () => {
    const result = computeScore(makeInput());
    expect(result.total).toBeGreaterThanOrEqual(0);
    expect(result.total).toBeLessThanOrEqual(100);
  });

  it("confidence is 35-96", () => {
    const result = computeScore(makeInput());
    expect(result.confidence).toBeGreaterThanOrEqual(35);
    expect(result.confidence).toBeLessThanOrEqual(96);
  });

  it("has 5 sub-scores", () => {
    const result = computeScore(makeInput());
    const labels = result.subs.map(s => s.label);
    expect(labels).toEqual([
      "Financials",
      "Cap Table Hygiene",
      "Governance",
      "Founder Background",
      "Documentation",
    ]);
  });
});

// ===========================================================================
// Revenue impact
// ===========================================================================
describe("revenue impact", () => {
  it("zero revenue scores lower than $10k/mo", () => {
    const noRev = computeScore(makeInput({ monthlyRevenue: 0 }));
    const hasRev = computeScore(makeInput({ monthlyRevenue: 10000 }));
    expect(hasRev.total).toBeGreaterThan(noRev.total);
  });

  it("higher revenue scores higher", () => {
    const low = computeScore(makeInput({ monthlyRevenue: 10000 }));
    const mid = computeScore(makeInput({ monthlyRevenue: 80000 }));
    const high = computeScore(makeInput({ monthlyRevenue: 200000 }));
    expect(mid.total).toBeGreaterThan(low.total);
    expect(high.total).toBeGreaterThan(mid.total);
  });
});

// ===========================================================================
// Runway & burn
// ===========================================================================
describe("runway and burn", () => {
  it("longer runway scores higher", () => {
    const short = computeScore(makeInput({ runwayMonths: 3, monthlyRevenue: 10000 }));
    const long = computeScore(makeInput({ runwayMonths: 18, monthlyRevenue: 10000 }));
    expect(long.total).toBeGreaterThan(short.total);
  });

  it("high burn multiple penalizes", () => {
    const lowBurn = computeScore(makeInput({ monthlyRevenue: 10000, monthlyBurn: 10000 }));
    const highBurn = computeScore(makeInput({ monthlyRevenue: 10000, monthlyBurn: 40000 }));
    expect(lowBurn.total).toBeGreaterThan(highBurn.total);
  });
});

// ===========================================================================
// Cap table & governance
// ===========================================================================
describe("cap table and governance", () => {
  it("SHA improves score", () => {
    const noSHA = computeScore(makeInput());
    const hasSHA = computeScore(makeInput({ hasShareholdersAgreement: true }));
    expect(hasSHA.total).toBeGreaterThan(noSHA.total);
  });

  it("ESOP allocation improves score", () => {
    const noEsop = computeScore(makeInput());
    const hasEsop = computeScore(makeInput({ esopAllocated: 10 }));
    expect(hasEsop.total).toBeGreaterThan(noEsop.total);
  });

  it("board meetings improve governance", () => {
    const noBoard = computeScore(makeInput());
    const hasBoard = computeScore(makeInput({ hasBoardMeetings: true }));
    expect(hasBoard.total).toBeGreaterThan(noBoard.total);
  });

  it("audit improves score", () => {
    const noAudit = computeScore(makeInput());
    const hasAudit = computeScore(makeInput({ hasFinancialAudit: true }));
    expect(hasAudit.total).toBeGreaterThan(noAudit.total);
  });
});

// ===========================================================================
// Sector heat
// ===========================================================================
describe("sector heat", () => {
  it("SaaS sector scores higher than marketplace", () => {
    const saas = computeScore(makeInput({ sector: "saas" }));
    const marketplace = computeScore(makeInput({ sector: "marketplace" }));
    expect(saas.total).toBeGreaterThanOrEqual(marketplace.total);
  });
});

// ===========================================================================
// Missing inputs & confidence
// ===========================================================================
describe("missing inputs", () => {
  it("identifies missing ABN", () => {
    const result = computeScore(makeInput({ abn: "" }));
    expect(result.missingInputs).toContain("ABN not provided");
  });

  it("full inputs have fewer missing items", () => {
    const full = computeScore(makeInput({
      abn: "12345678901",
      stage: "seed",
      arrBand: "0-250k",
      targetRaiseAud: 500000,
      valuationCapAud: 5000000,
      hasShareholdersAgreement: true,
      hasBoardMeetings: true,
      hasFinancialAudit: true,
    }));
    const partial = computeScore(makeInput({ abn: "" }));
    expect(full.missingInputs.length).toBeLessThan(partial.missingInputs.length);
    expect(full.confidence).toBeGreaterThan(partial.confidence);
  });
});

// ===========================================================================
// Benchmark
// ===========================================================================
describe("benchmark", () => {
  it("includes stage and sector label", () => {
    const result = computeScore(makeInput({ stage: "seed", sector: "saas" }));
    expect(result.benchmark.label).toContain("seed");
    expect(result.benchmark.label).toContain("SAAS");
  });

  it("median score varies by stage", () => {
    const preSeed = computeScore(makeInput({ stage: "pre-seed" }));
    const seriesA = computeScore(makeInput({ stage: "series-a" }));
    expect(seriesA.benchmark.medianScore).toBeGreaterThan(preSeed.benchmark.medianScore);
  });
});

// ===========================================================================
// Action plan
// ===========================================================================
describe("action plan", () => {
  it("generates actions", () => {
    const result = computeScore(makeInput());
    expect(result.actionPlan.length).toBeGreaterThan(0);
    expect(result.actionPlan.length).toBeLessThanOrEqual(5);
  });

  it("suggests SHA when missing", () => {
    const result = computeScore(makeInput({ hasShareholdersAgreement: false }));
    const shaAction = result.actionPlan.find(a => a.title.toLowerCase().includes("shareholder"));
    expect(shaAction).toBeDefined();
  });

  it("suggests runway bridge when short runway", () => {
    const result = computeScore(makeInput({ runwayMonths: 3 }));
    const runwayAction = result.actionPlan.find(a => a.title.toLowerCase().includes("runway"));
    expect(runwayAction).toBeDefined();
  });
});

// ===========================================================================
// Healthy seed stage startup benchmark
// ===========================================================================
describe("realistic scenario", () => {
  it("healthy AU seed SaaS scores in the high range", () => {
    const result = computeScore({
      companyName: "FinHealth AU",
      abn: "51234567890",
      sector: "saas",
      stage: "seed",
      yearsTrading: 2,
      monthlyRevenue: 30000,
      monthlyBurn: 25000,
      runwayMonths: 14,
      arrBand: "250k-1m",
      targetRaiseAud: 2000000,
      valuationCapAud: 10000000,
      founders: 2,
      esopAllocated: 10,
      hasShareholdersAgreement: true,
      hasBoardMeetings: true,
      hasFinancialAudit: false,
    });
    // Healthy seed should score 65+
    expect(result.total).toBeGreaterThanOrEqual(65);
    expect(result.confidence).toBeGreaterThanOrEqual(60);
  });

  it("fragile pre-seed scores lower", () => {
    const result = computeScore({
      companyName: "Idea Co",
      abn: "",
      sector: "other",
      stage: "pre-seed",
      yearsTrading: 0,
      monthlyRevenue: 0,
      monthlyBurn: 2000,
      runwayMonths: 6,
      founders: 1,
      esopAllocated: 0,
      hasShareholdersAgreement: false,
      hasBoardMeetings: false,
      hasFinancialAudit: false,
    });
    // Fragile pre-seed should score below 50
    expect(result.total).toBeLessThan(50);
  });
});
