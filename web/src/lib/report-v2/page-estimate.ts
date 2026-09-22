import { isValuationAvailable } from "./schema";
// Page-count estimate for a ReportV2 (length gate C.9-5, risk R6).
//
// The real page count comes from the rendered PDF (`lib/pdf/page-count.ts`
// parses the file). This helper estimates BEFORE rendering so the free tier
// can be checked in unit tests and the pipeline can shorten a report that
// would blow the 10-page budget. Model: A4, 18 mm margins, 11 pt body —
// ~420 body words per page; a full-width chart costs ~0.3 page; every
// chapter header + table costs a fixed overhead.
//
// G27 (TBR v3, spec docs/design/tbr-v3-investor-report-spec.md § 2 / § 5):
// the sections are the v3 order — dashboard (one page) → investment view
// → key points → valuation → 8 chapters → risk matrix → 90-day plan →
// money → appendix (which now holds the score-ledger tables).

import { cardRenderModes } from "./card-modes";
import { PLAN_STEPS_FREE, RISK_ROWS_FREE } from "./investment-view";
import type { DimensionChapter, ReportV2 } from "./schema";

/**
 * G19-S44: the standard demo fixture must stay within this many rendered
 * words (≥ 60 % non-boilerplate). G27: +100 for the investment view — the
 * 3 + 3 reasons / risks, the summary and the phase box print on page 2
 * (the estimate used to count the one-line thesis only).
 */
export const STANDARD_WORD_BUDGET = 1_500;

export interface PageEstimate {
  pages: number;
  words: number;
  visuals: number;
  /** Per-section page cost (for the length gate's "shorten this" hint). */
  sections: Array<{ id: string; pages: number; words: number }>;
}

const WORDS_PER_PAGE = 420;
const FULL_VISUAL_PAGES = 0.3;
// G27 § 3: heading + header box + the evidence / improve rail + takeaway + stamp ≈ 0.45 page,
// plus one criteria-table row per criterion and, on the paid tiers, one compact card per criterion.
const CHAPTER_OVERHEAD_PAGES = 0.45;
const CRITERION_ROW_PAGES = 0.04;
const CRITERION_CARD_PAGES = 0.1;
const CARD_OVERHEAD_PAGES = 0.16;
// G27 § 5: the dashboard is one page (tiles + chart + footer line); the
// investment view ≈ 0.7 page before its prose (one page with it); key points 0.2; the risk
// matrix 0.4 (grid + table); the plan 0.3 (table + note).
const DASHBOARD_PAGES = 1.0;
const INVESTMENT_VIEW_PAGES = 0.7;
const KEY_POINTS_PAGES = 0.2;
const RISK_MATRIX_PAGES = 0.4;
const RISK_GRID_ONLY_PAGES = 0.2;
const PLAN_PAGES = 0.3;
// G19-S41: "How this score was built" — one compact table per assessed
// chapter (base + signals + score + factors + adjustment, 8.5 pt rows), now
// in the appendix (G27). Measured on the demo: 8 tables ≈ +1 rendered page,
// so ≈ 0.03 per table plus ≈ 0.01 per row; an unassessed chapter is a
// single pending line.
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
    // G27 § 6: locked compact card — score · band · verdict ≤ 40 words · takeaway (no chart).
    const words = wc(ch.verdict.split(/\s+/).slice(0, 40).join(" "));
    return { pages: CARD_OVERHEAD_PAGES + words / WORDS_PER_PAGE, words };
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
  // G27 § 3: one primary figure per chapter on the paid tiers (the free budget carries the dashboard chart
  // instead); secondary visuals are not part of the anatomy; paid tiers add the compact criterion cards.
  const visuals = freeTier ? 0 : 1;
  const criteria = ch.criteria.length * (CRITERION_ROW_PAGES + (freeTier ? 0 : CRITERION_CARD_PAGES));
  return { pages: CHAPTER_OVERHEAD_PAGES + visuals * FULL_VISUAL_PAGES + criteria + words / WORDS_PER_PAGE, words };
}

/** Appendix cost of the score-ledger tables (G27: the ledger moved out of the chapters). */
function ledgerCost(ch: DimensionChapter): number {
  const bd = ch.scoreBreakdown;
  if (!bd) return 0;
  return bd.assessed ? LEDGER_TABLE_PAGES + (bd.signals.length + LEDGER_FIXED_ROWS) * LEDGER_ROW_PAGES : LEDGER_ROW_PAGES;
}

