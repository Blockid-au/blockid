// Colocated vitest for the grant-advisor narrative (T0240). `callAI` is
// mocked — the auditor's critic/reviser calls run through the same mock.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/ai-client", () => ({
  callAI: vi.fn(),
}));

import { callAI } from "@/lib/ai-client";
import { mapGrantSeeds, mapProgramSeeds } from "@/lib/funding/seed-map";
import { buildTimeline, matchGrants, matchPrograms, type GrantProfile } from "./grant-advisor";
import {
  buildNarrativePrompt,
  extractActions,
  narrateFundingPlan,
  stripUncitedNames,
  templateNarrative,
  GRANT_ADVISOR_SYSTEM,
  type NarrativeInput,
} from "./grant-advisor-narrative";

const mockCallAI = vi.mocked(callAI);

const DATA_DIR = resolve(__dirname, "../../../content/data");
const grants = mapGrantSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "grants-au.seed.json"), "utf8")) as { grants: unknown[] }).grants,
);
const programs = mapProgramSeeds(
  (JSON.parse(readFileSync(resolve(DATA_DIR, "programs-au.seed.json"), "utf8")) as { programs: unknown[] }).programs,
);
const TODAY = new Date(Date.UTC(2026, 8, 10));

const PROFILE: GrantProfile = {
  state: "NSW",
  city: "Sydney",
  stage: "mvp",
  entity_type: "pty_ltd",
  incorporated_at: "2025-03-01",
  turnover_aud: 40_000,
  prior_year_expenses_aud: 90_000,
  prior_year_income_aud: 10_000,
  rd_spend_aud: 60_000,
  headcount: 3,
  industry_tags: ["ai_ml", "software_saas"],
  funding_need_aud: 200_000,
};

function topFor(profile: GrantProfile, n = 6): NarrativeInput {
  const g = matchGrants(profile, grants, TODAY);
  const p = matchPrograms(profile, programs, TODAY);
  return {
    grants: g.slice(0, n),
    programs: p.slice(0, n),
    timeline: buildTimeline(profile, g, p, TODAY),
    catalogue: { grants, programs },
    totals: { grants: g.length, programs: p.length },
  };
}

const ok = (text: string) => ({ text, provider: "groq" as const, model: "test" });

function goodNarrative(top: NarrativeInput): string {
  const g = top.grants[0];
  const p = top.programs[0];
  return [
    "## Where you stand",
    "You are an MVP-stage AI startup in Sydney with A$60,000 of R&D spend on the books, which is the single most valuable number on your profile right now.",
    "",
    "## Grants to pursue",
    `Start with ${g.name} [${g.ref_id}] because it fits your stage today. Prepare the evidence pack this month.`,
    "",
    "## Programs to join",
    `${p.name} [${p.ref_id}] is the right next room to be in — apply before the deadline in the timeline.`,
    "",
    "## Your next 12 months",
    "- 2026-09 · lodge the first applications",
    "- 2027-03 · register R&D activities [rdti] before 30 April",
    "",
    "## Next actions",
    `1. Apply to ${p.name} [${p.ref_id}] this week.`,
    `2. Book a registered tax agent to confirm the R&DTI position [rdti].`,
    `3. Prepare your ${g.name} [${g.ref_id}] evidence pack.`,
    "",
    "General information only, not financial, tax or legal advice.",
  ].join("\n");
}

describe("stripUncitedNames", () => {
  const top = topFor(PROFILE);

  it("drops sentences naming catalogue rows that are not in the top lists, keeps cited ones", () => {
    const uncited = grants.find((r) => !top.grants.some((g) => g.ref_id === r.id) && r.id === "boosting-female-founders")!;
    const text = `Apply to ${top.grants[0].name} first. You should also try ${uncited.name} for A$480k. Then keep building.`;
    const out = stripUncitedNames(text, { grants: top.grants, programs: top.programs }, top.catalogue);
    expect(out.stripped).toHaveLength(1);
    expect(out.stripped[0]).toMatch(/Boosting Female Founders/);
    expect(out.text).toContain(top.grants[0].name);
    expect(out.text).toContain("Then keep building.");
    expect(out.text).not.toMatch(/Boosting Female Founders/);
  });

  it("removes well-known dead schemes even without a catalogue", () => {
    const out = stripUncitedNames("Techstars Sydney is a great option. Keep going.", { grants: [], programs: [] });
    expect(out.text).toBe("Keep going.");
  });

  it("drops a whole bullet line when nothing survives", () => {
    const out = stripUncitedNames("- Industry Growth Program (A$250k)\n- Keep this line", { grants: [], programs: [] });
    expect(out.text).toBe("- Keep this line");
  });
});

