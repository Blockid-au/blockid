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
import * as os from "os";
import * as path from "path";

// Embedded AI worker source. Written to a temp file as a last-resort fallback
// when no on-disk ai-worker.mjs can be found — e.g. an incomplete standalone
// deploy where the file wasn't copied alongside the server's cwd. Keeping a
// copy here means a missing worker file can never take down the whole AI stack.
// NOTE: keep this in sync with ai-worker.mjs (path uses pathname + search so
// query-string auth like Gemini's ?key= survives).
const AI_WORKER_SRC = `import https from 'https';
let input = '';
process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => {
  try {
    const { url, headers, body } = JSON.parse(input);
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname,
      port: 443,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
      timeout: 180000,
    }, res => {
      let data = '';
      res.on('data', c => { data += c.toString(); });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          process.stderr.write('HTTP ' + res.statusCode + ': ' + data.slice(0, 200));
          process.exit(1);
        }
        process.stdout.write(data);
      });
    });
    req.on('error', e => { process.stderr.write(e.message); process.exit(1); });
    req.on('timeout', () => { req.destroy(); process.stderr.write('timeout'); process.exit(1); });
    req.write(body);
    req.end();
  } catch (e) {
    process.stderr.write('[ai-worker] ' + e.message);
    process.exit(1);
  }
});
`;

// Resolve the ai-worker.mjs path once, with a self-healing temp-file fallback.
let cachedWorkerPath: string | null = null;
function resolveWorkerPath(): string {
  if (cachedWorkerPath && fs.existsSync(cachedWorkerPath)) return cachedWorkerPath;

  const candidates = [
    path.join(process.cwd(), "ai-worker.mjs"),
    "/app/ai-worker.mjs",
    path.join(process.cwd(), ".next", "standalone", "ai-worker.mjs"),
  ];
  // __dirname may be undefined in some bundling modes — guard the reference.
  try { if (typeof __dirname === "string") candidates.push(path.join(__dirname, "ai-worker.mjs")); } catch { /* ignore */ }

  const found = candidates.find(p => { try { return fs.existsSync(p); } catch { return false; } });
  if (found) { cachedWorkerPath = found; return found; }

  // Last resort: materialize the embedded worker to a temp file (write once).
  const tmp = path.join(os.tmpdir(), "blockid-ai-worker.mjs");
  if (!fs.existsSync(tmp)) fs.writeFileSync(tmp, AI_WORKER_SRC, "utf-8");
  console.warn(`[ai-worker] no on-disk worker found; using embedded fallback at ${tmp}`);
  cachedWorkerPath = tmp;
  return tmp;
}

/**
 * Call external API via ai-worker.mjs subprocess — bypasses Next.js Turbopack fetch patches
 * that silently hang on long-running API calls (>5s).
 */
