import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// R&D Idea Lab — AI-fronted sector-aware angle generator.
// Tests below pin every branch of the AI parse + fallback loop so a silent
// widening of the parse-tolerance thresholds (angles < 6 / nonObvious < 3 /
// competitors < 2) or a re-tuning of the string-slice caps (title 120 /
// oneLiner 400 / etc.) can never corrupt the /api/idea-lab payload — either
// by shipping a half-empty AI response OR by silently starving the seed
// fallback that /api/idea-lab depends on to never 500.
// ---------------------------------------------------------------------------

const callAIMock = vi.fn();
vi.mock("@/lib/ai-client", () => ({
  callAI: (opts: unknown) => callAIMock(opts),
}));

import { generateIdeaLab, type IdeaLabRequest, type StartupAngle } from "./rnd-idea-lab";
import { SEED_SECTORS, getSeed } from "./rnd-idea-lab-seed";
import { SECTOR_LABELS } from "@/lib/svi-analysis";

// ── Helpers ────────────────────────────────────────────────────────────

function makeAngle(overrides: Partial<StartupAngle> = {}, idx = 0): StartupAngle {
  return {
    title: `Angle ${idx}`,
    oneLiner: `A one-liner for angle ${idx}.`,
    targetCustomer: `Customer ${idx}`,
    monetisation: `$${(idx + 1) * 10}/mo`,
    effortLevel: "medium",
    ...overrides,
  };
}

function makeAngles(n: number): StartupAngle[] {
  return Array.from({ length: n }, (_, i) => makeAngle({}, i));
}

function makeNonObvious(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    title: `Opp ${i}`,
    whyOverlooked: `Because ${i}`,
    hookForFounder: `Hook ${i}`,
  }));
}

function makeCompetitors(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    name: `Comp ${i}`,
    whatTheyDo: `They do ${i}`,
    angle: `Their moat ${i}`,
  }));
}

function goodAIPayload() {
  return JSON.stringify({
    angles: makeAngles(10),
    nonObvious: makeNonObvious(5),
    competitors: makeCompetitors(3),
  });
}

function req(over: Partial<IdeaLabRequest> = {}): IdeaLabRequest {
  return {
    sector: "fintech",
    problemArea: "SMB embedded payments",
    ...over,
  };
}

beforeEach(() => {
  callAIMock.mockReset();
});

// ── Envelope + shape ──────────────────────────────────────────────────

describe("generateIdeaLab — response envelope", () => {
  it("returns the 8 documented top-level keys on the AI happy path", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "sonnet-4-6" });
    const r = await generateIdeaLab(req());
    expect(Object.keys(r).sort()).toEqual(
      [
        "angles",
        "competitors",
        "generatedAt",
        "model",
        "nonObvious",
        "provider",
        "sector",
        "sectorLabel",
        "source",
      ].sort(),
    );
  });

  it("emits an ISO-8601 generatedAt that Date.parse round-trips", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(Number.isFinite(Date.parse(r.generatedAt))).toBe(true);
  });

  it("stamps source='ai' + model + provider when the AI answers cleanly", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "openai", model: "gpt-4o-mini" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
    expect(r.model).toBe("gpt-4o-mini");
    expect(r.provider).toBe("openai");
  });

  it("omits model + provider on seed fallback", async () => {
    callAIMock.mockRejectedValue(new Error("no key"));
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
    expect(r.model).toBeUndefined();
    expect(r.provider).toBeUndefined();
  });
});

// ── Sector normalisation + label resolution ───────────────────────────

