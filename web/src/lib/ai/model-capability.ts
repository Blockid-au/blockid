// W1 (pricing v5 §7.2 #1, founder 2026-10-20) — one capability floor for every
// FREE model pool.
//
// Defect: classify calls were answered by Groq `allam-2-7b` (a 7B
// Arabic-focused checkpoint). The daily refresh ranked it into
// ai-free-models.json, `modelsForClass` let every model through for
// `classify`, and `demoteFlaky` then sorted the 0-failure 7B model above
// qwen3.8-27b. The ai-health cron took its "OK" as proof the AI stack was
// healthy.
//
// Rules (pure, id-based — no network):
//   1. A model whose id matches MODEL_DENY_PATTERNS (non-text endpoints,
//      safety classifiers, Arabic-only / speech checkpoints) is never used.
//   2. Otherwise it is admitted when it matches CAPABLE_MODEL_ALLOW (families
//      whose ids do not encode a size, or MoE ids whose active size is small),
//   3. or when the size its id encodes is ≥ MIN_FREE_MODEL_PARAMS_B.
//   Unknown size + no allow-list match → not admitted (fail closed).
//
// `isReportGradeModel` (report / synthesis on the free tiers) is stricter and
// lives in ai-client.ts; it also requires this floor.

/** Minimum parameter count (billions) for a free-pool model whose family is not allow-listed. */
export const MIN_FREE_MODEL_PARAMS_B = 20;

/** Never a text-completion model we want answering: speech / audio / safety / embedding / image / Arabic-only. */
export const MODEL_DENY_PATTERNS: readonly RegExp[] = [
  /allam/i,
  /\btts\b|orpheus|playai|speech|audio|\bstt\b/i,
  /whisper/i,
  /guard|safety|moderation/i,
  /embed|rerank/i,
  /lyria|imagen|\bimage\b|-image-|vision-only/i,
];

/** Families admitted without a size marker (ids rarely encode the effective size). */
export const CAPABLE_MODEL_ALLOW: readonly RegExp[] = [
  /gpt-oss-(120b|20b)/i,
  /nemotron-3(\.\d+)?-(super|ultra)/i,
  /qwen-?3(\.\d+)?[-_/]?.*?(27b|32b|80b|235b|max|next)/i,
  /deepseek/i,
  /kimi/i,
  /minimax-m\d/i,
  /glm-?\d/i,
  /llama-?4/i,
  /gemma-4-(26b|31b)/i,
  /gemini-(2\.5|3)(\.\d)?-(flash|pro)/i,
  /mistral-(small|medium|large)/i,
];

/**
 * Largest TOTAL parameter count (billions) an id encodes, e.g. `qwen-3.8-27b`
 * → 27, `Qwen3-235B-A22B` → 235, `lfm-2.5-2.6b` → 2.6. Active-parameter
 * markers (`a22b`, `a4b`) and expert counts (`8x7b`) are ignored. Null when
 * the id carries no size.
 */
export function parseParamBillions(id: string): number | null {
  let best: number | null = null;
  const re = /(^|[^a-z0-9.])(\d+(?:\.\d+)?)b(?![a-z0-9])/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(id)) !== null) {
    const n = Number(m[2]);
    if (Number.isFinite(n) && n > 0) best = best === null ? n : Math.max(best, n);
  }
  return best;
}

export function isDeniedModel(id: string): boolean {
  return MODEL_DENY_PATTERNS.some((re) => re.test(id));
}

/** True when a free-pool model clears the capability floor (deny list → allow list → size ≥ 20B). */
export function meetsCapabilityFloor(id: string): boolean {
  if (!id || isDeniedModel(id)) return false;
  if (CAPABLE_MODEL_ALLOW.some((re) => re.test(id))) return true;
  const size = parseParamBillions(id);
  return size !== null && size >= MIN_FREE_MODEL_PARAMS_B;
}

/**
 * Discovery-side screen (refresh-models / discover-models): drop denied ids
 * and ids whose ENCODED size is below the floor. Unknown-size ids still pass
 * here — the runtime floor (`meetsCapabilityFloor`) decides whether they are
 * ever dialled — so a new family can still be listed and probed.
 */
export function passesDiscoveryFloor(id: string): boolean {
  if (!id || isDeniedModel(id)) return false;
  if (CAPABLE_MODEL_ALLOW.some((re) => re.test(id))) return true;
  const size = parseParamBillions(id);
  return size === null || size >= MIN_FREE_MODEL_PARAMS_B;
}

/**
 * W1: does a health-check answer prove the AI stack is healthy? Only when it
 * is non-empty AND came from a model that clears the capability floor (a
 * Claude model counts — it is the subscription fallback). Groq `allam-2-7b`
 * answered every ai-health check while the capable chain was degraded.
 */
export function isRepresentativeHealthAnswer(model: string | undefined, text: string | undefined): boolean {
  if (!model || !text || !text.trim()) return false;
  if (/^claude-/i.test(model)) return true;
  return meetsCapabilityFloor(model);
}
