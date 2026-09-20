// G19-S47 — the pure typography helpers behind the executive summary, the
// chapter verdicts and the criterion cards.

import { describe, expect, it } from "vitest";
import { proseParagraphs, splitSentences, stripMarkdown, toParagraphs, truncateWords, wordCount } from "./paragraphs";

describe("splitSentences", () => {
  it("splits on . ! ? followed by a capital / digit / quote, never inside decimals, A$ figures or abbreviations", () => {
    expect(splitSentences("ARR is A$1.2M. Growth is 8.5% a month! Is that enough? Yes.")).toEqual(["ARR is A$1.2M.", "Growth is 8.5% a month!", "Is that enough?", "Yes."]);
    expect(splitSentences("Cohort e.g. Seed SaaS shows p50 52. Nothing else.")).toEqual(["Cohort e.g. Seed SaaS shows p50 52.", "Nothing else."]);
    expect(splitSentences('He said "done." Then left.')).toEqual(['He said "done."', "Then left."]);
    expect(splitSentences("")).toEqual([]);
    expect(splitSentences("   ")).toEqual([]);
  });

  it("keeps a trailing fragment without a terminator and collapses whitespace", () => {
    expect(splitSentences("First one.\n  Second one\n")).toEqual(["First one.", "Second one"]);
  });

  it("does not split after an ellipsis or a lower-case continuation", () => {
    expect(splitSentences("Wait... then go. ok. Fine.")).toEqual(["Wait... then go. ok.", "Fine."]);
  });
});

describe("toParagraphs", () => {
  const six = "One is here. Two is here. Three is here. Four is here. Five is here. Six is here.";
  it("keeps blank-line paragraphs and splits a long one into ≤ 3-sentence groups", () => {
    expect(toParagraphs("A short one.\n\nAnother short one.")).toEqual(["A short one.", "Another short one."]);
    expect(toParagraphs(six)).toEqual(["One is here. Two is here. Three is here.", "Four is here. Five is here. Six is here."]);
    expect(toParagraphs(six, 2)).toEqual(["One is here. Two is here.", "Three is here. Four is here.", "Five is here. Six is here."]);
  });

  it("folds an orphan trailing sentence into the previous group", () => {
    const seven = `${six} Seven is here.`;
    expect(toParagraphs(seven)).toEqual(["One is here. Two is here. Three is here.", "Four is here. Five is here. Six is here. Seven is here."]);
  });

  it("returns [] for empty input and never a blank paragraph", () => {
    expect(toParagraphs("")).toEqual([]);
    expect(toParagraphs("\n\n  \n")).toEqual([]);
  });
});

describe("truncateWords / wordCount", () => {
  it("cuts at the word cap with an ellipsis and trims trailing punctuation", () => {
    expect(truncateWords("one two three four", 4)).toBe("one two three four");
    expect(truncateWords("one two, three four five", 2)).toBe("one two…");
    expect(wordCount("  a   b c ")).toBe(3);
  });
});

describe("stripMarkdown", () => {
  it("drops comments, headings, blockquotes, list markers, bold / italic / code — keeps the words and [ev:] citations", () => {
    const src = "# Executive Summary — Acme\n\n> **Key Insight:** the *gap* is `pricing` [ev:ev-1].\n\n**1. Title:** body __here__.\n- bullet one\n<!-- SCORE: 135 -->";
    const out = stripMarkdown(src);
    expect(out).toBe("Executive Summary — Acme\n\nKey Insight: the gap is pricing [ev:ev-1].\n\nTitle: body here.\nbullet one");
    expect(out).not.toMatch(/\*\*|<!--|^#|^>/m);
  });

  it("leaves arithmetic asterisks and underscores inside identifiers alone", () => {
    expect(stripMarkdown("team_structure score 55 and 2 * 3")).toBe("team_structure score 55 and 2 * 3");
  });
});

describe("proseParagraphs", () => {
  it("strips markdown then paragraphs a chapter verdict into ≤ 3-sentence blocks", () => {
    const verdict = "**TRE** is developing. Stripe shows A$12k MRR. Growth is 8% a month. The cohort p50 is 52. One more sentence here.";
    expect(proseParagraphs(verdict)).toEqual(["TRE is developing. Stripe shows A$12k MRR. Growth is 8% a month.", "The cohort p50 is 52. One more sentence here."]);
  });
});
