// Colocated vitest for the one AI price module (W1, pricing v5 §7.2 #5).
import { describe, expect, it } from "vitest";

import { ANTHROPIC_PRICING_USD_PER_1M, PAID_PRICING_USD_PER_1M, costUsdFor, priceFor, usageCostUsd } from "./model-prices";

describe("model-prices", () => {
  it("Gemini 3.x previews carry their own prices (ai.google.dev/gemini-api/docs/pricing, 2026-10-20)", () => {
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-3-flash-preview"]).toEqual({ in: 0.5, out: 3 });
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-3.1-pro-preview"]).toEqual({ in: 2, out: 12 });
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-3.1-flash-lite"]).toEqual({ in: 0.25, out: 1.5 });
    expect(PAID_PRICING_USD_PER_1M["gemini:gemini-2.5-flash"]).toEqual({ in: 0.3, out: 2.5 });
  });

  it("DeepInfra admitted report models match the report price policy (V3.2 0.26/0.38, Qwen3-235B 0.09/0.55, V4-Flash 0.09/0.18, Qwen3-VL 0.20/0.88)", () => {
    expect(PAID_PRICING_USD_PER_1M["deepinfra:deepseek-ai/DeepSeek-V3.2"]).toEqual({ in: 0.26, out: 0.38 });
    expect(PAID_PRICING_USD_PER_1M["deepinfra:Qwen/Qwen3-235B-A22B-Instruct-2507"]).toEqual({ in: 0.09, out: 0.55 });
    expect(PAID_PRICING_USD_PER_1M["deepinfra:deepseek-ai/DeepSeek-V4-Flash"]).toEqual({ in: 0.09, out: 0.18 });
    expect(PAID_PRICING_USD_PER_1M["deepinfra:Qwen/Qwen3-VL-235B-A22B-Instruct"]).toEqual({ in: 0.2, out: 0.88 });
  });

  it("priceFor: provider-keyed paid rows, zero for free / subscription providers, Anthropic by bare id (aliases too), null when unknown", () => {
    expect(priceFor("deepinfra", "deepseek-ai/DeepSeek-V4-Flash")).toEqual({ in: 0.09, out: 0.18 });
    expect(priceFor("groq", "openai/gpt-oss-120b")).toEqual({ in: 0, out: 0 });
    expect(priceFor("claude-oauth", "claude-sonnet-5")).toEqual({ in: 0, out: 0 });
    expect(priceFor(undefined, "claude-sonnet-5")).toEqual(ANTHROPIC_PRICING_USD_PER_1M["claude-sonnet-5"]);
    expect(priceFor("claude-apikey", "claude-haiku-4-5-20251001")).toEqual({ in: 1, out: 5 });
    expect(priceFor("deepinfra", "unknown/model")).toBeNull();
    expect(priceFor(undefined, "claude-opus-5#synthesis")).toBeNull();
  });

  it("usageCostUsd (paid rows only) and costUsdFor (any priced row)", () => {
    expect(usageCostUsd("deepinfra", "deepseek-ai/DeepSeek-V4-Flash", 1_000_000, 1_000_000)).toBeCloseTo(0.27, 8);
    expect(usageCostUsd("gemini", "gemini-3-flash-preview", 1_000_000, 1_000_000)).toBeCloseTo(3.5, 8);
    expect(usageCostUsd("groq", "openai/gpt-oss-120b", 1000, 1000)).toBeNull();
    expect(costUsdFor(undefined, "claude-opus-5", 1_000_000, 0)).toBeCloseTo(5, 8);
    expect(costUsdFor("groq", "openai/gpt-oss-120b", 1_000_000, 1_000_000)).toBe(0);
    expect(costUsdFor("deepinfra", "nope", 1, 1)).toBeNull();
  });
});
