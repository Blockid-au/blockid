// Page-count estimate for a ReportV2 (length gate C.9-5, risk R6).
//
// The real page count comes from the rendered PDF (`lib/pdf/page-count.ts`
// parses the file). This helper estimates BEFORE rendering so the free tier
// can be checked in unit tests and the pipeline can shorten a report that
// would blow the 10-page budget. Model: A4, 18 mm margins, 11 pt body —
// ~420 body words per page; a full-width chart costs ~0.3 page, a card
// chart ~0.15; every chapter header + table costs a fixed overhead.

import { cardRenderModes } from "./card-modes";
import type { DimensionChapter, ReportV2 } from "./schema";

/** G19-S44: the standard demo fixture must stay within this many rendered words (≥ 60 % non-boilerplate). */
export const STANDARD_WORD_BUDGET = 1_400;

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
// G19-S41: "How this score was built" — one compact table per full chapter
// (base + signals + score + factors + adjustment, 8.5 pt rows). Measured on
// the demo: 8 tables ≈ +1 rendered page (23 → 24), so ≈ 0.03 per table plus
// ≈ 0.01 per row; an unassessed chapter shows a single pending line.
const LEDGER_TABLE_PAGES = 0.03;
const LEDGER_ROW_PAGES = 0.01;
const LEDGER_FIXED_ROWS = 5; // base, score, weight×confidence, verification, adjustment

function normBullet(text: string): string {
  return text.trim().toLowerCase().replace(/[.;:,\s]+$/u, "");
}

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
  // G19-S44: chapter-level bullets count only where they add to the cards
  // (the web chapter hides duplicates), and the phase-lens sentence is no
  // longer rendered per chapter (one row in Phase Gates + a floor chip).
  const cardText = new Set(ch.criteria.flatMap((c) => [...c.strengths, ...c.gaps]).map(normBullet));
  const modes = cardRenderModes(ch);
  const words = wc(
    ch.verdict,
    ch.strengths.filter((x) => !cardText.has(normBullet(x))),
    ch.gaps.filter((x) => !cardText.has(normBullet(x))),
    ch.nextAction.title,
    ...ch.criteria.map((c) => (modes.get(c.key) === "compact" ? [c.verdict] : [c.verdict, ...c.strengths, ...c.gaps, c.nextAction])),
  );
  const visuals = 1 + (freeTier ? 0 : ch.secondaryVisuals.length);
  const bd = ch.scoreBreakdown;
  const ledger = !bd ? 0 : bd.assessed ? LEDGER_TABLE_PAGES + (bd.signals.length + LEDGER_FIXED_ROWS) * LEDGER_ROW_PAGES : LEDGER_ROW_PAGES;
  return { pages: CHAPTER_OVERHEAD_PAGES + visuals * FULL_VISUAL_PAGES + ledger + words / WORDS_PER_PAGE, words };
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

  // G19-S42/S44: the chapter renders the APPLICABLE method rows only (derivation + rationale); non-applicable rows are one hidden line.
  const applicable = report.valuation.methods.filter((m) => m.applicable);
  const valWords = free ? 0 : wc(report.valuation.narrative, ...applicable.map((m) => m.rationale), ...applicable.map((m) => report.valuation.derivation?.[m.method] ?? ""));
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
