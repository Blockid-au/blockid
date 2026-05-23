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

/**
 * Call external API via ai-worker.mjs subprocess — bypasses Next.js Turbopack fetch patches
 * that silently hang on long-running API calls (>5s).
 */
function workerFetch(url: string, headers: Record<string, string>, body: string): Promise<string> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const cp = eval('require')("child_process") as typeof import("child_process");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { spawn } = cp;

  return new Promise((resolve, reject) => {
    const workerPath = [
      path.join(process.cwd(), "ai-worker.mjs"),
      "/app/ai-worker.mjs",
    ].find(p => fs.existsSync(p));

    console.log(`[ai-worker] spawn: worker=${workerPath} url=${url.slice(0, 40)}...`);

    if (!workerPath) {
      reject(new Error("ai-worker.mjs not found"));
      return;
    }

    const child = spawn("node", [workerPath]);
    let stdout = "";
    let stderr = "";
    let killed = false;

    // Hard kill after 30s — fail fast, let retry use next provider
    const killTimer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, 30_000);

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number) => {
      clearTimeout(killTimer);
      if (killed) reject(new Error("Worker timeout (60s)"));
      else if (code === 0 && stdout) resolve(stdout);
      else reject(new Error(stderr || `Worker exited ${code}`));
    });
    child.on("error", (err) => { clearTimeout(killTimer); reject(err); });

    child.stdin.write(JSON.stringify({ url, headers, body }));
    child.stdin.end();
  });
}

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
  "o3-mini": 0.0055,
  "gpt-4.1-mini": 0.002,
  "gemini-2.5-flash": 0.0001,
  "llama-3.3-70b-versatile": 0, // Groq free tier
  "deepseek/deepseek-v4-flash:free": 0, // OpenRouter free
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
  provider: "claude" | "openai" | "gemini" | "groq" | "openrouter" | "ollama";
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

type Provider = "claude-oauth" | "claude-apikey" | "claude-proxy" | "openai-codex" | "openai-apikey" | "gemini" | "groq" | "openrouter" | "ollama" | "none";

function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];
  // Priority: TapHoaAPI (expiring key, use ASAP) → Claude → Gemini → Groq → OpenRouter → paid → local
  // 1. TapHoaAPI proxy (active key, use before it expires)
  if (process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) providers.push("claude-proxy");
  else if (getDBKey("anthropic_proxy")) providers.push("claude-proxy");
  // 2. Claude CLI OAuth (subscription — Sonnet for reports, Haiku for quick)
  if (readCliOAuthToken()) providers.push("claude-oauth");
  // 3. Codex CLI OAuth (ChatGPT subscription)
  if (readCodexOAuthToken()) providers.push("openai-codex");
  // 4. Gemini 2.5 Flash (free credit)
  if (process.env.GOOGLE_GEMINI_API_KEY) providers.push("gemini");
  else if (getDBKey("gemini")) providers.push("gemini");
  // 5. Groq (free tier — llama-3.3-70b, 30 req/min)
  if (process.env.GROQ_API_KEY) providers.push("groq");
  else if (getDBKey("groq")) providers.push("groq");
  // 6. OpenRouter (free models)
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  else if (getDBKey("openrouter")) providers.push("openrouter");
  // 7. Anthropic API key (paid)
  if (process.env.ANTHROPIC_API_KEY) providers.push("claude-apikey");
  else if (getDBKey("anthropic")) providers.push("claude-apikey");
  // 8. OpenAI API key (paid)
  if (process.env.OPENAI_API_KEY) providers.push("openai-apikey");
  else if (getDBKey("openai")) providers.push("openai-apikey");
  // 9. Ollama local LLM (last resort)
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_ENABLED === "true") providers.push("ollama");
  return providers;
}

export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}

// ── Claude call ────────────────────────────────────────────────────────

async function callClaude(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const isOAuth = apiKey.startsWith("sk-ant-oat");
  // Use best model based on task: Sonnet for reports (>1000 tokens), Haiku for quick tasks
  const isHeavy = opts.tools?.length || (opts.maxTokens && opts.maxTokens > 1000);
  const model = isHeavy ? "claude-sonnet-4-6" : "claude-haiku-4-5-20251001";

  // Use raw fetch for OAuth tokens — SDK may send wrong header format
  if (isOAuth) {
    const raw = await workerFetch("https://api.anthropic.com/v1/messages", {
      "Authorization": `Bearer ${apiKey}`,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    }, JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system,
      messages: [{ role: "user", content: opts.user }],
    }));
    const data = JSON.parse(raw);
    let text = "";
    for (const block of (data.content ?? [])) {
      if (block.type === "text") text = block.text;
    }
    return { text, provider: "claude", model };
  }

  // Standard API key — use SDK
  const Anthropic = (await import("@anthropic-ai/sdk")).default;
  const client = new Anthropic({ apiKey });

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