describe("extractActions / template", () => {
  it("parses numbered and bulleted actions under the Next actions heading", () => {
    const md = "## Plan\ntext\n## Next actions\n1. Do A\n2. Do B\n- Do C\n## After\n1. not an action";
    expect(extractActions(md)).toEqual(["Do A", "Do B", "Do C"]);
    expect(extractActions("no heading")).toEqual([]);
  });

  it("template narrative is deterministic, cites ref_ids and ends with three actions", () => {
    const top = topFor(PROFILE);
    const a = templateNarrative(PROFILE, top);
    const b = templateNarrative(PROFILE, top);
    expect(a).toEqual(b);
    expect(a.actions).toHaveLength(3);
    expect(a.narrative_md).toContain(`[${top.grants[0].ref_id}]`);
    expect(a.narrative_md).toMatch(/We matched \d+ grants and \d+ programs/);
    expect(a.narrative_md).toContain(`${top.totals!.grants} grants`);
    expect(a.narrative_md).toMatch(/not financial, tax or legal advice/);
  });

  it("prompt lists only the supplied rows with ref_ids and timing labels", () => {
    const top = topFor(PROFILE, 3);
    const prompt = buildNarrativePrompt(PROFILE, top);
    for (const g of top.grants) expect(prompt).toContain(`[${g.ref_id}]`);
    for (const p of top.programs) expect(prompt).toContain(`[${p.ref_id}]`);
    expect(prompt).toContain("FOUNDER PROFILE");
    expect(prompt).toContain("A$60,000");
    expect(GRANT_ADVISOR_SYSTEM).toMatch(/ref_id/);
    expect(GRANT_ADVISOR_SYSTEM).toMatch(/900 words/);
  });
});

describe("narrateFundingPlan", () => {
  beforeEach(() => {
    mockCallAI.mockReset();
  });

  it("happy path: one narrative call at temperature 0.4, critic says ACCURATE, actions extracted", async () => {
    const top = topFor(PROFILE);
    const draft = goodNarrative(top);
    mockCallAI.mockImplementation(async (opts) => {
      if (opts.system === GRANT_ADVISOR_SYSTEM) return ok(draft);
      // llm-auditor critic
      return ok("FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    });
    const res = await narrateFundingPlan(PROFILE, top);
    expect(res.source).toBe("llm");
    expect(res.narrative_md).toBe(draft);
    expect(res.actions).toHaveLength(3);
    expect(res.actions[0]).toMatch(new RegExp(top.programs[0].ref_id));
    expect(res.audit_findings).toEqual([]);
    expect(res.stripped).toEqual([]);
    expect(mockCallAI).toHaveBeenCalledTimes(2); // narrative + critic (no reviser)
    const first = mockCallAI.mock.calls[0][0];
    expect(first.temperature).toBe(0.4);
    expect(first.system).toBe(GRANT_ADVISOR_SYSTEM);
    expect(first.agentId).toBe("grant-advisor");
  });

  it("uses the reviser output when the critic objects, then strips uncited names", async () => {
    const top = topFor(PROFILE);
    const draft = goodNarrative(top) + "\n\nAlso consider Boosting Female Founders for A$480,000.";
    const revised = goodNarrative(top) + "\n\nAlso consider Accelerating Commercialisation for A$1M.";
    let call = 0;
    mockCallAI.mockImplementation(async (opts) => {
      call += 1;
      if (opts.system === GRANT_ADVISOR_SYSTEM) return ok(draft);
      if (call === 2) return ok("FINDINGS:\n- \"A$480,000\" is not in the evidence\n\nVERDICT: NEEDS_REVISION");
      return ok(revised);
    });
    const res = await narrateFundingPlan(PROFILE, top);
    expect(res.source).toBe("llm");
    expect(res.audit_findings).toHaveLength(1);
    expect(mockCallAI).toHaveBeenCalledTimes(3);
    expect(res.narrative_md).not.toMatch(/Boosting Female Founders/);
    expect(res.narrative_md).not.toMatch(/Accelerating Commercialisation/);
    expect(res.stripped.some((s) => /Accelerating Commercialisation/.test(s))).toBe(true);
  });

  it("falls back to the template when callAI throws", async () => {
    mockCallAI.mockRejectedValue(new Error("all providers down"));
    const top = topFor(PROFILE);
    const res = await narrateFundingPlan(PROFILE, top);
    expect(res.source).toBe("template");
    expect(res.actions).toHaveLength(3);
    expect(res.narrative_md).toContain("## Next actions");
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it("falls back when the model returns fewer than 200 characters", async () => {
    mockCallAI.mockResolvedValue(ok("Too short."));
    const res = await narrateFundingPlan(PROFILE, topFor(PROFILE));
    expect(res.source).toBe("template");
    expect(mockCallAI).toHaveBeenCalledTimes(1);
  });

  it("skips the auditor when audit=false and still guards names", async () => {
    const top = { ...topFor(PROFILE), audit: false };
    mockCallAI.mockResolvedValue(ok(goodNarrative(top) + "\nTechstars Sydney would also suit you."));
    const res = await narrateFundingPlan(PROFILE, top);
    expect(mockCallAI).toHaveBeenCalledTimes(1);
    expect(res.source).toBe("llm");
    expect(res.narrative_md).not.toMatch(/Techstars/);
    expect(res.stripped).toHaveLength(1);
  });

  it("tops up actions from the timeline when the model gives fewer than three", async () => {
    const top = { ...topFor(PROFILE), audit: false };
    const draft = goodNarrative(top).replace(/\n2\. .*\n3\. .*/, "");
    mockCallAI.mockResolvedValue(ok(draft));
    const res = await narrateFundingPlan(PROFILE, top);
    expect(res.actions).toHaveLength(3);
  });
});
