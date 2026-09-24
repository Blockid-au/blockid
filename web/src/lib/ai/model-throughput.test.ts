import { beforeEach, describe, expect, it } from "vitest";
import { _resetModelSpeeds, estimateCompletionMs, modelSpeed, orderModelsBySpeed, recordModelSpeed } from "./model-throughput";

const V32 = "deepseek-ai/DeepSeek-V3.2";
const QWEN = "Qwen/Qwen3-235B-A22B-Instruct-2507";
const FLASH = "deepseek-ai/DeepSeek-V4-Flash";
const LADDER = [V32, QWEN, FLASH];

beforeEach(() => _resetModelSpeeds());

describe("model throughput (G33-T05)", () => {
  it("estimates from the 24/09 priors: a 2 600-token call needs ~200 s on V3.2, ~82 s on Flash", () => {
    expect(Math.round(estimateCompletionMs(V32, 2600)! / 1000)).toBe(201);
    expect(Math.round(estimateCompletionMs(FLASH, 2600)! / 1000)).toBe(82);
    expect(estimateCompletionMs("unknown/model", 2600)).toBeNull();
  });

  it("keeps quality order when everything fits, and moves slow models behind when the window is short", () => {
    expect(orderModelsBySpeed(LADDER, 1000, 300_000)).toEqual(LADDER);
    // W4 reserve of 120 s for a 3 200-token chapter: only Flash (≈100 s) fits.
    expect(orderModelsBySpeed(LADDER, 3200, 120_000)).toEqual([FLASH, V32, QWEN]);
    // No deadline → unchanged.
    expect(orderModelsBySpeed(LADDER, 3200, undefined)).toEqual(LADDER);
    // Nothing known fits → quality order stands; an unmeasured model never jumps ahead of measured ones.
    expect(orderModelsBySpeed([V32, FLASH, "x/new"], 4096, 60_000)).toEqual([V32, FLASH, "x/new"]);
    expect(orderModelsBySpeed([V32, "x/new", FLASH], 3200, 120_000)).toEqual([FLASH, V32, "x/new"]);
  });

  it("learns from streamed samples (EWMA) and ignores samples too small to measure", () => {
    recordModelSpeed(V32, { firstTokenMs: 500, totalMs: 500 + 10_000, outputTokens: 1300 }); // 130 tok/s — a fast day
    const s = modelSpeed(V32)!;
    expect(s.samples).toBe(1);
    expect(s.tokensPerSecond).toBeCloseTo(13 + 0.3 * (130 - 13), 5);
    // ≈48 tok/s now: a 3 200-token chapter (~67 s) fits the 120 s W4 window again → quality first.
    expect(orderModelsBySpeed(LADDER, 3200, 120_000)[0]).toBe(V32);
    // A slow sample pulls it back down (13 → 48 → ~34 tok/s … a few slow runs demote it again).
    for (let i = 0; i < 6; i++) recordModelSpeed(V32, { firstTokenMs: 500, totalMs: 500 + 250_000, outputTokens: 2500 }); // 10 tok/s
    expect(orderModelsBySpeed(LADDER, 3200, 120_000)[0]).toBe(FLASH);
    recordModelSpeed(V32, { firstTokenMs: 500, totalMs: 900, outputTokens: 10 });
    recordModelSpeed(V32, { firstTokenMs: null, totalMs: 10_000, outputTokens: 1000 });
    expect(modelSpeed(V32)!.samples).toBe(7);
  });
});
