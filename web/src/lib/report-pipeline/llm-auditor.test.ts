import { describe, it, expect } from "vitest";
import { auditText, auditSections, findUncitedClaims } from "./llm-auditor";
import { LlmAgent, SequentialAgent, newSession, type ModelCaller } from "@/lib/adk";

// A scripted mock ModelCaller — routes by which agent (system prompt) is calling,
// so tests are deterministic and never hit a real provider ($0, offline).
function mockModel(handlers: {
  critic: (user: string) => string;
  reviser: (user: string) => string;
}): ModelCaller {
  return async (system, user) => {
    if (/fact-checking critic/i.test(system)) return handlers.critic(user);
    if (/revise startup-report prose/i.test(system)) return handlers.reviser(user);
    return "";
  };
}

describe("ADK agent layer", () => {
  it("templates {key} from session state into instruction and user input", async () => {
    let seenSystem = "";
    let seenUser = "";
    const model: ModelCaller = async (system, user) => {
      seenSystem = system;
      seenUser = user;
      return "ok";
    };
    const agent = new LlmAgent({
      name: "t",
      instruction: "Company is {name}.",
      outputKey: "result",
    });
    const session = newSession({ name: "BlockID" });
    const res = await agent.run("Score for {name}?", session, model);

    expect(seenSystem).toBe("Company is BlockID.");
    expect(seenUser).toBe("Score for BlockID?");
    expect(res.output).toBe("ok");
    expect(session.state.result).toBe("ok"); // outputKey published to state
  });

  it("SequentialAgent threads output of one agent into the next via state", async () => {
    const model: ModelCaller = async (system) =>
      /first/i.test(system) ? "FIRST_OUT" : `saw:${"{prev}"}`;
    const a = new LlmAgent({ name: "a", instruction: "first", outputKey: "prev" });
    const b = new LlmAgent({ name: "b", instruction: "second uses {prev}" });
    const seq = new SequentialAgent("s", [a, b]);
    const session = newSession();
    const trace = await seq.run("go", session, model);

    expect(trace).toHaveLength(2);
    expect(session.state.prev).toBe("FIRST_OUT");
    expect(trace[1].agent).toBe("b");
  });
});

describe("llm-auditor", () => {
  const evidence = "Startup: Acme. Revenue: not disclosed. SVI market: 40/100.";

  it("passes through unchanged when critic finds the draft accurate", async () => {
    const draft = "Acme operates in a competitive market. Revenue was not disclosed.";
    const model = mockModel({
      critic: () => "FINDINGS:\n- none\n\nVERDICT: ACCURATE",
      reviser: () => "SHOULD NOT BE CALLED",
    });
    const res = await auditText(draft, evidence, model);

    expect(res.hadIssues).toBe(false);
    expect(res.findings).toEqual([]);
    expect(res.revised).toBe(draft);
  });

  it("flags fabricated specifics and returns the revised prose", async () => {
    const draft = "Acme has $2M ARR and 50,000 users, dominating the market.";
    const revised = "Acme is an early-stage player; revenue and user figures were not disclosed.";
    const model = mockModel({
      critic: () =>
        'FINDINGS:\n- Fabricated: "$2M ARR" not in evidence\n- Fabricated: "50,000 users" not in evidence\n\nVERDICT: NEEDS_REVISION',
      reviser: () => revised,
    });
    const res = await auditText(draft, evidence, model);

    expect(res.hadIssues).toBe(true);
    expect(res.findings).toHaveLength(2);
    expect(res.findings[0]).toMatch(/2M ARR/);
    expect(res.revised).toBe(revised);
  });

  it("is fail-safe: a throwing model returns the original draft untouched", async () => {
    const draft = "Original text.";
    const model: ModelCaller = async () => {
      throw new Error("provider down");
    };
    const res = await auditText(draft, evidence, model);

    expect(res.hadIssues).toBe(false);
    expect(res.revised).toBe(draft);
  });

  it("keeps the original when the reviser returns suspiciously empty output", async () => {
    const draft = "A long, perfectly fine paragraph of grounded analysis about Acme.";
    const model = mockModel({
      critic: () => "FINDINGS:\n- minor overstatement\n\nVERDICT: NEEDS_REVISION",
      reviser: () => "x", // junk / too-short revision
    });
    const res = await auditText(draft, evidence, model);

    expect(res.hadIssues).toBe(true);
    expect(res.revised).toBe(draft); // guard kept the original
  });
});