// ── OpenAI Codex OAuth call (uses ChatGPT/Codex subscription token) ──
// Model selection:
//   - o3-mini: reasoning model for SVI analysis, reports, complex tasks (>1000 tokens)
//   - gpt-4o-mini: fast model for quick tasks, summaries (<1000 tokens)
// Falls back to gpt-4.1-mini if o3-mini is unavailable.

async function callCodex(opts: AICallOptions): Promise<AICallResult> {
  const token = readCodexOAuthToken();
  if (!token) throw new Error("Codex OAuth token not available");

  // Smart model selection: o3-mini for heavy analysis, gpt-4o-mini for quick tasks
  const isHeavy = (opts.maxTokens && opts.maxTokens > 1000) || opts.user.length > 2000;
  const models = isHeavy
    ? ["o3-mini", "gpt-4.1-mini", "gpt-4o-mini"]
    : ["gpt-4o-mini", "gpt-4.1-mini"];

  let lastError: Error | null = null;

  for (const model of models) {
    try {
      // o3-mini uses "reasoning_effort" instead of "max_tokens"
      const isReasoning = model === "o3-mini";
      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: isReasoning ? "developer" : "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      };

      if (isReasoning) {
        body.reasoning_effort = "medium";
        body.max_completion_tokens = opts.maxTokens ?? 4096;
      } else {
        body.max_tokens = opts.maxTokens ?? 4096;
      }

      const raw = await workerFetch("https://api.openai.com/v1/chat/completions", {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      }, JSON.stringify(body));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const data = JSON.parse(raw) as any;
      if (data.error) throw new Error(data.error.message ?? `OpenAI error: ${JSON.stringify(data.error)}`);
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Codex response");
      return { text, provider: "openai", model };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client:codex] ${model} failed: ${lastError.message}. Trying next model...`);
    }
  }

  throw lastError ?? new Error("All Codex models failed");
}

// ── Gemini call ────────────────────────────────────────────────────────

async function callGemini(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY ?? getDBKey("gemini")?.api_key ?? "";
  if (!apiKey) throw new Error("Gemini API key not configured");

  const model = "gemini-2.5-flash";
  // Use workerFetch to bypass Next.js fetch patches (same as Claude/Groq)
  const raw = await workerFetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    { "Content-Type": "application/json" },
    JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: [{ text: opts.user }] }],
      generationConfig: { maxOutputTokens: opts.maxTokens ?? 4096 },
    }),
  );

  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error.message ?? "Gemini error");
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  if (!text) throw new Error("Empty Gemini response");
  return { text, provider: "gemini", model };
}

// ── Groq (OpenAI-compatible, free tier, llama-3.3-70b) ────────────────

async function callGroq(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.GROQ_API_KEY ?? getDBKey("groq")?.api_key ?? "";
  if (!apiKey) throw new Error("Groq API key not configured");

  const model = "llama-3.3-70b-versatile";
  const raw = await workerFetch("https://api.groq.com/openai/v1/chat/completions", {
    "Authorization": `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  }, JSON.stringify({
    model,
    max_tokens: Math.min(opts.maxTokens ?? 4096, 8000), // Groq free limit
    temperature: 0.7,
    messages: [
      { role: "system", content: opts.system },
      { role: "user", content: opts.user },
    ],
  }));

  const data = JSON.parse(raw);
  if (data.error) throw new Error(data.error.message ?? "Groq error");
  const text = data.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("Empty Groq response");
  return { text, provider: "groq", model };
}

// ── OpenRouter (OpenAI-compatible, free models) ──────────────────────

