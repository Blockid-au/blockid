/**
 * Unified AI client — priority chain:
 *   1. Claude CLI OAuth token (~/.claude/.credentials.json)
 *   2. ANTHROPIC_API_KEY env var
 *   3. Google Gemini (GOOGLE_GEMINI_API_KEY) — free quota fallback
 *
 * All AI routes use `callAI()` which returns a plain text response.
 * This abstracts away the provider so routes don't care which model runs.
 */

import * as fs from "fs";
import * as path from "path";

// ── Types ──────────────────────────────────────────────────────────────

interface OAuthCredentials {
  claudeAiOauth?: {
    accessToken?: string;
    refreshToken?: string;
    expiresAt?: number;
  };
}

export interface AICallOptions {
  system: string;
  user: string;
  maxTokens?: number;
  /** Tools for Claude (e.g. web_search). Ignored by Gemini. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
}

interface AICallResult {
  text: string;
  provider: "claude" | "gemini";
  model: string;
}

// ── Claude CLI OAuth ───────────────────────────────────────────────────

function readCliOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const credPath = path.join(home, ".claude", ".credentials.json");
    const raw = fs.readFileSync(credPath, "utf-8");
    const creds: OAuthCredentials = JSON.parse(raw);
    const oauth = creds.claudeAiOauth;
    if (!oauth?.accessToken) return null;
    if (oauth.expiresAt && Date.now() > oauth.expiresAt - 5 * 60 * 1000) return null;
    return oauth.accessToken;
  } catch {
    return null;
  }
}

// ── Provider detection ─────────────────────────────────────────────────

type Provider = "claude-oauth" | "claude-apikey" | "gemini" | "none";

function detectProvider(): Provider {
  if (readCliOAuthToken()) return "claude-oauth";
  if (process.env.ANTHROPIC_API_KEY) return "claude-apikey";
  if (process.env.GOOGLE_GEMINI_API_KEY) return "gemini";
  return "none";
}

export function isAIConfigured(): boolean {
  return detectProvider() !== "none";
}

// ── Claude call ────────────────────────────────────────────────────────

async function callClaude(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({
    apiKey,
    authToken: apiKey,
  });

  const model = opts.tools?.length ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  const response = await client.messages.create({
    model,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
    ...(opts.tools?.length ? { tools: opts.tools } : {}),
  });

  // Handle agentic tool_use loop (for web search etc.)
  if (response.stop_reason === "tool_use" && opts.tools?.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolResults: any[] = [];
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
      ...(opts.tools?.length ? { tools: opts.tools } : {}),
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

// ── Gemini call ────────────────────────────────────────────────────────

async function callGemini(opts: AICallOptions): Promise<AICallResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent({
    systemInstruction: opts.system,
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: {
      maxOutputTokens: opts.maxTokens ?? 4096,
    },
  });

  const text = result.response.text();
  return { text, provider: "gemini", model: "gemini-2.0-flash" };
}

// ── Unified entry point ────────────────────────────────────────────────

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  const provider = detectProvider();

  if (provider === "none") {
    throw new Error("No AI provider configured. Set up Claude CLI, ANTHROPIC_API_KEY, or GOOGLE_GEMINI_API_KEY.");
  }

  // Try Claude first
  if (provider === "claude-oauth" || provider === "claude-apikey") {
    const apiKey = provider === "claude-oauth"
      ? readCliOAuthToken()!
      : process.env.ANTHROPIC_API_KEY!;

    try {
      return await callClaude(apiKey, opts);
    } catch (err) {
      console.warn(`[ai-client] Claude failed (${provider}), trying Gemini fallback:`, err instanceof Error ? err.message : err);

      // Fallback to Gemini if available
      if (process.env.GOOGLE_GEMINI_API_KEY) {
        const geminiOpts = { ...opts, tools: undefined }; // Gemini doesn't support Claude tools
        return await callGemini(geminiOpts);
      }
      throw err;
    }
  }

  // Gemini primary (no tools support)
  const geminiOpts = { ...opts, tools: undefined };
  return await callGemini(geminiOpts);
}

// ── Legacy compat — keep getAnthropicClient for term-sheet (uses parse()) ──

export function getAnthropicClient() {
  // Dynamic import not possible here since term-sheet needs sync client
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Anthropic = require("@anthropic-ai/sdk").default;

  const oauthToken = readCliOAuthToken();
  if (oauthToken) {
    return new Anthropic({ apiKey: oauthToken, authToken: oauthToken });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  throw new Error("No Anthropic credentials for term-sheet analysis");
}

export function isAnthropicConfigured(): boolean {
  if (readCliOAuthToken()) return true;
  if (process.env.ANTHROPIC_API_KEY) return true;
  return false;
}