function workerFetch(url: string, headers: Record<string, string>, body: string, timeoutMs = 30_000): Promise<string> {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const cp = eval('require')("child_process") as typeof import("child_process");
  /* eslint-enable @typescript-eslint/no-require-imports */
  const { spawn } = cp;

  return new Promise((resolve, reject) => {
    let workerPath: string;
    try {
      workerPath = resolveWorkerPath();
    } catch (err) {
      reject(new Error(`ai-worker.mjs not found and fallback failed: ${err instanceof Error ? err.message : String(err)}`));
      return;
    }

    console.log(`[ai-worker] spawn: worker=${workerPath} url=${url.slice(0, 40)}... timeout=${timeoutMs}ms`);

    const child = spawn("node", [workerPath]);
    let stdout = "";
    let stderr = "";
    let killed = false;

    const killTimer = setTimeout(() => {
      killed = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout.on("data", (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on("data", (d: Buffer) => { stderr += d.toString(); });
    child.on("close", (code: number) => {
      clearTimeout(killTimer);
      if (killed) reject(new Error(`Worker timeout (${Math.round(timeoutMs / 1000)}s)`));
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
  "gemini-2.5-flash": 0.0014,   // PAID: $0.30/1M input + $2.50/1M output averaged
  "llama-3.3-70b-versatile": 0, // Groq free tier
  "openai/gpt-oss-120b": 0,     // Groq free tier
  "openai/gpt-oss-20b": 0,      // Groq free tier
  "llama-3.1-8b-instant": 0,    // Groq free tier
  // Cerebras free tier
  "llama-3.3-70b": 0,
  "llama-3.1-8b": 0,
  // SambaNova free tier
  "DeepSeek-V3-0324": 0,
  "Meta-Llama-3.3-70B-Instruct": 0,
  "Qwen2.5-72B-Instruct": 0,
  "Meta-Llama-3.1-8B-Instruct": 0,
  // OpenRouter free models — all $0 cost
  "deepseek/deepseek-v4-flash:free": 0,
  "qwen/qwen3-coder:free": 0,
  "nvidia/nemotron-3-super-120b-a12b:free": 0,
  "openrouter/owl-alpha": 0,
  "openai/gpt-oss-120b:free": 0,
  "openai/gpt-oss-20b:free": 0,
  "moonshotai/kimi-k2.6:free": 0,
  "qwen/qwen3-next-80b-a3b-instruct:free": 0,
  "google/gemma-4-31b-it:free": 0,
  "google/gemma-4-26b-a4b-it:free": 0,
  "poolside/laguna-m.1:free": 0,
  "poolside/laguna-xs.2:free": 0,
  "nvidia/nemotron-3-nano-30b-a3b:free": 0,
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free": 0,
  "minimax/minimax-m2.5:free": 0,
  "meta-llama/llama-3.3-70b-instruct:free": 0,
  "z-ai/glm-4.5-air:free": 0,
  "nousresearch/hermes-3-llama-3.1-405b:free": 0,
  "nvidia/nemotron-nano-12b-v2-vl:free": 0,
  "nvidia/nemotron-nano-9b-v2:free": 0,
  "meta-llama/llama-3.2-3b-instruct:free": 0,
  "cognitivecomputations/dolphin-mistral-24b-venice-edition:free": 0,
  "liquid/lfm-2.5-1.2b-thinking:free": 0,
  "liquid/lfm-2.5-1.2b-instruct:free": 0,
  // Image generation models
  "gemini-2.5-flash-preview-image-generation": 0,  // Free with API key
  "google/gemini-2.5-flash-preview-image-generation": 0,
  "google/gemini-3.1-flash-image-preview": 0.0001,
  "gpt-image-1": 0.04,              // ~$0.04 per standard image
  "x-ai/grok-imagine-image-quality": 0.05,
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
  /** Worker subprocess timeout in ms. Default 30s. Use 180_000 for long reports. */
  timeoutMs?: number;
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

type Provider = "claude-oauth" | "claude-apikey" | "claude-proxy" | "openai-codex" | "openai-apikey" | "gemini" | "groq" | "openrouter" | "cerebras" | "sambanova" | "ollama" | "none";

function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];
  // ──────────────────────────────────────────────────────────────────────
  // PRIORITY: Subscription (best quality) → FREE (unlimited) → Local
  // NO paid API keys — zero marginal cost only.
  //
  // Benchmark intelligence (May 2026):
  //   S-tier (52+): Claude Sonnet 4.6, o3-mini, DeepSeek V3/V4, Kimi K2.6
  //   A-tier (40-50): Qwen3, Nemotron 120B, gpt-oss-120b, GLM-5
  //   B-tier (35-42): Llama 3.3 70B, Gemma 4, gpt-4o-mini
  //   C-tier (<35):  Llama 3.1 8B, small models
  // ──────────────────────────────────────────────────────────────────────

  // ── Ranked: free/fast first, paid/slow last ────────────────────────────
  // 1. Claude OAuth — Sonnet 4.6 (subscription, no extra cost)
  if (readCliOAuthToken()) providers.push("claude-oauth");
  // 2. Proxy — Sonnet 4.6 (shared key)
  if (process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) providers.push("claude-proxy");
  else if (getDBKey("anthropic_proxy")) providers.push("claude-proxy");
  // 3. OpenRouter — 24+ free models (Kimi K2.6, DeepSeek V4, etc.)
  if (process.env.OPENROUTER_API_KEY) providers.push("openrouter");
  else if (getDBKey("openrouter")) providers.push("openrouter");
  // 4. SambaNova — DeepSeek V3 (free)
  if (process.env.SAMBANOVA_API_KEY) providers.push("sambanova");
  else if (getDBKey("sambanova")) providers.push("sambanova");
  // 5. Cerebras — gpt-oss-120b (free, 30 RPM)
  if (process.env.CEREBRAS_API_KEY) providers.push("cerebras");
  else if (getDBKey("cerebras")) providers.push("cerebras");
  // 6. Groq — fastest inference (free tier)
  if (process.env.GROQ_API_KEY) providers.push("groq");
  else if (getDBKey("groq")) providers.push("groq");
  // 7. Ollama — local backup
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_ENABLED === "true") providers.push("ollama");
  // 8. Codex OAuth — low priority (often expires, slow)
  if (readCodexOAuthToken()) providers.push("openai-codex");

  // ❌ Gemini / Anthropic API / OpenAI API — DISABLED
  return providers;
}

export function isAIConfigured(): boolean {
  return getAvailableProviders().length > 0;
}

// ── Claude call ────────────────────────────────────────────────────────

async function callClaude(apiKey: string, opts: AICallOptions): Promise<AICallResult> {
  const isOAuth = apiKey.startsWith("sk-ant-oat");
  // Always use Sonnet 4.6 (S-tier, score 52) — subscription = no extra cost.
  const model = "claude-sonnet-4-6";

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
    }), opts.timeoutMs);
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

  // Always try strongest model first — subscription = no extra cost per call.
  // o3-mini (S-tier reasoning) → gpt-4.1-mini (B-tier) → gpt-4o-mini (B-tier fallback)
  const models = ["o3-mini", "gpt-4.1-mini", "gpt-4o-mini"];

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
      }, JSON.stringify(body), opts.timeoutMs);

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
    opts.timeoutMs,
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

  // Groq models ranked by benchmark, all free tier:
  // gpt-oss-120b (A-tier ~44, 500t/s) > llama-3.3-70b (B-tier ~42, 280t/s)
  // > gpt-oss-20b (C-tier ~34, 1000t/s) > llama-3.1-8b (C-tier ~28, 560t/s)
  const GROQ_MODELS = [
    "openai/gpt-oss-120b",       // A-tier: 117B MoE, best quality
    "llama-3.3-70b-versatile",    // B-tier: 70B, reliable general
    "openai/gpt-oss-20b",        // C-tier: 20B, fast
    "llama-3.1-8b-instant",       // C-tier: 8B, ultra-fast fallback
  ];

  let lastErr: Error | null = null;
  for (const model of GROQ_MODELS) {
    try {
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
      }), opts.timeoutMs);

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "Groq error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Groq response");
      return { text, provider: "groq", model };
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] Groq ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All Groq models failed");
}

