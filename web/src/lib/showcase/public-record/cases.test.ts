// Data guard for the public-record showcases (G2 #6, S19-B).
// Every monetary figure must be attached to a public https source with a
// publisher and a date; prose (summary, lessons, rationale) carries no
// figures; phases are valid 12-phase slots; the illustrative stage is a
// canonical StageKey.

import { describe, expect, it } from "vitest";

import { CANONICAL_STAGES } from "@/lib/journey-vocabulary";
import {
  AIRWALLEX_CASE,
  CULTURE_AMP_CASE,
  ILLUSTRATIVE_SVI_DISCLAIMER,
  PUBLIC_RECORD_CASES,
  caseSources,
  moneyFigures,
  publicRecordCase,
  type PublicSource,
} from "./cases";

const DATE_RE = /^\d{4}(-\d{2}){0,2}$/;

function expectSource(s: PublicSource, where: string) {
  expect(s.url, `${where}: url`).toMatch(/^https:\/\/[^\s"]+$/);
  expect(s.publisher.length, `${where}: publisher`).toBeGreaterThan(0);
  expect(s.date, `${where}: date`).toMatch(DATE_RE);
}

describe("public-record showcase data", () => {
  it("exposes exactly Airwallex and Culture Amp", () => {
    expect(PUBLIC_RECORD_CASES.map((c) => c.slug)).toEqual(["airwallex", "culture-amp"]);
    expect(publicRecordCase("airwallex")).toBe(AIRWALLEX_CASE);
    expect(publicRecordCase("culture-amp")).toBe(CULTURE_AMP_CASE);
  });

  it("carries the illustrative-SVI disclaimer wording", () => {
    expect(ILLUSTRATIVE_SVI_DISCLAIMER).toContain("Illustrative SVI only");
    expect(ILLUSTRATIVE_SVI_DISCLAIMER).toContain("not an assessment of the company");
    expect(ILLUSTRATIVE_SVI_DISCLAIMER).toContain("omitted, not estimated");
  });

  it.each(PUBLIC_RECORD_CASES.map((c) => [c.slug, c] as const))("%s: every fact has a dated https source", (slug, c) => {
    expectSource(c.founded.source, `${slug} founded`);
    expectSource(c.hq.source, `${slug} hq`);
    expectSource(c.founders.source, `${slug} founders`);
    expect(c.founders.names.length).toBeGreaterThan(0);
    expect(c.stats.length).toBeGreaterThanOrEqual(3);
    for (const s of c.stats) expectSource(s.source, `${slug} stat ${s.label}`);
    expect(c.milestones.length).toBeGreaterThanOrEqual(5);
    for (const m of c.milestones) {
      expectSource(m.source, `${slug} milestone ${m.headline}`);
      expect(m.date).toMatch(DATE_RE);
      expect(m.phase).toBeGreaterThanOrEqual(1);
      expect(m.phase).toBeLessThanOrEqual(12);
    }
    expect(caseSources(c).length).toBeGreaterThanOrEqual(3);
  });

  it.each(PUBLIC_RECORD_CASES.map((c) => [c.slug, c] as const))("%s: milestones are in chronological order", (_slug, c) => {
    const dates = c.milestones.map((m) => m.date);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it.each(PUBLIC_RECORD_CASES.map((c) => [c.slug, c] as const))("%s: every monetary figure lives on a sourced fact, never in prose", (_slug, c) => {
    expect(moneyFigures(c.summary)).toEqual([]);
    expect(moneyFigures(c.illustrativeSvi.rationale)).toEqual([]);
    for (const l of c.lessons) {
      expect(moneyFigures(`${l.title} ${l.body}`), l.title).toEqual([]);
    }
    for (const m of c.milestones) {
      // A figure/valuation badge must also be stated in the detail or headline
      // the source backs — the badge is never the only place a number appears.
      const text = `${m.headline} ${m.detail}`;
      const bare = (s: string) => s.replace(/\s+/g, "").replace(/^[>~]/, "");
      const stated = moneyFigures(text).map(bare);
      if (m.figure) expect(stated, m.headline).toContain(bare(m.figure));
      if (m.valuation) expect(stated, m.headline).toContain(bare(m.valuation));
    }
  });

  it.each(PUBLIC_RECORD_CASES.map((c) => [c.slug, c] as const))("%s: illustrative stage is a canonical StageKey with a valid phase slot", (_slug, c) => {
    expect(CANONICAL_STAGES).toContain(c.illustrativeSvi.canonicalStage);
    expect(c.illustrativeSvi.phase).toBeGreaterThanOrEqual(1);
    expect(c.illustrativeSvi.phase).toBeLessThanOrEqual(12);
  });

  it("moneyFigures recognises the badge formats used on the pages", () => {
    expect(moneyFigures("US$300M at a US$6.2B valuation; >US$1B raised; A$149; NZ$15M")).toEqual([
      "US$300M",
      "US$6.2B",
      ">US$1B",
      "A$149",
      "NZ$15M",
    ]);
    expect(moneyFigures("Founded 2015 in Melbourne, 25 million employees")).toEqual([]);
  });
});
