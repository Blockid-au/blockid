// Colocated vitest for the known-good free-model pool (W1, pricing v5 §7.2 #3).
import { describe, expect, it } from "vitest";

import { KNOWN_GOOD_FREE_MODELS, poolWithKeys } from "./known-good-pool";
import { meetsCapabilityFloor } from "./model-capability";

// The 15 ids that answered 404 / decommissioned on every 30-min probe since
// September (~1,760 strikes each) — they must never come back into the pool.
const DEAD_2026_10_20 = [
  "groq::llama-3.3-70b-versatile", "groq::llama-3.1-8b-instant", "groq::mixtral-8x7b-32768", "groq::gemma2-9b-it",
  "sambanova::Meta-Llama-3.1-405B-Instruct", "sambanova::DeepSeek-R1",
  "cerebras::llama-3.3-70b", "cerebras::llama3.1-8b", "cerebras::qwen-3-32b",
  "openrouter::meta-llama/llama-3.3-70b-instruct:free", "openrouter::deepseek/deepseek-r1:free",
  "openrouter::qwen/qwen-2.5-72b-instruct:free", "openrouter::google/gemma-2-9b-it:free", "openrouter::mistralai/mistral-7b-instruct:free",
];

describe("KNOWN_GOOD_FREE_MODELS", () => {
  it("carries none of the permanently dead ids", () => {
    const keys = new Set(KNOWN_GOOD_FREE_MODELS.map((m) => `${m.provider}::${m.model}`));
    for (const dead of DEAD_2026_10_20) expect(keys.has(dead), dead).toBe(false);
  });

  it("every keyed-provider entry clears the free-pool capability floor", () => {
    for (const m of KNOWN_GOOD_FREE_MODELS.filter((x) => x.provider !== "chutes" && x.provider !== "cloudflare")) {
      expect(meetsCapabilityFloor(m.model), m.model).toBe(true);
    }
  });

  it("carries the W1 OpenRouter :free candidates (exact catalogue ids)", () => {
    const ids = KNOWN_GOOD_FREE_MODELS.filter((m) => m.provider === "openrouter").map((m) => m.model);
    expect(ids).toEqual(["nvidia/nemotron-3-ultra-550b-a55b:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-31b-it:free"]);
  });

  it("poolWithKeys keeps only providers with a key", () => {
    const pool = poolWithKeys((p) => p === "groq");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((m) => m.provider === "groq")).toBe(true);
  });
});
