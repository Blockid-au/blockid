// W1 (pricing v5 §7.2 #5) — ONE price table for AI cost ledgers.
//
// Before W1 there were three: ANTHROPIC_PRICING_USD_PER_1M (anthropic-tier),
// PAID_PRICING_USD_PER_1M (ai-client) and MODEL_PRICING_USD_PER_1M
// (call-structured, a copy of the Anthropic one). The ai_runs ledger priced a
// DeepInfra-answered call at the Claude list price because call-structured
// only knew Claude. Every ledger now prices from this module. (The policy-pinned
// admission table in report-attempt-budget.ts stays separate on purpose: it is
// integer micro-USD tied to REPORT_PRICE_POLICY; the full single model
// catalogue is lane A1.)
//
// Units: USD per 1M tokens, standard tier, no cache / batch discount.

export interface PricePer1M {
  in: number;
  out: number;
}

/** Anthropic first-party list price (Sep 2026). Cache reads 10 %, writes 125 % (anthropic-tier). */
export const ANTHROPIC_PRICING_USD_PER_1M: Record<string, PricePer1M> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
};

/** Dated / alias ids billed as their base model. */
const ANTHROPIC_ALIASES: Record<string, string> = {
  "claude-haiku-4-5-20251001": "claude-haiku-4-5",
};

/** USD per 1M tokens for the quality-cost providers, keyed `provider:model`
 *  (a model id like `openai/gpt-oss-120b` exists on both Groq (free) and
 *  DeepInfra (paid), so the provider is part of the key). */
export const PAID_PRICING_USD_PER_1M: Record<string, PricePer1M> = {
  // DeepInfra — verified 2026-09-15, re-observed unchanged 2026-10-20
  "deepinfra:deepseek-ai/DeepSeek-V4-Flash": { in: 0.09, out: 0.18 },
  "deepinfra:deepseek-ai/DeepSeek-V3.2": { in: 0.26, out: 0.38 },
  "deepinfra:Qwen/Qwen3-VL-235B-A22B-Instruct": { in: 0.20, out: 0.88 },
  "deepinfra:Qwen/Qwen3-235B-A22B-Instruct-2507": { in: 0.09, out: 0.55 },
  "deepinfra:openai/gpt-oss-120b": { in: 0.037, out: 0.17 },
  "deepinfra:meta-llama/Llama-3.3-70B-Instruct-Turbo": { in: 0.10, out: 0.32 },
  "deepinfra:moonshotai/Kimi-K2.6": { in: 0.75, out: 3.50 },
  "deepinfra:deepseek-ai/DeepSeek-V4-Pro": { in: 1.30, out: 2.60 },
  // A1 (pricing v5 §7.3 challengers) — public feed api.deepinfra.com/v1/openai/models,
  // 2026-10-20. Not report-admitted; priced so a challenger call is ledgered at
  // its real cost. GLM-5.3-Flash carries a 50 % promo ending 2026-10-20 23:59 UTC
  // (feed `discount_ends_at`) — the nightly sync-prices drift alert catches the
  // step-up; update this row when it does.
  "deepinfra:deepseek-ai/DeepSeek-V4-Flash-0731": { in: 0.06, out: 0.18 },
  "deepinfra:deepseek-ai/DeepSeek-V4.1-Flash": { in: 0.20, out: 0.60 },
  "deepinfra:zai-org/GLM-5.3-Flash": { in: 0.15, out: 0.50 },
  "deepinfra:Qwen/Qwen3-VL-30B-A3B-Instruct": { in: 0.15, out: 0.60 },
  "deepinfra:google/gemma-4-31B-it": { in: 0.20, out: 0.40 },
  // Gemini — paid tier, standard, text, prompts ≤ 200k; output includes
  // thinking tokens. W1: verified on ai.google.dev/gemini-api/docs/pricing
  // 2026-10-20 — the 3.x previews are NOT billed as their 2.5 siblings
  // (the old rows under-stated 3-flash 40 %/17 %, 3.1-pro 38 %/17 %).
  "gemini:gemini-2.5-flash": { in: 0.30, out: 2.50 },
  "gemini:gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
  "gemini:gemini-2.5-pro": { in: 1.25, out: 10 },
  "gemini:gemini-3-flash-preview": { in: 0.50, out: 3.00 },
  "gemini:gemini-3.1-pro-preview": { in: 2.00, out: 12.00 },
  "gemini:gemini-3.1-flash-lite": { in: 0.25, out: 1.50 },
};

/** Providers whose calls cost nothing per token (free tiers / subscription). */
const ZERO_COST_PROVIDERS = new Set(["groq", "cerebras", "sambanova", "openrouter", "ollama", "claude-oauth", "claude-proxy"]);

/**
 * The price row for a call. `provider` is the dispatcher provider that
 * answered (`deepinfra`, `gemini`, `claude-apikey`, …) or undefined for a
 * bare Anthropic model id. Returns null when unknown — the caller decides
 * (estimate, or record 0 and keep the token counts for a back-fill).
 */
export function priceFor(provider: string | undefined, model: string): PricePer1M | null {
  if (provider) {
    const row = PAID_PRICING_USD_PER_1M[`${provider}:${model}`];
    if (row) return row;
    if (ZERO_COST_PROVIDERS.has(provider)) return { in: 0, out: 0 };
  }
  if (!provider || /^claude/.test(provider)) {
    const base = ANTHROPIC_ALIASES[model] ?? model;
    return ANTHROPIC_PRICING_USD_PER_1M[base] ?? null;
  }
  return null;
}

/** Exact USD for a call from the provider's reported usage; null when the
 *  `provider:model` pair has no PAID price row (free tiers included — the
 *  dispatcher treats null as "estimate or zero"). */
export function usageCostUsd(provider: string, model: string, inputTokens: number, outputTokens: number): number | null {
  const price = PAID_PRICING_USD_PER_1M[`${provider}:${model}`];
  if (!price) return null;
  return round8((inputTokens / 1_000_000) * price.in + (outputTokens / 1_000_000) * price.out);
}

/** USD for token counts at `priceFor(provider, model)`; null when unpriced. */
export function costUsdFor(provider: string | undefined, model: string, inputTokens: number, outputTokens: number): number | null {
  const p = priceFor(provider, model);
  if (!p) return null;
  return round8((Math.max(0, inputTokens) / 1_000_000) * p.in + (Math.max(0, outputTokens) / 1_000_000) * p.out);
}

function round8(usd: number): number {
  return Math.round(usd * 1e8) / 1e8;
}
