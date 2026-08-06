// Barrel test for src/lib/adk/index.ts — the top-level ADK-style agent
// primitive barrel consumed by the report pipeline (llm-auditor + every
// `src/lib/adk/agents/*` sample) and by any future ADK-shaped code path.
//
// The sibling `src/lib/adk/agents/index.ts` re-exports the *agent samples*
// (optimizeForSearch / handleSupportQuery / analyzeFinancials / researchMarket)
// and is pinned by `src/lib/adk/agents/index.test.ts`. This file pins the
// upstream primitives layer — LlmAgent / SequentialAgent / newSession — and
// proves the two contracts every downstream caller relies on:
//
//   1. Every runtime export is identity-equal to the source-module export in
//      `./agent`, so a rename or re-shuffle of the primitives module cannot
//      silently drop a symbol from the public barrel.
//   2. The behavioural envelope of each re-exported primitive is intact when
//      constructed / invoked *through the barrel* (not the source module).
//      This guards against a future refactor that swaps `./agent` for
//      `./agent-v2` and forgets to re-run the source-side agent.test.ts —
//      the barrel-side envelope catches that in one pair of `vitest run`.
//
// Coverage overlaps the source-side agent.test.ts intentionally on the
// happy path so the barrel proves the wire, not just the identity.
//
// Loop tag: P9-adk-barrel-lib-test

import { describe, expect, it } from "vitest";

import {
  LlmAgent,
  SequentialAgent,
  newSession,
  type AgentSession,
  type LlmAgentConfig,
  type AgentRunResult,
  type ModelCaller,
} from "./index";

import {
  LlmAgent as LlmAgentSrc,
  SequentialAgent as SequentialAgentSrc,
  newSession as newSessionSrc,
} from "./agent";

// ─── Test helpers ──────────────────────────────────────────────────────────

/** Model that echoes back what it received, with a marker for shape checks. */
function recordingModel(reply = ""): {
  call: ModelCaller;
  calls: Array<{ system: string; user: string; maxTokens: number }>;
} {
  const calls: Array<{ system: string; user: string; maxTokens: number }> = [];
  const call: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    return reply;
  };
  return { call, calls };
}

/** Model that returns successive scripted replies. */
function scriptedModel(replies: string[]): ModelCaller {
  let i = 0;
  return async () => {
    const reply = replies[i] ?? "";
    i += 1;
    return reply;
  };
}

// ─── Barrel identity ───────────────────────────────────────────────────────

describe("adk barrel — identity re-exports", () => {
  it("re-exports LlmAgent identity-equal to the source module", () => {
    expect(LlmAgent).toBe(LlmAgentSrc);
  });

  it("re-exports SequentialAgent identity-equal to the source module", () => {
    expect(SequentialAgent).toBe(SequentialAgentSrc);
  });

  it("re-exports newSession identity-equal to the source module", () => {
    expect(newSession).toBe(newSessionSrc);
  });

  it("LlmAgent is a constructable class (typeof function)", () => {
    expect(typeof LlmAgent).toBe("function");
    // Node marks classes with prototype.constructor pointing back at the class.
    expect(LlmAgent.prototype.constructor).toBe(LlmAgent);
  });

  it("SequentialAgent is a constructable class (typeof function)", () => {
    expect(typeof SequentialAgent).toBe("function");
    expect(SequentialAgent.prototype.constructor).toBe(SequentialAgent);
  });

  it("newSession is a plain function (not a class)", () => {
    expect(typeof newSession).toBe("function");
    // A factory function shouldn't be marked as a class — no `class` in its
    // stringified form. This guards against an accidental refactor from
    // factory function into a class shape (which would break callers that
    // invoke it without `new`).
    expect(String(newSession).startsWith("class ")).toBe(false);
  });
});

// ─── newSession — session factory envelope ────────────────────────────────

