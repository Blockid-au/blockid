// G28-B — run-scoped provider strikes (pure ledger).
import { afterEach, describe, expect, it } from "vitest";
import { RUN_STRIKE_THRESHOLD_DEFAULT, RunStrikeLedger, RunStruckError, classifyRunStrike, createRunStrikeLedger, runStrikeThreshold } from "./run-strikes";

describe("classifyRunStrike", () => {
  it("counts worker timeouts and overloaded / 429 answers, nothing else", () => {
    expect(classifyRunStrike(new Error("Worker timeout (120s)"))).toBe("timeout");
    expect(classifyRunStrike(new Error("Worker timeout (45s)"))).toBe("timeout");
    expect(classifyRunStrike(new Error("request timed out"))).toBe("timeout");
    expect(classifyRunStrike(new Error("socket hang up"))).toBe("timeout");
    expect(classifyRunStrike(new Error('HTTP 429: {"error":{"message":"Model busy, retry later","code":"engine_overloaded"}}'))).toBe("overloaded");
    expect(classifyRunStrike(new Error("429 quota RESOURCE_EXHAUSTED"))).toBe("overloaded");
    expect(classifyRunStrike(new Error("Rate limit reached for model"))).toBe("overloaded");
    expect(classifyRunStrike("Overloaded")).toBe("overloaded");
    // Not strikes — they have their own cooldowns and say nothing about slowness.
    expect(classifyRunStrike(new Error("HTTP 401: invalid api key"))).toBeNull();
    expect(classifyRunStrike(new Error("HTTP 404: model not found"))).toBeNull();
    expect(classifyRunStrike(new Error("Empty DeepInfra response"))).toBeNull();
    expect(classifyRunStrike(new Error("Unexpected token < in JSON"))).toBeNull();
    expect(classifyRunStrike(new Error("AI call budget exhausted (60s across providers)"))).toBeNull();
    expect(classifyRunStrike(new RunStruckError("deepinfra", 2))).toBeNull();
    expect(classifyRunStrike(null)).toBeNull();
    expect(classifyRunStrike("")).toBeNull();
  });
});

describe("RunStrikeLedger", () => {
  afterEach(() => {
    delete process.env.AI_RUN_STRIKE_THRESHOLD;
  });

  it("a provider is struck at the second timeout / overloaded answer; other providers stay dialable", () => {
    const ledger = createRunStrikeLedger();
    expect(ledger.threshold).toBe(RUN_STRIKE_THRESHOLD_DEFAULT);
    expect(ledger.note("deepinfra", new Error("Worker timeout (45s)"))).toBe("timeout");
    expect(ledger.struck("deepinfra")).toBe(false);
    expect(ledger.note("deepinfra", new Error("HTTP 429: engine_overloaded"))).toBe("overloaded");
    expect(ledger.struck("deepinfra")).toBe(true);
    expect(ledger.struck("gemini")).toBe(false);
    expect(ledger.strikes("gemini")).toBe(0);
    expect(ledger.struckProviders()).toEqual(["deepinfra"]);
    expect(ledger.snapshot()).toEqual({ deepinfra: { strikes: 2, timeout: 1, overloaded: 1 } });
  });

  it("the same error object is counted once — a ladder records the attempt and callAI's catch sees it again", () => {
    const ledger = createRunStrikeLedger();
    const err = new Error("Worker timeout (45s)");
    expect(ledger.note("deepinfra", err)).toBe("timeout");
    expect(ledger.note("deepinfra", err)).toBeNull();
    expect(ledger.strikes("deepinfra")).toBe(1);
    expect(ledger.struck("deepinfra")).toBe(false);
  });

  it("non-strike errors never count", () => {
    const ledger = createRunStrikeLedger();
    expect(ledger.note("groq", new Error("HTTP 401"))).toBeNull();
    expect(ledger.note("groq", new Error("Empty Groq response"))).toBeNull();
    expect(ledger.strikes("groq")).toBe(0);
    expect(ledger.snapshot()).toEqual({});
  });

  it("strikes are per ledger — a new run starts clean", () => {
    const a = createRunStrikeLedger();
    a.note("deepinfra", new Error("Worker timeout (45s)"));
    a.note("deepinfra", new Error("Worker timeout (45s)"));
    expect(a.struck("deepinfra")).toBe(true);
    const b = createRunStrikeLedger();
    expect(b.struck("deepinfra")).toBe(false);
    expect(b.strikes("deepinfra")).toBe(0);
  });

  it("AI_RUN_STRIKE_THRESHOLD overrides the threshold (min 1); garbage keeps the default", () => {
    process.env.AI_RUN_STRIKE_THRESHOLD = "3";
    expect(runStrikeThreshold()).toBe(3);
    const three = createRunStrikeLedger();
    three.note("deepinfra", new Error("Worker timeout (45s)"));
    three.note("deepinfra", new Error("Worker timeout (45s)"));
    expect(three.struck("deepinfra")).toBe(false);
    three.note("deepinfra", new Error("Worker timeout (45s)"));
    expect(three.struck("deepinfra")).toBe(true);
    process.env.AI_RUN_STRIKE_THRESHOLD = "0";
    expect(runStrikeThreshold()).toBe(RUN_STRIKE_THRESHOLD_DEFAULT);
    process.env.AI_RUN_STRIKE_THRESHOLD = "nope";
    expect(runStrikeThreshold()).toBe(RUN_STRIKE_THRESHOLD_DEFAULT);
    expect(new RunStrikeLedger(0).threshold).toBe(1);
  });

  it("RunStruckError names the provider and is not itself a strike or a cooldown trigger", () => {
    const err = new RunStruckError("deepinfra", 2);
    expect(err.name).toBe("RunStruckError");
    expect(err.provider).toBe("deepinfra");
    expect(err.message).toMatch(/deepinfra skipped for the rest of this run after 2 strikes/);
    // The message must not read as a 429 / timeout to cooldownForError or the ledger.
    expect(/rate.?limit|\b429\b|quota|too many requests|overloaded|capacity|timeout/i.test(err.message)).toBe(false);
  });
});
