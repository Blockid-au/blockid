// Colocated vitest for the W1 free-pool capability floor (model-capability.ts).
import { describe, expect, it } from "vitest";

import {
  MIN_FREE_MODEL_PARAMS_B,
  isDeniedModel,
  isRepresentativeHealthAnswer,
  meetsCapabilityFloor,
  parseParamBillions,
  passesDiscoveryFloor,
} from "./model-capability";

describe("parseParamBillions", () => {
  it.each([
    ["qwen-3.8-27b", 27],
    ["qwen/qwen3.8-27b", 27],
    ["Qwen3-235B-A22B-Instruct-2507", 235],
    ["openai/gpt-oss-120b", 120],
    ["openai/gpt-oss-20b", 20],
    ["allam-2-7b", 7],
    ["liquid/lfm-2.5-2.6b:free", 2.6],
    ["llama-3.1-8b-instant", 8],
    ["Meta-Llama-3.1-405B-Instruct", 405],
    ["nvidia/nemotron-3-super-120b-a12b:free", 120],
  ])("%s → %s", (id, n) => {
    expect(parseParamBillions(id)).toBe(n);
  });

  it("ignores active-parameter and expert markers and returns null without a size", () => {
    expect(parseParamBillions("google/gemma-4-26b-a4b-it:free")).toBe(26);
    expect(parseParamBillions("mixtral-8x7b-32768")).toBeNull();
    expect(parseParamBillions("minimax/minimax-m3.1-flash:free")).toBeNull();
    expect(parseParamBillions("DeepSeek-V3.2")).toBeNull();
  });
});

describe("meetsCapabilityFloor", () => {
  it("admits ≥ 20B models and allow-listed families", () => {
    for (const ok of [
      "qwen/qwen3.8-27b", "qwen-3.8-27b", "openai/gpt-oss-120b", "gpt-oss-120b", "openai/gpt-oss-20b",
      "DeepSeek-V3.2", "Meta-Llama-3.3-70B-Instruct", "minimax/minimax-m3.1-flash:free",
      "nvidia/nemotron-3.5-super-vl:free", "nvidia/nemotron-3-ultra-550b-a55b:free", "google/gemma-4-31b-it:free",
      "gemini-2.5-flash-lite", "MiniMax-M3", "gemma-4-31B-it",
    ]) expect(meetsCapabilityFloor(ok), ok).toBe(true);
  });

  it("rejects the Allam / speech / safety / tiny models that answered classify (W1)", () => {
    for (const bad of [
      "allam-2-7b", "canopylabs/orpheus-v1-english", "canopylabs/orpheus-arabic-saudi", "playai-tts",
      "whisper-large-v3", "meta-llama/llama-guard-4-12b", "nvidia/nemotron-3.5-content-safety:free",
      "text-embedding-3-small", "llama-3.1-8b-instant", "liquid/lfm-2.5-2.6b:free",
      "cohere/north-mini-code:free", "openrouter/free", "",
    ]) expect(meetsCapabilityFloor(bad), bad).toBe(false);
    expect(MIN_FREE_MODEL_PARAMS_B).toBe(20);
  });
});

describe("isDeniedModel / passesDiscoveryFloor", () => {
  it("discovery drops denied and encoded-small ids but keeps unknown sizes for probing", () => {
    expect(isDeniedModel("allam-2-7b")).toBe(true);
    expect(passesDiscoveryFloor("allam-2-7b")).toBe(false);
    expect(passesDiscoveryFloor("llama-3.1-8b-instant")).toBe(false);
    expect(passesDiscoveryFloor("opaque/foo")).toBe(true);
    expect(passesDiscoveryFloor("qwen/qwen3.8-27b")).toBe(true);
  });
});

describe("isRepresentativeHealthAnswer", () => {
  it("only a non-empty answer from a capable (or Claude) model proves health", () => {
    expect(isRepresentativeHealthAnswer("qwen/qwen3.8-27b", "OK")).toBe(true);
    expect(isRepresentativeHealthAnswer("claude-haiku-4-5", "OK")).toBe(true);
    expect(isRepresentativeHealthAnswer("deepseek-ai/DeepSeek-V4-Flash", "OK")).toBe(true);
    expect(isRepresentativeHealthAnswer("allam-2-7b", "OK")).toBe(false);
    expect(isRepresentativeHealthAnswer("qwen/qwen3.8-27b", "  ")).toBe(false);
    expect(isRepresentativeHealthAnswer(undefined, "OK")).toBe(false);
  });
});
