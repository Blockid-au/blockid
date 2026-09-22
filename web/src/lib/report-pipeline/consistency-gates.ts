import { isValuationAvailable } from "@/lib/report-v2/schema";
// consistency-gates — the deterministic consistency checks of the quality
// gates (spec 12-product-ai-tbr-v2.md §C.9 gate 3, S-R3). No LLM, no I/O;
// runs in the orchestrator after AUDIT and before ASSEMBLE and mutates the
// chapters / valuation / executive summary in place so every surface renders
// the reconciled numbers.
//
//   1. chapter score within ± 10 of the computeSVI dimension score — else the
//      deterministic score wins and the chapter gets a "score reconciled" note
//   2. valuation consensus within the stage band — the AU stage baselines
//      (`VALUATION_BASELINES_AUD`, lib/valuation.ts) widened ×0.5 / ×2; outside
//      it the range is kept, the confidence is cut and the narrative says so
//      (`SVI_BENCHMARKS` holds SVI-score percentiles, not A$ — see the note)
//   3. the TRE narrative must not state an MRR / ARR figure when no revenue
//      evidence row exists — the figure is replaced by an [unevidenced] marker
//   4. the phase blockers listed in the executive summary are exactly
//      `PhaseGateResult.blockers` — a missing list is appended deterministically

import type { PhaseGateResult } from "@/lib/growth/phase-gate";
import type { DimensionChapter, EvidenceRow, ValuationChapter } from "@/lib/report-v2/schema";
import { bandFor } from "@/lib/report-visuals";
import { VALUATION_BASELINES_AUD } from "@/lib/valuation";
import { criteriaForDimension, type DimKey } from "./dimension-owners";
import type { ConsistencyIssue } from "./types";

export const SCORE_TOLERANCE = 10;
/** Stage band tolerance: consensus mid must sit within [low × 0.5, high × 2]. */
export const VALUATION_BAND_LOW_FACTOR = 0.5;
export const VALUATION_BAND_HIGH_FACTOR = 2;

export interface ConsistencyGateInput {
  chapters?: Map<DimKey, DimensionChapter> | null;
  /** Deterministic computeSVI dimension scores. */
  dimScores: Partial<Record<DimKey, number>>;
  valuation?: ValuationChapter | null;
  /** SVI stage 0–7. */
  stage: number;
  evidenceRows: EvidenceRow[];
  phaseGate?: PhaseGateResult | null;
  executiveSummary: string;
}

export interface ConsistencyGateResult {
  issues: ConsistencyIssue[];
  /** Chapters whose score was replaced by the deterministic one. */
  reconciled: DimKey[];
  /** null when there is no valuation to check. */
  valuationInBand: boolean | null;
  /** True when an MRR / ARR figure was stripped from the TRE chapter. */
  treRevenueStripped: boolean;
  /** True when the blockers block was appended to the summary. */
  blockersAppended: boolean;
  executiveSummary: string;
}

// ── 3. Revenue statements ───────────────────────────────────────────────────

/**
 * A revenue evidence row: a connector (stripe / xero) row, an evidenced row
 * whose label / value talks revenue, or a founder-stated revenue row
 * (`self_declared`, status partial) — the valuation chapter is built from
 * that same founder-stated MRR, so the TRE narrative may cite it too; the
 * gate only fires when the report has NO revenue row at all (W3 review).
 */
export function hasRevenueEvidence(rows: EvidenceRow[]): boolean {
  const revenueish = (r: EvidenceRow) => /\b(revenue|mrr|arr|invoice|sales|payments?)\b/i.test(`${r.label} ${r.value ?? ""}`);
  return rows.some(
    (r) =>
      (r.status === "evidenced" && (r.source === "stripe" || r.source === "xero" || revenueish(r))) ||
      (r.status === "partial" && r.source === "self_declared" && revenueish(r)),
  );
}

const MONEY = String.raw`(?:A?\$|AUD\s?)\s?\d[\d,.]*(?:\s?(?:k|m|bn|million|thousand)\b)?`;
/**
 * Only explicit recurring-revenue statements: "A$12,400 MRR", "MRR of A$12k",
 * "ARR: $150,000", "12,400 in monthly recurring revenue". Generic "$8k per
 * month" is NOT matched — burn, hosting and salaries are "per month" too.
 * A citation right after the figure is swallowed so the marker never
 * precedes a dangling `[E3]`.
 */
