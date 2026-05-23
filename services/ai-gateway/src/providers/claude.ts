/**
 * Claude provider — three modes:
 *   1. callClaudeProxy()  — TapHoaAPI proxy with multiple keys
 *   2. callClaudeOAuth()  — Claude CLI OAuth token from ~/.claude/.credentials.json
 *   3. callClaude()       — standard ANTHROPIC_API_KEY via SDK
 *
 * Proxy uses Haiku for quick tasks (<= 4096 tokens) and Sonnet for heavy reports.
 * OAuth and API key use Haiku for quick tasks and Sonnet for heavy tasks (tools or >1000 tokens).
 */

import Anthropic from "@anthropic-ai/sdk";
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

// ── Claude via API key (SDK) ────────────────────────────────────────

export async function callClaude(
  apiKey: string,
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const isHeavy = !!(opts.tools?.length || (opts.maxTokens && opts.maxTokens > 1000));
  const model = isHeavy ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  const client = new Anthropic({
    apiKey,
    timeout: timeoutMs ?? opts.timeoutMs ?? 30_000,
  });

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    ...(opts.tools?.length ? { tools: opts.tools as Anthropic.Messages.Tool[] } : {}),
  });

  // Handle agentic tool_use loop (for web search etc.)
  if (response.stop_reason === "tool_use" && opts.tools?.length) {
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
    for (const block of response.content) {
      if (block.type === "tool_use") {
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: "Search completed. Analyse results and return the JSON.",
        });
      }
    }

    const followUp = await client.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [
        { role: "user", content: opts.user },
        { role: "assistant", content: response.content },
        { role: "user", content: toolResults },
      ],
      ...(opts.tools?.length ? { tools: opts.tools as Anthropic.Messages.Tool[] } : {}),
    });

    let text = "";
    for (const block of followUp.content) {
      if (block.type === "text") text = block.text;
    }
    return { text, provider: "claude", model };
  }

  let text = "";
  for (const block of response.content) {
    if (block.type === "text") text = block.text;
  }
  return { text, provider: "claude", model };
}

// ── Claude via OAuth token ──────────────────────────────────────────

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export function readCliOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const credPath = path.join(home, ".claude", ".credentials.json");
    const raw = fs.readFileSync(credPath, "utf-8");
    const creds: OAuthCredentials = JSON.parse(raw);
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    // Skip if token expires within 5 minutes
    if (oauth.expiresAt && Date.now() > oauth.expiresAt - 5 * 60 * 1000) return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}

export async function callClaudeOAuth(
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const token = readCliOAuthToken();
  if (!token) throw new Error("Claude CLI OAuth token not available");

  const isHeavy = !!(opts.tools?.length || (opts.maxTokens && opts.maxTokens > 1000));
  const model = isHeavy ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;

  const res = await fetchWithTimeout(
    "https://api.anthropic.com/v1/messages",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
    },
    effectiveTimeout,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Claude OAuth ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = await res.json() as {
    content?: Array<{ type: string; text?: string }>;
  };

  let text = "";
  for (const block of data.content ?? []) {
    if (block.type === "text" && block.text) text = block.text;
  }
  if (!text) throw new Error("Empty Claude OAuth response");
  return { text, provider: "claude", model };
}

// ── Claude via proxy (TapHoaAPI) ────────────────────────────────────

export async function callClaudeProxy(
  baseURL: string,
  keys: string[],
  opts: AICallOptions,
  timeoutMs?: number,
): Promise<AICallResult> {
  const isHeavy = !!(opts.maxTokens && opts.maxTokens > 4096);
  const model = isHeavy ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";
  const maxTokens = isHeavy
    ? (opts.maxTokens ?? 8192)
    : Math.min(opts.maxTokens ?? 4096, 1500);
  const effectiveTimeout = timeoutMs ?? opts.timeoutMs ?? 30_000;

  let lastErr: Error | null = null;

  for (const key of keys) {
    try {
      const res = await fetchWithTimeout(
        `${baseURL}/messages`,
        {
          method: "POST",
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model,
            max_tokens: maxTokens,
            stream: false,
            system: opts.system,
            messages: [{ role: "user", content: opts.user }],
          }),
        },
        effectiveTimeout,
      );

      const raw = await res.text();
      if (!res.ok) throw new Error(`Proxy ${res.status}: ${raw.slice(0, 200)}`);

      // Parse — response may be JSON or SSE
      let text = "";
      if (raw.trimStart().startsWith("{")) {
        const data = JSON.parse(raw) as {
          content?: Array<{ type: string; text?: string }>;
        };
        for (const block of data.content ?? []) {
          if (block.type === "text" && block.text) text += block.text;
        }
      } else {
        // SSE stream response
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const d = JSON.parse(line.slice(6)) as {
              delta?: { text?: string };
              type?: string;
              content_block?: { text?: string };
            };
            if (d.delta?.text) text += d.delta.text;
            if (d.type === "content_block_start" && d.content_block?.text) {
              text += d.content_block.text;
            }
          } catch {
            /* skip malformed SSE lines */
          }
        }
      }

      if (text) return { text, provider: "claude", model };
      throw new Error("Empty response from proxy");
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(
        `[ai-gateway:proxy] key ${key.slice(0, 12)}... failed: ${lastErr.message}`,
      );
    }
  }

  throw lastErr ?? new Error("All proxy keys failed");
}
