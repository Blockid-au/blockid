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

// ── Budget tracking ($100/month cap) ───────────────────────────────────
// Tracks estimated cost per provider per month. Persisted to disk so it
// survives container restarts. When budget exceeded, provider is skipped.

const MONTHLY_BUDGET_USD = 100;
const BUDGET_FILE = "/tmp/blockid-ai-budget.json";

// Rough cost estimates per 1K tokens (input+output averaged)
const COST_PER_1K: Record<string, number> = {
  "claude-haiku-4-5-20251001": 0.001,
  "claude-sonnet-4-6": 0.015,
  "gpt-4o-mini": 0.0003,
  "gemini-2.0-flash": 0.0001, // free tier / very cheap
};

interface BudgetData {
  month: string; // "2026-05"
  totalUSD: number;
  calls: number;
}

function currentMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function readBudget(): BudgetData {
  try {
    const raw = fs.readFileSync(BUDGET_FILE, "utf-8");
    const data: BudgetData = JSON.parse(raw);
    if (data.month !== currentMonth()) {
      return { month: currentMonth(), totalUSD: 0, calls: 0 };
    }
    return data;
  } catch {
    return { month: currentMonth(), totalUSD: 0, calls: 0 };
  }
}

function writeBudget(data: BudgetData): void {
  try {
    fs.writeFileSync(BUDGET_FILE, JSON.stringify(data));
  } catch { /* ignore write errors */ }
}

function trackCost(model: string, estimatedTokens: number): void {
  const costPer1K = COST_PER_1K[model] ?? 0.001;
  const cost = (estimatedTokens / 1000) * costPer1K;
  const budget = readBudget();
  budget.totalUSD += cost;
  budget.calls += 1;
  writeBudget(budget);
}

function isBudgetExceeded(): boolean {
  return readBudget().totalUSD >= MONTHLY_BUDGET_USD;
}

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

// ── OpenAI Codex CLI OAuth ─────────────────────────────────────────────

function readCodexOAuthToken(): string | null {
  try {
    const home = process.env.HOME ?? "/root";
    const authPath = path.join(home, ".codex", "auth.json");

    if (!fs.existsSync(authPath)) {
      return process.env.CODEX_ACCESS_TOKEN ?? null;
    }

    const raw = fs.readFileSync(authPath, "utf-8");
    const creds = JSON.parse(raw);

    // Codex stores tokens at: { tokens: { access_token, refresh_token, id_token } }
    const tokens = creds.tokens ?? {};
    const token = tokens.access_token ?? creds.access_token ?? creds.OPENAI_API_KEY;
    if (!token) return process.env.CODEX_ACCESS_TOKEN ?? null;

    return token;
  } catch {
    return process.env.CODEX_ACCESS_TOKEN ?? null;
  }
}

// ── Provider detection ─────────────────────────────────────────────────

type Provider = "claude-oauth" | "claude-apikey" | "claude-proxy" | "openai-codex" | "openai-apikey" | "gemini" | "none";

function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];
  // Priority: Proxy (paid third-party) → Claude OAuth → Anthropic key → Codex → OpenAI → Gemini
  if (process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) providers.push("claude-proxy");
  if (readCliOAuthToken()) providers.push("claude-oauth");
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude-apikey");
  if (readCodexOAuthToken()) providers.push("openai-codex");
  if (process.env.OPENAI_API_KEY) providers.push("openai-apikey");
  if (process.env.GOOGLE_GEMINI_API_KEY) providers.push("gemini");
  return providers;
}

export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}

// ── Claude call ────────────────────────────────────────────────────────

async function callClaude(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  // sk-ant-api* = standard API key, sk-ant-oat* = OAuth token
  const isOAuth = apiKey.startsWith("sk-ant-oat");
  const client = new Anthropic(
    isOAuth ? { authToken: apiKey } : { apiKey },
  );

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

// ── OpenAI call (API key) ──────────────────────────────────────────────

async function callOpenAI(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey });

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

// ── OpenAI Codex CLI call (uses codex exec subprocess) ─────────────────

async function callCodex(opts: AICallOptions): Promise<AICallResult> {
  const { execSync } = await import("child_process");

  const prompt = `${opts.system}\n\n---\n\n${opts.user}`;
  const tmpPrompt = `/tmp/codex-prompt-${Date.now()}.txt`;
  const tmpOut = `/tmp/codex-out-${Date.now()}.txt`;
  fs.writeFileSync(tmpPrompt, prompt);

  try {
    execSync(
      `cat "${tmpPrompt}" | codex exec -o "${tmpOut}"`,
      { timeout: 90_000, maxBuffer: 2 * 1024 * 1024, encoding: "utf-8", shell: "/bin/bash" }
    );
    const text = fs.readFileSync(tmpOut, "utf-8").trim();
    return { text, provider: "openai", model: "codex-chatgpt" };
  } finally {
    try { fs.unlinkSync(tmpPrompt); } catch { /* ignore */ }
    try { fs.unlinkSync(tmpOut); } catch { /* ignore */ }
  }
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

async function callClaudeProxy(opts: AICallOptions): Promise<AICallResult> {
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const baseURL = process.env.ANTHROPIC_PROXY_BASE_URL!;
  // Support comma-separated keys for auto-rotation
  const keys = (process.env.ANTHROPIC_PROXY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const model = opts.tools?.length ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      const client = new Anthropic({ apiKey: key, baseURL });
      const response = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        ...(opts.tools?.length ? { tools: opts.tools } : {}),
      });
      let text = "";
      for (const block of response.content) {
        if (block.type === "text") text = block.text;
      }
      return { text, provider: "claude", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] proxy key ${key.slice(0, 12)}... failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All proxy keys failed");
}

async function callProvider(provider: Provider, opts: AICallOptions): Promise<AICallResult> {
  const noTools = { ...opts, tools: undefined };
  switch (provider) {
    case "claude-oauth":
      return callClaude(readCliOAuthToken()!, opts);
    case "claude-apikey":
      return callClaude(process.env.ANTHROPIC_API_KEY!, opts);
    case "claude-proxy":
      return callClaudeProxy(opts);
    case "openai-codex":
      return callCodex(noTools);
    case "openai-apikey":
      return callOpenAI(process.env.OPENAI_API_KEY!, noTools);
    case "gemini":
      return callGemini(noTools);
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

  // Budget check — refuse if monthly cap exceeded
  if (isBudgetExceeded()) {
    const budget = readBudget();
    throw new Error(
      `Monthly AI budget exceeded ($${budget.totalUSD.toFixed(2)} / $${MONTHLY_BUDGET_USD}). Resets next month.`
    );
  }

  let lastError: Error | null = null;

  for (const provider of providers) {
    try {
      const result = await callProvider(provider, opts);
      // Track estimated cost (rough: input+output ~2x input tokens)
      const estimatedTokens = Math.ceil((opts.system.length + opts.user.length) / 3) * 2;
      trackCost(result.model, estimatedTokens);
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
    return new Anthropic({ authToken: oauthToken });
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
