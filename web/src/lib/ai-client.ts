/**
 * Unified AI client — priority chain:
 *   1. Claude CLI OAuth token (~/.claude/.credentials.json)
 *   2. ANTHROPIC_API_KEY env var
 *   3. OpenAI (OPENAI_API_KEY) — ChatGPT / GPT-4o-mini
 *   4. Google Gemini (GOOGLE_GEMINI_API_KEY) — free quota fallback
 *
 * All AI routes use `callAI()` which returns a plain text response.
 * This abstracts away the provider so routes don't care which model runs.
 *
 * Fallback: if the primary provider fails (rate limit, auth error, etc.),
 * the system automatically tries the next available provider in the chain.
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
  /** Tools for Claude (e.g. web_search). Ignored by OpenAI/Gemini. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
}

interface AICallResult {
  text: string;
  provider: "claude" | "openai" | "gemini";
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

type Provider = "claude-oauth" | "claude-apikey" | "openai" | "gemini" | "none";

function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];
  if (readCliOAuthToken()) providers.push("claude-oauth");
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude-apikey");
  if (process.env.OPENAI_API_KEY) providers.push("openai");
  if (process.env.GOOGLE_GEMINI_API_KEY) providers.push("gemini");
  return providers;
}

export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}

// ── Claude call ────────────────────────────────────────────────────────

async function callClaude(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey, authToken: apiKey });

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

// ── OpenAI call ────────────────────────────────────────────────────────

async function callOpenAI(opts: AICallOptions): Promise<AICallResult> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  return { text, provider: "openai", model };
}

// ── Gemini call ────────────────────────────────────────────────────────

async function callGemini(opts: AICallOptions): Promise<AICallResult> {
  const { GoogleGenerativeAI } = await import("@google/generative-ai");
  const genAI = new GoogleGenerativeAI(process.env.GOOGLE_GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

  const result = await model.generateContent({
    systemInstruction: opts.system,
    contents: [{ role: "user", parts: [{ text: opts.user }] }],
    generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096 },
  });

  const text = result.response.text();
  return { text, provider: "gemini", model: "gemini-2.0-flash" };
}

// ── Provider caller map ────────────────────────────────────────────────

async function callProvider(provider: Provider, opts: AICallOptions): Promise<AICallResult> {
  switch (provider) {
    case "claude-oauth":
      return callClaude(readCliOAuthToken()!, opts);
    case "claude-apikey":
      return callClaude(process.env.ANTHROPIC_API_KEY!, opts);
    case "openai":
      return callOpenAI({ ...opts, tools: undefined }); // OpenAI doesn't use Claude tools
    case "gemini":
      return callGemini({ ...opts, tools: undefined }); // Gemini doesn't use Claude tools
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Unified entry point (with auto-fallback) ───────────────────────────

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  const providers = getAvailableProviders();

  if (providers.length === 0) {
    throw new Error(
      "No AI provider configured. Set up Claude CLI, ANTHROPIC_API_KEY, OPENAI_API_KEY, or GOOGLE_GEMINI_API_KEY."
    );
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, opts);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] ${provider} failed: ${lastError.message}. Trying next provider...`);
    }
  }

  throw lastError ?? new Error("All AI providers failed");
}

// ── Legacy compat — getAnthropicClient for term-sheet (uses parse() API) ──

export function getAnthropicClient() {
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
