// S31-A — first-class Anthropic API tier (official SDK, not raw fetch).
//
// This is the QUALITY tier of the dispatcher in ../ai-client.ts: when a valid,
// funded ANTHROPIC_API_KEY is present it is tried first; the free tiers
// (Groq / Cerebras / SambaNova / OpenRouter free models) and the Claude
// subscription OAuth path become overflow. Routing by task class:
//
//   classify   → claude-haiku-4-5   categorisers, extractors, SVI signal
//                                   parsing, short JSON
//   report     → claude-sonnet-5    the default: reports, narratives, chat
//   synthesis  → claude-opus-5      CEO final synthesis, valuation
//                                   certificate narrative only
//
// Request shape rules (pinned by anthropic-tier.test.ts):
//   • the stable system prompt goes FIRST as one text block carrying
//     `cache_control: {type: "ephemeral"}`; the volatile user content follows,
//     so identical rubrics are served from the prompt cache at 10 % of the
//     input price from the second call onward;
//   • `output_config.effort` — "medium" for reports, "high" for Opus
//     synthesis; Haiku 4.5 rejects `effort`, so it is never sent there;
//   • never `budget_tokens` (400 on Sonnet 5 / Opus 5 — adaptive thinking is
//     the default on Opus 5), never an assistant prefill, never `temperature`
//     on Sonnet 5 / Opus 5 (sampling params were removed there);
//   • `client.messages.stream()` + `finalMessage()` whenever max_tokens > 8000
//     so a long report never trips the HTTP timeout.
//
// Typed error chain: `Anthropic.AuthenticationError` marks the key invalid
// for one hour (the hot path skips the provider; logged once per hour),
// `Anthropic.RateLimitError` honours `retry-after` and feeds the headroom
// model, everything else surfaces as an `AnthropicTierError` with its
// status so the dispatcher's cooldown regexes classify it like any other
// provider failure. Rate-limit headers from every response are copied into
// `getAnthropicHeadroom()` so the dispatcher ranks Anthropic by REAL
// remaining requests / tokens instead of a static RPM guess.

import Anthropic from "@anthropic-ai/sdk";
import type { AICallOptions } from "@/lib/ai-client";

export type AITaskClass = "classify" | "report" | "synthesis";

export const ANTHROPIC_MODEL_BY_CLASS: Record<AITaskClass, string> = {
  classify: "claude-haiku-4-5",
  report: "claude-sonnet-5",
  synthesis: "claude-opus-5",
};

/** USD per 1M tokens — Anthropic first-party list price (Sep 2026). Cache
 *  reads are billed at 10 % of the input price, cache writes at 125 %. */
export const ANTHROPIC_PRICING_USD_PER_1M: Record<string, { in: number; out: number }> = {
  "claude-haiku-4-5": { in: 1, out: 5 },
  "claude-sonnet-5": { in: 2, out: 10 },
  "claude-opus-5": { in: 5, out: 25 },
};
export const CACHE_READ_MULTIPLIER = 0.1;
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** Above this many output tokens we stream — the SDK itself refuses very
 *  large non-streaming requests and a long report can exceed the timeout. */
export const STREAM_THRESHOLD_TOKENS = 8000;
export const SDK_MAX_RETRIES = 2;
export const SDK_TIMEOUT_MS = 120_000;
export const INVALID_KEY_COOLDOWN_MS = 60 * 60_000;

export interface AnthropicUsage {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
}

export interface AnthropicHeadroom {
  requests_remaining: number | null;
  tokens_remaining: number | null;
  requests_reset_at: string | null;
  tokens_reset_at: string | null;
  /** ms epoch of the response the headers came from. */
  observed_at: number;
}

export interface AnthropicTierResult {
  text: string;
  model: string;
  usage: AnthropicUsage;
  cost_usd: number;
  streamed: boolean;
}