const REVENUE_FIGURE_RE = new RegExp(
  [
    `${MONEY}\\s*(?:in\\s+|of\\s+)?(?:MRR|ARR|monthly recurring(?: revenue)?|annual recurring(?: revenue)?|monthly revenue|annual revenue|(?:per month|/\\s?mo(?:nth)?)\\s+(?:recurring|in revenue|revenue))\\b(?:\\s*\\[[^\\]]+\\])?`,
    `\\b(?:MRR|ARR)\\b\\s*(?:of|at|is|:|=|reached|hit|now)?\\s*${MONEY}(?:\\s*\\[[^\\]]+\\])?`,
  ].join("|"),
  "gi",
);
/** Words within 40 chars before a figure that mark it as NOT a claimed revenue fact. */
const NON_REVENUE_CONTEXT_RE = /\b(burn|cost|costs|salary|salaries|hosting|spend|cac|target|goal|projected|projection|forecast|plan(?:ned)?|aim(?:ing)?|expect(?:ed|s)?)\b[^.]{0,40}$/i;

export const UNEVIDENCED_REVENUE = "a revenue figure [unevidenced — no revenue evidence row]";

/** Replace stated MRR / ARR figures with the unevidenced marker; returns the text and whether anything changed. */
export function stripRevenueFigures(text: string): { text: string; changed: boolean } {
  let changed = false;
  const out = text.replace(REVENUE_FIGURE_RE, (match, offset: number) => {
    const before = text.slice(Math.max(0, offset - 60), offset);
    if (NON_REVENUE_CONTEXT_RE.test(before)) return match; // a burn / target / cost figure, not a revenue claim
    changed = true;
    return UNEVIDENCED_REVENUE;
  });
  return { text: out, changed };
}

// ── 2. Stage band ───────────────────────────────────────────────────────────

export function valuationStageBand(stage: number): { low: number; high: number; mid: number } {
  const s = Math.max(0, Math.min(7, Math.round(Number.isFinite(stage) ? stage : 0)));
  const b = VALUATION_BASELINES_AUD[s];
  return { low: b.low * VALUATION_BAND_LOW_FACTOR, high: b.high * VALUATION_BAND_HIGH_FACTOR, mid: b.mid };
}

