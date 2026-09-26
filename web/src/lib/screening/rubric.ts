// G32 SV0 — rubric@v1 (SOT §9.4.7 SV0, §9.4.8 step 2; G34 §5, D24-a).
//
// The screening catalogue IS the rubric source: one entry per scope.ts guiding
// question (52, owned by the catalogue item that maps it) plus one entry per
// overlay item (catalogue items with no guiding question). Each entry carries
// ordinal anchors 0–4, 2–4 binary checks, level-2 and level-4 examples, the
// evidence types and tiers that count, stage applicability and the N/A rule.
//
// Pure data + lookups: no I/O, no AI, and NOT wired into scoring yet — SV3
// (shadow scoring) consumes it. No numeric weights here (D24-f); question
// budgets and evidence factors stay in code/private config. Changing any
// anchor, check or applicability is a new rubric version, never an edit in place.

import type { AgentRole } from "@/lib/report-pipeline/types";
import { RUBRIC_VERSION, SCREENING_DIMENSIONS, screeningItem } from "./registry";
import { CGH_RUBRIC } from "./rubric-data/cgh";
import type { RubricEntry, RubricInput, RubricLevel } from "./rubric-data/define";
import { FTV_RUBRIC } from "./rubric-data/ftv";
import { IRI_RUBRIC } from "./rubric-data/iri";
import { LCO_RUBRIC } from "./rubric-data/lco";
import { MPC_RUBRIC } from "./rubric-data/mpc";
import { PTD_RUBRIC } from "./rubric-data/ptd";
import { SVM_RUBRIC } from "./rubric-data/svm";
import { TRE_RUBRIC } from "./rubric-data/tre";
import type { EvidenceTier, ScreeningDimension, ScreeningStage } from "./types";

export type { RubricAnchors, RubricEntry, RubricLevel } from "./rubric-data/define";

export { RUBRIC_VERSION };

export const RUBRIC_LEVELS: readonly RubricLevel[] = [0, 1, 2, 3, 4];

/**
 * Published level meaning shared by every entry (the per-entry anchors make it
 * concrete). "Not assessed" is N/A — pending, no points, never level 0.
 */
export const RUBRIC_LEVEL_MEANING: Readonly<Record<RubricLevel, string>> = {
  0: "Assessed, and the evidence shows the practice or result is absent or contradicted.",
  1: "Asserted only: a claim with no specifics that could be checked.",
  2: "Specific and checkable, but supported only by the company's or founder's own account.",
  3: "Supported by evidence of the tier the entry requires, at the level expected for the stage.",
  4: "Supported by required-tier evidence over time or from independent sources, and strong for the stage.",
};

/** Founder-stated (T4) evidence alone never supports more than level 2 (SOT §9.4.8 step 4). */
export const FOUNDER_CLAIM_LEVEL_CEILING: RubricLevel = 2;

const TIER_ORDER: readonly EvidenceTier[] = ["T1", "T2", "T3", "T4"];

const AUTHORED: Readonly<Record<ScreeningDimension, readonly RubricInput[]>> = {
  FTV: FTV_RUBRIC, MPC: MPC_RUBRIC, PTD: PTD_RUBRIC, TRE: TRE_RUBRIC,
  CGH: CGH_RUBRIC, IRI: IRI_RUBRIC, LCO: LCO_RUBRIC, SVM: SVM_RUBRIC,
};

function build(dimension: ScreeningDimension, input: RubricInput): RubricEntry {
  const kind = input.item ? "question" : "overlay";
  const itemId = input.item ?? input.id;
  const item = screeningItem(itemId);
  if (!item || item.dimension !== dimension) throw new Error(`rubric@v1: ${input.id} names unknown ${dimension} item ${itemId}`);
  const criterion = kind === "question" ? (/^blockid:question:([a-z_]+):/.exec(input.id)?.[1] ?? null) : null;
  const entry: RubricEntry = {
    id: input.id,
    kind,
    itemId,
    dimension,
    criterion,
    prompt: kind === "question" ? (input.question ?? "") : item.question.en,
    ownerAgent: item.ownerAgent,
    requiredJudgeAgents: item.requiredJudgeAgents,
    anchors: input.anchors,
    checklist: input.checklist,
    examples: input.examples,
    evidence: {
      types: input.evidenceTypes ?? item.evidence.sources,
      level4Tiers: input.level4Tiers ?? item.evidence.acceptedTiers,
      freshnessDays: item.evidence.freshnessDays,
    },
    stages: kind === "overlay" ? item.stages : (input.stages ?? item.stages),
    notApplicable: input.notApplicable,
    rubricVersion: RUBRIC_VERSION,
  };
  return Object.freeze(entry);
}

/** Every rubric@v1 entry in dimension order FTV → SVM (questions, then overlays, as authored). */
export const RUBRIC_ENTRIES: readonly RubricEntry[] = Object.freeze(
  SCREENING_DIMENSIONS.flatMap(dim => AUTHORED[dim].map(input => build(dim, input))),
);

const BY_ID: ReadonlyMap<string, RubricEntry> = new Map(RUBRIC_ENTRIES.map(entry => [entry.id, entry]));

/** Rubric for a scope.ts question id (`blockid:question:*`) or an overlay item id (e.g. "TRE-04"). */
export function rubricFor(questionId: string): RubricEntry | undefined {
  return BY_ID.get(questionId);
}

/** Entries (guiding questions + overlays) that apply at a stage; everything else is N/A there. */
export function applicableQuestions(stage: ScreeningStage): RubricEntry[] {
  return RUBRIC_ENTRIES.filter(entry => entry.stages.includes(stage));
}

/** Every entry scored under a catalogue item (its guiding questions, or the overlay itself). */
export function rubricForItem(itemId: string): RubricEntry[] {
  return RUBRIC_ENTRIES.filter(entry => entry.itemId === itemId);
}

/** Entries a given agent owns (phiếu 1 of the panel). */
export function rubricOwnedBy(agent: AgentRole): RubricEntry[] {
  return RUBRIC_ENTRIES.filter(entry => entry.ownerAgent === agent);
}

/**
 * Highest level the cited evidence can support. `null` = no evidence cited, so
 * the entry is not assessed (N/A, pending) rather than level 0. Evidence at a
 * required tier or stronger allows 4; weaker T1–T3 evidence allows 3;
 * founder-stated only allows 2.
 */
export function levelCeiling(entry: RubricEntry, citedTiers: readonly EvidenceTier[]): RubricLevel | null {
  const best = TIER_ORDER.findIndex(tier => citedTiers.includes(tier));
  if (best < 0) return null;
  const weakestRequired = Math.max(...entry.evidence.level4Tiers.map(tier => TIER_ORDER.indexOf(tier)));
  if (best <= weakestRequired) return 4;
  return TIER_ORDER[best] === "T4" ? FOUNDER_CLAIM_LEVEL_CEILING : 3;
}
