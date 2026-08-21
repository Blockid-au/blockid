import { describe, it, expect, afterEach } from "vitest";
import { modelForAgent, currentAgentModelAssignment, MODEL_OPUS_5, MODEL_SONNET_5, MODEL_HAIKU_45 } from "./agent-model-tiers";

describe("modelForAgent", () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    // Reset any env overrides between tests so cases don't leak.
    for (const key of Object.keys(process.env)) {
      if (key.startsWith("MODEL_AGENT_")) delete process.env[key];
    }
    Object.assign(process.env, originalEnv);
  });

  it("defaults CEO to opus-5 (synthesis)", () => {
    expect(modelForAgent("ceo")).toBe(MODEL_OPUS_5);
  });

  it("defaults CFO to opus-5 (decision-critical valuation)", () => {
    expect(modelForAgent("cfo")).toBe(MODEL_OPUS_5);
  });

  it("defaults CMO to sonnet-5 (market analysis)", () => {
    expect(modelForAgent("cmo")).toBe(MODEL_SONNET_5);
  });

  it("defaults CDO to haiku-4.5 (mechanical data-quality)", () => {
    expect(modelForAgent("cdo")).toBe(MODEL_HAIKU_45);
  });

  it("defaults CISO to haiku-4.5 (mechanical security checklist)", () => {
    expect(modelForAgent("ciso")).toBe(MODEL_HAIKU_45);
  });

  it("respects MODEL_AGENT_<ROLE> env override", () => {
    process.env.MODEL_AGENT_CFO = "claude-opus-5-experimental";
    expect(modelForAgent("cfo")).toBe("claude-opus-5-experimental");
  });

  it("ignores empty-string env override", () => {
    process.env.MODEL_AGENT_CMO = "";
    expect(modelForAgent("cmo")).toBe(MODEL_SONNET_5);
  });

  it("currentAgentModelAssignment returns all 11 roles", () => {
    const a = currentAgentModelAssignment();
    expect(Object.keys(a).sort()).toEqual([
      "cdo", "ceo", "cfo", "chro", "ciso", "clo", "cmo", "coo", "cpo", "cro", "cto",
    ]);
  });
});
