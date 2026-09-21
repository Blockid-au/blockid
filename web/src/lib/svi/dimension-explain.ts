// G21-P1-B — per-dimension explainability, one data shape for the web card,
// the workspace and the document twins:
//
//   Score · Confidence · Why (≤ 3 sentences from the ledger rationale) ·
//   Evidence (≤ 3 strongest items, L1–L6 badges) · Missing (≤ 3 catalogue
//   items not yet present — what would materially move the score) ·
//   Benchmark (prop-driven; P1-C labels it) · Next action (one)
//
// A pending dimension (S41 `assessed:false`) keeps the G19 pending band and
// carries only Missing + Next action. Pure — no I/O, no React.

import type { DimensionEvidenceItem } from "@/lib/evidence/dimension-evidence";
import { reportRowToDimensionEvidence, signalsToDimensionEvidence, mergeDimensionEvidence, strongestDimensionEvidence } from "@/lib/evidence/dimension-evidence";
import { DIMENSION_OWNERS, type DimKey } from "@/lib/report-pipeline/dimension-owners";
import type { Band } from "@/lib/report-visuals/types";
import { bandFor } from "@/lib/report-visuals/palette";
import { stripCitationMarkers } from "@/lib/report-v2/citations";
import { ctaForCode, hrefForCode } from "@/lib/report-v2/evidence-cta";
import { splitSentences, stripMarkdown } from "@/lib/report-v2/paragraphs";
import type { ActionWindow, DimensionChapter } from "@/lib/report-v2/schema";
import type { SVIAnalysis, SVISubScore } from "@/lib/svi-analysis";
import { EVIDENCE_CATALOG } from "@/lib/svi-completeness";
import type { AssessmentBenchmark } from "@/lib/svi/assessment-card";

export const EXPLAIN_MAX_WHY = 3;
export const EXPLAIN_MAX_EVIDENCE = 3;
export const EXPLAIN_MAX_MISSING = 3;

export interface DimensionMissingItem {
  code: string;
  label: string;
  /** Catalogue lift (estimatedSviImpact) — the one lift model. */
  lift: number;
  href: string;
}

export interface DimensionNextAction {
  title: string;
  href?: string;
  window?: ActionWindow;
  lift?: number;
}

export interface DimensionExplainData {
  dim: DimKey;
  title: string;
  weight: number;
  /** Null while pending. */
  score: number | null;
  band: Band;
  pending: boolean;
  /** 0–100 (the dimension's evidence-confidence multiplier × 100); null while pending. */
  confidence: number | null;
  why: string[];
  evidence: DimensionEvidenceItem[];
  missing: DimensionMissingItem[];
  benchmark?: AssessmentBenchmark;
  nextAction: DimensionNextAction | null;
}

/** ≤ n sentences of plain prose (markdown stripped). */
export function whySentences(text: string | null | undefined, max = EXPLAIN_MAX_WHY): string[] {
  if (!text) return [];
  // Citation markers are footnotes on the report surfaces; the card has no appendix (review G24 P2).
  return splitSentences(stripMarkdown(stripCitationMarkers(text))).slice(0, max);
}

/** Catalogue items for `dim` not yet present (by code), strongest lift first. */
export function missingFor(dim: string, present: ReadonlySet<string>, max = EXPLAIN_MAX_MISSING): DimensionMissingItem[] {
  const catalogue = EVIDENCE_CATALOG[dim.toLowerCase()] ?? [];
  return catalogue
    .filter((e) => !present.has(e.code))
    .sort((a, b) => b.estimatedSviImpact - a.estimatedSviImpact)
    .slice(0, max)
    .map((e) => ({ code: e.code, label: e.label, lift: e.estimatedSviImpact, href: hrefForCode(e.code) }));
}

/** The codes the evidence items already cover. */
export function presentCodes(items: readonly DimensionEvidenceItem[]): Set<string> {
  return new Set(items.map((i) => i.code).filter((c): c is string => Boolean(c)));
}

