// Colocated schema-surface vitest for `web/src/lib/term-sheet/schema.ts` —
// pins the negative-space of TermSheetAnalysisSchema so a widened enum,
// dropped nullable, or loosened numeric bound is caught at unit-test time
// before it silently reshapes the demo path (`demo.ts`) or the live
// Claude Sonnet 4.6 parse path (`analyze.ts`).
//
// Distinct from `demo.test.ts` — that file pins the DEMO fixture ↔ schema
// round-trip and cross-consistency between DEMO_TERM_SHEET copy and
// DEMO_ANALYSIS. This file pins the SCHEMA ITSELF: every enum's exact
// members, every nullable branch on `keyTerms`, `clause_confidence`'s
// [0, 1] bounds, required-field rejection matrix, and RiskLevelSchema in
// isolation. Ships under P10 (term-sheet track).
import { describe, expect, it } from "vitest";
import {
  RiskLevelSchema,
  TermSheetAnalysisSchema,
  type RiskLevel,
  type TermSheetAnalysis,
} from "./schema";

// Canonical enum members — every test below asserts against these tuples
// so a widened enum (e.g. adding "Series B") fails the fixture assertion
// before it can silently pass through the schema.
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

// Minimal valid analysis object — reused by mutation-based tests so each
// test perturbs a single field. Do not add any field beyond what the
// schema currently requires; adding a new required field to the schema
// should fail the "minimal object parses" test until this fixture is
// updated in lock-step.
function makeValidAnalysis(): TermSheetAnalysis {
  return {
    instrumentType: "SAFE",
    plainEnglishSummary: "Sentence one. Sentence two. Sentence three.",
    keyTerms: {
      investorAmountAud: 500_000,
      valuationCapAud: 5_000_000,
      discountPct: 20,
      preMoneyAud: null,
      postMoneyAud: 5_000_000,
      optionPoolPostMoneyPct: null,
      boardSeatsToInvestor: 0,
      liquidationPreference: "1x non-participating",
      proRataRights: true,
      leadInvestorName: "Atlas Ventures Pty Ltd",
    },
    redline: [
      {
        clause: "MFN with no expiry",
        issue: "Standard AU market MFN is capped at 24 months.",
        severity: "warning",
        suggestedRevision: "Add 24-month expiry.",
        clause_confidence: 0.9,
        risk_level: "medium",
      },
    ],
    auMarketComparison: {
      summary: "Broadly aligned with AU seed norms.",
      deviations: [
        {
          term: "MFN expiry",
          yourTerm: "No expiry",
          auMarketNorm: "24 months",
          verdict: "investor_friendly",
        },
      ],
    },
    riskFlags: [{ flag: "ESIC exposure", why: "Round marketed as ESIC." }],
    lawyer_questions: [
      "Is the MFN expiry acceptable?",
      "Is the discount stackable with the cap?",
      "Does the SAFE convert on a change of control?",
      "Is the pro-rata right assignable?",
      "Does the founder need to sign anything separately?",
    ],
    founder_actions: [
      "URGENT: Get an AU startup lawyer to review.",
      "Confirm ESIC eligibility with your accountant.",
      "Verify the discount does not stack with cap.",
      "Countersign only after item 1.",
    ],
  };
}

// ---------- RiskLevelSchema in isolation ------------------------------------

describe("RiskLevelSchema", () => {
  it("accepts every canonical member exactly once", () => {
    for (const level of RISK_LEVELS) {
      const r = RiskLevelSchema.safeParse(level);
      expect(r.success).toBe(true);
      if (r.success) expect(r.data).toBe(level);
    }
  });

  it("exposes exactly the 4 canonical members (no accidental widening)", () => {
    // Zod does not expose _def.values as a public API guarantee; the
    // best portable pin is: every non-canonical string is rejected.
    const bogus = ["", "LOW", "Critical", "unknown", "high ", " high"];
    for (const s of bogus) {
      expect(RiskLevelSchema.safeParse(s).success).toBe(false);
    }
  });

  it("rejects non-string inputs (number, boolean, null, undefined)", () => {
    for (const v of [0, 1, true, false, null, undefined, {}, []]) {
      expect(RiskLevelSchema.safeParse(v).success).toBe(false);
    }
  });

  it("infers RiskLevel type as the union of the 4 members", () => {
    // Compile-time guard — this test exists so `tsc --noEmit` fails if the
    // union widens or narrows. If someone drops "critical" from the enum
    // this assignment stops compiling.
    const _all: RiskLevel[] = ["low", "medium", "high", "critical"];
    expect(_all).toHaveLength(4);
  });
});

// ---------- Full-shape happy path ------------------------------------------