// ── Cerebras (OpenAI-compatible, free tier, ultra-fast inference) ─────
// Free: 30 RPM, 60K TPM, ~1M tokens/day. No credit card required.
// API: https://api.cerebras.ai/v1 (OpenAI-compatible)

async function callCerebras(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.CEREBRAS_API_KEY ?? getDBKey("cerebras")?.api_key ?? "";
  if (!apiKey) throw new Error("Cerebras API key not configured");

  // Cerebras models ranked by benchmark:
  // gpt-oss-120b (A-tier ~44) > llama-3.3-70b (B-tier ~42) > llama-3.1-8b (C-tier ~28)
  const CEREBRAS_MODELS = [
    "openai/gpt-oss-120b",    // A-tier: 117B MoE, best quality on Cerebras
    "llama-3.3-70b",           // B-tier: Llama 3.3 70B, reliable
    "llama-3.1-8b",            // C-tier: 8B fast fallback
  ];

  let lastErr: Error | null = null;
  for (const model of CEREBRAS_MODELS) {
    try {
      const raw = await workerFetch("https://api.cerebras.ai/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), opts.timeoutMs);

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "Cerebras error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty Cerebras response");
      return { text, provider: "groq" as const, model }; // reuse "groq" provider type for compat
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] Cerebras ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All Cerebras models failed");
}

// ── SambaNova (OpenAI-compatible, free tier, high throughput) ─────────
// Free: ~294 TPS, DeepSeek + Llama + Qwen models. No credit card.
// API: https://api.sambanova.ai/v1 (OpenAI-compatible)

async function callSambaNova(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.SAMBANOVA_API_KEY ?? getDBKey("sambanova")?.api_key ?? "";
  if (!apiKey) throw new Error("SambaNova API key not configured");

  // SambaNova models ranked by benchmark intelligence score:
  // DeepSeek-V3 (score ~50) > Qwen2.5-72B (~46) > Llama-3.3-70B (~42) > Llama-3.1-8B (~28)
  const SAMBANOVA_MODELS = [
    "DeepSeek-V3-0324",            // S-tier: DeepSeek V3, best open-source reasoning
    "Qwen2.5-72B-Instruct",        // A-tier: Qwen 2.5 72B, strong structured output
    "Meta-Llama-3.3-70B-Instruct",  // B-tier: Llama 3.3 70B, reliable general
    "Meta-Llama-3.1-8B-Instruct",   // C-tier: Llama 3.1 8B, fast fallback
  ];

  let lastErr: Error | null = null;
  for (const model of SAMBANOVA_MODELS) {
    try {
      const raw = await workerFetch("https://api.sambanova.ai/v1/chat/completions", {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      }, JSON.stringify({
        model,
        max_tokens: Math.min(opts.maxTokens ?? 4096, 8192),
        temperature: 0.7,
        messages: [
          { role: "system", content: opts.system },
          { role: "user", content: opts.user },
        ],
      }), opts.timeoutMs);

      const data = JSON.parse(raw);
      if (data.error) throw new Error(data.error.message ?? "SambaNova error");
      const text = data.choices?.[0]?.message?.content ?? "";
      if (!text) throw new Error("Empty SambaNova response");
      return { text, provider: "groq" as const, model }; // reuse "groq" provider type for compat
    } catch (err) {
      lastErr = err instanceof Error ? err : new Error(String(err));
      console.warn(`[ai-client] SambaNova ${model} failed: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("All SambaNova models failed");
}

// ── OpenRouter (OpenAI-compatible, free models) ──────────────────────

async function callOpenRouter(opts: AICallOptions): Promise<AICallResult> {
  const apiKey = process.env.OPENROUTER_API_KEY ?? getDBKey("openrouter")?.api_key ?? "";
  if (!apiKey) throw new Error("OpenRouter API key not configured");

  // Free models ranked by intelligence benchmark (May 2026).
  // S-tier (50+) → A-tier (42-50) → B-tier (35-42) → C-tier (<35)
  // Last updated: 2026-05-30 — 24 free models for maximum uptime.
  const FREE_MODELS = [
    // ── S-tier: Frontier-class free models (score 47-54) ────────────
    "moonshotai/kimi-k2.6:free",                          // 262K ctx, score ~54, Moonshot best
    "deepseek/deepseek-v4-flash:free",                    // 1M ctx, score ~47, MoE 284B reasoning
    "minimax/minimax-m2.5:free",                          // 205K ctx, score ~50, matches Opus on SWE-bench
    "qwen/qwen3-next-80b-a3b-instruct:free",             // 262K ctx, score ~46, Qwen3 next-gen
    "qwen/qwen3-coder:free",                              // 1M ctx, score ~45, strongest free coding

    // ── A-tier: Strong general-purpose (score 40-47) ────────────────
    "nvidia/nemotron-3-super-120b-a12b:free",             // 1M ctx, NVIDIA 120B, excellent reports
    "openai/gpt-oss-120b:free",                           // 131K ctx, OpenAI 117B MoE open-weight
    "z-ai/glm-4.5-air:free",                              // 131K ctx, Zhipu GLM 4.5 (GLM-5 family)
    "openrouter/owl-alpha",                                // 1M ctx, OpenRouter agentic model
    "nousresearch/hermes-3-llama-3.1-405b:free",          // 131K ctx, 405B params — largest free

    // ── B-tier: Solid quality, reliable (score 35-42) ───────────────
    "google/gemma-4-31b-it:free",                         // 262K ctx, Gemma 4 multimodal
    "meta-llama/llama-3.3-70b-instruct:free",             // 131K ctx, Meta Llama 3.3 70B
    "google/gemma-4-26b-a4b-it:free",                     // 262K ctx, Gemma 4 smaller
    "poolside/laguna-m.1:free",                           // 262K ctx, Poolside coding agent
    "nvidia/nemotron-3-nano-30b-a3b:free",                // 256K ctx, NVIDIA 30B
    "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free", // 256K ctx, NVIDIA reasoning
    "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", // 33K ctx, Mistral 24B

    // ── C-tier: Fast fallback / small models (score <35) ────────────
    "openai/gpt-oss-20b:free",                            // 131K ctx, OpenAI 20B fast
    "poolside/laguna-xs.2:free",                          // 262K ctx, Poolside small
    "nvidia/nemotron-nano-12b-v2-vl:free",                // 128K ctx, NVIDIA 12B vision
    "nvidia/nemotron-nano-9b-v2:free",                    // 128K ctx, NVIDIA 9B
    "meta-llama/llama-3.2-3b-instruct:free",              // 131K ctx, Meta 3B ultra-fast
    "liquid/lfm-2.5-1.2b-thinking:free",                  // 33K ctx, Liquid 1.2B thinking
    "liquid/lfm-2.5-1.2b-instruct:free",                  // 33K ctx, Liquid 1.2B instruct
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
      }), opts.timeoutMs);

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
  // Always use Sonnet 4.6 (S-tier) — maximize quality for every call.
  const model = "claude-sonnet-4-6";
  const maxTokens = opts.maxTokens ?? 8192;

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
      }), opts.timeoutMs);

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
    case "cerebras":
      return callCerebras(noTools);
    case "sambanova":
      return callSambaNova(noTools);
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

// ── AI Gateway (microservice) ─────────────────────────────────────────
// Phase 1 Strangler Fig: try the standalone AI Gateway service first.
// If it's not available or returns an error, fall back to local providers.

const AI_GATEWAY_URL = process.env.AI_GATEWAY_URL; // e.g. "http://ai-gateway:4010" or "http://127.0.0.1:4010"
const AI_GATEWAY_SECRET = process.env.AI_GATEWAY_SECRET;

let gatewayAvailable = true; // assume available until proven otherwise
let gatewayBackoffUntil = 0; // timestamp — skip gateway until this time

async function callViaGateway(opts: AICallOptions): Promise<AICallResult | null> {
  if (!AI_GATEWAY_URL || !AI_GATEWAY_SECRET) return null;
  if (Date.now() < gatewayBackoffUntil) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? 30_000);

    const res = await fetch(`${AI_GATEWAY_URL}/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": AI_GATEWAY_SECRET,
      },
      body: JSON.stringify({
        system: opts.system,
        user: opts.user,
        maxTokens: opts.maxTokens,
        timeoutMs: opts.timeoutMs,
        tools: opts.tools,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn(`[ai-client] Gateway returned ${res.status}: ${body.slice(0, 200)}`);
      // 503 = all providers failed, 429 = budget exceeded — don't back off, just fallback
      if (res.status >= 500) {
        gatewayBackoffUntil = Date.now() + 60_000; // back off 1 min
      }
      return null;
    }

    const data = await res.json();
    if (!data.ok) return null;

    gatewayAvailable = true;
    return { text: data.text, provider: data.provider, model: data.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Connection refused = service not running, back off 5 min
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      gatewayAvailable = false;
      gatewayBackoffUntil = Date.now() + 300_000; // 5 min
      console.warn("[ai-client] Gateway unavailable (ECONNREFUSED), falling back to local for 5 min");
    } else {
      console.warn(`[ai-client] Gateway error: ${msg}, falling back to local`);
    }
    return null;
  }
}

// ── Unified entry point (with auto-fallback) ───────────────────────────

// Track recently failed providers — skip them for 2 minutes to avoid wasting time
const providerCooldown = new Map<string, number>();

export async function callAI(opts: AICallOptions): Promise<AICallResult> {
  // Phase 1: Try AI Gateway microservice first (if configured)
  const gatewayResult = await callViaGateway(opts);
  if (gatewayResult) return gatewayResult;

  // Fallback: local provider chain (existing behavior)
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

  // Only use FREE and subscription providers — NO paid API keys (Gemini, Anthropic, OpenAI)
  const freeProviders: Provider[] = [];
  // 100% free providers first
  if (process.env.OPENROUTER_API_KEY || getDBKey("openrouter")) freeProviders.push("openrouter");
  if (process.env.GROQ_API_KEY || getDBKey("groq")) freeProviders.push("groq");
  if (process.env.CEREBRAS_API_KEY || getDBKey("cerebras")) freeProviders.push("cerebras");
  if (process.env.SAMBANOVA_API_KEY || getDBKey("sambanova")) freeProviders.push("sambanova");
  // Subscription providers (fixed cost, not per-call)
  if (readCliOAuthToken()) freeProviders.push("claude-oauth");
  if (readCodexOAuthToken()) freeProviders.push("openai-codex");
  // NOTE: Gemini EXCLUDED — it costs $0.30-$2.50/1M tokens, NOT free

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