describe("generateIdeaLab — sector normalisation", () => {
  it("lowercases and trims the sector into sectorKey before passing to seed / label lookup", async () => {
    callAIMock.mockRejectedValue(new Error("down"));
    const r = await generateIdeaLab(req({ sector: "  FinTech  " }));
    expect(r.sector).toBe("fintech");
    expect(r.sectorLabel).toBe(SECTOR_LABELS.fintech);
  });

  it("falls back to the raw req.sector for sectorLabel when the key is not in SECTOR_LABELS", async () => {
    callAIMock.mockRejectedValue(new Error("down"));
    const r = await generateIdeaLab(req({ sector: "quantumtech" }));
    expect(r.sectorLabel).toBe("quantumtech");
  });

  it("resolves sectorLabel to req.sector ('' — nullish-coalesced) when sector is empty; sectorKey is also blank", async () => {
    // `??` falls through only for null/undefined, so an empty req.sector propagates
    // to sectorLabel here. The "General" default only kicks in for a null/undefined
    // req.sector — pinned as a semantic guard for callers that pass literal "".
    callAIMock.mockRejectedValue(new Error("down"));
    const r = await generateIdeaLab(req({ sector: "" }));
    expect(r.sector).toBe("");
    expect(r.sectorLabel).toBe("");
  });
});

// ── Prompt composition ───────────────────────────────────────────────

describe("generateIdeaLab — prompt composition", () => {
  it("defaults audience to 'any' when omitted and reflects it in the user prompt", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req());
    const call = callAIMock.mock.calls[0][0];
    expect(call.user).toContain("Audience preference: any");
    expect(call.user).toContain("mix of consumer, SMB, and enterprise");
  });

  it("uses the caller-supplied audience when provided", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req({ audience: "enterprise" }));
    const call = callAIMock.mock.calls[0][0];
    expect(call.user).toContain("Audience preference: enterprise");
    expect(call.user).toContain("500+ employees");
  });

  it("caps problemArea at 500 chars in the prompt", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    const long = "x".repeat(700);
    await generateIdeaLab(req({ problemArea: long }));
    const call = callAIMock.mock.calls[0][0];
    // Trimmed to 500 max — the prompt should contain exactly 500 x's on one line.
    expect(call.user).toContain("x".repeat(500));
    expect(call.user).not.toContain("x".repeat(501));
  });

  it("substitutes '(open-ended...' when problemArea is blank/whitespace only", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req({ problemArea: "   " }));
    const call = callAIMock.mock.calls[0][0];
    expect(call.user).toContain("(open-ended");
  });

  it("wires the shared 1500-token cap + 45s timeout onto the AI call", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req());
    const call = callAIMock.mock.calls[0][0];
    expect(call.maxTokens).toBe(1500);
    expect(call.timeoutMs).toBe(45_000);
  });

  it("pins the AU-focused system prompt (regulators, no fake competitors, JSON-only)", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req());
    const { system } = callAIMock.mock.calls[0][0];
    expect(system).toMatch(/Australian/);
    expect(system).toMatch(/NEVER invent competitors/);
    expect(system).toMatch(/JSON/);
  });

  it("passes sectorKey='general' to the prompt when req.sector is blank so the model never gets an empty sector line", async () => {
    callAIMock.mockResolvedValue({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req({ sector: "" }));
    const { user } = callAIMock.mock.calls[0][0];
    expect(user).toContain("(general)");
  });
});

// ── Retry ladder ──────────────────────────────────────────────────────

