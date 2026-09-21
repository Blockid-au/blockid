// G28-B — per-stage model timeouts + W4 reserve constants.
import { afterEach, describe, expect, it } from "vitest";
import {
  FALLBACK_HEADROOM_MS,
  PIPELINE_TIMEOUT_MS,
  PIPELINE_TIMEOUT_MS_DEFAULT,
  PIPELINE_TIMEOUT_MS_MIN,
  W4_RESERVE_ENV,
  W4_RESERVE_MS_DEFAULT,
  pipelineCallTimeouts,
  pipelineTimeoutEnvName,
  pipelineTimeoutMs,
  w4ReserveMsFor,
} from "./pipeline-timeouts";

afterEach(() => {
  delete process.env.REPORT_PIPELINE_TIMEOUT_MS_CRITERION;
  delete process.env.REPORT_PIPELINE_TIMEOUT_MS_CHAPTER;
  delete process.env.REPORT_PIPELINE_TIMEOUT_MS_SYNTHESIS;
  delete process.env[W4_RESERVE_ENV];
});

describe("pipelineTimeoutMs — constants + env override", () => {
  it("criterion 60 s, chapter / synthesis 120 s, no stage → the legacy 120 s", () => {
    expect(PIPELINE_TIMEOUT_MS).toEqual({ criterion: 60_000, chapter: 120_000, synthesis: 120_000 });
    expect(pipelineTimeoutMs("criterion")).toBe(60_000);
    expect(pipelineTimeoutMs("chapter")).toBe(120_000);
    expect(pipelineTimeoutMs("synthesis")).toBe(120_000);
    expect(pipelineTimeoutMs(undefined)).toBe(PIPELINE_TIMEOUT_MS_DEFAULT);
    expect(pipelineTimeoutMs(null)).toBe(120_000);
  });

  it("REPORT_PIPELINE_TIMEOUT_MS_<STAGE> overrides one stage; garbage / ≤ 0 keep the constant; the 5 s floor holds", () => {
    expect(pipelineTimeoutEnvName("criterion")).toBe("REPORT_PIPELINE_TIMEOUT_MS_CRITERION");
    process.env.REPORT_PIPELINE_TIMEOUT_MS_CRITERION = "75000";
    expect(pipelineTimeoutMs("criterion")).toBe(75_000);
    expect(pipelineTimeoutMs("chapter")).toBe(120_000);
    process.env.REPORT_PIPELINE_TIMEOUT_MS_CRITERION = "garbage";
    expect(pipelineTimeoutMs("criterion")).toBe(60_000);
    process.env.REPORT_PIPELINE_TIMEOUT_MS_CRITERION = "-5";
    expect(pipelineTimeoutMs("criterion")).toBe(60_000);
    process.env.REPORT_PIPELINE_TIMEOUT_MS_SYNTHESIS = "1";
    expect(pipelineTimeoutMs("synthesis")).toBe(PIPELINE_TIMEOUT_MS_MIN);
  });
});

describe("pipelineCallTimeouts — the callAI options for a hint", () => {
  it("no hint → 120 s and no budget (legacy callers)", () => {
    expect(pipelineCallTimeouts()).toEqual({ timeoutMs: 120_000 });
    expect(pipelineCallTimeouts(null)).toEqual({ timeoutMs: 120_000 });
    expect(pipelineCallTimeouts({ stage: "criterion" })).toEqual({ timeoutMs: 60_000 });
  });

  it("a wide remaining clock keeps the stage timeout and passes the clock as the call budget", () => {
    expect(pipelineCallTimeouts({ stage: "criterion", remainingMs: 360_000 })).toEqual({ timeoutMs: 60_000, budgetMs: 360_000 });
    expect(pipelineCallTimeouts({ stage: "chapter", remainingMs: 384_000 })).toEqual({ timeoutMs: 120_000, budgetMs: 384_000 });
  });

  it("inside a tight window an attempt leaves headroom for one fallback: min(stage, max(budget/2, budget − 45 s))", () => {
    expect(FALLBACK_HEADROOM_MS).toBe(45_000);
    // The 120 s W4 reserve: 75 s first attempt, 45 s left for the fallback.
    expect(pipelineCallTimeouts({ stage: "chapter", remainingMs: 120_000 })).toEqual({ timeoutMs: 75_000, budgetMs: 120_000 });
    // 50 s left: two 25 s attempts beat one 50 s attempt.
    expect(pipelineCallTimeouts({ stage: "chapter", remainingMs: 50_000 })).toEqual({ timeoutMs: 25_000, budgetMs: 50_000 });
    // Criterion never exceeds 60 s even with a wide window; inside 100 s it leaves the 45 s headroom (100 − 45 = 55).
    expect(pipelineCallTimeouts({ stage: "criterion", remainingMs: 100_000 })).toEqual({ timeoutMs: 55_000, budgetMs: 100_000 });
    expect(pipelineCallTimeouts({ stage: "criterion", remainingMs: 200_000 })).toEqual({ timeoutMs: 60_000, budgetMs: 200_000 });
    // Nearly spent: the 5 s floor and a 1 s budget floor — fails fast instead of hanging.
    expect(pipelineCallTimeouts({ stage: "synthesis", remainingMs: 800 })).toEqual({ timeoutMs: 5_000, budgetMs: 1_000 });
    expect(pipelineCallTimeouts({ stage: "synthesis", remainingMs: Number.NaN })).toEqual({ timeoutMs: 120_000 });
  });
});

describe("w4ReserveMsFor — the W4 reserve", () => {
  it("120 s by default, never more than half the deadline", () => {
    expect(W4_RESERVE_MS_DEFAULT).toBe(120_000);
    expect(w4ReserveMsFor(480_000)).toBe(120_000);
    expect(w4ReserveMsFor(420_000)).toBe(120_000);
    expect(w4ReserveMsFor(240_000)).toBe(120_000);
    expect(w4ReserveMsFor(120_000)).toBe(60_000);
    expect(w4ReserveMsFor(90_000)).toBe(45_000);
  });

  it("REPORT_W4_RESERVE_MS overrides (0 allowed = no reserve); garbage keeps the default", () => {
    process.env[W4_RESERVE_ENV] = "60000";
    expect(w4ReserveMsFor(480_000)).toBe(60_000);
    process.env[W4_RESERVE_ENV] = "0";
    expect(w4ReserveMsFor(480_000)).toBe(0);
    process.env[W4_RESERVE_ENV] = "abc";
    expect(w4ReserveMsFor(480_000)).toBe(120_000);
    process.env[W4_RESERVE_ENV] = "900000";
    expect(w4ReserveMsFor(480_000)).toBe(240_000);
  });
});