// ── §5.4 grounding across EVERY section (gap G8) ──────────────────────────────

const EV_A = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const EV_B = "bbbbbbbb-2222-4222-9222-bbbbbbbbbbbb";

describe("findUncitedClaims (free deterministic citation gate)", () => {
  it("passes a material claim that cites an allowed evidence id", () => {
    const text = `Acme reported A$1.2M ARR [ev:${EV_A}] in FY25.`;
    expect(findUncitedClaims(text, [EV_A, EV_B])).toEqual([]);
  });

  it("flags a material claim with no citation at all", () => {
    const text = "Acme reported A$1.2M ARR in FY25.";
    const flagged = findUncitedClaims(text, [EV_A]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0]).toMatch(/A\$1\.2M ARR/);
  });

  it("flags a claim citing an evidence id outside the allowed catalogue", () => {
    const rogue = "cccccccc-3333-4333-8333-cccccccccccc";
    const text = `Growth was 340% year on year [ev:${rogue}].`;
    expect(findUncitedClaims(text, [EV_A])).toHaveLength(1);
  });

  it("accepts an explicitly unevidenced claim (cite it or say you cannot)", () => {
    const text = "Revenue is estimated at A$400k (estimate). User count not disclosed.";
    expect(findUncitedClaims(text, [EV_A])).toEqual([]);
  });

  it("does not flag qualitative prose without material specifics", () => {
    const text =
      "The team shows strong domain expertise and a credible go-to-market plan.\n" +
      "Execution risk remains the dominant concern at this stage.";
    expect(findUncitedClaims(text, [EV_A])).toEqual([]);
  });

  it("ignores machine comments such as the score marker", () => {
    expect(findUncitedClaims("<!-- SCORE: 72 -->", [EV_A])).toEqual([]);
  });
});