export class AnthropicTierError extends Error {
  readonly kind: "invalid_key" | "rate_limited" | "api_error" | "connection";
  readonly status: number | undefined;
  readonly retryAfterMs: number | undefined;
  constructor(kind: AnthropicTierError["kind"], message: string, status?: number, retryAfterMs?: number) {
    super(message);
    this.name = "AnthropicTierError";
    this.kind = kind;
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

// ── Task-class routing ─────────────────────────────────────────────────

const CLASSIFY_AGENT_RE = /classif|extract|ocr|categoris|categoriz|intake|signal|parser|tagger|labeller/i;
const SYNTHESIS_AGENT_RE = /^ceo(-|$)|synthesis|valuation-certificate|certificate-narrative/i;
/** A call that asks for this little output is a short-JSON / label task. */
const CLASSIFY_MAX_TOKENS = 600;

/** Explicit `taskClass` wins; otherwise the agentId names the job; otherwise
 *  a tiny max_tokens means "short JSON"; the default is a report. */
export function inferTaskClass(opts: Pick<AICallOptions, "taskClass" | "agentId" | "maxTokens">): AITaskClass {
  if (opts.taskClass) return opts.taskClass;
  const id = opts.agentId ?? "";
  if (id && SYNTHESIS_AGENT_RE.test(id)) return "synthesis";
  if (id && CLASSIFY_AGENT_RE.test(id)) return "classify";
  if (typeof opts.maxTokens === "number" && opts.maxTokens > 0 && opts.maxTokens <= CLASSIFY_MAX_TOKENS) return "classify";
  return "report";
}

export function modelForTaskClass(cls: AITaskClass): string {
  const override = process.env[`ANTHROPIC_MODEL_${cls.toUpperCase()}`];
  return override && override.length > 0 ? override : ANTHROPIC_MODEL_BY_CLASS[cls];
}

function effortFor(cls: AITaskClass): "medium" | "high" | null {
  if (cls === "synthesis") return "high";
  if (cls === "report") return "medium";
  return null; // Haiku 4.5 rejects output_config.effort
}

function supportsEffort(model: string): boolean {
  return !/haiku/i.test(model);
}

function supportsTemperature(model: string): boolean {
  return /haiku/i.test(model);
}

/** Build the Messages API request. Exported so the test can pin the shape. */
export function buildAnthropicParams(
  opts: AICallOptions,
  cls: AITaskClass = inferTaskClass(opts),
  model: string = modelForTaskClass(cls),
): Anthropic.MessageCreateParamsNonStreaming {
  const params: Anthropic.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: opts.maxTokens ?? 4096,
    // Stable prefix first, cached; the volatile user turn after it.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.user }],
  };
  const effort = effortFor(cls);
  if (effort && supportsEffort(model)) params.output_config = { effort };
  if (typeof opts.temperature === "number" && supportsTemperature(model)) params.temperature = opts.temperature;
  if (opts.tools?.length) params.tools = opts.tools as Anthropic.MessageCreateParams["tools"];
  return params;
}

export function shouldStream(maxTokens: number): boolean {
  return maxTokens > STREAM_THRESHOLD_TOKENS;
}

// ── Cost ───────────────────────────────────────────────────────────────

export function estimateAnthropicCostUsd(model: string, usage: AnthropicUsage): number {
  const p = ANTHROPIC_PRICING_USD_PER_1M[model] ?? ANTHROPIC_PRICING_USD_PER_1M["claude-sonnet-5"];
  const fresh = (usage.input_tokens / 1e6) * p.in;
  const cacheRead = (usage.cache_read_input_tokens / 1e6) * p.in * CACHE_READ_MULTIPLIER;
  const cacheWrite = (usage.cache_creation_input_tokens / 1e6) * p.in * CACHE_WRITE_MULTIPLIER;
  const out = (usage.output_tokens / 1e6) * p.out;
  return fresh + cacheRead + cacheWrite + out;
}

// ── Key validity + headroom state (module-level, restart-safe by design) ──

let invalidKeyUntil = 0;
let lastInvalidLogAt = 0;
let headroom: AnthropicHeadroom | null = null;

export function isAnthropicKeyInvalid(now: number = Date.now()): boolean {
  return now < invalidKeyUntil;
}

export function markAnthropicKeyInvalid(now: number = Date.now(), reason = "401"): void {
  invalidKeyUntil = now + INVALID_KEY_COOLDOWN_MS;
  if (now - lastInvalidLogAt >= INVALID_KEY_COOLDOWN_MS) {
    lastInvalidLogAt = now;
    const key = process.env.ANTHROPIC_API_KEY ?? "";
    console.warn(
      `[ai-client:anthropic] API key rejected (${reason}) — provider skipped for 1 h. ` +
      `key len=${key.length} prefix=${key.slice(0, 3)}… Set a valid ANTHROPIC_API_KEY (docs/ops/ai-providers.md).`,
    );
  }
}

export function getAnthropicHeadroom(): AnthropicHeadroom | null {
  return headroom;
}

/** Parse the `anthropic-ratelimit-*` headers off any response. Exported for
 *  the probe + tests. Missing headers leave the field null. */
export function parseRateLimitHeaders(h: Headers | { get(name: string): string | null } | null | undefined, now: number = Date.now()): AnthropicHeadroom | null {
  if (!h) return null;
  const num = (name: string): number | null => {
    const v = h.get(name);
    if (v == null || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const iso = (name: string): string | null => {
    const v = h.get(name);
    if (!v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  };
  const out: AnthropicHeadroom = {
    requests_remaining: num("anthropic-ratelimit-requests-remaining"),
    tokens_remaining: num("anthropic-ratelimit-tokens-remaining"),
    requests_reset_at: iso("anthropic-ratelimit-requests-reset"),
    tokens_reset_at: iso("anthropic-ratelimit-tokens-reset"),
    observed_at: now,
  };
  if (out.requests_remaining === null && out.tokens_remaining === null) return null;
  return out;
}

export function noteAnthropicHeadroom(h: AnthropicHeadroom | null): void {
  if (h) headroom = h;
}

/** Remaining-request estimate for the dispatcher: null when we have no
 *  fresh header sample (older than its reset → the window has rolled). */
export function anthropicRequestsRemaining(now: number = Date.now()): number | null {
  if (!headroom) return null;
  const reset = headroom.requests_reset_at ? new Date(headroom.requests_reset_at).getTime() : NaN;
  if (!Number.isNaN(reset) && now >= reset) return null; // window rolled — trust the static ceiling
  if (headroom.tokens_remaining !== null && headroom.tokens_remaining < 2000) return 0; // out of tokens this minute
  return headroom.requests_remaining;
}

/** Test-only. */
export function _resetAnthropicTierForTests(): void {
  invalidKeyUntil = 0;
  lastInvalidLogAt = 0;
  headroom = null;
}

// ── Client + call ──────────────────────────────────────────────────────

let cachedClient: { key: string; client: Anthropic } | null = null;

export function getAnthropicApiClient(apiKey: string): Anthropic {
  if (cachedClient && cachedClient.key === apiKey) return cachedClient.client;
  const client = new Anthropic({ apiKey, maxRetries: SDK_MAX_RETRIES, timeout: SDK_TIMEOUT_MS });
  cachedClient = { key: apiKey, client };
  return client;
}

function textOf(message: Anthropic.Message): string {
  let text = "";
  for (const block of message.content) if (block.type === "text") text += block.text;
  return text;
}

function usageOf(message: Anthropic.Message): AnthropicUsage {
  return {
    input_tokens: message.usage.input_tokens ?? 0,
    output_tokens: message.usage.output_tokens ?? 0,
    cache_read_input_tokens: message.usage.cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: message.usage.cache_creation_input_tokens ?? 0,
  };
}

function retryAfterMs(headers: Headers | undefined): number | undefined {
  const v = headers?.get("retry-after");
  if (!v) return undefined;
  const secs = Number(v);
  if (Number.isFinite(secs)) return Math.max(0, secs) * 1000;
  const at = new Date(v).getTime();
  return Number.isNaN(at) ? undefined : Math.max(0, at - Date.now());
}

/** Minimal surface of the SDK we touch — tests inject a fake. */
export interface AnthropicClientLike {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): {
      withResponse(): Promise<{ data: Anthropic.Message; response: { headers: Headers } }>;
    };
    stream(params: Anthropic.MessageCreateParams): {
      withResponse(): Promise<{ data: { finalMessage(): Promise<Anthropic.Message> }; response: { headers: Headers } }>;
    };
  };
}

/**
 * One Messages call on the API-key tier. Throws `AnthropicTierError`; never
 * returns an empty text (an empty completion is an error so the dispatcher
 * falls through to the next provider like every other call path).
 */
export async function callAnthropicTier(
  opts: AICallOptions,
  deps: { client?: AnthropicClientLike; apiKey?: string; now?: () => number } = {},
): Promise<AnthropicTierResult> {
  const now = deps.now ?? Date.now;
  if (isAnthropicKeyInvalid(now())) {
    throw new AnthropicTierError("invalid_key", "Anthropic API key marked invalid (401) — skipped for 1 h");
  }
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const client: AnthropicClientLike = deps.client ?? (getAnthropicApiClient(apiKey) as unknown as AnthropicClientLike);

  const cls = inferTaskClass(opts);
  const model = modelForTaskClass(cls);
  const params = buildAnthropicParams(opts, cls, model);
  const streamed = shouldStream(params.max_tokens);

  try {
    let message: Anthropic.Message;
    let headers: Headers | undefined;
    if (streamed) {
      const { data, response } = await client.messages.stream({ ...params, stream: true }).withResponse();
      headers = response.headers;
      message = await data.finalMessage();
    } else {
      const { data, response } = await client.messages.create(params).withResponse();
      headers = response.headers;
      message = data;
    }
    noteAnthropicHeadroom(parseRateLimitHeaders(headers, now()));

    if (message.stop_reason === "refusal") {
      throw new AnthropicTierError("api_error", "Anthropic refused the request (stop_reason=refusal)", 200);
    }
    const text = textOf(message);
    if (!text.trim()) throw new AnthropicTierError("api_error", "Empty Anthropic response", 200);
    const usage = usageOf(message);
    return { text, model: message.model || model, usage, cost_usd: estimateAnthropicCostUsd(model, usage), streamed };
  } catch (err) {
    if (err instanceof AnthropicTierError) throw err;
    if (err instanceof Anthropic.AuthenticationError) {
      markAnthropicKeyInvalid(now(), `401 ${err.message.slice(0, 80)}`);
      throw new AnthropicTierError("invalid_key", `Anthropic 401 authentication_error: ${err.message.slice(0, 120)}`, 401);
    }
    if (err instanceof Anthropic.RateLimitError) {
      noteAnthropicHeadroom(parseRateLimitHeaders(err.headers, now()) ?? {
        requests_remaining: 0, tokens_remaining: null, requests_reset_at: null, tokens_reset_at: null, observed_at: now(),
      });
      const wait = retryAfterMs(err.headers);
      throw new AnthropicTierError("rate_limited", `Anthropic 429 rate_limit: retry after ${wait !== undefined ? Math.ceil(wait / 1000) : "?"}s`, 429, wait);
    }
    if (err instanceof Anthropic.APIConnectionError) {
      throw new AnthropicTierError("connection", `Anthropic connection error: ${err.message.slice(0, 120)}`);
    }
    if (err instanceof Anthropic.APIError) {
      const status = typeof err.status === "number" ? err.status : undefined;
      throw new AnthropicTierError("api_error", `Anthropic API error HTTP ${status ?? "?"}: ${err.message.slice(0, 160)}`, status);
    }
    throw err;
  }
}