function aud(n: number): string {
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

// ── The gate ────────────────────────────────────────────────────────────────

export function applyConsistencyGates(input: ConsistencyGateInput): ConsistencyGateResult {
  const issues: ConsistencyIssue[] = [];
  const reconciled: DimKey[] = [];
  let executiveSummary = input.executiveSummary;

  // 1. Chapter score vs deterministic score.
  input.chapters?.forEach((chapter, dim) => {
    const det = input.dimScores[dim];
    if (typeof det !== "number" || !Number.isFinite(det)) return;
    if (Math.abs(chapter.score - det) <= SCORE_TOLERANCE) return;
    const proposed = chapter.score;
    chapter.proposedScore = chapter.proposedScore ?? proposed;
    chapter.score = Math.round(det);
    chapter.band = bandFor(chapter.score);
    chapter.scoreNote = `Score reconciled: the ${chapter.ownerAgent.toUpperCase()} chapter proposed ${proposed}, more than ${SCORE_TOLERANCE} points from the deterministic SVI score ${Math.round(det)} — the deterministic score is shown.`;
    reconciled.push(dim);
    issues.push({
      type: "score_mismatch",
      severity: Math.abs(proposed - det) > 25 ? "high" : "medium",
      description: `${dim.toUpperCase()} chapter score ${proposed} reconciled to the deterministic ${Math.round(det)} (> ±${SCORE_TOLERANCE}).`,
      criteria: criteriaForDimension(dim),
      suggestedFix: "Add evidence for the criteria behind the higher figure; the owner narrative keeps its reasoning.",
    });
  });

  // 2. Valuation consensus within the stage band.
  let valuationInBand: boolean | null = null;
  const v = input.valuation;
  if (v && isValuationAvailable(v) && v.consensus.midAud > 0) {
    const band = valuationStageBand(input.stage);
    valuationInBand = v.consensus.midAud >= band.low && v.consensus.midAud <= band.high;
    if (!valuationInBand) {
      const side = v.consensus.midAud > band.high ? "above" : "below";
      v.consensus.confidence = Math.round(Math.max(0, Math.min(1, v.consensus.confidence * 0.8)) * 100) / 100;
      const note = `Consistency note: the consensus mid ${aud(v.consensus.midAud)} sits ${side} the AU stage band ${aud(band.low)}–${aud(band.high)} (stage ${Math.round(input.stage)} baseline mid ${aud(band.mid)}); the range is retained, confidence reduced — verify the revenue and multiple inputs before quoting the mid.`;
      if (!v.narrative.includes("Consistency note:")) v.narrative = `${v.narrative} ${note}`.trim();
      // G19-S42: the note also lives on the chapter so every surface renders it, not just the log.
      v.consistencyNotes = [...(v.consistencyNotes ?? []).filter((n) => !n.startsWith("Consistency note:")), note];
      issues.push({
        type: "data_misalignment",
        severity: "medium",
        description: `Valuation consensus ${aud(v.consensus.midAud)} is ${side} the stage ${Math.round(input.stage)} band ${aud(band.low)}–${aud(band.high)}.`,
        criteria: ["revenue", "market"],
        suggestedFix: "Connect Stripe / Xero or state MRR so the revenue multiple runs on evidenced revenue.",
      });
    }
  }

  // 3. TRE narrative must not state MRR without a revenue evidence row.
  let treRevenueStripped = false;
  const tre = input.chapters?.get("tre");
  if (tre && !hasRevenueEvidence(input.evidenceRows)) {
    const verdict = stripRevenueFigures(tre.verdict);
    if (verdict.changed) tre.verdict = verdict.text;
    const strengths = tre.strengths.map(stripRevenueFigures);
    const gaps = tre.gaps.map(stripRevenueFigures);
    tre.strengths = strengths.map((s) => s.text);
    tre.gaps = gaps.map((g) => g.text);
    let cardsChanged = false;
    tre.criteria.forEach((card) => {
      const cv = stripRevenueFigures(card.verdict);
      if (cv.changed) {
        card.verdict = cv.text;
        cardsChanged = true;
      }
    });
    treRevenueStripped = verdict.changed || strengths.some((s) => s.changed) || gaps.some((g) => g.changed) || cardsChanged;
    if (treRevenueStripped) {
      tre.audit = { ...tre.audit, grounded: false, uncited: tre.audit.uncited + 1 };
      issues.push({
        type: "evidence_gap",
        severity: "high",
        description: "TRE stated an MRR / ARR figure with no revenue evidence row — the figure was replaced by an [unevidenced] marker.",
        criteria: ["revenue", "customer_size"],
        suggestedFix: "Connect Stripe or Xero, or upload a revenue statement, so the figure can be cited.",
      });
    }
  }

  // 4. Phase blockers in the executive summary = PhaseGateResult.blockers.
  let blockersAppended = false;
  const gate = input.phaseGate;
  if (gate && gate.blockers.length) {
    const lower = executiveSummary.toLowerCase();
    const listed = gate.blockers.every((b) => lower.includes(b.detail.toLowerCase()) || lower.includes(b.subject.toLowerCase()));
    if (!listed) {
      const block = [`**Phase blockers — ${gate.currentPhaseLabel} (deterministic gate):**`, ...gate.blockers.map((b) => `- ${b.detail}`)].join("\n");
      executiveSummary = `${executiveSummary.trimEnd()}\n\n${block}`;
      blockersAppended = true;
      issues.push({
        type: "narrative_conflict",
        severity: "low",
        description: `The executive summary did not list all ${gate.blockers.length} phase blocker(s) — the deterministic list was appended.`,
        criteria: [],
      });
    }
  }

  return { issues, reconciled, valuationInBand, treRevenueStripped, blockersAppended, executiveSummary };
}
