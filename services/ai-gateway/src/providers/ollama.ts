/**
 * Ollama provider — local LLM inference, last-resort fallback.
 * Connects to Ollama server via HTTP (default: http://172.19.0.1:11434).
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

export async function callOllama(
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";
  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 120_000; // local models can be slow

  const res = await fetchWithTimeout(
    `${host}/api/generate`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        system: opts.system,
        prompt: opts.user,
        stream: false,
        options: {
          num_predict: opts.maxTokens ?? 2048,
          temperature: 0.7,
        },
      }),
    },
    effectiveTimeout,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Ollama ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { response?: string };
  const text = data.response ?? "";
  if (!text) throw new Error("Empty Ollama response");
  return { text, provider: "ollama", model };
}
