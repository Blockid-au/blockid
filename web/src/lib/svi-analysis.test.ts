import { describe, it, expect } from "vitest";
import {
  extractSignals,
  computeSVI,
  detectStage,
  SVI_STAGE_LABELS,
  SVI_BENCHMARKS,
  EVIDENCE_CONFIDENCE,
  type SVIExtractedSignals,
} from "./svi-analysis";

// ---------------------------------------------------------------------------
// Helper: build a minimal signals object with overrides
// ---------------------------------------------------------------------------
function makeSignals(overrides: Partial<SVIExtractedSignals> = {}): SVIExtractedSignals {
  return {
    hasCoFounder: false,
    founderExperience: "first-time",
    founderSectorFit: false,
    hasAdvisors: false,
    marketSize: "unknown",
    problemClarity: "vague",
    hasCustomerInterviews: false,
    isAIWrapper: false,
    hasMoat: false,
    hasNetworkEffect: false,
    hasDataAdvantage: false,
    hasSwitchingCosts: false,
    hasProduct: false,
    hasDemo: false,
    hasSourceCode: false,
    hasWebsite: false,
    hasApp: false,
    hasRevenue: false,
    revenueBand: "pre-revenue",
    hasCustomers: false,
    hasSocialProof: false,
    hasAnalytics: false,
    hasCapTable: false,
    hasVesting: false,
    hasShareholdersAgreement: false,
    hasBoardCadence: false,
    hasFinancialAudit: false,
    esopAllocated: false,
    hasPitchDeck: false,
    hasFinancialModel: false,
    hasDataRoom: false,
    targetRaiseMentioned: false,
    raiseMentioned: false,
    hasABN: false,
    hasIPProtection: false,
    hasContracts: false,
    hasLegalDocs: false,
    evidenceLevel: "self_declared",
    ...overrides,
  };
}

// ===========================================================================
// extractSignals
// ===========================================================================
describe("extractSignals", () => {
  it("returns all-false defaults for empty input", () => {
    const signals = extractSignals({ rawText: "" });
    expect(signals.hasCoFounder).toBe(false);
    expect(signals.hasRevenue).toBe(false);
    expect(signals.evidenceLevel).toBe("self_declared");
    expect(signals.founderExperience).toBe("first-time");
    expect(signals.marketSize).toBe("unknown");
    expect(signals.problemClarity).toBe("vague");
  });

  it("detects co-founder", () => {
    const s = extractSignals({ rawText: "We have a co-founder with engineering background" });
    expect(s.hasCoFounder).toBe(true);
  });

  it("detects serial founder", () => {
    const s = extractSignals({ rawText: "I'm a serial founder who exited my last company" });
    expect(s.founderExperience).toBe("serial");
  });

  it("detects experienced founder", () => {
    const s = extractSignals({ rawText: "Senior engineer with a decade of experience" });
    expect(s.founderExperience).toBe("experienced");
  });

  it("detects large market", () => {
    const s = extractSignals({ rawText: "The market is worth $10 billion globally" });
    expect(s.marketSize).toBe("large");
  });

  it("detects medium market", () => {
    const s = extractSignals({ rawText: "$500m addressable market in Australia" });
    expect(s.marketSize).toBe("medium");
  });

  it("detects validated problem", () => {
    const s = extractSignals({ rawText: "Validated through 20 customer interviews and paying customers" });
    expect(s.problemClarity).toBe("validated");
  });

  it("detects clear problem", () => {
    const s = extractSignals({ rawText: "We solve a key pain point for small businesses" });
    expect(s.problemClarity).toBe("clear");
  });

  it("detects AI wrapper risk", () => {
    const s = extractSignals({ rawText: "We built a chatgpt wrapper for customer service" });
    expect(s.isAIWrapper).toBe(true);
  });

  it("does not flag AI wrapper when fine-tuned model", () => {
    const s = extractSignals({ rawText: "We use OpenAI with our custom model fine-tuned on proprietary data" });
    expect(s.isAIWrapper).toBe(false);
  });

  it("detects revenue bands", () => {
    const preRev = extractSignals({ rawText: "We have a concept" });
    expect(preRev.revenueBand).toBe("pre-revenue");

    const early = extractSignals({ rawText: "We have monthly revenue from paying users" });
    expect(early.revenueBand).toBe("early");

    const growing = extractSignals({ rawText: "Our ARR is $200k and growing fast" });
    expect(growing.revenueBand).toBe("growing");

    const scaling = extractSignals({ rawText: "We hit $1m ARR this quarter, scaling rapidly" });
    expect(scaling.revenueBand).toBe("scaling");
  });

  it("detects evidence level from file name", () => {
    const s = extractSignals({ rawText: "Our pitch deck", fileName: "pitch-deck.pdf" });
    expect(s.evidenceLevel).toBe("document_uploaded");
  });

  it("upgrades evidence level for connected sources", () => {
    const s = extractSignals({ rawText: "Connected stripe and github for verification" });
    expect(s.evidenceLevel).toBe("connected_source");
  });

  it("detects transaction data evidence", () => {
    const s = extractSignals({ rawText: "We have signed customer contract and revenue proof" });
    expect(s.evidenceLevel).toBe("transaction_data");
  });

  it("detects cap table signals", () => {
    const s = extractSignals({ rawText: "Our cap table shows 60/40 equity split with 4 year vesting and 12 month cliff. ESOP pool at 10%." });
    expect(s.hasCapTable).toBe(true);
    expect(s.hasVesting).toBe(true);
    expect(s.esopAllocated).toBe(true);
  });

  it("detects product signals", () => {
    const s = extractSignals({ rawText: "We have a live demo on our website with a github repository" });
    expect(s.hasDemo).toBe(true);
    expect(s.hasWebsite).toBe(true);
    expect(s.hasSourceCode).toBe(true);
  });
});

