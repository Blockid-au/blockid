// A2 (pricing v5 §7.4, G35) — the eval's own model transport.
//
// The dispatcher (callAI) picks a model for the caller; the eval must pin
// ONE provider + model per call, so it speaks the OpenAI-compatible chat
// API directly. Spend guard: `isEvalCallable` is enforced here BEFORE any
// I/O — DeepInfra is the only paid provider it can reach; Groq, Cerebras,
// SambaNova (free tiers) and OpenRouter `:free` ids cost nothing. Gemini,
// paid OpenRouter, Anthropic, OpenAI … are refused with no request sent.
//
// Keys come from the environment only and are never logged or returned.

import { inprocessFetch } from "./http-transport";
import type { ModelCallRequest, ModelCallResponse, ModelTransport } from "./model-eval";
import { isEvalCallable } from "./task-profiles";

export const EVAL_ENDPOINTS: Readonly<Record<string, string>> = Object.freeze({
  deepinfra: "https://api.deepinfra.com/v1/openai/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
  cerebras: "https://api.cerebras.ai/v1/chat/completions",
  sambanova: "https://api.sambanova.ai/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
});

export const EVAL_KEY_ENV: Readonly<Record<string, string>> = Object.freeze({
  deepinfra: "DEEPINFRA_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
});

export function evalProviderConfigured(provider: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const name = EVAL_KEY_ENV[provider];
  return Boolean(name && env[name]?.trim());
}

/** OpenAI-compatible request body. Pure. */
export function buildChatBody(req: ModelCallRequest, thinkingOff: ReadonlySet<string> = new Set()): Record<string, unknown> {
  const user = req.imageBase64
    ? [
        { type: "text", text: req.user },
        { type: "image_url", image_url: { url: `data:image/png;base64,${req.imageBase64}` } },
      ]
    : req.user;
  const body: Record<string, unknown> = {
    model: req.model,
    messages: [
      { role: "system", content: req.system },
      { role: "user", content: user },
    ],
    max_tokens: req.maxTokens,
    temperature: 0,
  };
  if (req.provider === "deepinfra" && thinkingOff.has(req.model)) body.chat_template_kwargs = { thinking: false };
  return body;
}

/** Content + usage from an OpenAI-compatible response. Pure. */
export function parseChatResponse(raw: string): { text: string; inputTokens?: number; outputTokens?: number } {
  const j = JSON.parse(raw) as { choices?: Array<{ message?: { content?: unknown } }>; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const content = j.choices?.[0]?.message?.content;
  const text = typeof content === "string" ? content : Array.isArray(content) ? content.map((p) => (typeof p === "object" && p && "text" in p ? String((p as { text: unknown }).text) : "")).join("") : "";
  return {
    text,
    inputTokens: typeof j.usage?.prompt_tokens === "number" ? j.usage.prompt_tokens : undefined,
    outputTokens: typeof j.usage?.completion_tokens === "number" ? j.usage.completion_tokens : undefined,
  };
}

export interface EvalTransportOptions {
  env?: NodeJS.ProcessEnv;
  fetchText?: (url: string, headers: Record<string, string>, body: string, timeoutMs: number) => Promise<string>;
  thinkingOff?: ReadonlySet<string>;
  now?: () => number;
}

export function createEvalTransport(opts: EvalTransportOptions = {}): ModelTransport {
  const env = opts.env ?? process.env;
  const fetchText = opts.fetchText ?? inprocessFetch;
  const now = opts.now ?? (() => Date.now());
  return async (req: ModelCallRequest): Promise<ModelCallResponse> => {
    if (!isEvalCallable(req.provider, req.model)) {
      return { ok: false, text: "", latencyMs: 0, error: `refused: ${req.provider}/${req.model} is not eval-callable (paid providers other than DeepInfra are never dialled)` };
    }
    const url = EVAL_ENDPOINTS[req.provider];
    const key = env[EVAL_KEY_ENV[req.provider] ?? ""]?.trim();
    if (!url || !key) return { ok: false, text: "", latencyMs: 0, error: `${req.provider} not configured` };
    const headers: Record<string, string> = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
    if (req.provider === "openrouter") {
      headers["HTTP-Referer"] = "https://blockid.au";
      headers["X-Title"] = "BlockID model eval";
    }
    const started = now();
    try {
      const raw = await fetchText(url, headers, JSON.stringify(buildChatBody(req, opts.thinkingOff)), req.timeoutMs);
      const parsed = parseChatResponse(raw);
      const latencyMs = now() - started;
      if (!parsed.text.trim()) return { ok: false, text: "", latencyMs, inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens, error: "empty content" };
      return { ok: true, text: parsed.text, latencyMs, inputTokens: parsed.inputTokens, outputTokens: parsed.outputTokens };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Never echo a key back (an error body can quote the Authorization header on some gateways).
      return { ok: false, text: "", latencyMs: now() - started, error: msg.replace(key, "***").slice(0, 300) };
    }
  };
}