export function estimatePages(report: ReportV2): PageEstimate {
  const free = report.tier === "free";
  const sections: PageEstimate["sections"] = [];
  let visuals = 0;

  // 1 · Dashboard: header + 4 tiles + the dim_bars chart + footer line — one page (spec § 5).
  const coverWords = wc(report.cover.threeQuestions.where, report.cover.threeQuestions.worth, report.cover.threeQuestions.next);
  sections.push({ id: "dashboard", pages: DASHBOARD_PAGES, words: coverWords });
  visuals += 1;

  // 2 · Investment view: band callout + summary + conditions + 3 + 3 cards + phase box.
  const x = report.executive.structured;
  const execWords = x ? wc(x.headline, x.summary, ...x.reasonsToBack.map((r) => `${r.title} ${r.body}`), ...x.criticalGaps.map((g) => `${g.title} ${g.body}`), x.phaseNow.blocker, x.phaseNow.whatItTakes) : wc(report.executive.thesis, report.executive.strengths, report.executive.gaps, report.executive.verdict);
  sections.push({ id: "investment-view", pages: INVESTMENT_VIEW_PAGES + execWords / WORDS_PER_PAGE, words: execWords });

  // 3 · Key points: five lines.
  const kpWords = wc(report.investmentView?.keyPoints ?? []);
  sections.push({ id: "key-points", pages: KEY_POINTS_PAGES + kpWords / WORDS_PER_PAGE, words: kpWords });

  // 4 · Valuation: range tiles + method table (names / weights only on free) + what moves it; paid adds inputs, cross-checks, narrative.
  const applicable = isValuationAvailable(report.valuation) ? report.valuation.methods.filter((m) => m.applicable) : [];
  const valWords = free ? 0 : wc(report.valuation.narrative, ...applicable.map((m) => m.rationale), ...applicable.map((m) => (isValuationAvailable(report.valuation) ? report.valuation.derivation?.[m.method] : "") ?? ""));
  sections.push({ id: "valuation", pages: free ? 0.45 : 0.5 + report.valuation.visuals.length * FULL_VISUAL_PAGES + valWords / WORDS_PER_PAGE, words: valWords });
  visuals += free ? 0 : report.valuation.visuals.length;

  // 5–12 · Chapters.
  for (const ch of report.dimensions) {
    const c = chapterCost(ch, free);
    sections.push({ id: `dim-${ch.dim}`, ...c });
    visuals += free ? 0 : 1;
  }

  // 13 · Risk matrix: the 3×3 grid + the table (grid only on free at level ≥ 3, where the projection empties `show.riskTable`).
  const riskRows = (report.investmentView?.riskMatrix ?? []).slice(0, free ? RISK_ROWS_FREE : undefined);
  const riskWords = wc(...riskRows.map((r) => `${r.text} ${r.mitigation}`));
  sections.push({ id: "risk-matrix", pages: (riskRows.length ? RISK_MATRIX_PAGES : RISK_GRID_ONLY_PAGES) + riskWords / WORDS_PER_PAGE, words: riskWords });

  // 14 · 90-day improvement plan: one table row per step.
  const steps = (report.investmentView?.improvementPlan ?? report.actionPlan.steps).slice(0, free ? PLAN_STEPS_FREE : undefined);
  const planWords = wc(...steps.map((s) => s.title));
  sections.push({ id: "plan", pages: PLAN_PAGES + planWords / WORDS_PER_PAGE + steps.length * 0.03, words: planWords });

  // 15 · Money on the table.
  const moneyWords = wc(...report.moneyOnTable.grants.slice(0, free ? 3 : 50).map((g) => g.name));
  // The money chart is paid content (free-tier.ts drops it at every level).
  const moneyVisuals = free ? 0 : report.moneyOnTable.visuals.length;
  sections.push({ id: "money", pages: 0.2 + moneyVisuals * FULL_VISUAL_PAGES + moneyWords / WORDS_PER_PAGE, words: moneyWords });
  visuals += moneyVisuals;

  // 16 · Appendix: method + phase-gate matrix (+ heat map on paid) + score-ledger tables + register + audit + sources + disclaimers.
  const appendixWords = wc(report.appendix.method, report.appendix.dataPrinciple, report.appendix.disclaimer);
  const registerRows = report.appendix.evidenceRegister.length;
  // Free: a locked card's ledger is paid content (only the full chapters print one).
  const ledger = report.dimensions.filter((ch) => !(free && ch.renderAs === "card")).reduce((a, ch) => a + ledgerCost(ch), 0);
  const gateVisuals = free ? 0 : report.phaseGates.visuals.filter((v) => v.kind === "heat_map").length;
  sections.push({ id: "appendix", pages: 0.5 + gateVisuals * FULL_VISUAL_PAGES + appendixWords / WORDS_PER_PAGE + registerRows * 0.02 + ledger, words: appendixWords });
  visuals += gateVisuals;

  const words = sections.reduce((a, s) => a + s.words, 0);
  const raw = sections.reduce((a, s) => a + s.pages, 0);
  return { pages: Math.ceil(raw * 10) / 10, words, visuals, sections };
}

/** True when a free-tier report fits the 10-page budget. */
export function withinFreeBudget(report: ReportV2): boolean {
  return estimatePages(report).pages <= report.pageBudget.free;
}
