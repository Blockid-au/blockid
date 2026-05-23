/**
 * OpenAI provider — two modes:
 *   1. callOpenAI()  — standard OPENAI_API_KEY via SDK (gpt-4o-mini)
 *   2. callCodex()   — Codex CLI OAuth token from ~/.codex/auth.json
 *
 * Codex smart-selects model: o3-mini for heavy analysis, gpt-4o-mini for quick tasks.
 * Falls back through multiple models if the primary is unavailable.
 */

import OpenAI from "openai";
import * as fs from "node:fs";
import * as path from "node:path";
import type { AICallOptions, AICallResult } from "../types.js";

// ── Helper: fetch with AbortController timeout ──────────────────────

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

// ── OpenAI via API key (SDK) ────────────────────────────────────────

export async function callOpenAI(
  apiKey: string,
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const client = new OpenAI({
    apiKey,
    timeout: timeoutMs ?? opts.timeoutMs ?? 30_000,
  });

  const model = "gpt-4o-mini";

  const response = await client.chat.completions.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  });

  const text = response.choices[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty OpenAI response");
  return { text, provider: "openai", model };
}

// ── Codex CLI OAuth ─────────────────────────────────────────────────

export function readCodexOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const authPath = path.join(home, ".codex", "auth.json");

    if (!fs.existsSync(authPath)) {
      return process.env.CODEX_ACCESS_TOKEN ?? null;
    }

    const raw = fs.readFileSync(authPath, "utf-8");
    const creds = JSON.parse(raw) as {
      tokens?: { access_token?: string };
      access_token?: string;
      OPENAI_API_KEY?: string;
    };

    const tokens = creds.tokens ?? {};
    const token =
      tokens.access_token ?? creds.access_token ?? creds.OPENAI_API_KEY;
    if (!token) return process.env.CODEX_ACCESS_TOKEN ?? null;

    return token;
  } catch {
    return process.env.CODEX_ACCESS_TOKEN ?? null;
  }
}

export async function callCodex(
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const token = readCodexOAuthToken();
  if (!token) throw new Error("Codex OAuth token not available");

  // Smart model selection: o3-mini for heavy analysis, gpt-4o-mini for quick tasks
  const isHeavy = (opts.maxTokens && opts.maxTokens > 1000) || opts.user.length > 2000;
  const models = isHeavy
    ? ["o3-mini", "gpt-4.1-mini", "gpt-4o-mini"]
    : ["gpt-4o-mini", "gpt-4.1-mini"];

  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;
  let lastError: Error | null = null;

  for (const model of models) {
    try {
      const isReasoning = model === "o3-mini";
      const body: Record<string, unknown> = {
        model,
        messages: [
          {
            role: isReasoning ? "developer" : "system",
            content: opts.system,
          },
          { role: "user", content: opts.user },
        ],
      };

      if (isReasoning) {
        body.reasoning_effort = "medium";
        body.max_completion_tokens = opts.maxTokens ?? 4096;
      } else {
        body.max_tokens = opts.maxTokens ?? 4096;
      }

      const res = await fetchWithTimeout(
        "https://api.openai.com/v1/chat/completions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        },
        effectiveTimeout,
      );

      const raw = await res.text();
      const data = JSON.parse(raw) as {
        error?: { message?: string };
        choices?: Array<{ message?: { content?: string } }>;
      };

      if (data.error) {
        throw new Error(
          data.error.message ?? `OpenAI error: ${JSON.stringify(data.error)}`,
        );
      }

      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Codex response");
      return { text, provider: "openai", model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[ai-gateway:codex] ${model} failed: ${lastError.message}. Trying next model...`,
      );
    }
  }

  throw lastError ?? new Error("All Codex models failed");
}
