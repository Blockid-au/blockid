/**
 * Term Sheet AI — output schema (v2).
 *
 * Defines the strict Zod shape that Claude Sonnet 4.6 must return for every
 * pasted term sheet. We pass this schema to `client.messages.parse()` so the
 * SDK validates the JSON for us — no manual JSON.parse + try/catch.
 *
 * All numeric `keyTerms` fields are nullable so the model can leave unknowns
 * blank rather than hallucinate a value. Severity / verdict fields are
 * tightly enumerated so the UI can map them directly to color tokens.
 *
 * v2 additions:
 *   - `clause_confidence` per redline item (0–1 float)
 *   - `risk_level` per redline item ('low' | 'medium' | 'high' | 'critical')
 *   - `lawyer_questions` — top questions a startup lawyer would ask
 *   - `founder_actions` — immediate concrete actions the founder should take
 */
import { z } from "zod";

export const RiskLevelSchema = z.enum(["low", "medium", "high", "critical"]);
export type RiskLevel = z.infer<typeof RiskLevelSchema>;

export const TermSheetAnalysisSchema = z.object({
  instrumentType: z.enum([
    "SAFE",
    "Convertible Note",
    "Series Seed",
    "Series A",
    "Other",
  ]),
  plainEnglishSummary: z
    .string()
    .describe(
      "3 to 5 sentences in a founder-friendly Australian voice — no hedging, no legalese.",
    ),
  keyTerms: z.object({
    investorAmountAud: z.number().nullable(),
    valuationCapAud: z.number().nullable(),
    discountPct: z.number().nullable(),
    preMoneyAud: z.number().nullable(),
    postMoneyAud: z.number().nullable(),
    optionPoolPostMoneyPct: z.number().nullable(),
    boardSeatsToInvestor: z.number().nullable(),
    liquidationPreference: z.string().nullable(),
    proRataRights: z.boolean().nullable(),
    leadInvestorName: z.string().nullable(),
  }),
  redline: z.array(
    z.object({
      clause: z.string(),
      issue: z.string(),
      severity: z.enum(["info", "warning", "critical"]),
      suggestedRevision: z.string(),
      /** 0–1 confidence that this clause exists and was correctly parsed from the term sheet text */
      clause_confidence: z
        .number()
        .min(0)
        .max(1)
        .describe(
          "0–1 float: how confident are you that this clause exists verbatim and was correctly extracted from the term sheet? 1.0 = verbatim quote found, 0.5 = implied by surrounding language, 0.1 = inferred from absence.",
        ),
      /** Overall risk level this clause poses to the founder */
      risk_level: RiskLevelSchema.describe(
        "low = minor stylistic nit, medium = worth negotiating if you have leverage, high = material founder-harm risk, critical = do not sign without resolving",
      ),
    }),
  ),
  auMarketComparison: z.object({
    summary: z.string(),
    deviations: z.array(
      z.object({
        term: z.string(),
        yourTerm: z.string(),
        auMarketNorm: z.string(),
        verdict: z.enum([
          "founder_friendly",
          "neutral",
          "investor_friendly",
        ]),
      }),
    ),
  }),
  riskFlags: z.array(
    z.object({
      flag: z.string(),
      why: z.string(),
    }),
  ),
  /** Top questions a startup lawyer would ask the founder about this term sheet */
  lawyer_questions: z
    .array(z.string())
    .describe(
      "5–8 pointed questions a senior AU startup lawyer would ask the founder before advising them. Focus on ambiguities, missing clauses, and downstream risks specific to this term sheet.",
    ),
  /** Immediate concrete actions the founder should take before signing */
  founder_actions: z
    .array(z.string())
    .describe(
      "4–6 specific, actionable steps the founder should take NOW — e.g. 'Get an AU startup lawyer to review the drag-along threshold', 'Confirm ESIC eligibility with your accountant before closing'. Ordered by urgency.",
    ),
});

export type TermSheetAnalysis = z.infer<typeof TermSheetAnalysisSchema>;
