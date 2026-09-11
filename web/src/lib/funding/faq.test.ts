// S12-A: the directory FAQ is four visible Q&As per directory, built from the
// `faq.*` copy group (EN + VI), the satellite sentence is derived from
// CAPITAL_SATELLITES, and the FAQPage object is only produced for ≥ 2 items
// and always validates.

import { describe, expect, it } from "vitest";
import vi from "@/lib/i18n/messages/vi.json";
import { validateJsonLd } from "@/lib/seo/structured-data";
import { FUNDING_COPY } from "./copy";
import { DIRECTORY_FAQ_KEYS, directoryFaq, faqPageJsonLd, satelliteCoverage } from "./faq";
import { CAPITAL_SATELLITES } from "./seed-map";

const VI = vi as Record<string, string>;

describe("directoryFaq", () => {
  it("returns four Q&As per directory from the faq.* copy group, in the pinned order, with every token filled", () => {
    for (const kind of ["grants", "programs"] as const) {
      const items = directoryFaq(kind);
      expect(items).toHaveLength(4);
      expect(DIRECTORY_FAQ_KEYS[kind]).toHaveLength(4);
      for (const [i, key] of DIRECTORY_FAQ_KEYS[kind].entries()) {
        expect(items[i].question).toBe((FUNDING_COPY.faq as Record<string, string>)[`${key}Q`]);
        expect(items[i].question.length).toBeGreaterThan(8);
        expect(items[i].answer.length).toBeGreaterThan(40);
        expect(items[i].answer).not.toMatch(/\{[a-zA-Z_]+\}/);
        expect(items[i].question).not.toMatch(/\{[a-zA-Z_]+\}/);
      }
    }
  });

  it("grants: free list, A$3 report, no cut, Sunday refresh — product facts only", () => {
    const [free, report, cut, updated] = directoryFaq("grants");
    expect(free.question).toBe("Is grant information free?");
    expect(free.answer).toMatch(/^Yes/);
    expect(free.answer).toContain("A$3");
    expect(report.question).toBe("What does the Money Finder report include?");
    expect(report.answer).toContain("12-month");
    expect(cut.question).toBe("Do you take a cut of grants?");
    expect(cut.answer).toMatch(/^No\./);
    expect(updated.answer).toContain("Sunday");
    expect(updated.answer).toContain("review queue");
  });

  it("programs: the cities answer names every satellite from CAPITAL_SATELLITES; equity varies per program", () => {
    const [cities, equity, updated, report] = directoryFaq("programs");
    expect(cities.question).toBe("Which cities are covered?");
    expect(cities.answer).toContain("eight capitals");
    for (const [capital, sats] of Object.entries(CAPITAL_SATELLITES)) {
      for (const s of sats) {
        expect(cities.answer, s).toContain(s);
        expect(cities.answer, capital).toContain(capital);
      }
    }
    expect(equity.question).toBe("Do programs take equity?");
    expect(equity.answer).toMatch(/varies/);
    expect(updated.answer).toContain("Sunday");
    expect(report.answer).toContain("A$3");
  });

  it("satelliteCoverage lists only capitals with satellites, in CAPITALS order", () => {
    const line = satelliteCoverage();
    expect(line).toBe("Sydney also lists Wollongong; Melbourne lists Geelong; Brisbane lists Gold Coast, Sunshine Coast and Regional Queensland; Hobart lists Launceston");
    expect(line).not.toContain("Perth");
    expect(line).not.toContain("Remote");
  });

  it("localises through the VI catalogue (funding.copy.faq.*) with the same satellite sentence", () => {
    const items = directoryFaq("grants", VI);
    expect(items[0].question).toBe(VI["funding.copy.faq.grantsFreeQ"]);
    expect(items[0].answer).toBe(VI["funding.copy.faq.grantsFreeA"]);
    const cities = directoryFaq("programs", VI)[0];
    expect(cities.answer).toContain("Wollongong");
    expect(cities.answer).not.toContain("{satellites}");
  });
});

describe("faqPageJsonLd", () => {
  it("builds a valid FAQPage from the rendered items and nothing under two", () => {
    for (const kind of ["grants", "programs"] as const) {
      const block = faqPageJsonLd(directoryFaq(kind))!;
      expect(block).not.toBeNull();
      expect(block["@type"]).toBe("FAQPage");
      expect((block.mainEntity as unknown[]).length).toBe(4);
      expect(validateJsonLd(block)).toEqual({ ok: true, errors: [] });
    }
    expect(faqPageJsonLd([])).toBeNull();
    expect(faqPageJsonLd([{ question: "Q", answer: "A" }])).toBeNull();
    expect(faqPageJsonLd([{ question: "Q", answer: "A" }, { question: " ", answer: "A" }])).toBeNull();
    expect(faqPageJsonLd([{ question: "Q1", answer: "A1" }, { question: "Q2", answer: "A2" }])).not.toBeNull();
  });
});
