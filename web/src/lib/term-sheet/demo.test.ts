import { describe, expect, it } from "vitest";
import { DEMO_ANALYSIS, DEMO_TERM_SHEET } from "./demo";
import {
  RiskLevelSchema,
  TermSheetAnalysisSchema,
  type TermSheetAnalysis,
} from "./schema";

const INSTRUMENT_TYPES = [
  "SAFE",
  "Convertible Note",
  "Series Seed",
  "Series A",
  "Other",
] as const;

const SEVERITIES = ["info", "warning", "critical"] as const;
const RISK_LEVELS = ["low", "medium", "high", "critical"] as const;
const VERDICTS = ["founder_friendly", "neutral", "investor_friendly"] as const;

describe("DEMO_TERM_SHEET (raw prospectus fixture)", () => {
  it("is a non-empty string the UI can render as a skeleton state", () => {
    expect(typeof DEMO_TERM_SHEET).toBe("string");
    expect(DEMO_TERM_SHEET.trim().length).toBeGreaterThan(0);
  });

  it("carries the canonical AUD $500k pre-seed SAFE headline facts", () => {
    // Cross-consistency guard: the copy the model sees must contain the
    // same numbers we later assert on DEMO_ANALYSIS.keyTerms — otherwise a
    // silent copy edit in demo.ts would leave the analysis lying.
    expect(DEMO_TERM_SHEET).toContain("AUD $500,000");
    expect(DEMO_TERM_SHEET).toContain("AUD $5,000,000");
    expect(DEMO_TERM_SHEET).toContain("Discount: 20%");
    expect(DEMO_TERM_SHEET).toContain("Standard SAFE");
  });

  it("names Atlas Ventures as the lead — matches DEMO_ANALYSIS.leadInvestorName", () => {
    expect(DEMO_TERM_SHEET).toContain("Atlas Ventures");
  });

  it("declares a 24-month MFN expiry (matches DEMO_ANALYSIS deviation row)", () => {
    expect(DEMO_TERM_SHEET).toMatch(/24 month/i);
  });

  it("explicitly says 'No board seat' (matches DEMO_ANALYSIS.boardSeatsToInvestor=0)", () => {
    expect(DEMO_TERM_SHEET).toMatch(/No board seat/i);
  });

  it("mentions ESIC eligibility (matches DEMO_ANALYSIS ESIC redline + riskFlag)", () => {
    expect(DEMO_TERM_SHEET).toMatch(/ESIC/);
  });
});

