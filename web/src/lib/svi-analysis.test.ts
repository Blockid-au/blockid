import { describe, it, expect } from "vitest";
import {
  extractSignals,
  computeSVI,
  detectStage,
  SVI_STAGE_LABELS,
  SVI_BENCHMARKS,
  EVIDENCE_CONFIDENCE,
  applyCapTableInput,
  type CapTableInput,
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

  it.each([
    ["two founders", "We are two founders in Sydney building an invoice tool"],
    ["2 founders", "2 founders, bootstrapped"],
    ["three founders", "Three founders, all ex-Atlassian"],
    ["two co-founders", "The company has two co-founders"],
    ["four cofounders", "four cofounders split the equity evenly"],
    ["both founders", "Both founders work on this full time"],
    ["founding team", "Our founding team has shipped together before"],
  ])("counts a team as having a co-founder: %s", (_label, rawText) => {
    expect(extractSignals({ rawText }).hasCoFounder).toBe(true);
  });

  it("does not read a solo founder as having a co-founder", () => {
    const s = extractSignals({
      rawText: "I am a solo founder building this alone, no team yet",
    });
    expect(s.hasCoFounder).toBe(false);
  });

  it("does not read an explicit customer denial as having customers", () => {
    const s = extractSignals({
      rawText: "Pre-revenue, no paying customers yet, launched a private beta",
    });
    expect(s.hasCustomers).toBe(false);
    expect(s.hasRevenue).toBe(false);
  });

  it("still detects customers when they are actually claimed", () => {
    const s = extractSignals({ rawText: "We have 40 paying customers on annual plans" });
    expect(s.hasCustomers).toBe(true);
  });

  it("does not read 'no external funding' as a raise", () => {
    const s = extractSignals({ rawText: "Bootstrapped, no external funding to date" });
    expect(s.targetRaiseMentioned).toBe(false);
  });

  it("an explicit raise still wins over a bootstrapped history", () => {
    const s = extractSignals({
      rawText: "Bootstrapped so far with no external funding, now raising a seed round",
    });
    expect(s.targetRaiseMentioned).toBe(true);
  });

  it.each([
    ["hasProduct", "We have no product yet, just a landing page idea", "hasProduct"],
    ["hasAdvisors", "Solo effort, no advisors and no mentor so far", "hasAdvisors"],
    ["hasCapTable", "There is no cap table yet, nothing has been issued", "hasCapTable"],
    ["hasWebsite", "We have not built a website yet", "hasWebsite"],
    ["hasPitchDeck", "No pitch deck yet, still writing it", "hasPitchDeck"],
    ["hasIPProtection", "We hold no patent and no trademark", "hasIPProtection"],
    ["esopAllocated", "No esop and no option pool has been set aside", "esopAllocated"],
    ["hasDataRoom", "We do not have a data room", "hasDataRoom"],
  ])("a denial does not set %s", (_label, rawText, field) => {
    const s = extractSignals({ rawText }) as unknown as Record<string, unknown>;
    expect(s[field]).toBe(false);
  });

  it.each([
    ["hasProduct", "Our product is live with a working MVP", "hasProduct"],
    ["hasAdvisors", "Two advisors joined us last quarter", "hasAdvisors"],
    ["hasCapTable", "The cap table is clean and up to date", "hasCapTable"],
    ["hasPitchDeck", "Our pitch deck is attached", "hasPitchDeck"],
    ["hasDataRoom", "The data room is open to investors", "hasDataRoom"],
  ])("a plain claim still sets %s", (_label, rawText, field) => {
    const s = extractSignals({ rawText }) as unknown as Record<string, unknown>;
    expect(s[field]).toBe(true);
  });

  it("a denial elsewhere does not suppress a genuine claim of the same thing", () => {
    // Both appear; the unnegated occurrence must win.
    const s = extractSignals({
      rawText: "We had no product in January. Today the product is live with 200 users.",
    });
    expect(s.hasProduct).toBe(true);
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

  // Stage 4 "Revenue" needs size or duration (S32-D, 2026-09-15): ARR ≥ A$250k
  // or ≥ 12 months of stated revenue. A bare "we have revenue" is traction.
  it("returns 3, not 4, for early revenue with no figure", () => {
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "early" }))).toBe(3);
  });

  it("returns 4 for revenue stage once ARR ≥ A$250k", () => {
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "growing", arrAud: 300_000 }))).toBe(4);
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "growing", arrAud: 250_000 }))).toBe(4);
  });

  it("returns 3 for a small ARR over a short period, 4 once it spans 12 months", () => {
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "early", arrAud: 72_000, revenueMonths: 6 }))).toBe(3);
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "early", arrAud: 72_000, revenueMonths: 12 }))).toBe(4);
    // A "growing" band with a stated figure under the bar is still traction.
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "growing", arrAud: 120_000, revenueMonths: 6 }))).toBe(3);
  });

  it("gates stage 5 and 6 on the same revenue rule", () => {
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "growing", hasCoFounder: true, arrAud: 120_000, revenueMonths: 6 }))).toBe(3);
    expect(detectStage(makeSignals({ hasRevenue: true, revenueBand: "growing", hasCoFounder: true, arrAud: 400_000 }))).toBe(5);
  });

  it("classifies the 2026-09-15 live input (2 pilots, A$36k over 6 months, A$6M cap) as stage 3 Early Traction", () => {
    const rawText =
      "Brisbane agri-robotics pre-seed, 3 founders. Traction: 2 paid pilots (A$18,000 each), 14 orchards waitlist, LOIs from 2 co-ops. " +
      "Revenue: A$36,000 in the last 6 months. Raising A$1.2M seed on a SAFE at A$6M cap.";
    const signals = extractSignals({ rawText });
    expect(signals).toMatchObject({
      hasRevenue: true,
      revenueBand: "early",
      mrrAud: 6_000,
      arrAud: 72_000,
      revenueMonths: 6,
      revenueKind: "period",
      raiseAskAud: 1_200_000,
      statedCapAud: 6_000_000,
      statedCapKind: "cap",
      pilotRevenueAud: 18_000,
      pilotCount: 2,
      targetRaiseMentioned: true,
    });
    expect(detectStage(signals)).toBe(3);
    const analysis = computeSVI(signals);
    expect(analysis.stage).toBe(3);
    expect(analysis.stageLabel).toBe("Early Traction");
  });

  it("reads Vietnamese figures into the same signals", () => {
    const signals = extractSignals({
      rawText: "Doanh thu: 36.000 AUD trong 6 tháng qua. Gọi vốn 1,2 triệu AUD, định giá 6 triệu AUD.",
    });
    expect(signals).toMatchObject({ hasRevenue: true, mrrAud: 6_000, arrAud: 72_000, revenueMonths: 6, raiseAskAud: 1_200_000, statedCapAud: 6_000_000, targetRaiseMentioned: true });
    expect(detectStage(signals)).toBe(3);
  });

  it("sets the revenue band by the stated figure, not by a stray '$1m' in the text", () => {
    const signals = extractSignals({ rawText: "We have A$40k MRR in a $1m niche market." });
    expect(signals.arrAud).toBe(480_000);
    expect(signals.revenueBand).toBe("growing");
    expect(detectStage(signals)).toBe(4);
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
describe("computeSVI — capTableInput (S-R5 §C.7 cap table → CGH)", () => {
  const cgh = (r: ReturnType<typeof computeSVI>) => r.subs.find((d) => d.key === "cgh")!;
  const withRegister = (signals: SVIExtractedSignals, register: CapTableInput | null) => computeSVI(signals, undefined, undefined, undefined, undefined, undefined, undefined, register);

  it("a register lifts CGH: cap table + ESOP + vesting + SHA facts beat the keyword flags, plus the AU-norm and founder-majority bonuses", () => {
    const signals = makeSignals({ hasABN: true });
    const without = withRegister(signals, null);
    const withReg = withRegister(signals, { founderPct: 72, esopPct: 12, investorPct: 16, vestingFlag: true, shaFlag: true, holders: 4 });
    // keyword score 40 → +20 cap table +15 vesting +15 SHA +10 ESOP +5 norm +5 majority = 110 → clamp 100
    expect(cgh(without).value).toBe(40);
    expect(cgh(withReg).value).toBe(100);
    expect(cgh(withReg).value - cgh(without).value).toBe(60);
    expect(cgh(withReg).adjustment).toBeGreaterThan(cgh(without).adjustment);
    expect(withReg.totalSVI).toBeGreaterThan(without.totalSVI);
    expect(cgh(withReg).evidence).toEqual(expect.arrayContaining([expect.stringMatching(/Equity register on file \(4 holders; founders 72 %, ESOP 12 %, investors 16 %\)/), "Vesting schedule recorded in the register", "Shareholders agreement on file", "ESOP pool 12 % in the register", "ESOP pool within the AU seed norm (8–20 %)", "Founders hold 72 % — a fundable majority"]));
    expect(cgh(withReg).gaps).not.toContain("Create a cap table with founder equity split");
    expect(withReg.signals.hasCapTable).toBe(true);
  });

  it("the delta tracks the register: no ESOP / no vesting / no SHA scores less; an oversized pool and a minority founder add gaps, not points", () => {
    const signals = makeSignals();
    const bare = withRegister(signals, { founderPct: 100, esopPct: 0, investorPct: 0, vestingFlag: false, shaFlag: false, holders: 1 });
    expect(cgh(bare).value).toBe(60); // +20 register only (100 % founders is above the majority band)
    expect(cgh(bare).gaps).toEqual(expect.arrayContaining(["Add founder vesting (standard: 4 years, 1 year cliff)", "Create a shareholders agreement (SHA)", "Allocate ESOP pool (8–15% is standard AU seed)"]));
    const skewed = withRegister(signals, { founderPct: 35, esopPct: 30, investorPct: 35, vestingFlag: true, shaFlag: false, holders: 6 });
    expect(cgh(skewed).value).toBe(85); // +20 +15 vesting +10 ESOP (30 % → no norm bonus) +0 majority
    expect(cgh(skewed).gaps).toEqual(expect.arrayContaining([expect.stringMatching(/ESOP pool 30 % is above the AU norm/), expect.stringMatching(/Founders hold 35 % — below 50 %/)]));
    const healthy = withRegister(signals, { founderPct: 60, esopPct: 10, investorPct: 30, vestingFlag: true, shaFlag: false, holders: 6 });
    expect(cgh(healthy).value).toBe(95);
    expect(cgh(healthy).value - cgh(skewed).value).toBe(10);
  });

  it("fail-soft: undefined / null register leaves every dimension exactly as before; applyCapTableInput never lowers a keyword flag", () => {
    const signals = makeSignals({ hasCapTable: true, hasVesting: true, esopAllocated: true, hasShareholdersAgreement: true });
    expect(withRegister(signals, null)).toEqual(computeSVI(signals));
    const folded = applyCapTableInput(signals, { founderPct: 80, esopPct: 0, investorPct: 20, vestingFlag: false, shaFlag: false });
    expect(folded).toMatchObject({ hasCapTable: true, hasVesting: true, esopAllocated: true, hasShareholdersAgreement: true });
    expect(applyCapTableInput(signals, null)).toBe(signals);
  });
});

describe("computeSVI", () => {
  it("returns baseline ~100 for empty concept (minus penalties)", () => {
    const result = computeSVI(makeSignals());
    // Empty concept gets many risk penalties, should be below 100
    expect(result.totalSVI).toBeLessThan(100);
    expect(result.totalSVI).toBeGreaterThanOrEqual(30); // min clamp
    expect(result.baselineSVI).toBe(100);
    expect(result.version).toBe("2.1.0");
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

// ── revenue negation (regression) ───────────────────────────────────────────

describe("extractSignals — revenue negation", () => {
  // `has` is a substring test, so "pre-revenue" contains "revenue". Before the
  // fix this read as revenue, pushed detectStage to 4, and priced a
  // bootstrapped no-product startup in the revenue band — a live case returned
  // "Series A (Growth), 90% confidence" and A$37.3M pre-money for a
  // two-founder pre-revenue idea.
  const denials = [
    "We are pre-revenue and bootstrapping with our own savings.",
    "The company is pre revenue with no outside capital raised.",
    "We have no revenue yet, only a prototype we demo to prospects.",
    "Zero revenue so far; we are still validating the problem.",
    "We have not yet monetised the product.",
  ];

  for (const text of denials) {
    it(`treats "${text.slice(0, 34)}…" as pre-revenue, not early revenue`, () => {
      const signals = extractSignals({ rawText: text });
      expect(signals.revenueBand).toBe("pre-revenue");
      expect(signals.hasRevenue).toBe(false);
      expect(detectStage(signals)).toBeLessThan(4);
    });
  }

  it("still detects real revenue when it is actually claimed", () => {
    const signals = extractSignals({
      rawText: "We have forty paying enterprise customers and A$680,000 ARR.",
    });
    expect(signals.revenueBand).not.toBe("pre-revenue");
    expect(signals.hasRevenue).toBe(true);
    expect(detectStage(signals)).toBeGreaterThanOrEqual(4);
  });
});