describe("adk barrel — newSession", () => {
  it("returns a fresh {state:{}} when called with no arguments", () => {
    const session = newSession();
    expect(session).toEqual({ state: {} });
  });

  it("copies the seed into a new state object (mutating the seed after is safe)", () => {
    const seed = { analysis: "seeded" };
    const session = newSession(seed);
    seed.analysis = "mutated after construction";
    expect(session.state).toEqual({ analysis: "seeded" });
  });

  it("returns independent sessions on each call (state objects are not shared)", () => {
    const a = newSession({ k: "v" });
    const b = newSession({ k: "v" });
    a.state.k = "changed-in-a";
    expect(b.state.k).toBe("v");
  });

  it("returns an object whose `state` shape matches the AgentSession type", () => {
    const session: AgentSession = newSession({ x: "1" });
    // AgentSession is `{ state: Record<string, string> }` — round-trip through
    // the type keeps the barrel export compatible with downstream callers.
    session.state["y"] = "2";
    expect(session.state).toEqual({ x: "1", y: "2" });
  });
});

// ─── LlmAgent — construction + run envelope through the barrel ────────────

describe("adk barrel — LlmAgent envelope", () => {
  it("applies config defaults (description='', maxTokens=2048, outputKey=undefined)", () => {
    const agent = new LlmAgent({ name: "critic", instruction: "critique {topic}" });
    expect(agent.name).toBe("critic");
    expect(agent.description).toBe("");
    expect(agent.maxTokens).toBe(2048);
    expect(agent.outputKey).toBeUndefined();
    expect(agent.instruction).toBe("critique {topic}");
  });

  it("preserves explicit config fields verbatim", () => {
    const cfg: LlmAgentConfig = {
      name: "analyst",
      description: "runs the health check",
      instruction: "analyse {facts}",
      maxTokens: 512,
      outputKey: "analysis",
    };
    const agent = new LlmAgent(cfg);
    expect(agent.name).toBe("analyst");
    expect(agent.description).toBe("runs the health check");
    expect(agent.maxTokens).toBe(512);
    expect(agent.outputKey).toBe("analysis");
  });

  it("templates {key} tokens in the instruction against session.state before calling the model", async () => {
    const { call, calls } = recordingModel("");
    const agent = new LlmAgent({ name: "a", instruction: "summarise {topic}" });
    const session = newSession({ topic: "cap-table basics" });
    await agent.run("please help", session, call);
    expect(calls[0]?.system).toBe("summarise cap-table basics");
  });

  it("templates {key} tokens in the userInput against session.state", async () => {
    const { call, calls } = recordingModel("");
    const agent = new LlmAgent({ name: "a", instruction: "help" });
    const session = newSession({ user_name: "Ava" });
    await agent.run("hi {user_name}", session, call);
    expect(calls[0]?.user).toBe("hi Ava");
  });

  it("replaces missing template keys with the empty string (never emits {key})", async () => {
    const { call, calls } = recordingModel("");
    const agent = new LlmAgent({ name: "a", instruction: "seen: {missing}!" });
    await agent.run("also {gone}?", newSession(), call);
    expect(calls[0]?.system).toBe("seen: !");
    expect(calls[0]?.user).toBe("also ?");
  });

  it("forwards maxTokens through to the ModelCaller call site", async () => {
    const { call, calls } = recordingModel("");
    const agent = new LlmAgent({ name: "a", instruction: "x", maxTokens: 137 });
    await agent.run("y", newSession(), call);
    expect(calls[0]?.maxTokens).toBe(137);
  });

  it("trims the model output before publishing to session.state[outputKey]", async () => {
    const { call } = recordingModel("  \n  produced text  \n");
    const agent = new LlmAgent({
      name: "a",
      instruction: "run",
      outputKey: "answer",
    });
    const session = newSession();
    const result = await agent.run("go", session, call);
    expect(result.output).toBe("produced text");
    expect(session.state["answer"]).toBe("produced text");
  });

  it("does not touch session.state when outputKey is not set", async () => {
    const { call } = recordingModel("hello");
    const agent = new LlmAgent({ name: "a", instruction: "run" });
    const session = newSession({ seeded: "keep-me" });
    await agent.run("go", session, call);
    expect(session.state).toEqual({ seeded: "keep-me" });
  });

  it("returns an AgentRunResult with the agent name, trimmed output, and a numeric duration", async () => {
    const { call } = recordingModel("done");
    const agent = new LlmAgent({ name: "critic", instruction: "run" });
    const result: AgentRunResult = await agent.run("go", newSession(), call);
    expect(result.agent).toBe("critic");
    expect(result.output).toBe("done");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── SequentialAgent — pipe envelope through the barrel ───────────────────

describe("adk barrel — SequentialAgent envelope", () => {
  it("stores the name + sub-agents list verbatim", () => {
    const a = new LlmAgent({ name: "one", instruction: "1" });
    const b = new LlmAgent({ name: "two", instruction: "2" });
    const pipe = new SequentialAgent("pipeline", [a, b]);
    expect(pipe.name).toBe("pipeline");
    expect(pipe.subAgents).toEqual([a, b]);
    // Same object identity — no defensive copy.
    expect(pipe.subAgents[0]).toBe(a);
    expect(pipe.subAgents[1]).toBe(b);
  });

  it("returns an empty trace when there are no sub-agents", async () => {
    const { call, calls } = recordingModel("ignored");
    const pipe = new SequentialAgent("empty", []);
    const trace = await pipe.run("kick-off", newSession(), call);
    expect(trace).toEqual([]);
    expect(calls.length).toBe(0);
  });

  it("passes initialInput to the first sub-agent's userInput", async () => {
    const { call, calls } = recordingModel("");
    const a = new LlmAgent({ name: "a", instruction: "sys-a" });
    const pipe = new SequentialAgent("p", [a]);
    await pipe.run("initial-input", newSession(), call);
    expect(calls[0]?.user).toBe("initial-input");
  });

  it("threads the previous agent's raw output into the next agent's userInput", async () => {
    const model = scriptedModel(["stage-1-out", "stage-2-out"]);
    const captured: Array<{ system: string; user: string; maxTokens: number }> = [];
    const capturing: ModelCaller = async (s, u, m) => {
      captured.push({ system: s, user: u, maxTokens: m });
      // Delegate to the scripted replies.
      return model(s, u, m);
    };
    const a = new LlmAgent({ name: "a", instruction: "sys-a" });
    const b = new LlmAgent({ name: "b", instruction: "sys-b" });
    const pipe = new SequentialAgent("p", [a, b]);
    const trace = await pipe.run("start", newSession(), capturing);
    expect(trace.length).toBe(2);
    expect(trace[0]?.output).toBe("stage-1-out");
    expect(trace[1]?.output).toBe("stage-2-out");
    // Stage 2's user input is stage 1's raw output.
    expect(captured[0]?.user).toBe("start");
    expect(captured[1]?.user).toBe("stage-1-out");
  });

  it("stage 2 can read stage 1's outputKey via {key} templating in its instruction", async () => {
    const model = scriptedModel(["seeded-by-stage-1", "final"]);
    const captured: string[] = [];
    const cap: ModelCaller = async (system, user, tokens) => {
      captured.push(system);
      return model(system, user, tokens);
    };
    const a = new LlmAgent({
      name: "a",
      instruction: "produce",
      outputKey: "analysis",
    });
    const b = new LlmAgent({
      name: "b",
      instruction: "act on {analysis}",
    });
    const pipe = new SequentialAgent("p", [a, b]);
    const session = newSession();
    await pipe.run("start", session, cap);
    // Stage 2's system prompt was templated with the value stage 1 published.
    expect(captured[1]).toBe("act on seeded-by-stage-1");
    // And the session survived the pipeline with the outputKey mirrored.
    expect(session.state["analysis"]).toBe("seeded-by-stage-1");
  });

  it("propagates a ModelCaller rejection out of the pipeline (does not swallow errors)", async () => {
    const a = new LlmAgent({ name: "a", instruction: "run" });
    const pipe = new SequentialAgent("p", [a]);
    const boom: ModelCaller = async () => {
      throw new Error("model-down");
    };
    await expect(pipe.run("start", newSession(), boom)).rejects.toThrow("model-down");
  });
});
