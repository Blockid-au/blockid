/** Customer CLO analysis through the admitted DeepInfra dispatcher.
 * The existing Zod output contract and deterministic dilution calculation stay
 * authoritative. Provider/schema failures retain the explicitly labelled demo
 * fallback. No model-specific cache discount or capability is assumed.
 */
import { z } from "zod";
import { computeDiff, type CapTableDiff, type Holder, type Round } from "@/lib/cap-table";
import { callAI, isAIConfigured } from "@/lib/ai-client";
import { TermSheetAnalysisSchema, type TermSheetAnalysis } from "./schema";
import { AU_MARKET_REFERENCE } from "./au-market-data";
import { DEMO_ANALYSIS } from "./demo";

const MAX_TOKENS = 8192;

/**
 * Stable instructions shared across requests; provider cache availability and
 * discounts are not assumed.
 */
const ANALYSIS_INSTRUCTIONS = `You are a senior Australian startup lawyer with prior experience as a partner at an AU early-stage VC. Your job: read a pasted term sheet and produce a founder-friendly analysis that would save an Australian founder AUD $3,000–$10,000 in legal fees and get them to a confident decision in 30 seconds.

Output contract — you MUST return a structured object that matches the schema you have been given. Do not return prose outside the schema.

Voice and tone:
- Plain English, Australian register. No legalese. No hedging.
- "Founders dilute by 24%" — not "founders may potentially experience some dilution".
- Quote clause language verbatim where it materially affects the analysis (use "quotes").
- Be specific. If the cap is AUD $5M, say AUD $5M, not "around $5M".
- Never recommend signing or not signing. You analyse; the founder (with their lawyer) decides.

Redline severity rubric — apply this to every redline item:
- info: a minor stylistic or drafting nit. The clause is fine substantively but could be clearer or tighter. The founder can ignore it without harm.
- warning: a clause that is standard-ish in the market but worth pushing back on if the founder has leverage. Sub-optimal but not a deal-breaker. Examples: pro-rata with no sunset, MFN scoped too broadly, ESOP top-up at 15% when 10% would do.
- critical: a clause that would materially harm founders' ownership, control, or upside in a realistic future scenario. The founder should NOT sign without negotiating this. Examples: full-ratchet anti-dilution, multiple liquidation preference, drag-along threshold below 50%, founder vesting reset with no acceleration, board control to a single investor at seed.

AU market comparison verdicts:
- founder_friendly: this term is BETTER for the founder than the AU market norm.
- neutral: this term is WITHIN the AU market norm range.
- investor_friendly: this term is WORSE for the founder than the AU market norm.

If a term is unspecified in the pasted term sheet (e.g. no liquidation preference mentioned), set the corresponding keyTerms field to null. Do not invent values. If you can't determine the instrument type, return "Other".

Risk flags should highlight non-obvious downstream risks the founder may not have noticed — e.g. "ESIC eligibility tested at conversion, not at signing", "vesting reset risk if shareholders' agreement isn't pre-negotiated", "ASIC disclosure obligation if 20-investor cap breached".

Use the AU Private Capital Market reference data that follows to ground your analysis. If the term sheet has US drafting tics (Delaware, Stockholder, NVCA forms) flag this as an info-severity redline.

v2 schema additions — you MUST populate these fields:

clause_confidence (per redline item, 0.0–1.0):
  - 1.0 = you found a verbatim quote for this clause in the pasted text
  - 0.7–0.9 = the clause language is strongly implied by adjacent text
  - 0.4–0.6 = you inferred the clause from context or surrounding provisions
  - 0.1–0.3 = you are flagging an absence of a clause (it should be there but isn't)

risk_level (per redline item):
  - "low" = minor stylistic or drafting nit; no material harm
  - "medium" = worth negotiating but not a deal-breaker
  - "high" = materially harms founders' ownership, control, or upside
  - "critical" = do not sign without resolving this

lawyer_questions: 5–8 pointed questions a senior AU startup lawyer would ask the founder before giving advice. Target ambiguities, missing clauses, and downstream risks SPECIFIC to this term sheet — not generic questions.

founder_actions: 4–6 specific, ordered-by-urgency action items the founder should take BEFORE signing. Be concrete: name the professional to engage, the clause to challenge, the document to check. No vague advice.`;