// ===========================================================================
// detectStage
// ===========================================================================
describe("detectStage", () => {
  it("returns 0 for bare concept", () => {
    expect(detectStage(makeSignals())).toBe(0);
  });

  it("returns 1 for validated idea", () => {
    expect(detectStage(makeSignals({ problemClarity: "validated" }))).toBe(1);
  });

  it("returns 2 for MVP", () => {
    expect(detectStage(makeSignals({ hasProduct: true }))).toBe(2);
  });

  it("returns 3 for early traction", () => {
    expect(detectStage(makeSignals({ hasCustomers: true }))).toBe(3);
  });

  it("returns 4 for revenue stage", () => {
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "early" }))).toBe(4);
  });

  it("returns 5 for growth stage", () => {
    expect(detectStage(makeSignals({
      revenueBand: "growing",
      hasCoFounder: true,
      hasRevenue: true,
    }))).toBe(5);
  });

  it("returns 6 for scale stage", () => {
    expect(detectStage(makeSignals({
      revenueBand: "scaling",
      hasCapTable: true,
      hasDataRoom: true,
      hasRevenue: true,
    }))).toBe(6);
  });

  it("returns 7 for corporation", () => {
    expect(detectStage(makeSignals({
      hasFinancialAudit: true,
      hasABN: true,
      hasBoardCadence: true,
    }))).toBe(7);
  });
});

