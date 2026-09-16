// prompt-tokens — the cheap token estimator + per-block caps every v2 prompt
// block is trimmed with (spec 12-product-ai-tbr-v2.md §C.2).
//
// No tokenizer dependency: ≈ 4 chars/token for English prose with a word
// floor (short words / code / tables tokenise worse than 4:1, so the estimate
// is deliberately pessimistic — a block that passes here fits the real
// budget with margin). Pure, client-safe.

/** Rough token estimate: max(chars / 4, words × 1.3). */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const chars = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.ceil(Math.max(chars / 4, words * 1.3));
}

/**
 * Trim `text` to at most `maxTokens` (by the estimator above), cutting on a
 * line boundary where possible and appending a marker so the model knows the
 * block was shortened. Returns the input unchanged when it already fits.
 */
export function capTokens(text: string, maxTokens: number, marker = "… [trimmed]"): string {
  if (maxTokens <= 0) return "";
  if (!text) return text;
  if (estimateTokens(text) <= maxTokens) return text;
  // Binary search on character length — cheap and deterministic.
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (estimateTokens(text.slice(0, mid) + marker) <= maxTokens) lo = mid;
    else hi = mid - 1;
  }
  let cut = text.slice(0, lo);
  const lastNl = cut.lastIndexOf("\n");
  if (lastNl > cut.length * 0.6) cut = cut.slice(0, lastNl);
  return `${cut.trimEnd()}${marker}`;
}

/** Per-block token caps (§C.2). The AU context is fixed prose and uncapped. */
export const PROMPT_BLOCK_CAPS = {
  ROLE_CARD: 700,
  PHASE_LENS: 250,
  SKILL_ADDON: 150,
  KNOWLEDGE_FILE: 600,
  KNOWLEDGE_FILES_MAX: 2,
  KNOWLEDGE_ROW: 120,
  KNOWLEDGE_ROWS_MAX: 3,
  MODULES: 400,
  EVIDENCE: 400,
  OUTPUT_SCHEMA: 700,
} as const;

/** Upper bound for a whole v2 system prompt (all blocks at cap + AU context). */
export const PROMPT_TOTAL_CAP =
  PROMPT_BLOCK_CAPS.ROLE_CARD +
  PROMPT_BLOCK_CAPS.PHASE_LENS +
  PROMPT_BLOCK_CAPS.SKILL_ADDON +
  PROMPT_BLOCK_CAPS.KNOWLEDGE_FILE * PROMPT_BLOCK_CAPS.KNOWLEDGE_FILES_MAX +
  PROMPT_BLOCK_CAPS.KNOWLEDGE_ROW * PROMPT_BLOCK_CAPS.KNOWLEDGE_ROWS_MAX +
  PROMPT_BLOCK_CAPS.MODULES +
  PROMPT_BLOCK_CAPS.EVIDENCE +
  PROMPT_BLOCK_CAPS.OUTPUT_SCHEMA +
  400; // AU_CONTEXT + startup context + slot headings
