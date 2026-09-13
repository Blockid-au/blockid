// Colocated vitest for the S31-A Anthropic quality tier (anthropic-tier.ts).
//
// Pins the request shape the SDK receives (no live call — a fake client is
// injected), the task-class → model routing, the prompt-caching block order,
// the streaming threshold, the typed error chain (401 latch / 429 retry-after
// / other APIError) and the rate-limit header → headroom bridge. A silent
// regression here would either burn money (cache_control dropped → 10× input
// cost on every rubric), break every call (budget_tokens / prefill /
// temperature on Sonnet 5 → 400) or hammer an invalid key on the hot path.

import Anthropic from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ANTHROPIC_MODEL_BY_CLASS,
  AnthropicTierError,
  STREAM_THRESHOLD_TOKENS,
  _resetAnthropicTierForTests,
  anthropicRequestsRemaining,
  buildAnthropicParams,
  callAnthropicTier,
  estimateAnthropicCostUsd,
  getAnthropicHeadroom,
  inferTaskClass,
  isAnthropicKeyInvalid,
  markAnthropicKeyInvalid,
  modelForTaskClass,
  parseRateLimitHeaders,
  shouldStream,
  type AnthropicClientLike,
} from "./anthropic-tier";

function message(text: string, extra: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: extra.model ?? "claude-sonnet-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 1200,
      output_tokens: 300,
      cache_read_input_tokens: 1000,
      cache_creation_input_tokens: 0,
      cache_creation: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
      speed: null,
      iterations: null,
    } as unknown as Anthropic.Usage,
    ...extra,
  } as Anthropic.Message;
}

interface FakeState {
  createParams: Anthropic.MessageCreateParamsNonStreaming[];
  streamParams: Anthropic.MessageCreateParams[];
  headers: Record<string, string>;
  reply: Anthropic.Message;
  throwOnCreate?: Error;
}

function fakeClient(state: FakeState): AnthropicClientLike {
  const headers = new Headers(state.headers);
  return {
    messages: {
      create(params) {
        state.createParams.push(params);
        return {
          async withResponse() {
            if (state.throwOnCreate) throw state.throwOnCreate;
            return { data: state.reply, response: { headers } };
          },
        };
      },
      stream(params) {
        state.streamParams.push(params);
        return {
          async withResponse() {
            if (state.throwOnCreate) throw state.throwOnCreate;
            return { data: { finalMessage: async () => state.reply }, response: { headers } };
          },
        };
      },
    },
  };
}

let state: FakeState;
let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  _resetAnthropicTierForTests();
  delete process.env.ANTHROPIC_MODEL_REPORT;
  state = { createParams: [], streamParams: [], headers: {}, reply: message("ok") };
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  warn.mockRestore();
});

describe("task-class routing", () => {
  it("maps the three classes to Haiku 4.5 / Sonnet 5 / Opus 5 (no date suffixes)", () => {
    expect(ANTHROPIC_MODEL_BY_CLASS).toEqual({ classify: "claude-haiku-4-5", report: "claude-sonnet-5", synthesis: "claude-opus-5" });
    expect(modelForTaskClass("report")).toBe("claude-sonnet-5");
    process.env.ANTHROPIC_MODEL_REPORT = "claude-opus-5";
    expect(modelForTaskClass("report")).toBe("claude-opus-5");
  });

  it("explicit taskClass wins; agentId names classifiers / CEO synthesis; tiny max_tokens = short JSON; default report", () => {
    expect(inferTaskClass({ taskClass: "synthesis", agentId: "intake-classifier" })).toBe("synthesis");
    expect(inferTaskClass({ agentId: "intake-classifier" })).toBe("classify");
    expect(inferTaskClass({ agentId: "deck-section-classifier", maxTokens: 4000 })).toBe("classify");
    expect(inferTaskClass({ agentId: "pitchdeck-ocr" })).toBe("classify");
    expect(inferTaskClass({ agentId: "ceo" })).toBe("synthesis");
    expect(inferTaskClass({ agentId: "ceo-synthesis" })).toBe("synthesis");
    expect(inferTaskClass({ agentId: "cfo", maxTokens: 400 })).toBe("classify");
    expect(inferTaskClass({ agentId: "cfo", maxTokens: 4000 })).toBe("report");
    expect(inferTaskClass({})).toBe("report");
  });
});