describe("auditSections (multi-section sweep)", () => {
  const evidence = "Startup: Acme. Revenue: not disclosed. SVI market: 40/100.";

  function countingModel(critic: (u: string) => string, reviser = () => "revised prose that is comfortably long enough to pass the length guard") {
    let calls = 0;
    const model = async (system: string, user: string) => {
      calls += 1;
      if (/fact-checking critic/i.test(system)) return critic(user);
      if (/revise startup-report prose/i.test(system)) return reviser();
      return "";
    };
    return { model, calls: () => calls };
  }

  it("a section whose claims are all cited passes without a model call", async () => {
    const { model, calls } = countingModel(() => "FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    const out = await auditSections(
      [
        {
          id: "revenue",
          title: "Revenue",
          content: `Acme booked A$1.2M ARR [ev:${EV_A}] last year.`,
          allowedEvidenceIds: [EV_A],
        },
      ],
      evidence,
      model,
      { llmOnlyWhenUncited: true },
    );

    expect(out[0].grounded).toBe(true);
    expect(out[0].uncitedClaims).toEqual([]);
    expect(out[0].llmAudited).toBe(false);
    expect(out[0].skipped).toBe("clean");
    expect(calls()).toBe(0);
  });

  it("flags an uncited material claim and runs the critic on that section only", async () => {
    const { model, calls } = countingModel(
      () => 'FINDINGS:\n- Fabricated: "A$1.2M ARR" not in evidence\n\nVERDICT: NEEDS_REVISION',
    );
    const out = await auditSections(
      [
        { id: "revenue", title: "Revenue", content: "Acme booked A$1.2M ARR last year.", allowedEvidenceIds: [EV_A] },
        { id: "team", title: "Team", content: `Two co-founders with prior exits [ev:${EV_A}].`, allowedEvidenceIds: [EV_A] },
      ],
      evidence,
      model,
      { llmOnlyWhenUncited: true },
    );

    const revenue = out.find(o => o.sectionId === "revenue");
    const team = out.find(o => o.sectionId === "team");
    expect(revenue?.grounded).toBe(false);
    expect(revenue?.uncitedClaims[0]).toMatch(/A\$1\.2M ARR/);
    expect(revenue?.llmAudited).toBe(true);
    expect(revenue?.findings).toHaveLength(1);
    expect(revenue?.revised).toMatch(/revised prose/);
    expect(revenue?.modelCalls).toBe(2);
    expect(team?.llmAudited).toBe(false);
    expect(calls()).toBe(2); // critic + reviser, for one section only
  });

  it("full sweep audits every section, not just the flagged ones", async () => {
    const { model, calls } = countingModel(() => "FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    const sections = ["idea", "market", "team"].map(id => ({
      id,
      title: id,
      content: `Qualitative analysis for ${id} with no specifics.`,
      allowedEvidenceIds: [EV_A],
    }));

    const out = await auditSections(sections, evidence, model, { llmOnlyWhenUncited: false });

    expect(out.every(o => o.llmAudited)).toBe(true);
    expect(out.every(o => o.grounded)).toBe(true);
    expect(calls()).toBe(3); // critic only — no revision needed
  });

  it("stops making model calls once the budget guard trips", async () => {
    const { model, calls } = countingModel(() => "FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    let allowed = 1;
    const budgetOk = () => allowed-- > 0;

    const out = await auditSections(
      ["a", "b", "c"].map(id => ({ id, title: id, content: `Section ${id} prose.` })),
      evidence,
      model,
      { llmOnlyWhenUncited: false, budgetOk },
    );

    expect(calls()).toBe(1);
    expect(out[0].llmAudited).toBe(true);
    expect(out[1].skipped).toBe("budget");
    expect(out[2].skipped).toBe("budget");
    // Budget-skipped sections still carry the free deterministic verdict.
    expect(out[2].grounded).toBe(true);
  });

  it("budget-skipped sections keep an ungrounded verdict rather than passing by default", async () => {
    const { model } = countingModel(() => "FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    const out = await auditSections(
      [{ id: "revenue", title: "Revenue", content: "ARR hit A$4.5M this quarter." }],
      evidence,
      model,
      { budgetOk: () => false },
    );

    expect(out[0].skipped).toBe("budget");
    expect(out[0].grounded).toBe(false);
    expect(out[0].uncitedClaims).toHaveLength(1);
  });

  it("caps how many sections may run the LLM pass", async () => {
    const { model, calls } = countingModel(() => "FINDINGS:\n- none\n\nVERDICT: ACCURATE");
    const sections = ["a", "b", "c", "d"].map(id => ({ id, title: id, content: `Prose ${id}.` }));

    const out = await auditSections(sections, evidence, model, {
      llmOnlyWhenUncited: false,
      maxLlmSections: 2,
    });

    expect(calls()).toBe(2);
    expect(out.filter(o => o.skipped === "cap")).toHaveLength(2);
  });

  it("is fail-safe: a throwing model leaves every section content intact", async () => {
    const model = async () => {
      throw new Error("provider down");
    };
    const out = await auditSections(
      [{ id: "revenue", title: "Revenue", content: "ARR hit A$4.5M this quarter." }],
      evidence,
      model,
      { llmOnlyWhenUncited: false },
    );

    expect(out[0].revised).toBe("ARR hit A$4.5M this quarter.");
    expect(out[0].grounded).toBe(false); // still ungrounded — never silently passed
  });
});
