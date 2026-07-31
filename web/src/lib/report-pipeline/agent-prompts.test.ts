// Pins the runtime shape + text of the three exports from `agent-prompts.ts`:
//   1. AU_CONTEXT       — the mentoring-tone AU disclaimer prefixed to every prompt
//   2. AGENT_PROMPTS    — per-C-Level agent {role, expertise, criteria[], outputGuidance}
//   3. buildAgentPrompt — the pure prompt builder consumed by agent-dispatcher +
//                         orchestrator (CEO exec summary, CDO cross-validation)
//
// A silent drift in AU_CONTEXT (dropped AU refs, wrong tone) or in a role's
// outputGuidance (missing SCORE tag, wrong stage guidance) leaks straight into
// every generated report — pricing, credit charge, and DOCX section headings
// are all derived from these strings.
//
// Pure, no mocks, no I/O — the test just diff-guards the prompt surface.
import { describe, expect, it } from "vitest";
import type { ReportContext } from "./types";
import { AGENT_ROLES } from "./types";
import { AGENT_PROMPTS, AU_CONTEXT, buildAgentPrompt } from "./agent-prompts";

const ROLE_ORDER = [
  "ceo",
  "cto",
  "cfo",
  "cpo",
  "cmo",
  "cro",
  "clo",
  "chro",
  "ciso",
  "cdo",
  "coo",
] as const;

function makeContext(overrides: Partial<{
  startupName: string;
  stage: number;
  stageLabel: string;
  totalSVI: number;
  locale: "en" | "vi";
}> = {}): ReportContext {
  const stage = overrides.stage ?? 3;
  return {
    accountId: "acc_1",
    userId: "u_1",
    projectId: "p_1",
    startupName: overrides.startupName ?? "Acme Robotics",
    rawText: "",
    sviAnalysis: {
      totalSVI: overrides.totalSVI ?? 142,
      stageLabel: overrides.stageLabel ?? "Growth",
    } as ReportContext["sviAnalysis"],
    evidenceItems: [],
    criteriaData: {} as ReportContext["criteriaData"],
    stage,
    locale: overrides.locale ?? "en",
    gatherResults: {},
    criterionResults: new Map(),
  };
}

describe("AU_CONTEXT", () => {
  it("names BlockID.au as the platform authorship anchor", () => {
    expect(AU_CONTEXT).toMatch(/BlockID\.au/);
  });

  it("cites the four AU legal / tax reference points", () => {
    for (const ref of ["ESIC", "ASIC", "ABN", "R&D Tax Incentive"]) {
      expect(AU_CONTEXT).toContain(ref);
    }
  });

  it("pins the current R&D refundable offset rate (43.5%)", () => {
    // Rate change would materially shift CFO section guidance for eligible
    // startups (<A$20M revenue) — pin the exact string to force a review.
    expect(AU_CONTEXT).toContain("43.5%");
  });

  it("mentions ASX as an AU listing pathway (not NASDAQ / NYSE)", () => {
    expect(AU_CONTEXT).toContain("ASX");
    expect(AU_CONTEXT).not.toMatch(/\bNASDAQ\b/);
    expect(AU_CONTEXT).not.toMatch(/\bNYSE\b/);
  });

  it("declares the supportive-mentoring tone (not judgmental / harsh)", () => {
    // Feedback memory: report tone must be mentoring with step-by-step guidance.
    expect(AU_CONTEXT).toMatch(/MENTORING/);
    expect(AU_CONTEXT).toMatch(/supportive/i);
  });

  it("mandates specificity (named competitors, real data, numbers)", () => {
    expect(AU_CONTEXT).toMatch(/competitors/);
    expect(AU_CONTEXT).toMatch(/numbers/);
  });

  it("mandates Markdown output with ### sub-headings + **bold** insights", () => {
    expect(AU_CONTEXT).toContain("### sub-headings");
    expect(AU_CONTEXT).toContain("**bold**");
  });

  it("is a non-trivial multi-line string (guards against accidental blanking)", () => {
    expect(AU_CONTEXT.split("\n").length).toBeGreaterThan(5);
    expect(AU_CONTEXT.length).toBeGreaterThan(400);
  });
});

