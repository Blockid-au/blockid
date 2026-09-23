import { describe, expect, it } from "vitest";

import { answeredWithContent } from "./health-check";

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
