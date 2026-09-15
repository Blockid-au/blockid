// Colocated suite for the C-level section writer (S32-B). Stub caller only —
// no live model. Pins: the prompt carries the echo and the grounding rules;
// the parser reads TITLE / body / NEXT (and tolerates markdown); a short
// first answer is retried once with the reason; a still-unusable answer
// throws AgentSectionError; a capacity error is NOT swallowed.

import { describe, expect, it, vi } from "vitest";

import { AICapacityError } from "@/lib/ai/capacity";
import {
  AgentSectionError,
  BENCHMARK_TAG,
  buildAgentSystemPrompt,
  buildAgentUserPrompt,
  checkGrounding,
  clipRaw,
  isAcceptable,
  parseAgentText,
  tagBenchmarks,
  writeAgentSection,
  type AgentGrounding,
} from "./agents";
import { sampleReport } from "./fixtures";
import { AGENT_SECTION_MIN_WORDS } from "./types";

function grounding(): AgentGrounding {
  const r = sampleReport({ agents: false });
  return { company: r.company, echo: r.echo, svi: r.svi, valuation: r.valuation, rawExcerpt: clipRaw("MRR is A$18,500.") };
}

/** The 2026-09-15 09:18 UTC live input: Melbourne allied-health SaaS, MRR A$9,400, raising A$800k on a A$5M cap. */
const MELBOURNE_RAW =
  "Allied-health practice management SaaS in Melbourne. MRR is A$9,400 across 31 clinics. " +
  "Two founders, one physio and one engineer. Raising A$800k on a SAFE with a A$5M valuation cap.";