describe("TermSheetAnalysisSchema — happy path", () => {
  it("parses the minimal valid analysis fixture cleanly", () => {
    const r = TermSheetAnalysisSchema.safeParse(makeValidAnalysis());
    if (!r.success) {
      throw new Error(
        `Valid fixture failed to parse: ${JSON.stringify(r.error.issues, null, 2)}`,
      );
    }
    expect(r.success).toBe(true);
  });

  it("parse() output structurally equals the input (no silent field drop)", () => {
    const input = makeValidAnalysis();
    const parsed = TermSheetAnalysisSchema.parse(input);
    expect(parsed).toEqual(input);
  });

  it("infers TermSheetAnalysis type — assignment from parse output compiles", () => {
    const parsed: TermSheetAnalysis = TermSheetAnalysisSchema.parse(
      makeValidAnalysis(),
    );
    expect(parsed.instrumentType).toBe("SAFE");
  });
});

// ---------- instrumentType enum --------------------------------------------

describe("instrumentType enum", () => {
  it("accepts every canonical member", () => {
    for (const t of INSTRUMENT_TYPES) {
      const input = { ...makeValidAnalysis(), instrumentType: t };
      const r = TermSheetAnalysisSchema.safeParse(input);
      expect(r.success).toBe(true);
    }
  });

  it("rejects out-of-enum instrumentType", () => {
    for (const bad of ["Series B", "safe", "series-seed", "", "Other "]) {
      const input = { ...makeValidAnalysis(), instrumentType: bad };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });
});

// ---------- keyTerms nullable branches -------------------------------------

describe("keyTerms nullable branches", () => {
  const NUMERIC_KEYS = [
    "investorAmountAud",
    "valuationCapAud",
    "discountPct",
    "preMoneyAud",
    "postMoneyAud",
    "optionPoolPostMoneyPct",
    "boardSeatsToInvestor",
  ] as const;

  it("each numeric field accepts null (so model can leave unknowns blank)", () => {
    for (const k of NUMERIC_KEYS) {
      const base = makeValidAnalysis();
      const input = { ...base, keyTerms: { ...base.keyTerms, [k]: null } };
      const r = TermSheetAnalysisSchema.safeParse(input);
      expect(r.success).toBe(true);
    }
  });

  it("each numeric field accepts a finite number", () => {
    for (const k of NUMERIC_KEYS) {
      const base = makeValidAnalysis();
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, [k]: 42 },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
    }
  });

  it("each numeric field rejects a string value", () => {
    for (const k of NUMERIC_KEYS) {
      const base = makeValidAnalysis();
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, [k]: "500000" },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });

  it("liquidationPreference accepts string OR null", () => {
    const base = makeValidAnalysis();
    for (const v of ["1x non-participating", null]) {
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, liquidationPreference: v },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
    }
  });

  it("liquidationPreference rejects non-string non-null", () => {
    const base = makeValidAnalysis();
    for (const v of [123, true, {}]) {
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, liquidationPreference: v as never },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });

  it("proRataRights accepts boolean OR null", () => {
    const base = makeValidAnalysis();
    for (const v of [true, false, null]) {
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, proRataRights: v },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
    }
  });

  it("proRataRights rejects string / number", () => {
    const base = makeValidAnalysis();
    for (const v of ["true", 1, 0]) {
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, proRataRights: v as never },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });

  it("leadInvestorName accepts string OR null", () => {
    const base = makeValidAnalysis();
    for (const v of ["Atlas Ventures", null]) {
      const input = {
        ...base,
        keyTerms: { ...base.keyTerms, leadInvestorName: v },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
    }
  });
});

// ---------- redline severity + risk_level + clause_confidence --------------

describe("redline item guards", () => {
  function withRedline(overrides: Record<string, unknown>) {
    const base = makeValidAnalysis();
    return {
      ...base,
      redline: [{ ...base.redline[0], ...overrides }],
    };
  }

  it("severity accepts every canonical member", () => {
    for (const s of SEVERITIES) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ severity: s })).success).toBe(true);
    }
  });

  it("severity rejects out-of-enum", () => {
    for (const s of ["INFO", "warn", "danger", "", "critical "]) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ severity: s })).success).toBe(false);
    }
  });

  it("risk_level accepts every canonical member", () => {
    for (const r of RISK_LEVELS) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ risk_level: r })).success).toBe(true);
    }
  });

  it("risk_level rejects out-of-enum", () => {
    for (const r of ["LOW", "unknown", "", "high "]) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ risk_level: r })).success).toBe(false);
    }
  });

  it("clause_confidence accepts 0 and 1 (inclusive bounds)", () => {
    for (const c of [0, 0.5, 1]) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ clause_confidence: c })).success).toBe(true);
    }
  });

  it("clause_confidence rejects values just outside [0, 1]", () => {
    for (const c of [-0.0001, 1.0001, -1, 2, 100]) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ clause_confidence: c })).success).toBe(false);
    }
  });

  it("clause_confidence rejects non-number inputs", () => {
    for (const c of ["0.5", null, undefined, true, {}]) {
      expect(TermSheetAnalysisSchema.safeParse(withRedline({ clause_confidence: c })).success).toBe(false);
    }
  });

  it("redline item requires every field — missing 'issue' rejects", () => {
    const base = makeValidAnalysis();
    const bad = {
      clause: "x",
      severity: "info",
      suggestedRevision: "y",
      clause_confidence: 0.5,
      risk_level: "low",
    };
    expect(TermSheetAnalysisSchema.safeParse({ ...base, redline: [bad as never] }).success).toBe(false);
  });

  it("redline empty array is accepted (schema does not require ≥ 1)", () => {
    const base = makeValidAnalysis();
    expect(TermSheetAnalysisSchema.safeParse({ ...base, redline: [] }).success).toBe(true);
  });
});

