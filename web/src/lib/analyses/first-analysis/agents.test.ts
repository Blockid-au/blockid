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
  checkGrounding,
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

  it("falls back to a trailing numbered list when the NEXT marker is missing (truncated answer, 2026-09-15 smoke)", () => {
    const p = parseAgentText(`TITLE: Fallback\n\n${WORDS}\n\nFocus on these three actions this week:\n1. Sign one customer.\n2. Register the company.\n3. Link the repo.`);
    expect(p?.nextSteps).toEqual(["Sign one customer.", "Register the company.", "Link the repo."]);
    expect(p?.body).toContain("Focus on these three actions this week:");
    expect(p?.body).not.toContain("Sign one customer");
    expect(isAcceptable(p)).toBe(true);
  });

  it("merges a numbered label with the bullet under it (allam-2-7b shape, 2026-09-15 smoke)", () => {
    const p = parseAgentText(`TITLE: Labels\n\n${WORDS}\n\nNEXT:\n1. Revenue generation:\n   - Sign one paying tradie.\n2. Team expansion:\n   - Find a technical co-founder.\n3. Compliance:\n   - Register an ABN.`);
    expect(p?.nextSteps).toEqual([
      "Revenue generation: Sign one paying tradie.",
      "Team expansion: Find a technical co-founder.",
      "Compliance: Register an ABN.",
    ]);
  });

  it("skips leaked reasoning before the title (nemotron shape, 2026-09-15 smoke)", () => {
    const p = parseAgentText(`We need to write a section for the Chief Legal Officer, focusing on structure and compliance.\n\nLegal foundations for Kelpie\n\n${WORDS}\n\nNEXT:\n1. a\n2. b\n3. c`);
    expect(p?.title).toBe("Legal foundations for Kelpie");
    expect(p?.body).not.toMatch(/We need to write/);
    const withTitle = parseAgentText(`Okay, the user wants a CFO section.\n\nTITLE: Money plan\n\n${WORDS}\n\nNEXT:\n1. a\n2. b\n3. c`);
    expect(withTitle?.title).toBe("Money plan");
  });

  it("returns null for an empty answer", () => {
    expect(parseAgentText("")).toBeNull();
    expect(parseAgentText("   \n  ")).toBeNull();
  });
});

describe("checkGrounding", () => {
  it("accepts figures from the input, the range and the assumptions; flags invented ones and a misstated valuation", () => {
    const g = grounding();
    const low = `A$${(g.valuation.lowAud / 1_000_000).toFixed(1)}M`;
    const high = `A$${(g.valuation.highAud / 1_000_000).toFixed(1)}M`;
    const good = `MRR is A$18,500 today. The indicative valuation of ${low} to ${high} rests on Berkus pillars capped at A$2.0M each.`;
    expect(checkGrounding(good, g)).toEqual({ ok: true, ungrounded: [], misstatedValuation: [] });

    const invented = "They raised A$333,333 last year and burn about $60k a month.";
    const v1 = checkGrounding(invented, g);
    expect(v1.ok).toBe(false);
    expect(v1.ungrounded).toEqual(["A$333,333", "$60k"]);
    expect(v1.misstatedValuation).toEqual([]);

    const misstated = "Wattle Ledger's indicative valuation is A$1.2M pre-seed, based on the SVI.";
    const v2 = checkGrounding(misstated, g);
    expect(v2.ok).toBe(false);
    expect(v2.ungrounded).toEqual([]); // A$1.2M is the founder's ask — grounded, but not the valuation
    expect(v2.misstatedValuation).toEqual(["A$1.2M"]);
  });

  it("ignores percentages (benchmarks by rule)", () => {
    expect(checkGrounding("The R&D Tax Incentive refunds 43.5% and churn above 3% would hurt.", grounding()).ok).toBe(true);
  });
});

describe("writeAgentSection", () => {
  it("retries a misstated valuation with the range spelled out, and fails the section if it persists", async () => {
    const bad = `TITLE: Wrong\n\n${WORDS} The indicative valuation is A$1.2M.\n\nNEXT:\n1. a\n2. b\n3. c`;
    const call = vi.fn().mockResolvedValue({ text: bad });
    await expect(writeAgentSection("ceo", grounding(), call)).rejects.toThrow(/misstated the valuation/);
    expect(call).toHaveBeenCalledTimes(2);
    expect(call.mock.calls[1][0].user).toMatch(/presented A\$1\.2M as the valuation; the indicative range is/);
  });

  it("keeps a grounded rewrite over an ungrounded first answer", async () => {
    const bad = `TITLE: Wrong\n\n${WORDS} Last quarter they made A$9.9M.\n\nNEXT:\n1. a\n2. b\n3. c`;
    const call = vi.fn().mockResolvedValueOnce({ text: bad }).mockResolvedValueOnce({ text: GOOD });
    const section = await writeAgentSection("cfo", grounding(), call);
    expect(section.title).toBe("Strategy for Kelpie");
  });

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
