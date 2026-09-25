// Shared constants + the authoring helper for the screening modules.
// Bands only (D24-f); numeric constants are fixed at SV4 calibration in private config.

import type { AgentRole } from "@/lib/report-pipeline/types";
import type { EmphasisBand, ScreeningDimension, ScreeningItem, ScreeningItemInput, ScreeningStage } from "./types";

export const SCREENING_STAGES: readonly ScreeningStage[] = ["PS", "S", "A", "B+"];
export const SCREENING_DIMENSIONS: readonly ScreeningDimension[] = ["FTV", "MPC", "PTD", "TRE", "CGH", "IRI", "LCO", "SVM"];
export const RUBRIC_VERSION = "rubric@v1" as const;

/** §4.4 dimension lead = item owner unless an item names otherwise (D24-c). */
export const DIMENSION_LEAD: Readonly<Record<ScreeningDimension, AgentRole>> = {
  FTV: "chro", MPC: "cmo", PTD: "cto", TRE: "cro", CGH: "cfo", IRI: "clo", LCO: "clo", SVM: "ceo",
};

/** §4.4 supporting roles per dimension; items pick a subset. */
export const DIMENSION_SUPPORTING: Readonly<Record<ScreeningDimension, readonly AgentRole[]>> = {
  FTV: ["ceo", "clo", "coo"], MPC: ["cpo", "cro", "cfo", "cdo"], PTD: ["ciso", "cpo", "cdo"], TRE: ["cfo", "cmo", "cdo"],
  CGH: ["clo", "chro", "coo"], IRI: ["cfo", "cro", "ceo", "cdo"], LCO: ["ciso", "coo", "cfo"], SVM: ["cmo", "cpo", "cfo"],
};

/** §4.3 stage emphasis, published as relative bands only. */
export const DIMENSION_EMPHASIS: Readonly<Record<ScreeningDimension, Readonly<Record<ScreeningStage, EmphasisBand>>>> = {
  FTV: { PS: "VeryHigh", S: "High", A: "Medium", "B+": "Medium" },
  MPC: { PS: "High", S: "High", A: "Medium", "B+": "Medium" },
  PTD: { PS: "High", S: "High", A: "Medium", "B+": "Low" },
  TRE: { PS: "Low", S: "Medium", A: "High", "B+": "VeryHigh" },
  CGH: { PS: "Low", S: "Medium", A: "Medium", "B+": "High" },
  IRI: { PS: "Low", S: "Medium", A: "High", "B+": "High" },
  LCO: { PS: "Medium", S: "Medium", A: "High", "B+": "High" },
  SVM: { PS: "Medium", S: "Medium", A: "Medium", "B+": "Medium" },
};

/** Inclusive stage span, e.g. span("PS", "A") → PS, S, A. */
export function span(from: ScreeningStage, to: ScreeningStage = "B+"): ScreeningStage[] {
  return SCREENING_STAGES.slice(SCREENING_STAGES.indexOf(from), SCREENING_STAGES.indexOf(to) + 1);
}
export const ALL_STAGES = span("PS");

export function defineItems(dimension: ScreeningDimension, inputs: readonly ScreeningItemInput[]): readonly ScreeningItem[] {
  return inputs.map(input => {
    const questionRefs = input.questionRefs ?? [];
    const emphasisBand = Object.fromEntries(input.stages.map(stage => [stage, DIMENSION_EMPHASIS[dimension][stage]]));
    const item: ScreeningItem = {
      id: input.id, dimension, title: input.title, question: input.question,
      questionRefs, overlay: questionRefs.length === 0,
      ownerAgent: input.ownerAgent ?? DIMENSION_LEAD[dimension], supporting: input.supporting,
      judges: 2, requiredJudgeAgents: input.requiredJudgeAgents ?? [],
      stages: input.stages, emphasisBand, evidence: input.evidence,
      benchmarkRef: input.benchmarkRef ?? null, redFlags: input.redFlags, signal: input.signal,
      metricsKey: input.metricsKey ?? null, rubricVersion: RUBRIC_VERSION,
      ...(input.rule ? { rule: input.rule } : {}),
    };
    return Object.freeze(item);
  });
}
