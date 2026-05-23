/**
 * Groq provider — OpenAI-compatible API, free tier.
 * Uses llama-3.3-70b-versatile with max 8000 tokens.
 */

import type { AICallOptions, AICallResult } from "../types.js";

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

export async function callGroq(
  opts: AICallOptions,
  apiKey?: string,
  timeoutMs?: number,
): Promise<AICallResult> {
  const key = apiKey ?? process.env.GROQ_API_KEY ?? "";
  if (!key) throw new Error("Groq API key not configured");

  const model = "llama-3.3-70b-versatile";
  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;

  const res = await fetchWithTimeout(
    "https://api.groq.com/openai/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8000),
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }),
    },
    effectiveTimeout,
  );

  const raw = await res.text();
  if (!res.ok) throw new Error(`Groq ${res.status}: ${raw.slice(0, 200)}`);

  const data = JSON.parse(raw) as {
    error?: { message?: string };
    choices?: Array<{ message?: { content?: string } }>;
  };

  if (data.error) throw new Error(data.error.message ?? "Groq error");

  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty Groq response");
  return { text, provider: "groq", model };
}
