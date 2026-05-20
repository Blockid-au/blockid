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

// ── Admin-configured keys from Supabase ───────────────────────────────
// Cache DB keys for 5 minutes to avoid hitting Supabase on every AI call.

interface DBKey { provider: string; api_key: string; base_url: string | null; is_active: boolean }
let dbKeysCache: { keys: DBKey[]; fetchedAt: number } | null = null;
const DB_KEYS_TTL = 5 * 60 * 1000; // 5 min

async function getDBKeys(): Promise<DBKey[]> {
  if (dbKeysCache && Date.now() - dbKeysCache.fetchedAt < DB_KEYS_TTL) {
    return dbKeysCache.keys;
  }
  try {
    // Dynamic import to avoid circular deps and keep module lightweight
    const { getSupabaseAdmin } = await import("@/lib/supabase");
    const supabase = getSupabaseAdmin();
    if (!supabase) return [];
    const { data } = await supabase
      .from("ai_provider_keys")
      .select("provider, api_key, base_url, is_active")
      .eq("is_active", true);
    const keys = (data ?? []) as DBKey[];
    dbKeysCache = { keys, fetchedAt: Date.now() };
    return keys;
  } catch {
    return dbKeysCache?.keys ?? [];
  }
}

function getDBKey(provider: string): DBKey | undefined {
  return dbKeysCache?.keys.find((k) => k.provider === provider && k.is_active);
}

/** Force refresh DB keys cache (call after admin updates keys) */
export function invalidateAIKeysCache(): void {
  dbKeysCache = null;
}

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
  // Priority: OAuth tokens first (free, auto-refresh) → Proxy → API keys → Gemini
  // 1. Codex OAuth (OpenAI — active, auto-refreshes via CLI)
  if (readCodexOAuthToken()) providers.push("openai-codex");
  // 2. Claude CLI OAuth (active when CLI is open, auto-refreshes)
  if (readCliOAuthToken()) providers.push("claude-oauth");
  // 3. Proxy (TapHoaAPI — paid third-party, multi-key)
  if (process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) providers.push("claude-proxy");
  else if (getDBKey("anthropic_proxy")) providers.push("claude-proxy");
  // 4. Anthropic API key (env or DB)
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude-apikey");
  else if (getDBKey("anthropic")) providers.push("claude-apikey");
  // 5. OpenAI API key (env or DB)
  if (process.env.OPENAI_API_KEY) providers.push("openai-apikey");
  else if (getDBKey("openai")) providers.push("openai-apikey");
  // 6. Gemini (free tier fallback)
  if (process.env.GOOGLE_GEMINI_API_KEY) providers.push("gemini");
  else if (getDBKey("gemini")) providers.push("gemini");
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

// ── OpenAI Codex OAuth call (uses OAuth token from ~/.codex/auth.json) ──

async function callCodex(opts: AICallOptions): Promise<AICallResult> {
  const token = readCodexOAuthToken();
  if (!token) throw new Error("Codex OAuth token not available");

  // Use OpenAI SDK with the Codex OAuth token
  const OpenAI = (await import("openai")).default;
  const client = new OpenAI({ apiKey: token });

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

async function callClaudeProxy(opts: AICallOptions): Promise<AICallResult> {
  const dbProxy = getDBKey("anthropic_proxy");
  const baseURL = process.env.ANTHROPIC_PROXY_BASE_URL ?? dbProxy?.base_url ?? "";
  const envKeys = (process.env.ANTHROPIC_PROXY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const dbKeys = dbProxy?.api_key ? dbProxy.api_key.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const keys = [...new Set([...envKeys, ...dbKeys])]; // deduplicate
  const model = opts.tools?.length ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      // Use raw fetch — proxy returns SSE stream which SDK may not handle
      const res = await fetch(`${baseURL}/messages`, {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          max_tokens: opts.maxTokens ?? 4096,
          stream: false,
          system: opts.system,
          messages: [{ role: "user", content: opts.user }],
        }),
      });

      const contentType = res.headers.get("content-type") ?? "";

      if (contentType.includes("text/event-stream")) {
        // Parse SSE stream manually
        const raw = await res.text();
        let text = "";
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.delta?.text) text += d.delta.text;
            if (d.type === "content_block_start" && d.content_block?.text) text += d.content_block.text;
          } catch { /* skip non-JSON lines */ }
        }
        if (text) return { text, provider: "claude", model };
        throw new Error("Empty SSE response from proxy");
      }

      // Standard JSON response
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? `Proxy ${res.status}`);
      let text = "";
      for (const block of (data.content ?? [])) {
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
      return callClaude(process.env.ANTHROPIC_API_KEY ?? getDBKey("anthropic")?.api_key ?? "", opts);
    case "claude-proxy":
      return callClaudeProxy(opts);
    case "openai-codex":
      return callCodex(noTools);
    case "openai-apikey":
      return callOpenAI(process.env.OPENAI_API_KEY ?? getDBKey("openai")?.api_key ?? "", noTools);
    case "gemini": {
      // Inject DB key into process.env temporarily for Gemini SDK
      const dbGemini = getDBKey("gemini");
      if (!process.env.GOOGLE_GEMINI_API_KEY && dbGemini) {
        process.env.GOOGLE_GEMINI_API_KEY = dbGemini.api_key;
      }
      return callGemini(noTools);
    }
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Unified entry point (with auto-fallback) ───────────────────────────

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  // Pre-load admin-configured keys from Supabase (cached 5 min)
  await getDBKeys();

  const providers = getAvailableProviders();

  if (providers.length === 0) {
    throw new Error(
      "No AI provider configured. Set up keys in Admin → AI Keys, or configure env vars."
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
