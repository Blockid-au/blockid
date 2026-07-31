// Colocated vitest for the free ADK-style agent primitive at
// src/lib/adk/agent.ts. Pins the runtime contract used by every ported
// Agent-Garden sample (financial-advisor, customer-service, market-research,
// brand-search-optimization) so a rewrite of the shim can't silently break
// them:
//
//   * LlmAgent — declarative `instruction` with `{state}` templating, optional
//     `outputKey` that publishes the trimmed model output back into shared
//     session state, `maxTokens` default of 2048.
//   * SequentialAgent — runs sub-agents in order, threads a single session,
//     first agent receives `initialInput`, later agents receive the previous
//     agent's raw output as their user input.
//   * newSession — fresh mutable `{ state }`, seedable, copies the seed so
//     mutating the seed after construction cannot leak into the session.
//
// The tests never hit a network — a `spyCaller()` helper records every
// `(system, user, maxTokens)` triple and returns pre-programmed strings. All
// timing assertions are lower bounds against a millisecond `await` so they
// hold on fast + slow hosts alike.
//
// Coverage matches the shape used by `src/lib/adk/agents/*.ts` production
// callers (see e.g. `financial-advisor.ts:81-110` — session.state seeded
// with the analyst's `outputKey='analysis'`, then trace[-1].output taken
// as the recommendations).

import { describe, it, expect } from "vitest";
import {
  LlmAgent,
  SequentialAgent,
  newSession,
  type AgentSession,
  type ModelCaller,
} from "./agent";

// ─── Test helpers ─────────────────────────────────────────────────────

interface CallRecord {
  system: string;
  user: string;
  maxTokens: number;
}

function spyCaller(
  responses: string | string[],
): { caller: ModelCaller; calls: CallRecord[] } {
  const calls: CallRecord[] = [];
  const queue = Array.isArray(responses) ? [...responses] : [responses];
  const caller: ModelCaller = async (system, user, maxTokens) => {
    calls.push({ system, user, maxTokens });
    return queue.length > 1 ? queue.shift()! : queue[0];
  };
  return { caller, calls };
}

const slowCaller =
  (response: string, delayMs: number): ModelCaller =>
  async () => {
    await new Promise((r) => setTimeout(r, delayMs));
    return response;
  };

// ─── LlmAgent — constructor + defaults ────────────────────────────────

describe("adk/agent — LlmAgent constructor", () => {
  it("[1] stores name + instruction verbatim", () => {
    const a = new LlmAgent({ name: "critic", instruction: "Be critical." });
    expect(a.name).toBe("critic");
    expect(a.instruction).toBe("Be critical.");
  });

  it("[2] description defaults to empty string when omitted", () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    expect(a.description).toBe("");
  });

  it("[3] description passes through when supplied", () => {
    const a = new LlmAgent({ name: "a", instruction: "x", description: "docstring" });
    expect(a.description).toBe("docstring");
  });

  it("[4] maxTokens defaults to 2048 when omitted", () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    expect(a.maxTokens).toBe(2048);
  });

  it("[5] maxTokens passes through when supplied (including small values)", () => {
    const a = new LlmAgent({ name: "a", instruction: "x", maxTokens: 128 });
    expect(a.maxTokens).toBe(128);
  });

  it("[6] outputKey is undefined by default and passes through when set", () => {
    const noKey = new LlmAgent({ name: "a", instruction: "x" });
    expect(noKey.outputKey).toBeUndefined();
    const withKey = new LlmAgent({ name: "a", instruction: "x", outputKey: "analysis" });
    expect(withKey.outputKey).toBe("analysis");
  });
});

// ─── LlmAgent — templating ────────────────────────────────────────────

