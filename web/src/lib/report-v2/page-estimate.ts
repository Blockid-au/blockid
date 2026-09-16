// Page-count estimate for a ReportV2 (length gate C.9-5, risk R6).
//
// The real page count comes from the rendered PDF (`lib/pdf/page-count.ts`
// parses the file). This helper estimates BEFORE rendering so the free tier
// can be checked in unit tests and the pipeline can shorten a report that
// would blow the 10-page budget. Model: A4, 18 mm margins, 11 pt body —
// ~420 body words per page; a full-width chart costs ~0.3 page, a card
// chart ~0.15; every chapter header + table costs a fixed overhead.

import type { DimensionChapter, ReportV2 } from "./schema";

export interface PageEstimate {
  pages: number;
  words: number;
  visuals: number;
  /** Per-section page cost (for the length gate's "shorten this" hint). */
  sections: Array<{ id: string; pages: number; words: number }>;
}

const WORDS_PER_PAGE = 420;
const FULL_VISUAL_PAGES = 0.3;
const CARD_VISUAL_PAGES = 0.15;
const CHAPTER_OVERHEAD_PAGES = 0.2; // header + evidence table + stamp
const CARD_OVERHEAD_PAGES = 0.12;

function wc(...parts: Array<string | string[] | undefined | null>): number {
  let n = 0;
  for (const p of parts) {
    if (!p) continue;
    const list = Array.isArray(p) ? p : [p];
    for (const s of list) n += String(s).trim().split(/\s+/).filter(Boolean).length;
  }
  return n;
}

function chapterCost(ch: DimensionChapter, freeTier: boolean): { pages: number; words: number } {
  const asCard = freeTier && ch.renderAs === "card";
  if (asCard) {
    const words = wc(ch.verdict.split(/\s+/).slice(0, 40).join(" "), ch.gaps[0]);
    return { pages: CARD_OVERHEAD_PAGES + CARD_VISUAL_PAGES + words / WORDS_PER_PAGE, words };
  }
  const words = wc(
    ch.verdict,
    ch.strengths,
    ch.gaps,
    ch.nextAction.title,
    ch.phaseLens.whatMattersNow,
    ...ch.criteria.map((c) => [c.verdict, ...c.strengths, ...c.gaps, c.nextAction]),
  );
  const visuals = 1 + (freeTier ? 0 : ch.secondaryVisuals.length);
  return { pages: CHAPTER_OVERHEAD_PAGES + visuals * FULL_VISUAL_PAGES + words / WORDS_PER_PAGE, words };
}

export function estimatePages(report: ReportV2): PageEstimate {
  const free = report.tier === "free";
  const sections: PageEstimate["sections"] = [];
  let visuals = 0;

  // Cover: ring + radar + three questions + dim table.
  const coverWords = wc(report.cover.threeQuestions.where, report.cover.threeQuestions.worth, report.cover.threeQuestions.next);
  sections.push({ id: "cover", pages: 0.9, words: coverWords });
  visuals += report.cover.visuals.length;

  const execWords = wc(report.executive.thesis, report.executive.strengths, report.executive.gaps, report.executive.verdict);
  sections.push({ id: "executive", pages: 0.25 + FULL_VISUAL_PAGES + execWords / WORDS_PER_PAGE, words: execWords });
  visuals += report.executive.visuals.length;

  for (const ch of report.dimensions) {
    const c = chapterCost(ch, free);
    sections.push({ id: `dim-${ch.dim}`, ...c });
    visuals += 1 + (free && ch.renderAs === "card" ? 0 : ch.secondaryVisuals.length);
  }

  const valWords = free ? 0 : wc(report.valuation.narrative, ...report.valuation.methods.map((m) => m.rationale));
  sections.push({ id: "valuation", pages: free ? 0.3 : 0.4 + report.valuation.visuals.length * FULL_VISUAL_PAGES + valWords / WORDS_PER_PAGE, words: valWords });
  visuals += free ? 1 : report.valuation.visuals.length;

  // Phase gates: current row only on free.
  sections.push({ id: "phase-gates", pages: free ? 0.25 : 0.3 + report.phaseGates.visuals.length * FULL_VISUAL_PAGES, words: 0 });
  visuals += free ? 1 : report.phaseGates.visuals.length;

  const moneyWords = wc(...report.moneyOnTable.grants.slice(0, free ? 3 : 50).map((g) => g.name));
  sections.push({ id: "money", pages: 0.2 + FULL_VISUAL_PAGES + moneyWords / WORDS_PER_PAGE, words: moneyWords });
  visuals += report.moneyOnTable.visuals.length;

  const steps = free ? report.actionPlan.steps.slice(0, 5) : report.actionPlan.steps;
  const planWords = wc(...steps.map((s) => s.title));
  sections.push({ id: "action-plan", pages: 0.2 + FULL_VISUAL_PAGES + planWords / WORDS_PER_PAGE + steps.length * 0.03, words: planWords });
  visuals += report.actionPlan.visuals.length;

  const appendixWords = wc(report.appendix.method, report.appendix.dataPrinciple, report.appendix.disclaimer);
  const registerRows = report.appendix.evidenceRegister.length;
  sections.push({ id: "appendix", pages: 0.3 + appendixWords / WORDS_PER_PAGE + registerRows * 0.02, words: appendixWords });

  const words = sections.reduce((a, s) => a + s.words, 0);
  const raw = sections.reduce((a, s) => a + s.pages, 0);
  return { pages: Math.ceil(raw * 10) / 10, words, visuals, sections };
}

/** True when a free-tier report fits the 10-page budget. */
export function withinFreeBudget(report: ReportV2): boolean {
  return estimatePages(report).pages <= report.pageBudget.free;
}
