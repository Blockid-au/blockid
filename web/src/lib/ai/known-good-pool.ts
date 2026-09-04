// Curated "known-good" free-model catalogue. Used as the auto-inject pool
// when the live provider chain hits a quota-exceeded model — the health-check
// cron prepends up to N of these into the active fallback chain, gated by
// which provider keys the runtime actually has.
//
// Keep entries here to models that have been verified free-tier reliable in
// production. If a model here goes paid or is removed, `verify-models` will
// catch it during the weekly ping and it'll drop out of the live chain.

export interface KnownModel {
  provider: "groq" | "sambanova" | "cerebras" | "openrouter" | "chutes" | "cloudflare";
  model: string;
  family: string; // e.g. "llama-3.3", "qwen-2.5", "deepseek-r1"
  contextWindow?: number;
}

export const KNOWN_GOOD_FREE_MODELS: readonly KnownModel[] = [
  // Groq — 400 RPM free tier, ~500 t/s
  { provider: "groq", model: "llama-3.3-70b-versatile", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "groq", model: "llama-3.1-8b-instant", family: "llama-3.1", contextWindow: 128_000 },
  { provider: "groq", model: "mixtral-8x7b-32768", family: "mixtral", contextWindow: 32_768 },
  { provider: "groq", model: "gemma2-9b-it", family: "gemma-2", contextWindow: 8_192 },

  // SambaNova — free tier, 294 TPS
  { provider: "sambanova", model: "Meta-Llama-3.3-70B-Instruct", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "sambanova", model: "Meta-Llama-3.1-405B-Instruct", family: "llama-3.1", contextWindow: 16_000 },
  { provider: "sambanova", model: "DeepSeek-R1", family: "deepseek-r1", contextWindow: 32_000 },

  // Cerebras — ultra-fast 2000 t/s
  { provider: "cerebras", model: "llama-3.3-70b", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "cerebras", model: "llama3.1-8b", family: "llama-3.1", contextWindow: 128_000 },
  { provider: "cerebras", model: "qwen-3-32b", family: "qwen-2.5", contextWindow: 32_000 },

  // OpenRouter free
  { provider: "openrouter", model: "meta-llama/llama-3.3-70b-instruct:free", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "openrouter", model: "deepseek/deepseek-r1:free", family: "deepseek-r1", contextWindow: 128_000 },
  { provider: "openrouter", model: "qwen/qwen-2.5-72b-instruct:free", family: "qwen-2.5", contextWindow: 32_000 },
  { provider: "openrouter", model: "google/gemma-2-9b-it:free", family: "gemma-2", contextWindow: 8_192 },
  { provider: "openrouter", model: "mistralai/mistral-7b-instruct:free", family: "mistral", contextWindow: 32_768 },

  // Chutes — awaits key wiring
  { provider: "chutes", model: "unsloth/Llama-3.3-70B-Instruct", family: "llama-3.3", contextWindow: 128_000 },
  { provider: "chutes", model: "deepseek-ai/DeepSeek-R1", family: "deepseek-r1", contextWindow: 64_000 },

  // Cloudflare Workers AI
  { provider: "cloudflare", model: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", family: "llama-3.3", contextWindow: 24_000 },
  { provider: "cloudflare", model: "@cf/qwen/qwen2.5-coder-32b-instruct", family: "qwen-2.5", contextWindow: 32_000 },
];

/** Families we bias discovery toward when ranking newly-found free models. */
export const KNOWN_GOOD_FAMILIES: readonly string[] = [
  "llama-3.3",
  "qwen-2.5",
  "deepseek-r1",
  "mixtral",
  "gemma-2",
  "llama-3.1",
  "mistral",
];

/** Return the subset of the pool whose provider has an active key at runtime. */
export function poolWithKeys(hasKey: (provider: string) => boolean): KnownModel[] {
  return KNOWN_GOOD_FREE_MODELS.filter((m) => hasKey(m.provider));
}