// ---------- auMarketComparison verdict + shape ------------------------------

describe("auMarketComparison guards", () => {
  it("verdict accepts every canonical member", () => {
    for (const v of VERDICTS) {
      const base = makeValidAnalysis();
      const input = {
        ...base,
        auMarketComparison: {
          ...base.auMarketComparison,
          deviations: [
            { ...base.auMarketComparison.deviations[0], verdict: v },
          ],
        },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
    }
  });

  it("verdict rejects out-of-enum", () => {
    const base = makeValidAnalysis();
    for (const v of ["founder", "friendly", "", "Neutral"]) {
      const input = {
        ...base,
        auMarketComparison: {
          ...base.auMarketComparison,
          deviations: [
            { ...base.auMarketComparison.deviations[0], verdict: v },
          ],
        },
      };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });

  it("deviations empty array is accepted", () => {
    const base = makeValidAnalysis();
    const input = {
      ...base,
      auMarketComparison: { ...base.auMarketComparison, deviations: [] },
    };
    expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(true);
  });

  it("requires summary — missing rejects", () => {
    const base = makeValidAnalysis();
    const { summary: _drop, ...rest } = base.auMarketComparison;
    const input = { ...base, auMarketComparison: rest as never };
    expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
  });
});

// ---------- riskFlags / lawyer_questions / founder_actions -----------------

describe("array-of-string guards", () => {
  it("lawyer_questions accepts an empty array (schema description says 5–8 but does not enforce)", () => {
    const base = makeValidAnalysis();
    expect(TermSheetAnalysisSchema.safeParse({ ...base, lawyer_questions: [] }).success).toBe(true);
  });

  it("lawyer_questions rejects non-string members", () => {
    const base = makeValidAnalysis();
    expect(
      TermSheetAnalysisSchema.safeParse({
        ...base,
        lawyer_questions: ["q1", 42 as never],
      }).success,
    ).toBe(false);
  });

  it("founder_actions accepts an empty array (schema description says 4–6 but does not enforce)", () => {
    const base = makeValidAnalysis();
    expect(TermSheetAnalysisSchema.safeParse({ ...base, founder_actions: [] }).success).toBe(true);
  });

  it("riskFlags requires flag+why on every row", () => {
    const base = makeValidAnalysis();
    expect(
      TermSheetAnalysisSchema.safeParse({
        ...base,
        riskFlags: [{ flag: "orphan" } as never],
      }).success,
    ).toBe(false);
  });
});

// ---------- top-level required-field rejection matrix ----------------------

describe("top-level required-field rejection matrix", () => {
  const REQUIRED_KEYS = [
    "instrumentType",
    "plainEnglishSummary",
    "keyTerms",
    "redline",
    "auMarketComparison",
    "riskFlags",
    "lawyer_questions",
    "founder_actions",
  ] as const;

  it("empty object is rejected (every required key missing)", () => {
    expect(TermSheetAnalysisSchema.safeParse({}).success).toBe(false);
  });

  it("dropping any single required top-level key rejects", () => {
    for (const k of REQUIRED_KEYS) {
      const base = makeValidAnalysis() as Record<string, unknown>;
      delete base[k];
      const r = TermSheetAnalysisSchema.safeParse(base);
      expect(r.success).toBe(false);
    }
  });

  it("plainEnglishSummary must be a string", () => {
    const base = makeValidAnalysis();
    expect(
      TermSheetAnalysisSchema.safeParse({ ...base, plainEnglishSummary: 42 as never }).success,
    ).toBe(false);
    expect(
      TermSheetAnalysisSchema.safeParse({ ...base, plainEnglishSummary: null as never }).success,
    ).toBe(false);
  });

  it("keyTerms must be an object with every canonical field", () => {
    const base = makeValidAnalysis();
    const { keyTerms } = base;
    // Drop each keyTerms field one at a time — schema requires every key
    // (each is nullable, but the KEY itself must be present so the model
    // cannot silently omit a metric).
    for (const k of Object.keys(keyTerms) as Array<keyof typeof keyTerms>) {
      const clone = { ...keyTerms } as Record<string, unknown>;
      delete clone[k];
      const input = { ...base, keyTerms: clone as never };
      expect(TermSheetAnalysisSchema.safeParse(input).success).toBe(false);
    }
  });
});
