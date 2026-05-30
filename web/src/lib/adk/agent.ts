// Lightweight ADK-style agent primitive — a free, zero-dependency port of the
// ergonomics of Google's Agent Development Kit (ADK / Agent Garden).
//
// WHY NOT the real @google/adk package?
//   @google/adk (v1.1.0) drags in ~25 heavy deps — MikroORM (+ DB drivers),
//   Google Cloud OpenTelemetry exporters, google-auth-library, express, and
//   @google/genai (the PAID Gemini SDK). It is designed to run on Google Cloud
//   Agent Engine. Bundling it into our custom Next.js build would bloat the
//   bundle, pull GCP auth/telemetry we never use, and default the model layer
//   to paid Gemini — directly contradicting our zero-marginal-cost rule.
//
// Instead we reproduce the *patterns* that make ADK useful — declarative
// `LlmAgent`s with templated instructions + an `output_key`, and a
// `SequentialAgent` that pipes shared session state between sub-agents — while
// running every call through our existing FREE provider chain (Groq, OpenRouter,
// Cerebras, SambaNova, Claude/Codex OAuth) via the injected `ModelCaller`.
//
// This keeps the Agent Garden mental model (and lets us port adk-samples like
// llm-auditor verbatim) at $0 and with no new dependencies. If we ever move to
// GCP we can swap the runner for the real ADK with minimal prompt changes.

/**
 * A model caller — matches the shape the report pipeline already injects
 * (`(system, user, maxTokens) => Promise<string>`), which is backed by the
 * free-provider `callAI()` in `@/lib/ai-client`.
 */
export type ModelCaller = (
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number,
) => Promise<string>;

/**
 * Shared session state — mirrors ADK's `session.state`. Sub-agents read prior
 * outputs from here and write their own under `outputKey`.
 */
export interface AgentSession {
  state: Record<string, string>;
}

export interface LlmAgentConfig {
  /** Stable agent name, e.g. "critic_agent". */
  name: string;
  /** Human description (documentation / tracing only). */
  description?: string;
  /**
   * System instruction. Supports ADK-style `{key}` templating: any `{key}`
   * token is replaced with `session.state[key]` at run time (missing keys
   * become empty strings).
   */
  instruction: string;
  /** Max output tokens for this agent's call. Default 2048. */
  maxTokens?: number;
  /**
   * If set, the agent's text output is written to `session.state[outputKey]`
   * so downstream sub-agents can reference it via `{outputKey}` templating.
   */
  outputKey?: string;
}

/** Result of running a single agent. */
export interface AgentRunResult {
  agent: string;
  output: string;
  durationMs: number;
}

const TEMPLATE_TOKEN = /\{([a-zA-Z0-9_]+)\}/g;

function renderTemplate(template: string, state: Record<string, string>): string {
  return template.replace(TEMPLATE_TOKEN, (_, key: string) => state[key] ?? "");
}

/**
 * An LLM-backed agent. Equivalent in spirit to ADK's `LlmAgent`:
 *   - declarative `instruction` (system prompt) with `{state}` templating
 *   - optional `outputKey` to publish its result into shared session state
 */
export class LlmAgent {
  readonly name: string;
  readonly description: string;
  readonly instruction: string;
  readonly maxTokens: number;
  readonly outputKey?: string;

  constructor(config: LlmAgentConfig) {
    this.name = config.name;
    this.description = config.description ?? "";
    this.instruction = config.instruction;
    this.maxTokens = config.maxTokens ?? 2048;
    this.outputKey = config.outputKey;
  }

  /**
   * Run the agent. `userInput` is the turn's user message; both the instruction
   * and the user input are templated against the current session state.
   */
  async run(
    userInput: string,
    session: AgentSession,
    model: ModelCaller,
  ): Promise<AgentRunResult> {
    const start = Date.now();
    const system = renderTemplate(this.instruction, session.state);
    const user = renderTemplate(userInput, session.state);

    const output = (await model(system, user, this.maxTokens)).trim();

    if (this.outputKey) {
      session.state[this.outputKey] = output;
    }

    return { agent: this.name, output, durationMs: Date.now() - start };
  }
}

/**
 * Runs sub-agents in order, threading a single shared session state between
 * them — the ADK `SequentialAgent` pattern. Each sub-agent can read prior
 * outputs via `{outputKey}` templating in its instruction.
 *
 * The first sub-agent receives `initialInput`; subsequent agents receive the
 * previous agent's raw output as their user input (they can still pull anything
 * else from session state). Returns the full run trace.
 */
export class SequentialAgent {
  readonly name: string;
  readonly subAgents: LlmAgent[];

  constructor(name: string, subAgents: LlmAgent[]) {
    this.name = name;
    this.subAgents = subAgents;
  }

  async run(
    initialInput: string,
    session: AgentSession,
    model: ModelCaller,
  ): Promise<AgentRunResult[]> {
    const trace: AgentRunResult[] = [];
    let nextInput = initialInput;

    for (const agent of this.subAgents) {
      const result = await agent.run(nextInput, session, model);
      trace.push(result);
      nextInput = result.output;
    }

    return trace;
  }
}

/** Create a fresh session, optionally seeded with initial state. */
export function newSession(initialState: Record<string, string> = {}): AgentSession {
  return { state: { ...initialState } };
}
