// Deterministic sections of the first analysis (S32-B).
//
// Everything here is a pure function of the stored intake — the same
// `computeSVI(signals)` the screen used — so the report, the page and the
// database can never disagree about what the founder was shown. No model call, no I/O, no
// `server-only`: the job runner writes these first (they cost nothing), then
// starts the agents.
//
// The rule that governs every number: it traces to an input or to a stated
// assumption. No dollar valuation is derived from the SVI (V04a / D22): the
// valuation section is "not estimable" with what would unlock a method.

import { computeSVI, type SVIAnalysis, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { valuationNotEstimable } from "@/lib/valuation/not-estimable";
import { formatFigureAud, parseFinancialFigures, type RevenueKind } from "@/lib/intake/financial-figures";
import { buildScnActionPlan, type ScnAction } from "@/lib/agents/scn-action-plan";
import { buildInputEcho, type EchoInput, type EchoMeta, type InputEcho } from "@/lib/analyses/input-echo";
import {
  DIMENSION_LABELS as DIM_LABELS,
  FIRST_ANALYSIS_REPORT_VERSION,
  type ActionPlanItem,
  type ActionPlanSection,
  type DimensionReasoning,
  type FirstAnalysisReport,
  type SviSection,
  type ValuationSection,
} from "./types";

/** Index weights as printed — mirrors the dimension weights in computeSVI. */
export const DIM_WEIGHTS: Record<string, string> = {
  ftv: "15%",
  mpc: "18%",
  ptd: "12%",
  tre: "20%",
  cgh: "12%",
  iri: "10%",
  lco: "8%",
  svm: "5%",
};

// ── Revenue figure from the founder's own words ──────────────────────────

export interface RevenueFigure {
  mrrAud?: number;
  arrAud?: number;
  /** The exact phrase it was read from. */
  quote: string;
  /** How it was stated: monthly, annual, over N months, or bare. */
  kind: RevenueKind;
  periodMonths?: number;
}

/**
 * Read an explicit revenue figure out of the text — MRR, ARR, "A$36,000 in
 * the last 6 months" (→ MRR = 36,000 / 6), or a bare "revenue of A$X"
 * (treated as the trailing 12 months). Returns null unless the founder
 * actually wrote one — "we have revenue" with no number is NOT a figure and
 * must not become one. Paid pilots ("A$18,000 each") are traction, not
 * recurring revenue, and are never read as the figure.
 *
 * Thin wrapper over the shared intake parser so the echo, the signals and
 * this section all read the same number.
 */
export function parseRevenueFigure(text: string): RevenueFigure | null {
  const r = parseFinancialFigures(text).revenue;
  if (!r) return null;
  return {
    mrrAud: r.mrrAud,
    arrAud: r.arrAud,
    quote: r.quote,
    kind: r.kind,
    ...(r.periodMonths != null ? { periodMonths: r.periodMonths } : {}),
  };
}

function describeRevenue(figure: RevenueFigure): string {
  const mrr = figure.mrrAud != null ? `MRR ${formatFigureAud(figure.mrrAud)}` : "";
  const arr = figure.arrAud != null ? `ARR ${formatFigureAud(figure.arrAud)}` : "";
  if (figure.kind === "period" && figure.periodMonths) {
    return `${formatFigureAud((figure.mrrAud ?? 0) * figure.periodMonths)} over ${figure.periodMonths} months → ${mrr} (${arr} annualised)`;
  }
  if (figure.kind === "unspecified") {
    return `${arr} (period not stated — treated as the last 12 months; ${mrr})`;
  }
  return [mrr, arr ? `(${arr})` : ""].filter(Boolean).join(" ");
}

// ── SVI ──────────────────────────────────────────────────────────────────

export function buildSviSection(analysis: SVIAnalysis): SviSection {
  const dimensions: DimensionReasoning[] = analysis.subs.map((sub) => ({
    key: sub.key,
    label: DIM_LABELS[sub.key] ?? sub.label,
    score: Math.round(sub.value),
    weight: DIM_WEIGHTS[sub.key] ?? "",
    rationale: sub.rationale,
    evidence: sub.evidence,
    gaps: sub.gaps,
  }));
  return {
    total: Math.round(analysis.totalSVI * 100) / 100,
    baseline: analysis.baselineSVI,
    netAdjustment: Math.round(analysis.netAdjustment * 100) / 100,
    stage: analysis.stage,
    stageLabel: analysis.stageLabel,
    confidence: analysis.confidenceMultiplier,
    sector: analysis.sector,
    sectorLabel: analysis.sectorLabel,
    summary: analysis.summary,
    dimensions,
    riskPenalties: analysis.riskPenalties.map((r) => ({ label: r.label, points: r.points, reason: r.reason })),
    evidenceGaps: analysis.evidenceGaps.map((g) => ({
      priority: g.priority,
      label: g.label,
      action: g.action,
      impact: g.impact,
    })),
  };
}

// ── Valuation ────────────────────────────────────────────────────────────

/**
 * V04a (founder decision D22): the valuation section is always "not
 * estimable". The SVI is an uncapped index, not a dollar valuation, and the
 * intake carries no qualified input a CFO method can run on (a founder-typed
 * revenue figure is company-stated, not verified — §9.5.3). The section says
 * what would unlock a method and reports what the founder stated (revenue,
 * cap, ask) exactly as read, without turning any of it into a value.
 */
export function buildValuationSection(
  analysis: SVIAnalysis,
  rawText: string,
): ValuationSection {
  const figures = parseFinancialFigures(rawText);
  const figure = parseRevenueFigure(rawText);
  const ne = valuationNotEstimable();

  const assumptions: string[] = [];
  if (figure) {
    assumptions.push(
      `Revenue figure read from your input: "${figure.quote}" — ${describeRevenue(figure)}. It is company-stated, so it cannot anchor a valuation until it is verified (connect Stripe or Xero, or add financial statements with a stated period).`,
    );
  } else {
    assumptions.push("No revenue figure was provided.");
  }
  if (figures.pilots) {
    assumptions.push(
      `Paid pilots ("${figures.pilots.quote}") count as traction, not recurring revenue.`,
    );
  }
  const statedCapAud = analysis.signals?.statedCapAud ?? figures.cap?.amountAud;
  const statedCapKind = analysis.signals?.statedCapKind ?? figures.cap?.kind;
  if (statedCapAud != null && statedCapAud > 0) {
    assumptions.push(
      `Your stated ${statedCapKind === "pre_money" ? "pre-money" : statedCapKind === "post_money" ? "post-money" : statedCapKind === "valuation" ? "valuation" : "cap"}: ${formatFigureAud(statedCapAud)}. Reported as you gave it; BlockID does not confirm or contest it.`,
    );
  }
  if (figures.ask) {
    assumptions.push(`The ask read from your input: "${figures.ask.quote}" (${formatFigureAud(figures.ask.amountAud)}).`);
  }
  assumptions.push(ne.why);

  return {
    status: "not_estimable",
    unlock: ne.unlock,
    assumptions,
    note: ne.line,
    ...(figures.ask ? { askAud: figures.ask.amountAud } : {}),
    ...(statedCapAud != null && statedCapAud > 0 ? { statedCapAud } : {}),
    ...(statedCapAud != null && statedCapAud > 0 && statedCapKind ? { statedCapKind } : {}),
  };
}

// ── 30-day action plan ───────────────────────────────────────────────────

function toItem(a: ScnAction): ActionPlanItem {
  return { title: a.title, detail: a.tactic || a.detail, priority: a.priority, timeline: a.timeline, impact: a.impact };
}

export function buildActionPlanSection(analysis: SVIAnalysis): ActionPlanSection {
  try {
    const plan = buildScnActionPlan({ analysis });
    const all = plan.layers.flatMap((l) => l.actions);
    const order: Record<ActionPlanItem["priority"], number> = { P0: 0, P1: 1, P2: 2 };
    const near = all
      .filter((a) => a.timeline === "this_week" || a.timeline === "30_day")
      .sort((a, b) => order[a.priority] - order[b.priority])
      .slice(0, 6);
    const thisWeek = plan.thisWeekFocus ? toItem(plan.thisWeekFocus) : null;
    const steps: ActionPlanSection["steps"] = [
      {
        day: 0,
        title: "Read the echo and the eight dimensions",
        detail: "Check the 'What we read' table. Anything marked not provided is a gap in the input before it is a gap in the business — fix those first, then re-run.",
      },
    ];
    if (thisWeek) steps.push({ day: 1, title: thisWeek.title, detail: thisWeek.detail });
    const days = [7, 14, 21, 28];
    let i = 0;
    for (const a of near) {
      if (thisWeek && a.title === thisWeek.title) continue;
      if (i >= days.length) break;
      steps.push({ day: days[i], title: a.title, detail: a.detail });
      i += 1;
    }
    steps.push({
      day: 30,
      title: "Re-run the analysis with the new evidence",
      detail: "Upload what you built or signed. The index moves only on evidence, so the re-run is the measurement.",
    });
    return {
      thisWeek,
      steps,
      milestones: plan.milestones.map((m) => ({
        day: m.day,
        title: m.title,
        goal: m.measurableGoal,
        evidence: m.evidenceRequired,
      })),
      actions: all.slice(0, 12).map(toItem),
    };
  } catch {
    return {
      thisWeek: null,
      steps: [
        { day: 0, title: "Read the echo and the eight dimensions", detail: "Anything marked not provided is a gap in the input before it is a gap in the business." },
        { day: 30, title: "Re-run the analysis with the new evidence", detail: "The index moves only on evidence." },
      ],
      milestones: [],
      actions: analysis.nextActions.slice(0, 6).map((a) => ({
        title: a.title,
        detail: a.detail,
        priority: a.priority,
        timeline: "30_day" as const,
        impact: a.impact,
      })),
    };
  }
}

// ── The whole deterministic skeleton ─────────────────────────────────────

/** A live IntakeResult, or the compact stored one — only these fields are read. */
export interface BuildIntake extends EchoInput {
  rawText: string;
  scoringSourceText?: string;
  signals: SVIExtractedSignals;
}

export interface BuildInput {
  analysisId: string;
  intake: BuildIntake;
  meta?: EchoMeta;
  now?: Date;
}

/**
 * The report before any agent has written a word: echo, SVI, valuation and
 * the 30-day plan, with `agents` empty and `progress` idle.
 */
export function buildDeterministicReport(input: BuildInput): {
  report: FirstAnalysisReport;
  analysis: SVIAnalysis;
  echo: InputEcho;
} {
  const now = input.now ?? new Date();
  const echo = buildInputEcho(input.intake, input.meta);
  const analysis = computeSVI(input.intake.signals);
  const report: FirstAnalysisReport = {
    version: FIRST_ANALYSIS_REPORT_VERSION,
    analysisId: input.analysisId,
    company: echo.company,
    generatedAt: now.toISOString(),
    echo,
    svi: buildSviSection(analysis),
    valuation: buildValuationSection(analysis, input.intake.scoringSourceText ?? input.intake.rawText ?? ""),
    actionPlan: buildActionPlanSection(analysis),
    agents: {},
    progress: { current: null, completed: [], failed: [] },
  };
  return { report, analysis, echo };
}