interface UsageStats {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AnalyzeResult {
  analysis: TermSheetAnalysis;
  dilution: CapTableDiff | null;
  mode: "live" | "demo";
  usage?: UsageStats;
}

export interface AnalyzeArgs {
  userId?: string;
  termSheet: string;
  capTable?: Holder[] | null;
  round?: Round | null;
}

function logCacheLine(usage: UsageStats): void {
  // Preserve token telemetry; absent cache counters are zero, not evidence
  // that this provider/model supports a cache discount.
  console.log(
    `[blockid:termsheet] cache_read=${usage.cache_read_input_tokens} cache_create=${usage.cache_creation_input_tokens} input=${usage.input_tokens} output=${usage.output_tokens}`,
  );
}

function maybeDilution(
  capTable?: Holder[] | null,
  round?: Round | null,
): CapTableDiff | null {
  if (!capTable || !round) return null;
  if (!Array.isArray(capTable) || capTable.length === 0) return null;
  return computeDiff(capTable, round);
}

export async function analyzeTermSheet({
  userId,
  termSheet,
  capTable,
  round,
}: AnalyzeArgs): Promise<AnalyzeResult> {
  const dilution = maybeDilution(capTable, round);

  if (!isAIConfigured()) {
    console.warn(
      "[blockid:termsheet] No AI credentials — returning demo analysis",
    );
    return { analysis: DEMO_ANALYSIS, dilution, mode: "demo" };
  }

  const system = `${ANALYSIS_INSTRUCTIONS}

# Australian Private Capital Market — Reference

${AU_MARKET_REFERENCE}

Required JSON schema:
${JSON.stringify(z.toJSONSchema(TermSheetAnalysisSchema))}`;

  const userParts: string[] = [
    "Analyse the following pasted term sheet for an Australian founder. Return ONLY the structured analysis matching the provided schema.",
    "",
    "--- TERM SHEET BEGIN ---",
    termSheet,
    "--- TERM SHEET END ---",
  ];

  if (dilution) {
    userParts.push(
      "",
      "Cap table provided — focus the dilution lens of your analysis on these holders. Do NOT compute share counts yourself; the dilution simulation is being computed locally and will be appended to the response. Your job is to comment qualitatively on whether the round economics in the term sheet are consistent with founder-friendly outcomes for this specific cap table.",
    );
  }

  const userMessage = userParts.join("\n");

  try {
    const response = await callAI({
      providerPolicy: "deepinfra-only",
      agentId: "clo-term-sheet",
      userId,
      taskClass: "report",
      maxTokens: MAX_TOKENS,
      system,
      user: userMessage,
    });

    const usage: UsageStats = {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
      cache_read_input_tokens: response.usage?.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage?.cache_creation_input_tokens ?? 0,
    };
    logCacheLine(usage);

    let decoded: unknown;
    try {
      decoded = JSON.parse(response.text);
    } catch {
      decoded = null;
    }
    const checked = TermSheetAnalysisSchema.safeParse(decoded);
    if (!checked.success) {
      console.error("[blockid:termsheet] response failed output schema — degrading to demo");
      return { analysis: DEMO_ANALYSIS, dilution, mode: "demo", usage };
    }
    const parsed = checked.data;

    return {
      analysis: parsed,
      dilution,
      mode: "live",
      usage,
    };
  } catch (err: unknown) {
    console.error("[blockid:termsheet] provider error — returning demo", err);
    return { analysis: DEMO_ANALYSIS, dilution, mode: "demo" };
  }
}
