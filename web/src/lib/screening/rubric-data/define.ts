// G32 SV0 — rubric@v1 authoring contract (SOT §9.4.8 step 2, G34 §5).
//
// Pure data. One entry per scope.ts guiding question (52) and one per
// catalogue overlay item (no questionRefs). Levels are ordinal 0–4 plus N/A;
// a model is never asked for a 0–100 number. No numeric weights live here
// (D24-f): question budgets and evidence factors stay in code/private config.

import type { AgentRole } from "@/lib/report-pipeline/types";
import type { EvidenceTier, ScreeningDimension, ScreeningSourceKind, ScreeningStage } from "../types";

export type RubricLevel = 0 | 1 | 2 | 3 | 4;

/** Anchors for levels 0 → 4, one concrete evidence-based sentence each. */
export type RubricAnchors = readonly [string, string, string, string, string];

export interface RubricInput {
  /** `blockid:question:*` id from lib/reanalysis/scope.ts, or the overlay item id (e.g. "TRE-04"). */
  id: string;
  /** The catalogue item a guiding question maps to (questions only; overlays use `id`). */
  item?: string;
  /** Guiding-question text exactly as in evaluation-criteria.ts (questions only). */
  question?: string;
  anchors: RubricAnchors;
  /** 2–4 binary checks a judge answers yes/no before choosing a level. */
  checklist: readonly string[];
  examples: { level2: string; level4: string };
  /** Evidence source kinds that count; defaults to the catalogue item's sources. */
  evidenceTypes?: readonly ScreeningSourceKind[];
  /** Tiers required for level 4; defaults to the catalogue item's accepted tiers. Never T4. */
  level4Tiers?: readonly EvidenceTier[];
  /** Stage applicability; overlays always inherit the catalogue item's stages. */
  stages?: readonly ScreeningStage[];
  /** When the entry is N/A (pending, no points, no penalty) instead of level 0. */
  notApplicable: string;
}

export interface RubricEntry {
  id: string;
  kind: "question" | "overlay";
  itemId: string;
  dimension: ScreeningDimension;
  /** Criterion key for guiding questions (`blockid:question:<criterion>:…`), null for overlays. */
  criterion: string | null;
  /** EN prompt the owner agent and judges answer. */
  prompt: string;
  ownerAgent: AgentRole;
  /** Roles that must sit on the judge panel (from the catalogue item). */
  requiredJudgeAgents: readonly AgentRole[];
  anchors: RubricAnchors;
  checklist: readonly string[];
  examples: { level2: string; level4: string };
  evidence: {
    types: readonly ScreeningSourceKind[];
    /**
     * Tiers required for level 4. Any tier may be cited: best evidence in
     * another T1–T3 tier caps the level at 3, founder-stated (T4) only caps it
     * at 2 (SOT §9.4.8 step 4) — see `levelCeiling`.
     */
    level4Tiers: readonly EvidenceTier[];
    /** Positive credit decays after this window (catalogue item); bad news does not expire. */
    freshnessDays: number;
  };
  stages: readonly ScreeningStage[];
  notApplicable: string;
  rubricVersion: "rubric@v1";
}