describe("DEMO_ANALYSIS ↔ TermSheetAnalysisSchema parse round-trip", () => {
  it("DEMO_ANALYSIS parses cleanly against TermSheetAnalysisSchema (no schema drift)", () => {
    // The single most important guard: any change to schema.ts (e.g. a new
    // required field) that would break the /api/term-sheet/analyze demo
    // fallback surfaces here instead of in a browser.
    const result = TermSheetAnalysisSchema.safeParse(DEMO_ANALYSIS);
    if (!result.success) {
      // Surface the zod error so a regression is diagnosable in-place.
      throw new Error(
        `DEMO_ANALYSIS failed TermSheetAnalysisSchema.safeParse: ${JSON.stringify(result.error.issues, null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("parse output structurally equals the input (schema does not silently drop fields)", () => {
    const parsed = TermSheetAnalysisSchema.parse(DEMO_ANALYSIS);
    expect(parsed).toEqual(DEMO_ANALYSIS);
  });
});

describe("DEMO_ANALYSIS.instrumentType", () => {
  it("is one of the 5 canonical instrument-type enum members", () => {
    expect(INSTRUMENT_TYPES).toContain(DEMO_ANALYSIS.instrumentType);
  });

  it("is 'SAFE' — pinned because DEMO_TERM_SHEET describes a SAFE", () => {
    expect(DEMO_ANALYSIS.instrumentType).toBe("SAFE");
  });
});

describe("DEMO_ANALYSIS.plainEnglishSummary", () => {
  it("is a non-empty string with sentence content", () => {
    expect(DEMO_ANALYSIS.plainEnglishSummary.trim().length).toBeGreaterThan(0);
  });

  it("contains at least 3 sentences (schema prompts 3–5)", () => {
    // Crude but stable: split on `. ` and count non-empty fragments.
    const sentences = DEMO_ANALYSIS.plainEnglishSummary
      .split(/[.!?]\s+/)
      .filter((s) => s.trim().length > 0);
    expect(sentences.length).toBeGreaterThanOrEqual(3);
  });
});

describe("DEMO_ANALYSIS.keyTerms (cross-consistency with DEMO_TERM_SHEET)", () => {
  it("investorAmountAud matches the AUD $500,000 stated in the term sheet", () => {
    expect(DEMO_ANALYSIS.keyTerms.investorAmountAud).toBe(500000);
  });

  it("valuationCapAud matches the AUD $5,000,000 post-money cap", () => {
    expect(DEMO_ANALYSIS.keyTerms.valuationCapAud).toBe(5000000);
  });

  it("postMoneyAud equals valuationCapAud for post-money-convention SAFEs", () => {
    expect(DEMO_ANALYSIS.keyTerms.postMoneyAud).toBe(
      DEMO_ANALYSIS.keyTerms.valuationCapAud,
    );
  });

  it("discountPct is the 20% stated in the term sheet", () => {
    expect(DEMO_ANALYSIS.keyTerms.discountPct).toBe(20);
  });

  it("boardSeatsToInvestor is 0 (matches 'No board seat' in the fixture)", () => {
    expect(DEMO_ANALYSIS.keyTerms.boardSeatsToInvestor).toBe(0);
  });

  it("liquidationPreference is the 1x-non-participating AU market standard", () => {
    expect(DEMO_ANALYSIS.keyTerms.liquidationPreference).toBe(
      "1x non-participating",
    );
  });

  it("leadInvestorName matches the Atlas Ventures Pty Ltd lead in the term sheet", () => {
    expect(DEMO_ANALYSIS.keyTerms.leadInvestorName).toBe("Atlas Ventures Pty Ltd");
  });

  it("proRataRights is true (major-investor floor documented in the term sheet)", () => {
    expect(DEMO_ANALYSIS.keyTerms.proRataRights).toBe(true);
  });

  it("nullable numeric fields left unspecified stay null rather than 0 (no invented values)", () => {
    // schema.ts explicitly comments: "so the model can leave unknowns blank
    // rather than hallucinate a value". Pin the demo's compliance with that.
    expect(DEMO_ANALYSIS.keyTerms.preMoneyAud).toBeNull();
    expect(DEMO_ANALYSIS.keyTerms.optionPoolPostMoneyPct).toBeNull();
  });
});

describe("DEMO_ANALYSIS.redline", () => {
  it("is a non-empty array", () => {
    expect(Array.isArray(DEMO_ANALYSIS.redline)).toBe(true);
    expect(DEMO_ANALYSIS.redline.length).toBeGreaterThan(0);
  });

  it("every redline row has non-empty clause / issue / suggestedRevision", () => {
    for (const r of DEMO_ANALYSIS.redline) {
      expect(r.clause.trim().length).toBeGreaterThan(0);
      expect(r.issue.trim().length).toBeGreaterThan(0);
      expect(r.suggestedRevision.trim().length).toBeGreaterThan(0);
    }
  });

  it("every severity is in the {info, warning, critical} enum", () => {
    for (const r of DEMO_ANALYSIS.redline) {
      expect(SEVERITIES).toContain(r.severity);
    }
  });

  it("every risk_level parses against RiskLevelSchema", () => {
    for (const r of DEMO_ANALYSIS.redline) {
      expect(RiskLevelSchema.safeParse(r.risk_level).success).toBe(true);
      expect(RISK_LEVELS).toContain(r.risk_level);
    }
  });

  it("every clause_confidence is a 0..1 finite float", () => {
    for (const r of DEMO_ANALYSIS.redline) {
      expect(Number.isFinite(r.clause_confidence)).toBe(true);
      expect(r.clause_confidence).toBeGreaterThanOrEqual(0);
      expect(r.clause_confidence).toBeLessThanOrEqual(1);
    }
  });

  it("contains at least one 'critical' risk_level (the founder-vesting reset row)", () => {
    // Pinned because a demo that never surfaces a critical row would
    // silently downgrade the tool's headline value proposition
    // (surface material harm before signing).
    const criticals = DEMO_ANALYSIS.redline.filter(
      (r) => r.risk_level === "critical",
    );
    expect(criticals.length).toBeGreaterThan(0);
  });

  it("surfaces both ESIC and founder-vesting clauses — the two AU-specific headline risks", () => {
    // Compound clause+issue haystack so a rename in either field surfaces.
    const haystack = DEMO_ANALYSIS.redline
      .map((r) => `${r.clause}::${r.issue}`)
      .join("\n");
    expect(haystack).toMatch(/ESIC/i);
    expect(haystack).toMatch(/vesting/i);
  });
});

describe("DEMO_ANALYSIS.auMarketComparison", () => {
  it("summary is a non-empty string", () => {
    expect(DEMO_ANALYSIS.auMarketComparison.summary.trim().length).toBeGreaterThan(0);
  });

  it("deviations is a non-empty array", () => {
    expect(DEMO_ANALYSIS.auMarketComparison.deviations.length).toBeGreaterThan(0);
  });

  it("every deviation carries non-empty term / yourTerm / auMarketNorm", () => {
    for (const d of DEMO_ANALYSIS.auMarketComparison.deviations) {
      expect(d.term.trim().length).toBeGreaterThan(0);
      expect(d.yourTerm.trim().length).toBeGreaterThan(0);
      expect(d.auMarketNorm.trim().length).toBeGreaterThan(0);
    }
  });

  it("every verdict is in the {founder_friendly, neutral, investor_friendly} enum", () => {
    for (const d of DEMO_ANALYSIS.auMarketComparison.deviations) {
      expect(VERDICTS).toContain(d.verdict);
    }
  });

  it("covers all three verdict bands (founder_friendly + neutral + investor_friendly)", () => {
    // A demo that only ever showed 'neutral' would undersell the tool.
    const seen = new Set(
      DEMO_ANALYSIS.auMarketComparison.deviations.map((d) => d.verdict),
    );
    expect(seen.has("founder_friendly")).toBe(true);
    expect(seen.has("neutral")).toBe(true);
    expect(seen.has("investor_friendly")).toBe(true);
  });
});

describe("DEMO_ANALYSIS.riskFlags", () => {
  it("is a non-empty array with non-empty flag + why per row", () => {
    expect(DEMO_ANALYSIS.riskFlags.length).toBeGreaterThan(0);
    for (const f of DEMO_ANALYSIS.riskFlags) {
      expect(f.flag.trim().length).toBeGreaterThan(0);
      expect(f.why.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("DEMO_ANALYSIS.lawyer_questions", () => {
  it("contains at least 5 questions (schema prompts 5–8)", () => {
    expect(DEMO_ANALYSIS.lawyer_questions.length).toBeGreaterThanOrEqual(5);
  });

  it("every question is a non-empty string containing at least one '?' (compound sentences allowed)", () => {
    for (const q of DEMO_ANALYSIS.lawyer_questions) {
      expect(q.trim().length).toBeGreaterThan(0);
      expect(q).toContain("?");
    }
  });
});

describe("DEMO_ANALYSIS.founder_actions", () => {
  it("contains 4..6 actions (schema prompts 4–6)", () => {
    // Upper-bound-inclusive because the schema description reads "4–6".
    expect(DEMO_ANALYSIS.founder_actions.length).toBeGreaterThanOrEqual(4);
    expect(DEMO_ANALYSIS.founder_actions.length).toBeLessThanOrEqual(6);
  });

  it("every action is a non-empty string", () => {
    for (const a of DEMO_ANALYSIS.founder_actions) {
      expect(a.trim().length).toBeGreaterThan(0);
    }
  });

  it("first action carries the 'URGENT' priority marker (pins ordered-by-urgency invariant)", () => {
    // Ordered-by-urgency is a schema-level contract; test the head element
    // so a re-ordering that dropped the urgent lawyer-engagement step
    // to the bottom would surface here.
    expect(DEMO_ANALYSIS.founder_actions[0]).toMatch(/URGENT/);
  });
});

describe("TermSheetAnalysisSchema surface", () => {
  it("rejects an empty object (required-field guard is live)", () => {
    const result = TermSheetAnalysisSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("rejects an instrumentType outside the enum", () => {
    const bad: unknown = {
      ...DEMO_ANALYSIS,
      instrumentType: "IPO",
    };
    expect(TermSheetAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects clause_confidence > 1 on a redline row", () => {
    const bad: TermSheetAnalysis = {
      ...DEMO_ANALYSIS,
      redline: DEMO_ANALYSIS.redline.map((r, i) =>
        i === 0 ? { ...r, clause_confidence: 1.5 } : r,
      ),
    };
    expect(TermSheetAnalysisSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects clause_confidence < 0 on a redline row", () => {
    const bad: TermSheetAnalysis = {
      ...DEMO_ANALYSIS,
      redline: DEMO_ANALYSIS.redline.map((r, i) =>
        i === 0 ? { ...r, clause_confidence: -0.01 } : r,
      ),
    };
    expect(TermSheetAnalysisSchema.safeParse(bad).success).toBe(false);
  });
});
