/**
 * OpenRouter provider — tries 8 free models in sequence.
 * OpenAI-compatible API with additional headers for tracking.
 */

import type { AICallOptions, AICallResult } from "../types.js";

const FREE_MODELS = [
  "deepseek/deepseek-v4-flash:free",
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "arcee-ai/trinity-large-thinking:free",
  "poolside/laguna-m.1:free",
  "poolside/laguna-xs.2:free",
  "baidu/cobuddy:free",
];

async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

export async function callOpenRouter(
  opts: AICallOptions,
  apiKey?: string,
  timeoutMs?: number,
): Promise<AICallResult> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY ?? "";
  if (!key) throw new Error("OpenRouter API key not configured");

  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;
  let lastErr: Error | null = null;

  for (const model of FREE_MODELS) {
    try {
      const res = await fetchWithTimeout(
        "https://openrouter.ai/api/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://blockid.au",
            "X-Title": "BlockID.au",
          },
          body: JSON.stringify({
            model,
            max_tokens: opts.maxTokens ?? 4096,
            messages: [
              { role: "system", content: opts.system },
              { role: "user", content: opts.user },
            ],
          }),
        },
        effectiveTimeout,
      );

      const raw = await res.text();
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${raw.slice(0, 200)}`);

      const data = JSON.parse(raw) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (data.error) throw new Error(data.error.message ?? "OpenRouter error");

      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty response");
      return { text, provider: "openrouter", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[ai-gateway:openrouter] ${model} failed: ${lastErr.message}`,
      );
    }
  }

  throw lastErr ?? new Error("All OpenRouter free models failed");
}
