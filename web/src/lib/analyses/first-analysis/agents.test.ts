// Colocated suite for the C-level section writer (S32-B). Stub caller only —
// no live model. Pins: the prompt carries the echo and the grounding rules;
// the parser reads TITLE / body / NEXT (and tolerates markdown); a short
// first answer is retried once with the reason; a still-unusable answer
// throws AgentSectionError; a capacity error is NOT swallowed.

import { describe, expect, it, vi } from "vitest";

import { AICapacityError } from "@/lib/ai/capacity";
import {
  AgentSectionError,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  clipRaw,
  isAcceptable,
  parseAgentText,
  writeAgentSection,
  type AgentGrounding,
} from "./agents";
import { sampleReport } from "./fixtures";
import { AGENT_SECTION_MIN_WORDS } from "./types";

function grounding(): AgentGrounding {
  const r = sampleReport({ agents: false });
  return { company: r.company, echo: r.echo, svi: r.svi, valuation: r.valuation, rawExcerpt: clipRaw("MRR is A$18,500.") };
}

const WORDS = Array.from({ length: 170 }, (_, i) => `word${i}`).join(" ");
const GOOD = `TITLE: Strategy for Kelpie\n\n${WORDS}\n\nNEXT:\n1. Do the first thing.\n2. Do the second thing.\n3. Do the third thing.`;

describe("prompts", () => {
  it("system prompt carries the grounding, tone and format rules", () => {
    const sys = buildAgentSystemPrompt("cfo");
    expect(sys).toContain("GROUNDING");
    expect(sys).toContain("Never invent revenue");
    expect(sys).toContain(`at least ${AGENT_SECTION_MIN_WORDS} words`);
    expect(sys).toContain("TITLE:");
    expect(sys).toContain("NEXT:");
    expect(sys).toContain("Australian English");
    expect(sys).toMatch(/mentor/i);
  });

  it("user prompt hands over the echo, the SVI and the valuation basis", () => {
    const user = buildAgentUserPrompt(grounding());
    expect(user).toContain("WHAT WE READ");
    expect(user).toContain("Revenue:");
    expect(user).toContain("Startup Value Index:");
    expect(user).toContain("INDICATIVE VALUATION");
    expect(user).toContain("a revenue figure from the input");
    expect(user).toContain("Kelpie Rostering");
  });
});

describe("parseAgentText", () => {
  it("reads the contract", () => {
    const p = parseAgentText(GOOD);
    expect(p?.title).toBe("Strategy for Kelpie");
    expect(p?.nextSteps).toEqual(["Do the first thing.", "Do the second thing.", "Do the third thing."]);
    expect(p?.wordCount).toBe(170);
    expect(isAcceptable(p)).toBe(true);
  });

  it("tolerates markdown headings, bold and a 'Next steps' heading", () => {
    const p = parseAgentText(`## **TITLE: Bold title**\n\n${WORDS}\n\n### Next steps\n- one\n- two\n- three\n- four`);
    expect(p?.title).toBe("Bold title");
    expect(p?.nextSteps).toEqual(["one", "two", "three"]);
  });

  it("returns null for an empty answer", () => {
    expect(parseAgentText("")).toBeNull();
    expect(parseAgentText("   \n  ")).toBeNull();
  });
});

describe("writeAgentSection", () => {
  it("accepts a good first answer and records provider/model", async () => {
    const call = vi.fn().mockResolvedValue({ text: GOOD, provider: "claude", model: "claude-sonnet-5" });
    const section = await writeAgentSection("ceo", grounding(), call, () => new Date("2026-09-15T00:00:00Z"));
    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0][0].agentId).toBe("first-analysis-ceo");
    expect(section).toMatchObject({ role: "ceo", title: "Strategy for Kelpie", provider: "claude", model: "claude-sonnet-5", wordCount: 170 });
    expect(section.nextSteps).toHaveLength(3);
  });

  it("retries once with the reason when the first answer is too short, and keeps the better one", async () => {
    const short = `TITLE: Short\n\nOnly a few words here.\n\nNEXT:\n1. a\n2. b\n3. c`;
    const call = vi.fn().mockResolvedValueOnce({ text: short }).mockResolvedValueOnce({ text: GOOD });
    const section = await writeAgentSection("cmo", grounding(), call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0].user).toMatch(/at least 150 are required/);
    expect(section.wordCount).toBe(170);
  });

  it("throws AgentSectionError when both answers are unusable", async () => {
    const call = vi.fn().mockResolvedValue({ text: "No." });
    await expect(writeAgentSection("clo", grounding(), call)).rejects.toBeInstanceOf(AgentSectionError);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("lets a capacity error propagate untouched", async () => {
    const call = vi.fn().mockRejectedValue(new AICapacityError("queue_full", 7, { queued: 3, running: 4 }));
    await expect(writeAgentSection("cto", grounding(), call)).rejects.toBeInstanceOf(AICapacityError);
    expect(call).toHaveBeenCalledTimes(1);
  });
});