describe("request shape (buildAnthropicParams)", () => {
  it("puts the stable system prompt FIRST as a cache_control ephemeral block, the volatile user turn after", () => {
    const p = buildAnthropicParams({ system: "RUBRIC", user: "profile 123", maxTokens: 2000 });
    expect(p.model).toBe("claude-sonnet-5");
    expect(p.system).toEqual([{ type: "text", text: "RUBRIC", cache_control: { type: "ephemeral" } }]);
    expect(p.messages).toEqual([{ role: "user", content: "profile 123" }]);
    expect(p.max_tokens).toBe(2000);
    // No assistant prefill, ever.
    expect(p.messages.some((m) => m.role === "assistant")).toBe(false);
  });

  it("uses output_config.effort medium for reports and high for Opus synthesis, never budget_tokens / thinking", () => {
    const report = buildAnthropicParams({ system: "s", user: "u" }, "report");
    expect(report.output_config).toEqual({ effort: "medium" });
    const synth = buildAnthropicParams({ system: "s", user: "u" }, "synthesis");
    expect(synth.model).toBe("claude-opus-5");
    expect(synth.output_config).toEqual({ effort: "high" });
    for (const p of [report, synth]) {
      expect(p).not.toHaveProperty("thinking");
      expect(JSON.stringify(p)).not.toContain("budget_tokens");
    }
  });

  it("never sends effort or temperature to Haiku... and never temperature to Sonnet 5 / Opus 5", () => {
    const haiku = buildAnthropicParams({ system: "s", user: "u", temperature: 0.2 }, "classify");
    expect(haiku.model).toBe("claude-haiku-4-5");
    expect(haiku).not.toHaveProperty("output_config");
    expect(haiku.temperature).toBe(0.2); // Haiku 4.5 still accepts sampling params
    const sonnet = buildAnthropicParams({ system: "s", user: "u", temperature: 0.2 }, "report");
    expect(sonnet).not.toHaveProperty("temperature");
  });

  it("passes tools through when supplied", () => {
    const p = buildAnthropicParams({ system: "s", user: "u", tools: [{ type: "web_search_20260209", name: "web_search" }] });
    expect(p.tools).toHaveLength(1);
  });

  it("streams above 8000 output tokens only", () => {
    expect(STREAM_THRESHOLD_TOKENS).toBe(8000);
    expect(shouldStream(8000)).toBe(false);
    expect(shouldStream(8001)).toBe(true);
  });
});

