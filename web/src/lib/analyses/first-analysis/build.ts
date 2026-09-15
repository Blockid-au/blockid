// Deterministic sections of the first analysis (S32-B).
//
// Everything here is a pure function of the stored intake — the same
// `computeSVI(signals)` the screen used, the same `estimateValuation` the row
// was stamped with — so the report, the page and the database can never
// disagree about what the founder was shown. No model call, no I/O, no
// `server-only`: the job runner writes these first (they cost nothing), then
// starts the agents.
//
// The rule that governs every number: it traces to an input or to a stated
// assumption. A revenue multiple is used ONLY when the founder's own text
// carries a revenue figure; otherwise the range is SVI-based and says so.

import { computeSVI, type SVIAnalysis, type SVIExtractedSignals } from "@/lib/svi-analysis";
import { estimateValuation } from "@/lib/valuation";
import { buildDeepValuationAnalysis } from "@/lib/agents/deep-valuation";
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
  type ValuationMethodRow,
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

const AMOUNT = String.raw`(?:A?\$|AUD\s?)\s?(\d[\d,]*(?:\.\d+)?)\s?(k|m|b|bn|million|thousand|billion)?`;

function toAud(num: string, unit: string | undefined): number {
  const n = Number.parseFloat(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return 0;
  const u = (unit ?? "").toLowerCase();
  if (u === "k" || u === "thousand") return n * 1_000;
  if (u === "m" || u === "million") return n * 1_000_000;
  if (u === "b" || u === "bn" || u === "billion") return n * 1_000_000_000;
  return n;
}

export interface RevenueFigure {
  mrrAud?: number;
  arrAud?: number;
  /** The exact phrase it was read from. */
  quote: string;
}

/**
 * Read an explicit MRR / ARR figure out of the text. Returns null unless the
 * founder actually wrote one — a "we have revenue" with no number is NOT a
 * figure and must not become one.
 */
export function parseRevenueFigure(text: string): RevenueFigure | null {
  if (!text) return null;
  const mrrA = new RegExp(String.raw`\bmrr\b[^.\n]{0,30}?${AMOUNT}`, "i").exec(text);
  const mrrB = new RegExp(String.raw`${AMOUNT}[^.\n]{0,20}?\b(?:mrr|per month|a month|/mo|monthly(?: recurring)? revenue)\b`, "i").exec(text);
  const arrA = new RegExp(String.raw`\barr\b[^.\n]{0,30}?${AMOUNT}`, "i").exec(text);
  const arrB = new RegExp(String.raw`${AMOUNT}[^.\n]{0,20}?\b(?:arr|per year|a year|/yr|annual(?: recurring)? revenue|in (?:annual )?revenue)\b`, "i").exec(text);
  const mrr = mrrA ?? mrrB;
  const arr = arrA ?? arrB;
  if (mrr) {
    const v = toAud(mrr[1], mrr[2]);
    if (v > 0) return { mrrAud: v, arrAud: v * 12, quote: mrr[0].trim() };
  }
  if (arr) {
    const v = toAud(arr[1], arr[2]);
    if (v > 0) return { arrAud: v, mrrAud: v / 12, quote: arr[0].trim() };
  }
  return null;
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

const STAGE_BAND: Record<number, number> = { 0: 50, 1: 50, 2: 40, 3: 40, 4: 30, 5: 30, 6: 25, 7: 25 };

export function buildValuationSection(
  analysis: SVIAnalysis,
  rawText: string,
): ValuationSection {
  const dims =
    analysis.dimensionScores ??
    Object.fromEntries(analysis.subs.map((s) => [s.key, s.value]));
  const sector = analysis.sector ?? analysis.signals?.sector;
  const figure = parseRevenueFigure(rawText);
  const estimate = estimateValuation(
    analysis.totalSVI,
    analysis.stage ?? 0,
    { sector, mrr: figure?.mrrAud, arr: figure?.arrAud },
    dims,
  );
  const basis: ValuationSection["basis"] = figure ? "revenue" : "svi_based";
  const stage = analysis.stage ?? 0;
  const band = STAGE_BAND[Math.max(0, Math.min(7, stage))] ?? 40;

  const assumptions: string[] = [];
  if (figure) {
    assumptions.push(
      `Revenue figure read from your input: "${figure.quote}" — treated as ${figure.mrrAud ? `MRR A$${Math.round(figure.mrrAud).toLocaleString("en-AU")}` : ""}${figure.arrAud ? ` (ARR A$${Math.round(figure.arrAud).toLocaleString("en-AU")})` : ""}.`,
    );
    assumptions.push(
      `Sector multiple: ${sector ? `${sector} band` : "generic band (no sector detected)"} from the AU 2024–25 calibration table; growth and churn were not provided, so no growth premium or churn discount was applied.`,
    );
  } else {
    assumptions.push(
      "No revenue figure was provided, so no revenue multiple was used. The range rests on the Berkus and Scorecard methods, each mapped from your SVI dimension scores.",
    );
    assumptions.push(
      `Stage baseline: the AU pre-money median for the "${analysis.stageLabel}" stage (Cut Through Venture 2024–25, Carta AU-discounted). Your stage was detected from the evidence in the input.`,
    );
  }
  assumptions.push(
    `Berkus pillars capped at A$2.0M each (AU-adjusted); Scorecard weights FTV 30%, MPC 25%, PTD 15%, SVM 10%, TRE 10%, IRI 5%, LCO 2.5%, CGH 2.5%.`,
  );
  assumptions.push(
    `Band: ±${band}% around the mid-point — the uncertainty we assign to this stage. A narrower band needs more evidence, not a different formula.`,
  );
  assumptions.push(
    `Evidence confidence ${Math.round(analysis.confidenceMultiplier * 100)}%: the score is scaled by how much of the eight dimensions your input actually evidences.`,
  );

  // Four-perspective cross-check (investor / market / operational / ecosystem).
  let methods: ValuationMethodRow[] = [];
  try {
    const deep = buildDeepValuationAnalysis({
      sviAnalysis: analysis,
      rawText,
      mrrAud: figure?.mrrAud,
    });
    methods = deep.perspectives.map((p) => ({
      name: p.label,
      lowAud: p.lowAud,
      midAud: p.midAud,
      highAud: p.highAud,
      weight: p.weight,
      rationale: p.rationale,
      assumptions: p.assumptions,
    }));
  } catch {
    methods = [];
  }

  const note = figure
    ? "Indicative only. Built from the revenue figure you gave and your SVI; not a formal valuation."
    : "Indicative only. No revenue was provided, so this is an SVI-based range under the assumptions listed — not a formal valuation.";

  return {
    lowAud: estimate.low,
    midAud: estimate.mid,
    highAud: estimate.high,
    method: estimate.method,
    confidence: estimate.confidence,
    basis,
    assumptions,
    methods,
    note,
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
    valuation: buildValuationSection(analysis, input.intake.rawText ?? ""),
    actionPlan: buildActionPlanSection(analysis),
    agents: {},
    progress: { current: null, completed: [], failed: [] },
  };
  return { report, analysis, echo };
}
