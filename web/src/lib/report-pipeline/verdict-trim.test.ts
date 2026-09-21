// verdict-trim — G23-A fix (c).
import { describe, expect, it } from "vitest";
import { wordCount } from "@/lib/report-v2/paragraphs";
import { trimVerdict } from "./verdict-trim";

const ID = "e5e0e468-23df-4bbb-8592-c0ef6d0d12ac";
const sentence = (n: number, tail = "") => `${Array.from({ length: n }, (_, i) => `W${i + 1}`).join(" ")}${tail}.`;

describe("trimVerdict", () => {
  it("returns short text unchanged (whitespace normalised) and never touches text at the cap", () => {
    expect(trimVerdict("  Two   words.  ", 80)).toEqual({ text: "Two words.", trimmed: false, wordsBefore: 2, wordsAfter: 2 });
    const exact = sentence(80);
    expect(trimVerdict(exact, 80).trimmed).toBe(false);
  });

  it("drops whole sentences from the end until the text fits, keeping the citation markers of the kept sentences", () => {
    const text = `${sentence(30, ` [ev:${ID}]`)} ${sentence(30)} ${sentence(30, " [unevidenced]")}`;
    const r = trimVerdict(text, 80);
    expect(r.trimmed).toBe(true);
    expect(r.text).toBe(`${sentence(30, ` [ev:${ID}]`)} ${sentence(30)}`);
    expect(wordCount(r.text)).toBeLessThanOrEqual(80);
    expect(r.wordsBefore).toBe(92);
  });

  it("a single sentence over the cap is cut on a word boundary and keeps its trailing markers within the cap", () => {
    const r = trimVerdict(sentence(100, ` [ev:${ID}]`), 80);
    expect(r.trimmed).toBe(true);
    expect(wordCount(r.text)).toBeLessThanOrEqual(80);
    expect(r.text.endsWith(`[ev:${ID}].`)).toBe(true);
    expect(r.text.startsWith("W1 W2 W3")).toBe(true);
  });

  it("respects decimals and abbreviations when choosing the boundary", () => {
    const r = trimVerdict(`Stripe shows A$1.2M ARR, i.e. real revenue [ev:${ID}]. ${sentence(90)}`, 80);
    expect(r.text).toBe(`Stripe shows A$1.2M ARR, i.e. real revenue [ev:${ID}].`);
  });
});