describe("cost estimate", () => {
  it("prices Sonnet 5 at $2/$10 with cache reads at 10 %", () => {
    const usd = estimateAnthropicCostUsd("claude-sonnet-5", {
      input_tokens: 1_000_000, output_tokens: 100_000, cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 0,
    });
    // 2 + 1 + 0.2
    expect(usd).toBeCloseTo(3.2, 6);
    expect(estimateAnthropicCostUsd("claude-opus-5", { input_tokens: 1e6, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(5);
    expect(estimateAnthropicCostUsd("claude-haiku-4-5", { input_tokens: 0, output_tokens: 1e6, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 })).toBe(5);
  });
});

describe("callAnthropicTier — happy path", () => {
  it("uses messages.create below the threshold, returns text + real usage + cost, and records headroom from headers", async () => {
    state.headers = {
      "anthropic-ratelimit-requests-remaining": "48",
      "anthropic-ratelimit-tokens-remaining": "39000",
      "anthropic-ratelimit-requests-reset": new Date(Date.now() + 30_000).toISOString(),
    };
    const out = await callAnthropicTier({ system: "RUBRIC", user: "u", maxTokens: 2000 }, { client: fakeClient(state) });
    expect(out.text).toBe("ok");
    expect(out.streamed).toBe(false);
    expect(out.usage).toEqual({ input_tokens: 1200, output_tokens: 300, cache_read_input_tokens: 1000, cache_creation_input_tokens: 0 });
    // 1200/1e6*2 + 1000/1e6*2*0.1 + 300/1e6*10
    expect(out.cost_usd).toBeCloseTo(0.0024 + 0.0002 + 0.003, 8);
    expect(state.createParams).toHaveLength(1);
    expect(state.streamParams).toHaveLength(0);
    expect(state.createParams[0].system).toEqual([{ type: "text", text: "RUBRIC", cache_control: { type: "ephemeral" } }]);
    expect(getAnthropicHeadroom()?.requests_remaining).toBe(48);
    expect(anthropicRequestsRemaining()).toBe(48);
  });

  it("streams (+ finalMessage) when max_tokens > 8000", async () => {
    const out = await callAnthropicTier({ system: "s", user: "u", maxTokens: 16000 }, { client: fakeClient(state) });
    expect(out.streamed).toBe(true);
    expect(state.streamParams).toHaveLength(1);
    expect(state.createParams).toHaveLength(0);
  });

  it("treats an empty completion and a refusal as errors so the dispatcher falls through", async () => {
    state.reply = message("   ");
    await expect(callAnthropicTier({ system: "s", user: "u" }, { client: fakeClient(state) })).rejects.toThrow(/Empty Anthropic response/);
    state.reply = message("nope", { stop_reason: "refusal" });
    await expect(callAnthropicTier({ system: "s", user: "u" }, { client: fakeClient(state) })).rejects.toThrow(/refusal/);
  });
});

describe("callAnthropicTier — typed error chain", () => {
  it("AuthenticationError latches the key invalid for 1 h and is not dialled again meanwhile (logged once)", async () => {
    state.throwOnCreate = new Anthropic.AuthenticationError(401, { type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, "invalid x-api-key", new Headers());
    const now = 1_700_000_000_000;
    let clock = now;
    const deps = { client: fakeClient(state), now: () => clock };
    await expect(callAnthropicTier({ system: "s", user: "u" }, deps)).rejects.toMatchObject({ kind: "invalid_key", status: 401 });
    expect(isAnthropicKeyInvalid(now)).toBe(true);
    // Second call within the hour never reaches the SDK.
    state.createParams.length = 0;
    await expect(callAnthropicTier({ system: "s", user: "u" }, deps)).rejects.toMatchObject({ kind: "invalid_key" });
    expect(state.createParams).toHaveLength(0);
    expect(warn).toHaveBeenCalledTimes(1);
    const logged = String(warn.mock.calls[0][0]);
    expect(logged).toContain("key len=");
    expect(logged).not.toContain("sk-ant-solo-secret");
    // After the hour it is tried again.
    clock = now + 60 * 60_000 + 1;
    expect(isAnthropicKeyInvalid(clock)).toBe(false);
    state.throwOnCreate = undefined;
    await expect(callAnthropicTier({ system: "s", user: "u" }, deps)).resolves.toMatchObject({ text: "ok" });
  });

  it("RateLimitError carries retry-after and zeroes requests_remaining so the dispatcher ranks it last", async () => {
    state.throwOnCreate = new Anthropic.RateLimitError(429, { type: "error", error: { type: "rate_limit_error", message: "slow down" } }, "slow down", new Headers({ "retry-after": "12" }));
    await expect(callAnthropicTier({ system: "s", user: "u" }, { client: fakeClient(state) })).rejects.toMatchObject({ kind: "rate_limited", status: 429, retryAfterMs: 12_000 });
    expect(anthropicRequestsRemaining()).toBe(0);
    expect(isAnthropicKeyInvalid()).toBe(false);
  });

  it("any other APIError surfaces its status and message; the key stays valid", async () => {
    state.throwOnCreate = new Anthropic.InternalServerError(529, { type: "error", error: { type: "overloaded_error", message: "Overloaded" } }, "Overloaded", new Headers());
    const err = await callAnthropicTier({ system: "s", user: "u" }, { client: fakeClient(state) }).catch((e) => e as AnthropicTierError);
    expect(err).toBeInstanceOf(AnthropicTierError);
    expect(err.kind).toBe("api_error");
    expect(err.status).toBe(529);
    expect(err.message).toMatch(/HTTP 529/);
    expect(isAnthropicKeyInvalid()).toBe(false);
  });
});

describe("rate-limit headers → headroom", () => {
  it("parses the anthropic-ratelimit-* headers and returns null when none are present", () => {
    expect(parseRateLimitHeaders(new Headers())).toBeNull();
    const h = parseRateLimitHeaders(new Headers({
      "anthropic-ratelimit-requests-remaining": "3",
      "anthropic-ratelimit-tokens-remaining": "1500",
      "anthropic-ratelimit-tokens-reset": "2026-09-13T22:41:00Z",
    }), 5);
    expect(h).toEqual({ requests_remaining: 3, tokens_remaining: 1500, requests_reset_at: null, tokens_reset_at: "2026-09-13T22:41:00.000Z", observed_at: 5 });
  });

  it("anthropicRequestsRemaining reports 0 when tokens are nearly spent and null once the window has reset", async () => {
    state.headers = { "anthropic-ratelimit-requests-remaining": "40", "anthropic-ratelimit-tokens-remaining": "500", "anthropic-ratelimit-requests-reset": new Date(1000).toISOString() };
    await callAnthropicTier({ system: "s", user: "u" }, { client: fakeClient(state), now: () => 0 });
    expect(anthropicRequestsRemaining(0)).toBe(0);      // tokens < 2000 → effectively no capacity
    expect(anthropicRequestsRemaining(2000)).toBeNull(); // past reset → trust the static ceiling again
  });

  it("markAnthropicKeyInvalid never prints more than the key length + 3-char prefix", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-api03-SECRETSECRET";
    markAnthropicKeyInvalid(Date.now(), "probe 401");
    const line = String(warn.mock.calls[0][0]);
    expect(line).toContain("key len=25");
    expect(line).toContain("prefix=sk-");
    expect(line).not.toContain("SECRET");
    delete process.env.ANTHROPIC_API_KEY;
  });
});