// ===========================================================================
// computeSVI
// ===========================================================================
describe("computeSVI", () => {
  it("returns baseline ~100 for empty concept (minus penalties)", () => {
    const result = computeSVI(makeSignals());
    // Empty concept gets many risk penalties, should be below 100
    expect(result.totalSVI).toBeLessThan(100);
    expect(result.totalSVI).toBeGreaterThanOrEqual(30); // min clamp
    expect(result.baselineSVI).toBe(100);
    expect(result.version).toBe("2.0.0");
    expect(result.stage).toBe(0);
    expect(result.stageLabel).toBe("Concept");
  });

  it("scores higher for strong startup", () => {
    const strong = computeSVI(makeSignals({
      founderExperience: "serial",
      hasCoFounder: true,
      founderSectorFit: true,
      hasAdvisors: true,
      marketSize: "large",
      problemClarity: "validated",
      hasCustomerInterviews: true,
      hasProduct: true,
      hasDemo: true,
      hasSourceCode: true,
      hasWebsite: true,
      hasRevenue: true,
      revenueBand: "growing",
      hasCustomers: true,
      hasAnalytics: true,
      hasCapTable: true,
      hasVesting: true,
      hasShareholdersAgreement: true,
      esopAllocated: true,
      hasPitchDeck: true,
      hasFinancialModel: true,
      hasDataRoom: true,
      targetRaiseMentioned: true,
      raiseMentioned: true,
      hasABN: true,
      hasIPProtection: true,
      hasContracts: true,
      hasLegalDocs: true,
      hasMoat: true,
      evidenceLevel: "connected_source",
    }));
    const weak = computeSVI(makeSignals());

    expect(strong.totalSVI).toBeGreaterThan(weak.totalSVI);
    expect(strong.totalSVI).toBeGreaterThan(120);
    expect(strong.stage).toBeGreaterThanOrEqual(5);
  });

  it("includes 8 sub-scores", () => {
    const result = computeSVI(makeSignals());
    expect(result.subs).toHaveLength(8);
    const keys = result.subs.map(s => s.key);
    expect(keys).toEqual(["ftv", "mpc", "ptd", "tre", "cgh", "iri", "lco", "svm"]);
  });

  it("applies risk penalties for AI wrapper without moat", () => {
    const result = computeSVI(makeSignals({ isAIWrapper: true }));
    const aiPenalty = result.riskPenalties.find(r => r.label === "AI Wrapper Risk");
    expect(aiPenalty).toBeDefined();
    expect(aiPenalty!.points).toBe(15);
  });

  it("does not apply AI wrapper penalty if moat exists", () => {
    const result = computeSVI(makeSignals({ isAIWrapper: true, hasMoat: true }));
    const aiPenalty = result.riskPenalties.find(r => r.label === "AI Wrapper Risk");
    expect(aiPenalty).toBeUndefined();
  });

  it("applies stage bonus", () => {
    const concept = computeSVI(makeSignals());
    const revenue = computeSVI(makeSignals({ hasRevenue: true, revenueBand: "early" }));
    // Revenue stage gets +12 bonus, concept gets +0
    expect(revenue.stageBonus).toBeGreaterThan(concept.stageBonus);
  });

  it("evidence confidence scales adjustments", () => {
    const selfDeclared = computeSVI(makeSignals({
      hasProduct: true,
      hasDemo: true,
      evidenceLevel: "self_declared",
    }));
    const connected = computeSVI(makeSignals({
      hasProduct: true,
      hasDemo: true,
      evidenceLevel: "connected_source",
    }));
    // Connected source has higher confidence → bigger adjustments
    expect(connected.confidenceMultiplier).toBeGreaterThan(selfDeclared.confidenceMultiplier);
  });

  it("generates evidence gaps", () => {
    const result = computeSVI(makeSignals());
    expect(result.evidenceGaps.length).toBeGreaterThan(0);
    expect(result.evidenceGaps[0].priority).toBe("P0");
  });

  it("generates next actions", () => {
    const result = computeSVI(makeSignals());
    expect(result.nextActions.length).toBeGreaterThan(0);
    expect(result.nextActions.length).toBeLessThanOrEqual(5);
  });

  it("includes weekly delta when provided", () => {
    const result = computeSVI(makeSignals(), 5);
    expect(result.weeklyDelta).toBe(5);
  });

  it("calculates percentile rank", () => {
    const result = computeSVI(makeSignals());
    expect(result.percentileRank).toBeDefined();
    expect([10, 25, 50, 75, 90]).toContain(result.percentileRank);
  });

  it("generates summary string", () => {
    const result = computeSVI(makeSignals());
    expect(result.summary).toBeTruthy();
    expect(typeof result.summary).toBe("string");
  });

  it("clamps total SVI between 30 and 300", () => {
    const minimal = computeSVI(makeSignals());
    expect(minimal.totalSVI).toBeGreaterThanOrEqual(30);
    expect(minimal.totalSVI).toBeLessThanOrEqual(300);
  });
});

// ===========================================================================
// Constants
// ===========================================================================
describe("constants", () => {
  it("SVI_STAGE_LABELS has 8 stages (0-7)", () => {
    expect(SVI_STAGE_LABELS).toHaveLength(8);
    expect(SVI_STAGE_LABELS[0]).toBe("Concept");
    expect(SVI_STAGE_LABELS[7]).toBe("Corporation");
  });

  it("SVI_BENCHMARKS covers all 8 stages", () => {
    for (let i = 0; i <= 7; i++) {
      const band = SVI_BENCHMARKS[i];
      expect(band).toBeDefined();
      expect(band.p10).toBeLessThan(band.p25);
      expect(band.p25).toBeLessThan(band.p50);
      expect(band.p50).toBeLessThan(band.p75);
      expect(band.p75).toBeLessThan(band.p90);
    }
  });

  it("EVIDENCE_CONFIDENCE has ordered confidence levels", () => {
    expect(EVIDENCE_CONFIDENCE.self_declared).toBeLessThan(EVIDENCE_CONFIDENCE.public_url);
    expect(EVIDENCE_CONFIDENCE.public_url).toBeLessThan(EVIDENCE_CONFIDENCE.document_uploaded);
    expect(EVIDENCE_CONFIDENCE.document_uploaded).toBeLessThan(EVIDENCE_CONFIDENCE.connected_source);
    expect(EVIDENCE_CONFIDENCE.connected_source).toBeLessThan(EVIDENCE_CONFIDENCE.transaction_data);
    expect(EVIDENCE_CONFIDENCE.transaction_data).toBeLessThan(EVIDENCE_CONFIDENCE.third_party_verified);
    expect(EVIDENCE_CONFIDENCE.third_party_verified).toBe(1.0);
  });
});