describe("AGENT_PROMPTS", () => {
  it("has an entry for every AGENT_ROLES member", () => {
    for (const role of AGENT_ROLES) {
      expect(AGENT_PROMPTS[role]).toBeDefined();
    }
  });

  it("has exactly 11 entries — no extra / stale role keys", () => {
    expect(Object.keys(AGENT_PROMPTS)).toHaveLength(11);
  });

  it("uses the canonical shipped order (matches AGENT_ROLES)", () => {
    expect(Object.keys(AGENT_PROMPTS)).toEqual([...ROLE_ORDER]);
  });

  it("every entry ships the 4 documented keys (role, expertise, criteria, outputGuidance)", () => {
    for (const role of AGENT_ROLES) {
      const p = AGENT_PROMPTS[role];
      expect(Object.keys(p).sort()).toEqual(["criteria", "expertise", "outputGuidance", "role"]);
    }
  });

  it("every role text is non-empty and human-readable", () => {
    for (const role of AGENT_ROLES) {
      const p = AGENT_PROMPTS[role];
      expect(p.role.length).toBeGreaterThan(5);
      expect(p.expertise.length).toBeGreaterThan(20);
      expect(p.outputGuidance.length).toBeGreaterThan(80);
    }
  });

  it("role labels start with 'Chief' or 'CEO' — no lowercase / stripped titles", () => {
    for (const role of AGENT_ROLES) {
      expect(AGENT_PROMPTS[role].role).toMatch(/^(CEO|Chief)\b/);
    }
  });

  it("criteria arrays contain only strings (never undefined / null)", () => {
    for (const role of AGENT_ROLES) {
      const c = AGENT_PROMPTS[role].criteria;
      expect(Array.isArray(c)).toBe(true);
      for (const key of c) {
        expect(typeof key).toBe("string");
        expect(key.length).toBeGreaterThan(0);
      }
    }
  });

  it("CEO + CDO have empty criteria (they synthesise, not evaluate)", () => {
    // CEO writes the executive summary, CDO cross-validates — neither owns
    // a specific SVI criterion in the dispatcher wave map.
    expect(AGENT_PROMPTS.ceo.criteria).toEqual([]);
    expect(AGENT_PROMPTS.cdo.criteria).toEqual([]);
  });

  it("every operational agent (non-CEO / non-CDO) owns ≥ 1 criterion", () => {
    for (const role of AGENT_ROLES) {
      if (role === "ceo" || role === "cdo") continue;
      expect(AGENT_PROMPTS[role].criteria.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("CFO output pins the R&D 43.5% offset with the AU revenue cap", () => {
    expect(AGENT_PROMPTS.cfo.outputGuidance).toContain("43.5%");
    expect(AGENT_PROMPTS.cfo.outputGuidance).toMatch(/A\$20M/);
  });

  it("CLO output covers Corporations Act s180-184 director duties + APP + ESIC", () => {
    const g = AGENT_PROMPTS.clo.outputGuidance;
    expect(g).toContain("s180-184");
    expect(g).toContain("Corporations Act 2001");
    expect(g).toMatch(/APP/);
    expect(g).toContain("ESIC");
  });

  it("CHRO output pins the AU ESOP benchmark band (10-15% pre-Series A)", () => {
    expect(AGENT_PROMPTS.chro.outputGuidance).toContain("10-15%");
  });

  it("CISO output cites the AU Essential Eight maturity model", () => {
    expect(AGENT_PROMPTS.ciso.outputGuidance).toContain("Essential Eight");
  });

  it("CMO owns market + gtm_strategy + website — the outbound tri-set", () => {
    expect(AGENT_PROMPTS.cmo.criteria).toEqual(["market", "gtm_strategy", "website"]);
  });

  it("COO's 90-Day Roadmap covers all 3 months with weekly milestones", () => {
    const g = AGENT_PROMPTS.coo.outputGuidance;
    expect(g).toContain("Month 1");
    expect(g).toContain("Month 2");
    expect(g).toContain("Month 3");
    expect(g).toContain("90-Day");
  });

  it("criteria keys are lowercase snake_case (matches CriterionKey convention)", () => {
    for (const role of AGENT_ROLES) {
      for (const key of AGENT_PROMPTS[role].criteria) {
        expect(key).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("every outputGuidance starts with an imperative sentence", () => {
    // Prompt-engineering convention: agent tasks lead with a verb so the LLM
    // treats the block as an instruction, not context.
    for (const role of AGENT_ROLES) {
      const first = AGENT_PROMPTS[role].outputGuidance.split(/\n/, 1)[0];
      expect(first).toMatch(/^[A-Z]\w+/);
    }
  });
});

describe("buildAgentPrompt — assembly", () => {
  it("returns a non-empty string for every role", () => {
    const ctx = makeContext();
    for (const role of AGENT_ROLES) {
      const out = buildAgentPrompt(role, ctx);
      expect(typeof out).toBe("string");
      expect(out.length).toBeGreaterThan(500);
    }
  });

  it("prefixes AU_CONTEXT verbatim (first block of every prompt)", () => {
    const out = buildAgentPrompt("cfo", makeContext());
    expect(out.startsWith(AU_CONTEXT)).toBe(true);
  });

  it("injects the role's title into the '## Your Role:' block", () => {
    const out = buildAgentPrompt("clo", makeContext());
    expect(out).toContain(`## Your Role: ${AGENT_PROMPTS.clo.role}`);
    expect(out).toContain(AGENT_PROMPTS.clo.expertise);
  });

  it("interpolates startup name + stage + SVI score into Startup Context", () => {
    const ctx = makeContext({
      startupName: "Nimbus Health",
      stage: 5,
      stageLabel: "Scale",
      totalSVI: 187,
    });
    const out = buildAgentPrompt("cro", ctx);
    expect(out).toContain("- Name: Nimbus Health");
    expect(out).toContain("(Stage 5)");
    expect(out).toContain("Scale");
    expect(out).toContain("- Current SVI Score: 187");
  });

  it("declares English when locale='en'", () => {
    const out = buildAgentPrompt("cmo", makeContext({ locale: "en" }));
    expect(out).toContain("- Language: English");
    expect(out).not.toContain("Vietnamese");
  });

  it("declares Vietnamese with Tieng Viet marker when locale='vi'", () => {
    const out = buildAgentPrompt("cmo", makeContext({ locale: "vi" }));
    expect(out).toContain("- Language: Vietnamese (Tieng Viet)");
  });

  it("embeds the role's outputGuidance under '## Your Task'", () => {
    const out = buildAgentPrompt("cto", makeContext());
    expect(out).toContain("## Your Task");
    expect(out).toContain(AGENT_PROMPTS.cto.outputGuidance);
  });

  it("appends the shipped Output Format block (SCORE marker + 5 numbered actions)", () => {
    const out = buildAgentPrompt("ceo", makeContext());
    expect(out).toContain("## Output Format");
    expect(out).toContain("### Recommended Actions (numbered 1-5)");
    expect(out).toContain("<!-- SCORE: XX -->");
    expect(out).toContain("VALUE PROPOSITION");
    expect(out).toContain("KEY INSIGHT");
  });

  it("pins the 500-1500 word target for every generated section", () => {
    // If this changes without a paired REPORT_TIER_CONFIG update, tier
    // minWords/maxWords windows drift and premium tier under-delivers.
    const out = buildAgentPrompt("cpo", makeContext());
    expect(out).toContain("Total output: 500-1500 words");
  });

  it("ignores the optional criterionKey argument (currently informational only)", () => {
    const ctx = makeContext();
    const a = buildAgentPrompt("cto", ctx);
    const b = buildAgentPrompt("cto", ctx, "code_git");
    expect(a).toBe(b);
  });
});

describe("buildAgentPrompt — stage-aware guidance", () => {
  it("uses Early-Stage guidance for stage 1 (encouraging tone, no unit economics focus)", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 1 }));
    expect(out).toContain("## Stage Guidance (Early Stage)");
    expect(out).toContain("MVP scope");
    expect(out).toContain("Australian grants");
  });

  it("uses Early-Stage guidance for stage 2 (boundary — includes 2)", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 2 }));
    expect(out).toContain("Early Stage");
  });

  it("switches to Growth-Stage guidance at stage 3 (boundary — excludes early)", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 3 }));
    expect(out).toContain("## Stage Guidance (Growth Stage)");
    expect(out).not.toContain("Early Stage");
  });

  it("stays on Growth-Stage guidance at stage 4 (upper boundary — includes 4)", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 4 }));
    expect(out).toContain("Growth Stage");
  });

  it("switches to Scale-Stage guidance at stage 5", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 5 }));
    expect(out).toContain("## Stage Guidance (Scale Stage)");
    expect(out).toContain("institutional investor readiness");
  });

  it("Scale-Stage guidance mentions governance + exit planning + board composition", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 7 }));
    const scale = out.slice(out.indexOf("## Stage Guidance"));
    expect(scale).toContain("governance");
    expect(scale).toContain("exit planning");
    expect(scale).toContain("board composition");
  });

  it("selects exactly one stage-guidance block per prompt (no leakage across bands)", () => {
    for (const stage of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const out = buildAgentPrompt("cro", makeContext({ stage }));
      const hits = (out.match(/## Stage Guidance/g) ?? []).length;
      expect(hits).toBe(1);
    }
  });

  it("Growth-Stage guidance signals that unit economics are now relevant", () => {
    const out = buildAgentPrompt("cfo", makeContext({ stage: 3 }));
    expect(out).toMatch(/[Uu]nit economics/);
  });
});