/** The first missing item phrased as one action ("Add cap table (current equity register)"). */
export function actionFromMissing(missing: readonly DimensionMissingItem[]): DimensionNextAction | null {
  const first = missing[0];
  if (!first) return null;
  const cta = ctaForCode(first.code);
  return { title: cta?.label ?? `Add ${first.label.toLowerCase()}`, href: first.href, lift: first.lift };
}

export interface ExplainOptions {
  /** Extra evidence items (Evidence Hub rows) merged with what the chapter / analysis carries. */
  evidence?: readonly DimensionEvidenceItem[];
  /** Prop-driven; P1-C computes the label. */
  benchmark?: AssessmentBenchmark | null;
}

/** ReportV2 chapter → explain data. */
export function dimensionExplainFromChapter(ch: DimensionChapter, opts: ExplainOptions = {}): DimensionExplainData {
  const pending = ch.scoreBreakdown ? !ch.scoreBreakdown.assessed : ch.band === "pending";
  const fromRows = ch.evidence.map(reportRowToDimensionEvidence).filter((i): i is DimensionEvidenceItem => Boolean(i));
  const fromSignals = signalsToDimensionEvidence(ch.dim, ch.scoreBreakdown?.signals);
  const all = mergeDimensionEvidence(opts.evidence ?? [], fromRows, fromSignals);
  const missing = missingFor(ch.dim, presentCodes(all));
  const nextAction: DimensionNextAction | null = pending
    ? actionFromMissing(missing)
    : ch.nextAction?.title
      ? { title: stripMarkdown(ch.nextAction.title), window: ch.nextAction.window, lift: ch.nextAction.expectedLift, ...(ch.nextAction.evidenceToAdd ? {} : missing[0] ? { href: missing[0].href } : {}) }
      : actionFromMissing(missing);
  return {
    dim: ch.dim,
    title: ch.title,
    weight: ch.weight,
    score: pending ? null : ch.score,
    band: pending ? "pending" : ch.band,
    pending,
    confidence: pending || !ch.scoreBreakdown ? null : Math.round(ch.scoreBreakdown.confidenceMultiplier * 100),
    why: pending ? [] : whySentences(ch.verdict),
    evidence: pending ? [] : strongestDimensionEvidence(all, EXPLAIN_MAX_EVIDENCE),
    missing,
    ...(opts.benchmark ? { benchmark: opts.benchmark } : {}),
    nextAction,
  };
}

/** SVIAnalysis sub-score (workspace) → explain data. */
export function dimensionExplainFromSubScore(sub: SVISubScore, analysis: Pick<SVIAnalysis, "confidenceMultiplier" | "nextActions" | "evidenceGaps">, opts: ExplainOptions = {}): DimensionExplainData {
  const dim = sub.key as DimKey;
  const owner = DIMENSION_OWNERS[dim];
  const pending = sub.assessed === false;
  const fromSignals = signalsToDimensionEvidence(dim, sub.breakdown);
  const all = mergeDimensionEvidence(opts.evidence ?? [], fromSignals);
  const missing = missingFor(dim, presentCodes(all));
  // The analysis' own gap for this dimension wins when it names a catalogue code.
  const gap = analysis.evidenceGaps?.find((g) => g.code && (EVIDENCE_CATALOG[dim] ?? []).some((e) => e.code === g.code) && !presentCodes(all).has(g.code));
  const nextAction: DimensionNextAction | null = gap ? { title: stripMarkdown(gap.action), href: hrefForCode(gap.code!), lift: gap.impact } : actionFromMissing(missing);
  return {
    dim,
    title: owner?.title ?? sub.label,
    weight: owner?.weight ?? 0,
    score: pending ? null : sub.value,
    band: pending ? "pending" : bandFor(sub.value),
    pending,
    confidence: pending ? null : Math.round(analysis.confidenceMultiplier * 100),
    why: pending ? [] : whySentences(sub.rationale),
    evidence: pending ? [] : strongestDimensionEvidence(all, EXPLAIN_MAX_EVIDENCE),
    missing,
    ...(opts.benchmark ? { benchmark: opts.benchmark } : {}),
    nextAction,
  };
}