async function callOpenRouter(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? getDBKey("openrouter")?.api_key ?? "";
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  // Try multiple free models — extensive fallback list for maximum availability
  const FREE_MODELS = [
    "deepseek/deepseek-v4-flash:free",        // 1M context, strong reasoning
    "google/gemma-4-31b-it:free",             // Google Gemma 4, 262K context
    "google/gemma-4-26b-a4b-it:free",         // Google Gemma 4 smaller variant
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // NVIDIA reasoning model
    "arcee-ai/trinity-large-thinking:free",   // Thinking/reasoning model
    "poolside/laguna-m.1:free",               // Poolside medium model
    "poolside/laguna-xs.2:free",              // Poolside XS fallback
    "baidu/cobuddy:free",                     // Baidu model, 131K context
  ];

  let lastErr: Error | null = null;
  for (const model of FREE_MODELS) {
    try {
      const raw = await workerFetch("https://openrouter.ai/api/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://blockid.au",
        "X-Title": "BlockID.au",
      }, JSON.stringify({
        model,
        max_tokens: opts.maxTokens ?? 4096,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }));

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "OpenRouter error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty response");
      return { text, provider: "openrouter", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] OpenRouter ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All OpenRouter free models failed");
}

// ── Ollama local LLM (GPU-accelerated, on-server fallback) ────────────

async function callOllama(opts: AICallOptions): Promise<AICallResult> {
  const host = process.env.OLLAMA_HOST ?? "http://localhost:11434";
  const model = process.env.OLLAMA_MODEL ?? "qwen2.5:3b";

  const res = await fetch(`${host}/api/generate`, {
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
  });

  if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return { text: data.response ?? "", provider: "ollama", model };
}

// ── Provider caller map ────────────────────────────────────────────────


