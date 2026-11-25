// json-salvage — G23-A fix (b): the hard trim before a JSON parse.
import { describe, expect, it } from "vitest";
import { looksTruncated, salvageTruncatedJson, salvageTruncatedJsonCandidates } from "./json-salvage";

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

  it("a short string element cut mid-sentence is dropped, not kept as a fragment (review G23 P2: 'Revenue is not' would invert meaning)", () => {
    const base = JSON.stringify({ highlights: ["one", "Revenue is not yet recurring"] });
    const cut = base.slice(0, base.indexOf("yet") + 2);
    expect(JSON.parse(salvageTruncatedJson(cut)!)).toEqual({ highlights: ["one"] });
  });

  it("long prose cut mid-sentence keeps its whole words (≥ SALVAGE_MIN_PROSE_WORDS)", () => {
    const prose = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");
    const base = JSON.stringify({ body: prose });
    const cut = base.slice(0, base.indexOf("word44") + 3);
    expect(JSON.parse(salvageTruncatedJson(cut)!)).toEqual({ body: prose.slice(0, prose.indexOf("word44")).trimEnd() });
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

// G36 (2026-11-25 showcase run, clo/dataroom): the cut landed inside the
// `risks` array; the last-complete-value rewind kept a half-written risk that
// no schema accepts, and the whole salvage was thrown away.
describe("salvageTruncatedJsonCandidates", () => {
  const risk = (n: number) => ({ title: `Risk ${n}`, severity: "medium", mitigation: `Fix ${n}.`, citations: [{ evidence_id: "a", quote: "q" }] });
  const doc = { finding: FULL.finding, section: { heading: "H", body_markdown: "Body." }, risks: [risk(1), risk(2), risk(3)], highlights: ["x"] };
  const full = JSON.stringify(doc);

  it("first candidate is the ordinary salvage; the next drops the partial trailing element of each open array, innermost first", () => {
    // Cut after `"severity":` of risk 3 — the parse error the run logged.
    const cut = full.slice(0, full.indexOf(`"severity"`, full.indexOf("Risk 3")) + `"severity":`.length);
    expect(() => JSON.parse(cut)).toThrow(/Unexpected end of JSON input/);
    const cands = salvageTruncatedJsonCandidates(cut).map((c) => JSON.parse(c));
    expect(cands[0]).toEqual(JSON.parse(salvageTruncatedJson(cut)!));
    expect(cands[0].risks[2]).toEqual({ title: "Risk 3" }); // half-written — fails any risk schema
    expect(cands[1]).toEqual({ finding: FULL.finding, section: doc.section, risks: [risk(1), risk(2)] });
    expect(cands).toHaveLength(2);
  });

  it("a cut inside a nested array (a risk's citation) offers the citation drop, then the whole-risk drop", () => {
    const at = full.indexOf(`"quote"`, full.indexOf("Risk 2"));
    const cands = salvageTruncatedJsonCandidates(full.slice(0, at + 3)).map((c) => JSON.parse(c));
    expect(cands.map((c) => c.risks.length)).toEqual([2, 2, 1]);
    expect(cands[1].risks[1].citations).toEqual([]);
    expect(cands[2].risks).toEqual([risk(1)]);
  });

  it("cut right after an array's opening bracket or a separating comma: the drop closes the array as written, never invents a value", () => {
    const afterBracket = full.slice(0, full.indexOf(`"risks":[`) + `"risks":[`.length);
    expect(salvageTruncatedJsonCandidates(afterBracket).map((c) => JSON.parse(c).risks)).toContainEqual([]);
    const afterComma = full.slice(0, full.indexOf(`,{"title":"Risk 2"`) + 1);
    const risksSeen = salvageTruncatedJsonCandidates(afterComma).map((c) => JSON.parse(c).risks);
    expect(risksSeen).toContainEqual([risk(1)]);
    for (const r of risksSeen) expect(r === undefined || r.length <= 1).toBe(true);
  });

  it("a complete document is the only candidate; non-JSON gives none", () => {
    expect(salvageTruncatedJsonCandidates(full)).toEqual([full]);
    expect(salvageTruncatedJsonCandidates("no json")).toEqual([]);
    expect(salvageTruncatedJsonCandidates("")).toEqual([]);
  });
});