function melbourneGrounding(): AgentGrounding {
  const r = sampleReport({ agents: false, rawText: MELBOURNE_RAW });
  return { company: r.company, echo: r.echo, svi: r.svi, valuation: r.valuation, rawExcerpt: clipRaw(MELBOURNE_RAW) };
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
  it("accepts figures from the input, the range and the assumptions; flags invented own-facts and a misstated valuation", () => {
    const g = grounding();
    const low = `A$${(g.valuation.lowAud / 1_000_000).toFixed(1)}M`;
    const high = `A$${(g.valuation.highAud / 1_000_000).toFixed(1)}M`;
    const good = `MRR is A$18,500 today. The indicative valuation of ${low} to ${high} rests on Berkus pillars capped at A$2.0M each.`;
    // The Berkus cap is a method assumption, not the founder's data — allowed, and tagged.
    expect(checkGrounding(good, g)).toEqual({ ok: true, ungrounded: [], misstatedValuation: [], benchmarks: ["A$2.0M"] });

    const invented = "You have raised A$333,333 to date and your burn is about $60k a month.";
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

  // Defect 1 (live run 2026-09-15 09:18 UTC): advice figures are not claims
  // about the company. The CHRO's AU salary range failed the whole section.
  describe("S32-E: own-facts vs benchmarks", () => {
    it("the CHRO salary sentence with $70k / $85k passes, as benchmarks", () => {
      const chro = "A first customer-success hire in Melbourne typically earns between $70k and $85k plus super; a part-time contractor is the cheaper first step.";
      const v = checkGrounding(chro, melbourneGrounding());
      expect(v.ok).toBe(true);
      expect(v.ungrounded).toEqual([]);
      expect(v.benchmarks).toEqual(["$70k", "$85k"]);
    });

    it("the same figures with no benchmark word are still advice, not own-facts", () => {
      const v = checkGrounding("Expect to pay $70k to $85k for that role in Melbourne.", melbourneGrounding());
      expect(v.ok).toBe(true);
      expect(v.benchmarks).toEqual(["$70k", "$85k"]);
    });

    it("'your valuation is A$42M' with a stated cap of A$5M fails", () => {
      const v = checkGrounding("On these numbers your valuation is A$42M, which the cap does not reflect.", melbourneGrounding());
      expect(v.ok).toBe(false);
      expect(v.ungrounded).toEqual(["A$42M"]);
      expect(v.misstatedValuation).toEqual(["A$42M"]);
    });

    it("'your MRR of A$9,400' passes — it matches the input", () => {
      const v = checkGrounding("Your MRR of A$9,400 across 31 clinics is real traction for this stage.", melbourneGrounding());
      expect(v).toEqual({ ok: true, ungrounded: [], misstatedValuation: [], benchmarks: [] });
    });

    it("an own-fact within ±10 % of an input figure passes (rounding), outside it fails", () => {
      const g = melbourneGrounding();
      expect(checkGrounding("Your MRR is around A$9.5k.", g).ok).toBe(true);
      // Derived from the input by the valuation (ARR = 12 × MRR): an own-fact, not a benchmark.
      expect(checkGrounding("Your ARR is A$112,800.", g)).toMatchObject({ ok: true, benchmarks: [] });
      expect(checkGrounding("Your MRR is around A$12k.", g)).toMatchObject({ ok: false, ungrounded: ["A$12k"] });
      expect(checkGrounding("Your raise of A$800k on your cap of A$5M is a 16% sale.", g).ok).toBe(true);
      expect(checkGrounding("You are raising A$1.5M.", g)).toMatchObject({ ok: false, ungrounded: ["A$1.5M"] });
    });

    it("'budget ≈ A$120k for two hires' passes and is tagged", () => {
      const v = checkGrounding("Plan a budget ≈ A$120k for two hires over the first year.", melbourneGrounding());
      expect(v.ok).toBe(true);
      expect(v.benchmarks).toEqual(["A$120k"]);
      expect(tagBenchmarks("Plan a budget ≈ A$120k for two hires; A$120k again later.", v.benchmarks)).toBe(
        `Plan a budget ≈ A$120k ${BENCHMARK_TAG} for two hires; A$120k again later.`,
      );
    });

    it("a clause boundary stops 'your … of' reaching a benchmark in the next sentence", () => {
      const v = checkGrounding("Track your runway. A typical seed round of A$1.5M buys 18 months.", melbourneGrounding());
      expect(v.ok).toBe(true);
      expect(v.benchmarks).toEqual(["A$1.5M"]);
    });

    it("tagBenchmarks never tags a prefix of a longer figure and is idempotent", () => {
      const once = tagBenchmarks("Costs run $7 per seat, or $70k a year.", ["$7", "$70k"]);
      expect(once).toBe(`Costs run $7 ${BENCHMARK_TAG} per seat, or $70k ${BENCHMARK_TAG} a year.`);
      expect(tagBenchmarks(once, ["$7", "$70k"])).toBe(once);
    });
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

  it("keeps a grounded rewrite over an own-fact-ungrounded first answer, and says why", async () => {
    const bad = `TITLE: Wrong\n\n${WORDS} You have generated A$77.7M in revenue so far.\n\nNEXT:\n1. a\n2. b\n3. c`;
    const call = vi.fn().mockResolvedValueOnce({ text: bad }).mockResolvedValueOnce({ text: GOOD });
    const section = await writeAgentSection("cfo", grounding(), call);
    expect(section.title).toBe("Strategy for Kelpie");
    expect(call.mock.calls[1][0].user).toMatch(/stated A\$77\.7M as this company's own figure/);
  });

  it("S32-E: benchmark figures never trigger the retry; they are tagged once and listed on the section", async () => {
    const chro = `TITLE: People plan\n\n${WORDS} A first customer-success hire in Melbourne typically earns between $70k and $85k plus super. Budget ≈ A$120k for two hires.\n\nNEXT:\n1. Post the role at $70k.\n2. b\n3. Set aside A$5k for onboarding.`;
    const call = vi.fn().mockResolvedValue({ text: chro, provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash" });
    const section = await writeAgentSection("chro", melbourneGrounding(), call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(section.benchmarkFigures).toEqual(["$70k", "$85k", "A$120k", "A$5k"]);
    expect(section.body).toContain(`between $70k ${BENCHMARK_TAG} and $85k ${BENCHMARK_TAG}`);
    expect(section.body).toContain(`A$120k ${BENCHMARK_TAG}`);
    // $70k was tagged in the body, so the step keeps it plain; A$5k only appears in a step.
    expect(section.nextSteps[0]).toBe("Post the role at $70k.");
    expect(section.nextSteps[2]).toBe(`Set aside A$5k ${BENCHMARK_TAG} for onboarding.`);
  });

  it("S32-E: a persistent own-fact miss fails the section and names the model on the error", async () => {
    const bad = `TITLE: Wrong\n\n${WORDS} Your valuation is A$42M today.\n\nNEXT:\n1. a\n2. b\n3. c`;
    const call = vi.fn().mockResolvedValue({ text: bad, provider: "groq", model: "allam-2-7b" });
    const err = await writeAgentSection("cfo", melbourneGrounding(), call).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(AgentSectionError);
    expect((err as AgentSectionError).message).toMatch(/misstated the valuation/);
    expect((err as AgentSectionError).provider).toBe("groq");
    expect((err as AgentSectionError).model).toBe("allam-2-7b");
    expect(call).toHaveBeenCalledTimes(2);
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
