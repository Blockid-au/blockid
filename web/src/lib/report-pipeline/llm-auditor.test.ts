import { describe, it, expect } from "vitest";
import { auditText } from "./llm-auditor";
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
