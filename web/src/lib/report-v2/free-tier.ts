// Free-tier projection + page-budget trim levels for the fixed-layout
// surfaces (PDF, DOCX) — S-R4, spec §A.1 "the 10-page budget is enforced
// by lib/pdf/page-count.ts" + §F S-R4 "page-count gate".
//
// The web renders every chapter and lets CSS decide; a PDF has a hard page
// count, so the free tier is projected HERE, once, and the PDF / DOCX
// builders read the projection rather than re-deciding per section:
//
//   level 0  the tier-native document — chapters 6–9 as cards, no secondary
//            visuals, valuation range only, current phase-gate row only,
//            top-3 money rows, 5 action steps, appendix register ≤ 12 rows
//   level 1  criterion cards capped at 2 per full chapter
//   level 2  evidence tables + phase lens dropped, criterion cards verdict-only,
//            chapter strengths / gaps capped at 3 × 25 words, verdict ≤ 60 words
//   level 3  appendix register + audit log dropped (counts remain), one
//            criterion card per chapter, verdict ≤ 40 words
//   level 4  every non-primary visual dropped (executive, money, action plan),
//            strengths / gaps 2 × 15 words, verdict ≤ 30 words
//
// `renderTbrPdf` starts at the level the page ESTIMATE needs, renders,
// reads the REAL page count back (`page-count.ts`) and steps up until the
// file fits. Paid tiers never trim (level 0 with `free: false` is identity).
//
// Pure: no I/O, no React; client-safe.

import type { DimensionChapter, ExecutiveStructured, ReportV2 } from "./schema";
import { estimatePages } from "./page-estimate";

export const MAX_TRIM_LEVEL = 4;
export type TrimLevel = 0 | 1 | 2 | 3 | 4;

export interface FreeTierProjection {
  report: ReportV2;
  free: boolean;
  level: TrimLevel;
  /** Human-readable list of what was cut (for the appendix "what this tier omits" line). */
  dropped: string[];
  /** Money rows / action steps shown. */
  moneyLimit: number;
  actionSteps: number;
  /** Section toggles the builders honour (data is never removed from chapters, so the schema still holds). */
  show: { evidenceTables: boolean; phaseLens: boolean; criterionDetail: boolean };
}

const words = (s: string, n: number): string => {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  return parts.length <= n ? s.trim() : `${parts.slice(0, n).join(" ")}…`;
};

/**
 * G19-S47: the structured executive on the free tier —
 *   level ≥ 1  summary ≤ 2 paragraphs, actions ≤ 3
 *   level ≥ 2  benchmarks + key insight dropped, card bodies ≤ 25 words
 *   level ≥ 3  reasons / gaps ≤ 2 each, bodies ≤ 15 words, actions ≤ 2
 *   level ≥ 4  summary 1 paragraph ≤ 40 words
 */
export function projectExecutiveStructured(x: ExecutiveStructured, level: TrimLevel): ExecutiveStructured {
  if (level === 0) return x;
  const bodyCap = level >= 3 ? 15 : level >= 2 ? 25 : 60;
  const out: ExecutiveStructured = {
    ...x,
    summary: level >= 4 ? [words(x.summary[0] ?? "", 40)] : x.summary.slice(0, 2),
    reasonsToBack: x.reasonsToBack.slice(0, level >= 3 ? 2 : 3).map((r) => ({ ...r, body: words(r.body, bodyCap) })),
    criticalGaps: x.criticalGaps.slice(0, level >= 3 ? 2 : 3).map((g) => ({ ...g, body: words(g.body, bodyCap) })),
    actions: x.actions.slice(0, level >= 3 ? 2 : 3).map((a) => ({ ...a, detail: words(a.detail, level >= 2 ? 15 : 30) })),
    benchmarks: level >= 2 ? [] : x.benchmarks,
  };
  if (level >= 2) delete out.keyInsight;
  return out;
}

