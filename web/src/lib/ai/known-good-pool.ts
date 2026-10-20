// Curated "known-good" free-model catalogue. Used as the auto-inject pool
// when the live provider chain hits a quota-exceeded model — the health-check
// cron prepends up to N of these into the active fallback chain, gated by
// which provider keys the runtime actually has.
//
// Keep entries here to models that have been verified free-tier reliable in
// production. A model here that starts answering a hard 404 / 402 (or fails
// 48 probes in a row) is excluded from the probe until the weekly discovery
// re-admits it (lib/ai/model-strikes) — but remove it here as well.

export interface KnownModel {
  provider: "groq" | "sambanova" | "cerebras" | "openrouter" | "chutes" | "cloudflare";
  model: string;
  family: string; // e.g. "llama-3.3", "qwen-2.5", "deepseek-r1"
  contextWindow?: number;
}

export const KNOWN_GOOD_FREE_MODELS: readonly KnownModel[] = [
  // W1 (pricing v5 §7.2 #3, 2026-10-20): the 15 entries that had answered
  // 404 / decommissioned on every 30-min probe since September (~1,760 strikes
  // each) are gone — Groq llama-3.3-70b-versatile (enterprise-only),
  // llama-3.1-8b-instant, mixtral-8x7b-32768, gemma2-9b-it; SambaNova
  // Meta-Llama-3.3-70B-Instruct (key 401), Llama-3.1-405B, DeepSeek-R1;
  // Cerebras llama-3.3-70b, llama3.1-8b, qwen-3-32b; OpenRouter
  // llama-3.3-70b / deepseek-r1 / qwen-2.5-72b / gemma-2-9b / mistral-7b :free.
  // Only ids that answered the probe (or the live catalogue lists) stay.
  // Cerebras (402 payment_required) and SambaNova (401 invalid key) have no
  // entry until the founder fixes billing / the key — their curated ladders in
  // ai-client still carry the live catalogue ids.

  // Groq — ~500 t/s
  { provider: "groq", model: "qwen/qwen3.8-27b", family: "qwen-3", contextWindow: 131_072 },
  { provider: "groq", model: "openai/gpt-oss-120b", family: "gpt-oss", contextWindow: 131_072 },
  { provider: "groq", model: "openai/gpt-oss-20b", family: "gpt-oss", contextWindow: 131_072 },

  // Chutes — awaits key wiring
  { provider: "chutes", model: "unsloth/Llama-3.3-70B-Instruct", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "chutes", model: "deepseek-ai/DeepSeek-R1", family: "deepseek-r1", contextWindow: 64_000 },

  // Cloudflare Workers AI
  { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", family: "llama-3.3", contextWindow: 24_000 },
  { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct", family: "qwen-2.5", contextWindow: 32_000 },
];

/** Families we bias discovery toward when ranking newly-found free models. */
export const KNOWN_GOOD_FAMILIES: readonly string[] = [
  // W1: families that answer today; mixtral / gemma-2 / llama-3.1 / mistral
  // (all sub-20B or decommissioned) no longer earn a ranking bonus.
  "qwen3",
  "gpt-oss",
  "deepseek",
  "nemotron-3",
  "gemma-4",
  "llama-3.3",
  "kimi",
  "minimax",
];

/** Return the subset of the pool whose provider has an active key at runtime. */
export function poolWithKeys(hasKey: (provider: string) => boolean): KnownModel[] {
  return KNOWN_GOOD_FREE_MODELS.filter((m) => hasKey(m.provider));
}
