import { afterEach, describe, expect, it, vi } from "vitest";

import { answeredWithContent, checkModel } from "./health-check";

// G30 D-A6. The probe used to score any 200 as healthy. Reasoning models answer
// 200 with an EMPTY `message.content` (the whole budget goes to the hidden
// trace), the latency sort then promoted them to rung 1, and every real report
// call on them failed with "Empty response". Health is "did it put text in the
// one field the client reads", not "did the status line say 200".
describe("answeredWithContent", () => {
  it("accepts an OpenAI-shaped answer with text", () => {
    expect(answeredWithContent(JSON.stringify({ choices: [{ message: { content: "ok" } }] }))).toBe(true);
  });

  it("rejects a 200 whose content is empty — the reasoning-model failure mode", () => {
    expect(answeredWithContent(JSON.stringify({
      choices: [{ message: { content: "", reasoning_content: "thinking…".repeat(200) }, finish_reason: "length" }],
    }))).toBe(false);
  });

  it("rejects whitespace-only content", () => {
    expect(answeredWithContent(JSON.stringify({ choices: [{ message: { content: "   \n" } }] }))).toBe(false);
  });

  it("accepts an Anthropic-shaped answer", () => {
    expect(answeredWithContent(JSON.stringify({ content: [{ type: "text", text: "ok" }] }))).toBe(true);
  });

  it("rejects an Anthropic body with no text block", () => {
    expect(answeredWithContent(JSON.stringify({ content: [{ type: "thinking", thinking: "…" }] }))).toBe(false);
  });

  it("rejects a body that is not JSON at all", () => {
    expect(answeredWithContent("<html>gateway timeout</html>")).toBe(false);
  });

  it("rejects an empty body", () => {
    expect(answeredWithContent("")).toBe(false);
  });
});

// G36: gpt-oss on Groq reasons at "medium" by default and the hidden trace ate
// the 64-token probe budget → empty content → a working model scored empty.
describe("checkModel request body", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  async function bodyFor(provider: string, model: string): Promise<Record<string, unknown>> {
    vi.stubEnv(provider === "groq" ? "GROQ_API_KEY" : "OPENROUTER_API_KEY", "k");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "ok" } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await checkModel(provider, model);
    expect(r.status).toBe("healthy");
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    return JSON.parse(String(init.body)) as Record<string, unknown>;
  }

  it("asks gpt-oss on Groq for low reasoning effort", async () => {
    expect((await bodyFor("groq", "openai/gpt-oss-20b")).reasoning_effort).toBe("low");
  });

  it("sends no reasoning field for other models or providers", async () => {
    expect((await bodyFor("groq", "qwen/qwen3.8-27b")).reasoning_effort).toBeUndefined();
    expect((await bodyFor("openrouter", "openai/gpt-oss-120b:free")).reasoning_effort).toBeUndefined();
  });
});