describe("adk/agent — LlmAgent instruction templating", () => {
  it("[7] {key} tokens are substituted from session state in the system prompt", async () => {
    const a = new LlmAgent({ name: "a", instruction: "Hello {name}." });
    const { caller, calls } = spyCaller("out");
    const session = newSession({ name: "Ada" });
    await a.run("noop", session, caller);
    expect(calls[0]!.system).toBe("Hello Ada.");
  });

  it("[8] {key} tokens are substituted in the user input too", async () => {
    const a = new LlmAgent({ name: "a", instruction: "sys" });
    const { caller, calls } = spyCaller("out");
    const session = newSession({ topic: "cash burn" });
    await a.run("Analyse {topic}.", session, caller);
    expect(calls[0]!.user).toBe("Analyse cash burn.");
  });

  it("[9] missing keys collapse to empty strings without throwing", async () => {
    const a = new LlmAgent({ name: "a", instruction: "before {gone} after" });
    const { caller, calls } = spyCaller("out");
    await a.run("noop", newSession(), caller);
    expect(calls[0]!.system).toBe("before  after");
  });

  it("[10] every occurrence of a repeated token is substituted (not just first)", async () => {
    const a = new LlmAgent({ name: "a", instruction: "{x} + {x} = {y}" });
    const { caller, calls } = spyCaller("out");
    await a.run("noop", newSession({ x: "1", y: "2" }), caller);
    expect(calls[0]!.system).toBe("1 + 1 = 2");
  });

  it("[11] underscore + digit key characters are allowed in tokens", async () => {
    const a = new LlmAgent({ name: "a", instruction: "{step_1}-{step_2b}-{v3}" });
    const { caller, calls } = spyCaller("out");
    await a.run("noop", newSession({ step_1: "A", step_2b: "B", v3: "C" }), caller);
    expect(calls[0]!.system).toBe("A-B-C");
  });

  it("[12] tokens with unsupported characters (hyphen, dot, space) are left literal", async () => {
    // The TEMPLATE_TOKEN regex only accepts [a-zA-Z0-9_], so these should not match.
    const a = new LlmAgent({ name: "a", instruction: "{a-b} {a.b} {a b}" });
    const { caller, calls } = spyCaller("out");
    await a.run("noop", newSession({ "a-b": "X", "a.b": "Y", "a b": "Z" }), caller);
    expect(calls[0]!.system).toBe("{a-b} {a.b} {a b}");
  });

  it("[13] JSON-like braces without inner text are left literal", async () => {
    const a = new LlmAgent({ name: "a", instruction: "{} plus {,} plus {} again" });
    const { caller, calls } = spyCaller("out");
    await a.run("noop", newSession(), caller);
    expect(calls[0]!.system).toBe("{} plus {,} plus {} again");
  });

  it("[14] empty instruction + empty input still calls model exactly once", async () => {
    const a = new LlmAgent({ name: "a", instruction: "" });
    const { caller, calls } = spyCaller("out");
    await a.run("", newSession(), caller);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({ system: "", user: "", maxTokens: 2048 });
  });
});

// ─── LlmAgent — run() output shape ────────────────────────────────────

describe("adk/agent — LlmAgent.run() output shape", () => {
  it("[15] returns AgentRunResult with agent name + output + duration", async () => {
    const a = new LlmAgent({ name: "critic", instruction: "x" });
    const { caller } = spyCaller("hello");
    const result = await a.run("in", newSession(), caller);
    expect(result.agent).toBe("critic");
    expect(result.output).toBe("hello");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("[16] output is trimmed (leading + trailing whitespace, newlines)", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    const { caller } = spyCaller("  \n  padded\n\t");
    const result = await a.run("in", newSession(), caller);
    expect(result.output).toBe("padded");
  });

  it("[17] durationMs reflects the model call latency (lower bound)", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    const result = await a.run("in", newSession(), slowCaller("done", 15));
    // Fudge factor for CI jitter — assert only the lower bound.
    expect(result.durationMs).toBeGreaterThanOrEqual(10);
  });

  it("[18] writes trimmed output to session.state[outputKey] when set", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x", outputKey: "analysis" });
    const { caller } = spyCaller("  the analysis  ");
    const session = newSession();
    await a.run("in", session, caller);
    expect(session.state.analysis).toBe("the analysis");
  });

  it("[19] does NOT touch session.state when outputKey is unset", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    const { caller } = spyCaller("out");
    const session = newSession({ preExisting: "keep" });
    await a.run("in", session, caller);
    expect(session.state).toEqual({ preExisting: "keep" });
  });

  it("[20] outputKey overwrites a prior value under the same key", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x", outputKey: "analysis" });
    const { caller } = spyCaller("v2");
    const session = newSession({ analysis: "v1" });
    await a.run("in", session, caller);
    expect(session.state.analysis).toBe("v2");
  });

  it("[21] passes the agent's configured maxTokens through to the model call", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x", maxTokens: 512 });
    const { caller, calls } = spyCaller("out");
    await a.run("in", newSession(), caller);
    expect(calls[0]!.maxTokens).toBe(512);
  });

  it("[22] model exceptions propagate — no swallowing at the LlmAgent layer", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x" });
    const failing: ModelCaller = async () => {
      throw new Error("boom");
    };
    await expect(a.run("in", newSession(), failing)).rejects.toThrow("boom");
  });
});

// ─── SequentialAgent ──────────────────────────────────────────────────

