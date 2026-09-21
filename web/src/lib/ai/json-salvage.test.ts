// json-salvage — G23-A fix (b): the hard trim before a JSON parse.
import { describe, expect, it } from "vitest";
import { looksTruncated, salvageTruncatedJson } from "./json-salvage";

const FULL = { finding: { title: "Revenue", detail: "Pre-revenue: 5 one-off charges.", proposed_score: 50, citations: [{ evidence_id: "a", quote: "5 one-off" }] }, section: { heading: "Revenue", body_markdown: "Line one. Line two.", citations: [], confidence: 0.6 }, risks: [] };

describe("salvageTruncatedJson", () => {
  it("returns a complete document unchanged (from its first brace) and null for non-JSON", () => {
    const text = "```json\n" + JSON.stringify(FULL);
    expect(JSON.parse(salvageTruncatedJson(text)!)).toEqual(FULL);
    expect(salvageTruncatedJson("no json here")).toBeNull();
    expect(salvageTruncatedJson("")).toBeNull();
  });

  it("cut inside a prose value: keeps the whole sentences written so far, closes the string and every open container", () => {
    const full = JSON.stringify({ finding: FULL.finding, section: { heading: "Revenue", body_markdown: "Stripe shows 5 charges. Growth is 8 % a month. The next sente" } });
    const cut = full.slice(0, full.indexOf("The next sente") + 9);
    const out = salvageTruncatedJson(cut);
    expect(out).not.toBeNull();
    const parsed = JSON.parse(out!);
    expect(parsed.finding).toEqual(FULL.finding);
    expect(parsed.section.body_markdown).toBe("Stripe shows 5 charges. Growth is 8 % a month.");
  });

  it("cut inside a key, after a comma or mid-number: rewinds to the last complete value", () => {
    const base = JSON.stringify({ a: { x: 1, y: "two" }, b: [1, 2] });
    const midKey = base.slice(0, base.indexOf(`"b"`) + 2);
    expect(JSON.parse(salvageTruncatedJson(midKey)!)).toEqual({ a: { x: 1, y: "two" } });
    const afterComma = base.slice(0, base.indexOf(`"b"`));
    expect(JSON.parse(salvageTruncatedJson(afterComma)!)).toEqual({ a: { x: 1, y: "two" } });
    const midNumber = base.slice(0, base.indexOf("2]") + 1);
    expect(JSON.parse(salvageTruncatedJson(midNumber)!)).toEqual({ a: { x: 1, y: "two" }, b: [1] });
    const afterColon = base.slice(0, base.indexOf(`"b":`) + 4);
    expect(JSON.parse(salvageTruncatedJson(afterColon)!)).toEqual({ a: { x: 1, y: "two" } });
  });

  it("cut inside an array string element keeps the whole words written and closes the array", () => {
    const base = JSON.stringify({ highlights: ["one", "two words here"] });
    const cut = base.slice(0, base.indexOf("here") + 2);
    expect(JSON.parse(salvageTruncatedJson(cut)!)).toEqual({ highlights: ["one", "two words"] });
  });

  it("never cuts inside an escape sequence or a decimal", () => {
    const base = JSON.stringify({ s: "Revenue is A$1.2M.\nNext line says \"quoted\" things. Tail" });
    const cut = base.slice(0, base.lastIndexOf("Tail"));
    const parsed = JSON.parse(salvageTruncatedJson(cut)!);
    expect(parsed.s).toContain("A$1.2M.");
    expect(parsed.s).toContain("quoted");
    const mid = base.slice(0, base.indexOf("quoted") - 1);
    expect(() => JSON.parse(salvageTruncatedJson(mid)!)).not.toThrow();
  });

  it("nothing complete → null; a document broken by a stray token → null (the repair pass still runs)", () => {
    expect(salvageTruncatedJson(`{"a": "ope`)).toBeNull();
    expect(salvageTruncatedJson(`{"a": 1, b: 2`)).toBeNull();
  });
});

describe("looksTruncated", () => {
  it("recognises the V8 parse errors an output cut short raises", () => {
    expect(looksTruncated("Unterminated string in JSON at position 9569 (line 102 column 13)")).toBe(true);
    expect(looksTruncated("Unexpected end of JSON input")).toBe(true);
    expect(looksTruncated("Unexpected token < in JSON at position 0")).toBe(false);
  });
});
