/**
 * Google Gemini provider — Gemini 2.5 Flash via REST API.
 * Uses free credit quota as a mid-priority fallback.
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

export async function callGemini(
  opts: AICallOptions,
  apiKey?: string,
  timeoutMs?: number,
): Promise<AICallResult> {
  const key = apiKey ?? process.env.GOOGLE_GEMINI_API_KEY ?? "";
  if (!key) throw new Error("Gemini API key not configured");

  const model = "gemini-2.5-flash";
  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;

  const res = await fetchWithTimeout(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: opts.system }] },
        contents: [{ role: "user", parts: [{ text: opts.user }] }],
        generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096 },
      }),
    },
    effectiveTimeout,
  );

  const raw = await res.text();
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${raw.slice(0, 200)}`);

  const data = JSON.parse(raw) as {
    error?: { message?: string };
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
  };

  if (data.error) throw new Error(data.error.message ?? "Gemini error");

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty Gemini response");
  return { text, provider: "gemini", model };
}
