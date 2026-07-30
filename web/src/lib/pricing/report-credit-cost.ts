/**
 * report-credit-cost — pure quote for the credit cost of one Trust
 * Business Report generation.
 *
 * Master Upgrade Plan §8.7 (confirm-before-charge modal) requires the
 * server to state the exact credit cost, word count, and model BEFORE
 * execution. This helper is that server-side truth; the client only
 * displays what the server returned so no client-side arithmetic can
 * game the debit.
 *
 * Design:
 *   - Depth ladder from feedback/transparent-credit-pricing.md:
 *       Scan 0.10 · Standard 0.50 · Deep 1.00 · Expert 2.00 · Max 3.00
 *     multiplied per section. A full Trust Business Report ships 10
 *     sections (§8.7 modal copy: "13 criteria across 4 pillars using
 *     6 C-Level agents"; the 10 comes from the section-assembler
 *     template count that renders those criteria).
 *   - Model tier multiplier:
 *       haiku 0.20 · sonnet 1.00 · opus 2.50
 *     Anchor: sonnet at Standard depth × 10 sections × 40 credit-units
 *     per section = 200 credits ⇒ A$5.00 at A$0.025/credit (§10.1).
 *     That reconciles Path A (A$5 net) with Path B (200 credits) as
 *     required by §14bis D1 / §10.1.
 *   - Word budget is derived so the confirm modal can quote an honest
 *     token estimate: 850 words per section (matches the §8.7 modal
 *     "Estimated: 8,500 words" line for the default Sonnet + Standard
 *     run).
 */

export type ReportDepth = "scan" | "standard" | "deep" | "expert" | "max";
export type ReportModel = "haiku" | "sonnet" | "opus";

/** How many discrete sections a full Trust Business Report generates. */
export const REPORT_SECTIONS = 10;

/** Words per section — used only for the confirm-before-charge modal. */
export const WORDS_PER_SECTION = 850;

/** Depth multiplier per section — mirrors transparent-credit-pricing.md. */
export const DEPTH_MULTIPLIER: Record<ReportDepth, number> = {
  scan: 0.1,
  standard: 0.5,
  deep: 1.0,
  expert: 2.0,
  max: 3.0,
};

/** Model tier multiplier. Sonnet at 1.00 anchors the 200-credit standard. */
export const MODEL_MULTIPLIER: Record<ReportModel, number> = {
  haiku: 0.2,
  sonnet: 1.0,
  opus: 2.5,
};

/**
 * Base credit-units per section at (Sonnet × Standard). The 40 anchors
 * the 200-credit Standard Sonnet 10-section report that reconciles the
 * A$5 Path A with the 200-credit Path B (200 × A$0.025 = A$5.00).
 */
export const BASE_UNITS_PER_SECTION = 40;

export interface ReportQuoteInput {
  model?: ReportModel;
  depth?: ReportDepth;
  /** Override section count — allows partial reports (rare). */
  sections?: number;
}

export interface ReportQuote {
  credits: number;
  estimatedWords: number;
  model: ReportModel;
  depth: ReportDepth;
  sections: number;
}

/**
 * Quote the credit cost of a Trust Business Report generation. Pure,
 * deterministic, server-only truth.
 */
export function quoteTrustReport(
  input: ReportQuoteInput = {},
): ReportQuote {
  const model: ReportModel = input.model ?? "sonnet";
  const depth: ReportDepth = input.depth ?? "standard";
  const sections = Math.max(1, Math.floor(input.sections ?? REPORT_SECTIONS));

  const perSection =
    BASE_UNITS_PER_SECTION * DEPTH_MULTIPLIER[depth] * MODEL_MULTIPLIER[model];

  // Ceil so a subscriber never underpays by rounding.
  const credits = Math.ceil(perSection * sections);
  const estimatedWords = sections * WORDS_PER_SECTION;

  return { credits, estimatedWords, model, depth, sections };
}

/**
 * The canonical Path B default: Sonnet · Standard · 10 sections = 200
 * credits. Kept as a named export so callers that just want the default
 * don't have to know the exact input shape.
 */
export const DEFAULT_TRUST_REPORT_QUOTE: ReportQuote = quoteTrustReport();