describe("generateIdeaLab — retry ladder", () => {
  it("only calls the AI once when the first attempt parses clean", async () => {
    callAIMock.mockResolvedValueOnce({ text: goodAIPayload(), provider: "claude", model: "m" });
    await generateIdeaLab(req());
    expect(callAIMock).toHaveBeenCalledTimes(1);
  });

  it("retries once with a 'reply ONLY with raw JSON' nudge when the first parse fails", async () => {
    callAIMock
      .mockResolvedValueOnce({ text: "not json at all", provider: "claude", model: "m" })
      .mockResolvedValueOnce({ text: goodAIPayload(), provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(callAIMock).toHaveBeenCalledTimes(2);
    expect(r.source).toBe("ai");
    const secondCall = callAIMock.mock.calls[1][0];
    expect(secondCall.user).toContain("Your previous reply was not valid JSON");
  });

  it("falls back to seed when BOTH attempts fail to parse", async () => {
    callAIMock.mockResolvedValue({ text: "still garbage", provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(callAIMock).toHaveBeenCalledTimes(2);
    expect(r.source).toBe("seed");
  });

  it("falls back to seed when the first call throws and the second call throws", async () => {
    callAIMock.mockRejectedValue(new Error("boom"));
    const r = await generateIdeaLab(req());
    expect(callAIMock).toHaveBeenCalledTimes(2);
    expect(r.source).toBe("seed");
  });

  it("recovers when the first attempt throws and the second attempt returns valid JSON", async () => {
    callAIMock
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ text: goodAIPayload(), provider: "gemini", model: "gemini-2.0-flash" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
    expect(r.provider).toBe("gemini");
    expect(r.model).toBe("gemini-2.0-flash");
  });
});

// ── JSON extraction (fences, prose, brace slicing) ────────────────────

describe("generateIdeaLab — JSON extraction", () => {
  it("strips ```json code fences", async () => {
    const fenced = "```json\n" + goodAIPayload() + "\n```";
    callAIMock.mockResolvedValueOnce({ text: fenced, provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
  });

  it("strips bare ``` code fences without the json language tag", async () => {
    const fenced = "```\n" + goodAIPayload() + "\n```";
    callAIMock.mockResolvedValueOnce({ text: fenced, provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
  });

  it("finds the first {..} block when prose surrounds the JSON", async () => {
    const wrapped = "Here you go: " + goodAIPayload() + "\n\nHope that helps.";
    callAIMock.mockResolvedValueOnce({ text: wrapped, provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
  });

  it("returns null-parse (falls back on 2nd try) when there is no { in the text at all", async () => {
    callAIMock.mockResolvedValue({ text: "sorry, i can only reply in prose", provider: "claude", model: "m" });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });
});

// ── Validation thresholds (raise-blocker fallback) ────────────────────

describe("generateIdeaLab — validation thresholds", () => {
  it("falls back when only 5 angles pass validation (< 6 minimum)", async () => {
    callAIMock.mockResolvedValue({
      text: JSON.stringify({
        angles: makeAngles(5),
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });

  it("accepts a borderline payload with exactly 6 angles / 3 nonObvious / 2 competitors", async () => {
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(6),
        nonObvious: makeNonObvious(3),
        competitors: makeCompetitors(2),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
    expect(r.angles.length).toBe(6);
    expect(r.nonObvious.length).toBe(3);
    expect(r.competitors.length).toBe(2);
  });

  it("falls back when only 2 nonObvious pass validation (< 3 minimum)", async () => {
    callAIMock.mockResolvedValue({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: makeNonObvious(2),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });

  it("falls back when only 1 competitor passes validation (< 2 minimum)", async () => {
    callAIMock.mockResolvedValue({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(1),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });

  it("filters out angles missing a required string field (title empty) then re-checks thresholds", async () => {
    const angles = makeAngles(10);
    angles[0] = { ...angles[0], title: "" };
    angles[1] = { ...angles[1], oneLiner: "" };
    // 8 valid remain — still ≥ 6, so AI wins.
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
    expect(r.angles.length).toBe(8);
  });

  it("filters non-object array elements (null, number, string) rather than throwing", async () => {
    const rawAngles: unknown[] = [
      ...makeAngles(6),
      null,
      42,
      "oops",
      { title: "", oneLiner: "x", targetCustomer: "x", monetisation: "x", effortLevel: "medium" },
    ];
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: rawAngles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("ai");
    expect(r.angles.length).toBe(6);
  });

  it("treats a missing 'angles' key as empty array and falls back", async () => {
    callAIMock.mockResolvedValue({
      text: JSON.stringify({
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });

  it("treats non-array angles (object) as empty and falls back", async () => {
    callAIMock.mockResolvedValue({
      text: JSON.stringify({
        angles: { not: "an array" },
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.source).toBe("seed");
  });
});

// ── Slice caps (over-count) ───────────────────────────────────────────

describe("generateIdeaLab — over-count slicing", () => {
  it("slices angles to 10 when the model returns 12", async () => {
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(12),
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.angles.length).toBe(10);
  });

  it("slices nonObvious to 5 when the model returns 8", async () => {
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: makeNonObvious(8),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.nonObvious.length).toBe(5);
  });

  it("slices competitors to 3 when the model returns 6", async () => {
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(6),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.competitors.length).toBe(3);
  });
});

// ── String slicing + effort coercion ──────────────────────────────────

describe("generateIdeaLab — field-level slicing", () => {
  it("slices angle.title to 120 chars", async () => {
    const angle = makeAngle({ title: "T".repeat(300) });
    const angles = [angle, ...makeAngles(9).slice(1)];
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.angles[0].title.length).toBe(120);
  });

  it("slices angle.oneLiner to 400 chars", async () => {
    const angle = makeAngle({ oneLiner: "O".repeat(800) });
    const angles = [angle, ...makeAngles(9).slice(1)];
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.angles[0].oneLiner.length).toBe(400);
  });

  it("coerces an unknown effortLevel to 'medium'", async () => {
    const angle = makeAngle({ effortLevel: "extreme" as unknown as StartupAngle["effortLevel"] });
    const angles = [angle, ...makeAngles(9).slice(1)];
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.angles[0].effortLevel).toBe("medium");
  });

  it("preserves valid 'low' | 'medium' | 'high' effort values verbatim", async () => {
    const angles = [
      makeAngle({ effortLevel: "low" }, 0),
      makeAngle({ effortLevel: "medium" }, 1),
      makeAngle({ effortLevel: "high" }, 2),
      ...makeAngles(7).slice(3),
    ];
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles,
        nonObvious: makeNonObvious(5),
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.angles[0].effortLevel).toBe("low");
    expect(r.angles[1].effortLevel).toBe("medium");
    expect(r.angles[2].effortLevel).toBe("high");
  });

  it("slices competitor.name to 100 chars", async () => {
    const comps = makeCompetitors(3);
    comps[0].name = "N".repeat(500);
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: makeNonObvious(5),
        competitors: comps,
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.competitors[0].name.length).toBe(100);
  });

  it("slices nonObvious.whyOverlooked + hookForFounder to 300 chars", async () => {
    const opps = makeNonObvious(5);
    opps[0].whyOverlooked = "W".repeat(900);
    opps[0].hookForFounder = "H".repeat(900);
    callAIMock.mockResolvedValueOnce({
      text: JSON.stringify({
        angles: makeAngles(10),
        nonObvious: opps,
        competitors: makeCompetitors(3),
      }),
      provider: "claude",
      model: "m",
    });
    const r = await generateIdeaLab(req());
    expect(r.nonObvious[0].whyOverlooked.length).toBe(300);
    expect(r.nonObvious[0].hookForFounder.length).toBe(300);
  });
});

// ── Seed fallback content contract ────────────────────────────────────

describe("generateIdeaLab — seed fallback content", () => {
  it("uses the deterministic sector seed on fallback for a known sector", async () => {
    callAIMock.mockRejectedValue(new Error("no key"));
    const r = await generateIdeaLab(req({ sector: "fintech" }));
    expect(r.source).toBe("seed");
    expect(r.angles).toEqual(SEED_SECTORS.fintech.angles);
    expect(r.nonObvious).toEqual(SEED_SECTORS.fintech.nonObvious);
    expect(r.competitors).toEqual(SEED_SECTORS.fintech.competitors);
  });

  it("uses the generic seed shape for an unknown sector on fallback (still 10/5/3)", async () => {
    callAIMock.mockRejectedValue(new Error("no key"));
    const r = await generateIdeaLab(req({ sector: "quantumtech" }));
    expect(r.source).toBe("seed");
    expect(r.angles.length).toBe(10);
    expect(r.nonObvious.length).toBe(5);
    expect(r.competitors.length).toBe(3);
    const expected = getSeed("quantumtech");
    expect(r.angles).toEqual(expected.angles);
  });

  it("still exposes the sectorLabel from SECTOR_LABELS on fallback for a known key", async () => {
    callAIMock.mockRejectedValue(new Error("no key"));
    const r = await generateIdeaLab(req({ sector: "saas" }));
    expect(r.sectorLabel).toBe(SECTOR_LABELS.saas);
  });
});
