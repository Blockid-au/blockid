/**
 * Term Sheet AI — server-side analysis pipeline.
 *
 * Calls Claude Sonnet 4.6 via `client.messages.parse()` with a Zod schema
 * (no manual JSON parsing). Uses the prompt-cache breakpoint trick to keep
 * the AU market reference data warm at ~0.1× input cost across analyses.
 *
 * Hard rules from the brief:
 *   - Model: claude-sonnet-4-6 (NOT Opus 4.7)
 *   - thinking: { type: "adaptive" } (NOT budget_tokens)
 *   - effort: "medium" (max is Opus-only)
 *   - No streaming, max_tokens: 8192, no temperature/top_p/top_k
 *   - No beta headers — effort, adaptive thinking, and parse() are GA
 *   - cache_control on the AU reference block ONLY (1h TTL)
 *
 * Failure mode: if no Anthropic credentials available OR the SDK throws a typed
 * Anthropic error, we degrade to demo mode — the funnel must not block on
 * transient API issues. Operators see the cache stats / error in container
 * logs and can verify cache hit rate after the first request.
 */
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { computeDiff, type CapTableDiff, type Holder, type Round } from "@/lib/cap-table";
import { getAnthropicClient, isAnthropicConfigured } from "@/lib/ai-client";
import { TermSheetAnalysisSchema, type TermSheetAnalysis } from "./schema";
import { AU_MARKET_REFERENCE } from "./au-market-data";
import { DEMO_ANALYSIS } from "./demo";

const MODEL_ID = "claude-sonnet-4-6";
const MAX_TOKENS = 8192;

/**
 * Static — no timestamps, request IDs, or per-user data may be interpolated
 * into this string. Doing so would silently invalidate the prompt cache.
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
  termSheet: string;
  capTable?: Holder[] | null;
  round?: Round | null;
}

function logCacheLine(usage: UsageStats): void {
  // Single-line, grep-friendly format the operator can scan in container logs
  // to confirm prompt caching is working. Should be > 0 on read after the
  // first request with the same system prefix.
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
  termSheet,
  capTable,
  round,
}: AnalyzeArgs): Promise<AnalyzeResult> {
  const dilution = maybeDilution(capTable, round);

  if (!isAnthropicConfigured()) {
    console.warn(
      "[blockid:termsheet] No Anthropic credentials — returning demo analysis",
    );
    return { analysis: DEMO_ANALYSIS, dilution, mode: "demo" };
  }

  const client = getAnthropicClient();

  // System prompt as TWO blocks: stable instructions first (uncached),
  // then the bulky AU market reference with cache_control. Render order is
  // tools → system → messages, so the cache breakpoint sits at the end of
  // the system prefix and covers everything before the (varying) user msg.
  const systemBlocks = [
    {
      type: "text" as const,
      text: ANALYSIS_INSTRUCTIONS,
    },
    {
      type: "text" as const,
      text: `# Australian Private Capital Market — Reference\n\n${AU_MARKET_REFERENCE}`,
      cache_control: { type: "ephemeral" as const, ttl: "1h" as const },
    },
  ];

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
    const response = await client.messages.parse({
      model: MODEL_ID,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: {
        effort: "medium",
        format: zodOutputFormat(TermSheetAnalysisSchema),
      },
      system: systemBlocks,
      messages: [
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    const usage: UsageStats = {
      input_tokens: response.usage.input_tokens ?? 0,
      output_tokens: response.usage.output_tokens ?? 0,
      cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens:
        response.usage.cache_creation_input_tokens ?? 0,
    };
    logCacheLine(usage);

    const parsed = response.parsed_output;
    if (!parsed) {
      console.error(
        "[blockid:termsheet] parse() returned no parsed_output — degrading to demo",
      );
      return { analysis: DEMO_ANALYSIS, dilution, mode: "demo", usage };
    }

    return {
      analysis: parsed,
      dilution,
      mode: "live",
      usage,
    };
  } catch (err: unknown) {
    if (err instanceof Anthropic.RateLimitError) {
      console.error(
        "[blockid:termsheet] Anthropic rate limit — returning demo",
        err.message,
      );
    } else if (err instanceof Anthropic.APIError) {
      console.error(
        `[blockid:termsheet] Anthropic API error ${err.status} — returning demo`,
        err.message,
      );
    } else {
      console.error(
        "[blockid:termsheet] Unexpected error in analyze — returning demo",
        err,
      );
    }
    return { analysis: DEMO_ANALYSIS, dilution, mode: "demo" };
  }
}