describe("adk/agent — SequentialAgent", () => {
  it("[23] stores name + subAgents", () => {
    const inner = new LlmAgent({ name: "inner", instruction: "x" });
    const seq = new SequentialAgent("pipeline", [inner]);
    expect(seq.name).toBe("pipeline");
    expect(seq.subAgents).toHaveLength(1);
    expect(seq.subAgents[0]).toBe(inner);
  });

  it("[24] runs sub-agents in the declared order", async () => {
    const { caller, calls } = spyCaller(["one", "two", "three"]);
    const a = new LlmAgent({ name: "a", instruction: "sysA" });
    const b = new LlmAgent({ name: "b", instruction: "sysB" });
    const c = new LlmAgent({ name: "c", instruction: "sysC" });
    const seq = new SequentialAgent("seq", [a, b, c]);
    const trace = await seq.run("start", newSession(), caller);
    expect(trace.map((t) => t.agent)).toEqual(["a", "b", "c"]);
    expect(calls.map((c) => c.system)).toEqual(["sysA", "sysB", "sysC"]);
  });

  it("[25] first sub-agent receives initialInput as its user prompt", async () => {
    const { caller, calls } = spyCaller(["out"]);
    const a = new LlmAgent({ name: "a", instruction: "sys" });
    const seq = new SequentialAgent("seq", [a]);
    await seq.run("HELLO", newSession(), caller);
    expect(calls[0]!.user).toBe("HELLO");
  });

  it("[26] each subsequent sub-agent receives the PREVIOUS agent's raw output as input", async () => {
    const { caller, calls } = spyCaller(["from-a", "from-b"]);
    const a = new LlmAgent({ name: "a", instruction: "sysA" });
    const b = new LlmAgent({ name: "b", instruction: "sysB" });
    const seq = new SequentialAgent("seq", [a, b]);
    await seq.run("start", newSession(), caller);
    expect(calls[0]!.user).toBe("start");
    expect(calls[1]!.user).toBe("from-a");
  });

  it("[27] downstream agent can template on a prior agent's outputKey via session state", async () => {
    const { caller, calls } = spyCaller(["ANALYSIS_BODY", "advice"]);
    const analyst = new LlmAgent({
      name: "analyst",
      instruction: "analyst-sys",
      outputKey: "analysis",
    });
    const advisor = new LlmAgent({
      name: "advisor",
      instruction: "Given: {analysis}",
    });
    const seq = new SequentialAgent("pair", [analyst, advisor]);
    await seq.run("go", newSession(), caller);
    expect(calls[1]!.system).toBe("Given: ANALYSIS_BODY");
  });

  it("[28] returns the full trace (one entry per sub-agent, in run order)", async () => {
    const { caller } = spyCaller(["one", "two"]);
    const a = new LlmAgent({ name: "a", instruction: "x" });
    const b = new LlmAgent({ name: "b", instruction: "x" });
    const seq = new SequentialAgent("seq", [a, b]);
    const trace = await seq.run("start", newSession(), caller);
    expect(trace).toHaveLength(2);
    expect(trace[0]!.output).toBe("one");
    expect(trace[1]!.output).toBe("two");
  });

  it("[29] empty sub-agent list returns empty trace (no model calls made)", async () => {
    const { caller, calls } = spyCaller("never");
    const seq = new SequentialAgent("empty", []);
    const trace = await seq.run("start", newSession(), caller);
    expect(trace).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("[30] threads a single shared session — writes by earlier agents are visible to later ones", async () => {
    const { caller } = spyCaller(["result-a", "result-b"]);
    const a = new LlmAgent({ name: "a", instruction: "x", outputKey: "step1" });
    const b = new LlmAgent({ name: "b", instruction: "x", outputKey: "step2" });
    const seq = new SequentialAgent("seq", [a, b]);
    const session = newSession({ seed: "SEED" });
    await seq.run("start", session, caller);
    expect(session.state).toEqual({
      seed: "SEED",
      step1: "result-a",
      step2: "result-b",
    });
  });

  it("[31] mid-pipeline model failure aborts and surfaces the error", async () => {
    const a = new LlmAgent({ name: "a", instruction: "x", outputKey: "step1" });
    const b = new LlmAgent({ name: "b", instruction: "x" });
    let callN = 0;
    const caller: ModelCaller = async () => {
      callN += 1;
      if (callN === 2) throw new Error("mid-fail");
      return "first-ok";
    };
    const seq = new SequentialAgent("seq", [a, b]);
    const session = newSession();
    await expect(seq.run("start", session, caller)).rejects.toThrow("mid-fail");
    // Partial progress is preserved — step1 landed before the second agent blew up.
    expect(session.state.step1).toBe("first-ok");
    expect(callN).toBe(2);
  });
});

// ─── newSession ───────────────────────────────────────────────────────

describe("adk/agent — newSession", () => {
  it("[32] returns a fresh session with empty state when unseeded", () => {
    const s: AgentSession = newSession();
    expect(s.state).toEqual({});
  });

  it("[33] seeds state from the initialState arg", () => {
    const s = newSession({ a: "1", b: "2" });
    expect(s.state).toEqual({ a: "1", b: "2" });
  });

  it("[34] copies the seed — mutating the input after construction does not leak in", () => {
    const seed: Record<string, string> = { a: "1" };
    const s = newSession(seed);
    seed.a = "MUTATED";
    seed.b = "NEW";
    expect(s.state).toEqual({ a: "1" });
  });

  it("[35] returns independent sessions on each call (no shared reference)", () => {
    const s1 = newSession({ a: "1" });
    const s2 = newSession({ a: "1" });
    s1.state.a = "changed";
    expect(s2.state.a).toBe("1");
  });
});
