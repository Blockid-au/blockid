/**
 * Term Sheet AI — output schema.
 *
 * Defines the strict Zod shape that Claude Sonnet 4.6 must return for every
 * pasted term sheet. We pass this schema to `client.messages.parse()` so the
 * SDK validates the JSON for us — no manual JSON.parse + try/catch.
 *
 * All numeric `keyTerms` fields are nullable so the model can leave unknowns
 * blank rather than hallucinate a value. Severity / verdict fields are
 * tightly enumerated so the UI can map them directly to color tokens.
 */
import { z } from "zod";

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
});

export type TermSheetAnalysis = z.infer<typeof TermSheetAnalysisSchema>;