function projectChapter(ch: DimensionChapter, free: boolean, level: TrimLevel): DimensionChapter {
  if (!free) return ch;
  const out: DimensionChapter = { ...ch, secondaryVisuals: [] };
  if (ch.renderAs === "card") return { ...out, criteria: ch.criteria.slice(0, 1) };
  if (level >= 1) out.criteria = ch.criteria.slice(0, 2);
  if (level >= 2) {
    out.criteria = out.criteria.map((c) => ({ ...c, strengths: [], gaps: [], nextAction: "", verdict: words(c.verdict, 40) }));
    out.verdict = words(ch.verdict, 60);
    out.strengths = ch.strengths.slice(0, 3).map((x) => words(x, 25));
    out.gaps = ch.gaps.slice(0, 3).map((x) => words(x, 25));
  }
  if (level >= 3) {
    out.verdict = words(ch.verdict, 40);
    out.criteria = out.criteria.slice(0, 1);
  }
  if (level >= 4) {
    out.strengths = out.strengths.slice(0, 2).map((x) => words(x, 15));
    out.gaps = out.gaps.slice(0, 2).map((x) => words(x, 15));
    out.verdict = words(ch.verdict, 30);
  }
  return out;
}

/**
 * Project a report for a fixed-layout surface at `level`. Paid tiers are
 * returned untouched (same object identity for the chapters, no dropped
 * list) so the PDF and DOCX builders can call this unconditionally.
 */
export function projectForTier(report: ReportV2, level: TrimLevel = 0): FreeTierProjection {
  const free = report.tier === "free";
  const showAll = { evidenceTables: true, phaseLens: true, criterionDetail: true };
  if (!free) return { report, free, level: 0, dropped: [], moneyLimit: 50, actionSteps: report.actionPlan.steps.length, show: showAll };
  const dropped: string[] = ["secondary visuals", "chapters 6–9 as summary cards", "valuation method detail", "phase-gate matrix", "grants beyond the top 3", "action steps beyond 5"];
  const registerCap = level >= 3 ? 0 : 12;
  const projected: ReportV2 = {
    ...report,
    dimensions: report.dimensions.map((ch) => projectChapter(ch, true, level)),
    executive: {
      ...report.executive,
      visuals: level >= 4 ? [] : report.executive.visuals,
      ...(report.executive.structured ? { structured: projectExecutiveStructured(report.executive.structured, level) } : {}),
    },
    // G19-S43: Money on the Table now carries real matches — level 4 keeps the top 2 rows.
    moneyOnTable: { ...report.moneyOnTable, grants: report.moneyOnTable.grants.slice(0, level >= 4 ? 2 : 3), programs: report.moneyOnTable.programs.slice(0, level >= 4 ? 2 : 3), visuals: level >= 4 ? [] : report.moneyOnTable.visuals },
    // G19-S43: the P0 / P1 evidence rows follow the register rule (≤ 3 rows, dropped with the register at level 3); level 4 keeps 3 steps.
    actionPlan: { ...report.actionPlan, steps: report.actionPlan.steps.slice(0, level >= 4 ? 3 : 5), visuals: level >= 4 ? [] : report.actionPlan.visuals, ...(report.actionPlan.evidenceToAdd ? { evidenceToAdd: report.actionPlan.evidenceToAdd.slice(0, level >= 3 ? 0 : 3) } : {}) },
    phaseGates: { ...report.phaseGates, visuals: report.phaseGates.visuals.filter((v) => v.kind === "route_map") },
    valuation: { ...report.valuation, visuals: report.valuation.visuals.filter((v) => v.kind === "range_bars"), narrative: "" },
    appendix: {
      ...report.appendix,
      evidenceRegister: report.appendix.evidenceRegister.slice(0, registerCap),
      auditLog: level >= 3 ? [] : report.appendix.auditLog,
    },
  };
  if (level >= 1) dropped.push("criterion cards beyond 2 per chapter");
  if (level >= 2) dropped.push("evidence tables", "phase lens");
  if (level >= 3) dropped.push("evidence register", "auditor log");
  if (level >= 4) dropped.push("executive / money / action-plan charts", "grants beyond the top 2", "action steps beyond 3");
  return {
    report: projected,
    free,
    level,
    dropped,
    moneyLimit: level >= 4 ? 2 : 3,
    actionSteps: Math.min(level >= 4 ? 3 : 5, report.actionPlan.steps.length),
    show: level >= 2 ? { evidenceTables: false, phaseLens: false, criterionDetail: false } : showAll,
  };
}

/** The lowest level whose page ESTIMATE fits the free budget (0 for paid tiers). */
export function levelForEstimate(report: ReportV2): TrimLevel {
  if (report.tier !== "free") return 0;
  for (let level = 0 as TrimLevel; level <= MAX_TRIM_LEVEL; level = (level + 1) as TrimLevel) {
    const p = projectForTier(report, level).report;
    if (estimatePages(p).pages <= report.pageBudget.free) return level;
  }
  return MAX_TRIM_LEVEL as TrimLevel;
}
