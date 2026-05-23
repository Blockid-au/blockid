/**
 * POST /generate — main AI generation endpoint.
 *
 * Request body:
 *   { system: string, user: string, maxTokens?: number, timeoutMs?: number, tools?: any[] }
 *
 * Response:
 *   { ok: true, text: string, provider: string, model: string }
 *   { ok: false, error: string }
 *
 * Provider priority:
 *   proxy -> claude-oauth -> codex -> gemini -> groq -> openrouter -> claude-apikey -> openai-apikey -> ollama
 *
 * Failed providers go on a 2-minute cooldown so subsequent requests skip them instantly.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { AICallOptions, AICallResult, Provider } from "../types.js";
import { getDBKeys, getDBKey } from "../db-keys.js";
import { trackCost, isBudgetExceeded, getBudgetStatus } from "../budget.js";

// Providers
import {
  callClaude,
  callClaudeOAuth,
  callClaudeProxy,
  readCliOAuthToken,
} from "../providers/claude.js";
import { callOpenAI, callCodex, readCodexOAuthToken } from "../providers/openai.js";
import { callGemini } from "../providers/gemini.js";
import { callGroq } from "../providers/groq.js";
import { callOpenRouter } from "../providers/openrouter.js";
import { callOllama } from "../providers/ollama.js";

// ── Cooldown tracking ───────────────────────────────────────────────

const providerCooldown = new Map<string, number>();
const COOLDOWN_MS = 120_000; // 2 minutes

// ── Provider detection ──────────────────────────────────────────────

function getAvailableProviders(): Provider[] {
  const providers: Provider[] = [];

  // 1. Proxy (active key, use before it expires)
  if (process.env.ANTHROPIC_PROXY_API_KEY && process.env.ANTHROPIC_PROXY_BASE_URL) {
    providers.push("claude-proxy");
  } else if (getDBKey("anthropic_proxy")) {
    providers.push("claude-proxy");
  }

  // 2. Claude CLI OAuth (subscription)
  if (readCliOAuthToken()) providers.push("claude-oauth");

  // 3. Codex CLI OAuth (ChatGPT subscription)
  if (readCodexOAuthToken()) providers.push("openai-codex");

  // 4. Gemini (free credit)
  if (process.env.GOOGLE_GEMINI_API_KEY || getDBKey("gemini")) {
    providers.push("gemini");
  }

  // 5. Groq (free tier)
  if (process.env.GROQ_API_KEY || getDBKey("groq")) {
    providers.push("groq");
  }

  // 6. OpenRouter (free models)
  if (process.env.OPENROUTER_API_KEY || getDBKey("openrouter")) {
    providers.push("openrouter");
  }

  // 7. Anthropic API key (paid)
  if (process.env.ANTHROPIC_API_KEY || getDBKey("anthropic")) {
    providers.push("claude-apikey");
  }

  // 8. OpenAI API key (paid)
  if (process.env.OPENAI_API_KEY || getDBKey("openai")) {
    providers.push("openai-apikey");
  }

  // 9. Ollama local LLM (last resort)
  if (process.env.OLLAMA_HOST || process.env.OLLAMA_ENABLED === "true") {
    providers.push("ollama");
  }

  return providers;
}

// ── Provider dispatcher ─────────────────────────────────────────────

async function callProvider(
  provider: Provider,
  opts: AICallOptions,
): Promise<AICallResult> {
  // Strip tools for non-Claude providers
  const noTools: AICallOptions = { ...opts, tools: undefined };

  switch (provider) {
    case "claude-proxy": {
      const dbProxy = getDBKey("anthropic_proxy");
      const baseURL =
        process.env.ANTHROPIC_PROXY_BASE_URL ?? dbProxy?.base_url ?? "";
      const envKeys = (process.env.ANTHROPIC_PROXY_API_KEY ?? "")
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      const dbKeys = dbProxy?.api_key
        ? dbProxy.api_key
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean)
        : [];
      const keys = [...new Set([...envKeys, ...dbKeys])];
      if (!baseURL || keys.length === 0) {
        throw new Error("Proxy not configured");
      }
      return callClaudeProxy(baseURL, keys, opts, opts.timeoutMs);
    }

    case "claude-oauth":
      return callClaudeOAuth(opts, opts.timeoutMs);

    case "openai-codex":
      return callCodex(noTools, opts.timeoutMs);

    case "gemini": {
      const geminiKey =
        process.env.GOOGLE_GEMINI_API_KEY ?? getDBKey("gemini")?.api_key;
      return callGemini(noTools, geminiKey, opts.timeoutMs);
    }

    case "groq": {
      const groqKey = process.env.GROQ_API_KEY ?? getDBKey("groq")?.api_key;
      return callGroq(noTools, groqKey, opts.timeoutMs);
    }

    case "openrouter": {
      const orKey =
        process.env.OPENROUTER_API_KEY ?? getDBKey("openrouter")?.api_key;
      return callOpenRouter(noTools, orKey, opts.timeoutMs);
    }

    case "claude-apikey": {
      const claudeKey =
        process.env.ANTHROPIC_API_KEY ?? getDBKey("anthropic")?.api_key ?? "";
      return callClaude(claudeKey, opts, opts.timeoutMs);
    }

    case "openai-apikey": {
      const openaiKey =
        process.env.OPENAI_API_KEY ?? getDBKey("openai")?.api_key ?? "";
      return callOpenAI(openaiKey, noTools, opts.timeoutMs);
    }

    case "ollama":
      return callOllama(noTools, opts.timeoutMs);

    default:
      throw new Error(`Unknown provider: ${provider as string}`);
  }
}

// ── Request / Response schemas ──────────────────────────────────────

interface GenerateBody {
  system: string;
  user: string;
  maxTokens?: number;
  timeoutMs?: number;
  tools?: unknown[];
}

// ── Route registration ──────────────────────────────────────────────

export async function generateRoute(app: FastifyInstance): Promise<void> {
  app.post(
    "/generate",
    async (
      request: FastifyRequest<{ Body: GenerateBody }>,
      reply: FastifyReply,
    ) => {
      const { system, user, maxTokens, timeoutMs, tools } = request.body;

      // Validate required fields
      if (!system || !user) {
        return reply.status(400).send({
          ok: false,
          error: "Missing required fields: system, user",
        });
      }

      // Warm DB keys cache
      await getDBKeys();

      // Budget check
      if (isBudgetExceeded()) {
        const budget = getBudgetStatus();
        return reply.status(429).send({
          ok: false,
          error: `Monthly AI budget exceeded ($${budget.spent} / $${budget.limit}). Resets next month.`,
        });
      }

      const opts: AICallOptions = {
        system,
        user,
        maxTokens,
        timeoutMs: timeoutMs ?? 30_000,
        tools,
      };

      // Get providers, filtering out those on cooldown
      const allProviders = getAvailableProviders();
      const now = Date.now();
      const activeProviders = allProviders.filter((p) => {
        const cooldownUntil = providerCooldown.get(p) ?? 0;
        return now > cooldownUntil;
      });

      // If all on cooldown, try them all anyway
      const effectiveProviders =
        activeProviders.length > 0 ? activeProviders : allProviders;

      if (effectiveProviders.length === 0) {
        return reply.status(503).send({
          ok: false,
          error:
            "No AI provider configured. Set up keys in Admin or configure env vars.",
        });
      }

      let lastError: Error | null = null;

      for (const provider of effectiveProviders) {
        try {
          request.log.info({ provider }, "Trying provider");
          const result = await callProvider(provider, opts);

          // Track cost
          const estimatedTokens =
            Math.ceil((system.length + user.length) / 3) * 2;
          trackCost(result.model, estimatedTokens);

          request.log.info(
            { provider, model: result.model },
            "Provider succeeded",
          );

          return reply.send({
            ok: true,
            text: result.text,
            provider: result.provider,
            model: result.model,
          });
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          providerCooldown.set(provider, Date.now() + COOLDOWN_MS);
          request.log.warn(
            { provider, error: lastError.message },
            "Provider failed, cooldown 2min",
          );
        }
      }

      return reply.status(503).send({
        ok: false,
        error: lastError?.message ?? "All AI providers failed",
      });
    },
  );
}