async function callClaudeProxy(opts: AICallOptions): Promise<AICallResult> {
  const dbProxy = getDBKey("anthropic_proxy");
  const baseURL = process.env.ANTHROPIC_PROXY_BASE_URL ?? dbProxy?.base_url ?? "";
  const envKeys = (process.env.ANTHROPIC_PROXY_API_KEY ?? "").split(",").map((k) => k.trim()).filter(Boolean);
  const dbKeys = dbProxy?.api_key ? dbProxy.api_key.split(",").map((k) => k.trim()).filter(Boolean) : [];
  const keys = [...new Set([...envKeys, ...dbKeys])];
  // Proxy: haiku + capped tokens to stay within 30s gateway timeout
  const model = "claude-haiku-4-5-20251001";
  const maxTokens = Math.min(opts.maxTokens ?? 4096, 1500); // Cap at 1500 for proxy speed

  let lastErr: Error | null = null;
  for (const key of keys) {
    try {
      const raw = await workerFetch(`${baseURL}/messages`, {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: maxTokens,
        stream: false,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }));

      // Parse — may be JSON or SSE
      let text = "";
      if (raw.trimStart().startsWith("{")) {
        const data = JSON.parse(raw);
        for (const block of (data.content ?? [])) {
          if (block.type === "text") text += block.text;
        }
      } else {
        for (const line of raw.split("\n")) {
          if (!line.startsWith("data: ") || line.includes("[DONE]")) continue;
          try {
            const d = JSON.parse(line.slice(6));
            if (d.delta?.text) text += d.delta.text;
            if (d.type === "content_block_start" && d.content_block?.text) text += d.content_block.text;
          } catch { /* skip */ }
        }
      }
      if (text) return { text, provider: "claude", model };
      throw new Error("Empty response from proxy");
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
    case "groq":
      return callGroq(noTools);
    case "openrouter":
      return callOpenRouter(noTools);
    case "gemini": {
      const dbGemini = getDBKey("gemini");
      if (!process.env.GOOGLE_GEMINI_API_KEY && dbGemini) {
        process.env.GOOGLE_GEMINI_API_KEY = dbGemini.api_key;
      }
      return callGemini(noTools);
    }
    case "ollama":
      return callOllama(noTools);
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

// ── Unified entry point (with auto-fallback) ───────────────────────────

// Track recently failed providers — skip them for 2 minutes to avoid wasting time
const providerCooldown = new Map<string, number>();

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  await getDBKeys();

  const allProviders = getAvailableProviders();
  const now = Date.now();
  // Skip providers that failed in the last 2 minutes
  const providers = allProviders.filter(p => {
    const cooldownUntil = providerCooldown.get(p) ?? 0;
    return now > cooldownUntil;
  });
  // If all providers are on cooldown, try them all anyway
  const effectiveProviders = providers.length > 0 ? providers : allProviders;

  if (effectiveProviders.length === 0) {
    throw new Error(
      "No AI provider configured. Set up keys in Admin → AI Keys, or configure env vars."
    );
  }

  if (isBudgetExceeded()) {
    const budget = readBudget();
    throw new Error(
      `Monthly AI budget exceeded ($${budget.totalUSD.toFixed(2)} / $${MONTHLY_BUDGET_USD}). Resets next month.`
    );
  }

  let lastError: Error | null = null;

  for (const provider of effectiveProviders) {
    try {
      const result = await callProvider(provider, opts);
      const estimatedTokens = Math.ceil((opts.system.length + opts.user.length) / 3) * 2;
      trackCost(result.model, estimatedTokens);
      return result;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      // Put failed provider on 2-minute cooldown so next pages skip it instantly
      providerCooldown.set(provider, Date.now() + 120_000);
      console.warn(`[ai-client] ${provider} failed (cooldown 2min): ${lastError.message}`);
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

// ── Agent Self-Upgrade AI Call ─────────────────────────────────────────
// Uses ONLY subscription/free models — zero additional API cost.
// Priority: Claude CLI OAuth → Codex CLI → Gemini → Groq → OpenRouter
// NEVER uses paid API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, proxy).

export async function callAIForUpgrade(opts: AICallOptions): Promise<AICallResult | null> {
  await getDBKeys(); // ensure cache is warm

  // Only use subscription and free providers — no paid API keys
  const freeProviders: Provider[] = [];
  if (readCliOAuthToken()) freeProviders.push("claude-oauth");
  if (readCodexOAuthToken()) freeProviders.push("openai-codex");
  if (process.env.GOOGLE_GEMINI_API_KEY || getDBKey("gemini")) freeProviders.push("gemini");
  if (process.env.GROQ_API_KEY || getDBKey("groq")) freeProviders.push("groq");
  if (process.env.OPENROUTER_API_KEY || getDBKey("openrouter")) freeProviders.push("openrouter");

  if (freeProviders.length === 0) {
    console.warn("[ai-client] No free/subscription providers available for upgrade task. Skipping.");
    return null;
  }

  for (const provider of freeProviders) {
    try {
      const result = await callProvider(provider, opts);
      // Track cost (should be $0 for subscription/free)
      const estimatedTokens = Math.ceil((opts.system.length + opts.user.length) / 3) * 2;
      trackCost(result.model, estimatedTokens);
      console.log(`[ai-client:upgrade] Success via ${provider} (${result.model})`);
      return result;
    } catch (err) {
      console.warn(`[ai-client:upgrade] ${provider} failed: ${err instanceof Error ? err.message : err}. Trying next...`);
    }
  }

  console.warn("[ai-client:upgrade] All free providers failed. Upgrade task skipped.");
  return null;
}

// ── Codex device auth info (for admin UI login link) ─────────────────

export const CODEX_DEVICE_AUTH = {
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  authUrl: "https://auth.openai.com/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  deviceAuthUrl: "https://auth.openai.com/oauth/device/code",
  scopes: "openai.chat openai.models.read",
};

export function getCodexAuthStatus(): {
  hasToken: boolean;
  tokenSource: "file" | "env" | "none";
  authFilePath: string;
} {
  const home = process.env.HOME ?? "/root";
  const authPath = path.join(home, ".codex", "auth.json");
  const hasFile = fs.existsSync(authPath);
  const hasEnv = !!process.env.CODEX_ACCESS_TOKEN;
  return {
    hasToken: !!readCodexOAuthToken(),
    tokenSource: hasFile ? "file" : hasEnv ? "env" : "none",
    authFilePath: authPath,
  };
}

// ── Check if off-peak hours (AEST = UTC+10/11) ───────────────────────
export function isOffPeakHours(): boolean {
  const now = new Date();
  const aestHour = (now.getUTCHours() + 10) % 24; // UTC+10 (AEST, ignoring DST)
  // Off-peak: 10pm (22) to 6am (6) AEST
  return aestHour >= 22 || aestHour < 6;
}

// ── Check if budget allows upgrade tasks ──────────────────────────────
export function canRunUpgradeTasks(): boolean {
  const budget = readBudget();
  // Only run upgrades if budget usage is under 80%
  return budget.totalUSD < MONTHLY_BUDGET_USD * 0.8;
}

// ── Get current AI budget usage ────────────────────────────────────────
export function getAIBudgetStatus(): { month: string; spent: number; limit: number; percent: number; calls: number } {
  const b = readBudget();
  return {
    month: b.month,
    spent: Math.round(b.totalUSD * 100) / 100,
    limit: MONTHLY_BUDGET_USD,
    percent: Math.round((b.totalUSD / MONTHLY_BUDGET_USD) * 100),
    calls: b.calls,
  };
}
