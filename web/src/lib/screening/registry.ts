// G34 BT0 — the investor-screening catalogue registry (plan §4, D24-a/c).
//
// Single owner source for screening items: an item's owner is its dimension
// lead unless the item names otherwise. `evaluation-criteria.ts primaryAgent`
// is a contributor, not an owner. Pure data: no I/O, no AI, and NOT wired into
// scoring or the report pipeline yet (BT5). Emphasis is published as bands
// only; numeric weights stay in code where they are today (D24-f).
//
// Adding an item = append it to its module + a golden fixture + a calibration
// row, then bump SCREENING_CATALOG_VERSION. Ids are never reused.

import type { AgentRole } from "@/lib/report-pipeline/types";
import { DIMENSION_LEAD, SCREENING_DIMENSIONS } from "./define";
import { CGH_ITEMS } from "./modules/cgh";
import { FTV_ITEMS } from "./modules/ftv";
import { IRI_ITEMS } from "./modules/iri";
import { LCO_ITEMS } from "./modules/lco";
import { MPC_ITEMS } from "./modules/mpc";
import { PTD_ITEMS } from "./modules/ptd";
import { SVM_ITEMS } from "./modules/svm";
import { TRE_ITEMS } from "./modules/tre";
import type { ScreeningDimension, ScreeningItem, ScreeningStage } from "./types";

export const SCREENING_CATALOG_VERSION = "catalog@v1";

export { DIMENSION_EMPHASIS, DIMENSION_LEAD, DIMENSION_SUPPORTING, RUBRIC_VERSION, SCREENING_DIMENSIONS, SCREENING_STAGES } from "./define";

const BY_DIMENSION: Readonly<Record<ScreeningDimension, readonly ScreeningItem[]>> = {
  FTV: FTV_ITEMS, MPC: MPC_ITEMS, PTD: PTD_ITEMS, TRE: TRE_ITEMS,
  CGH: CGH_ITEMS, IRI: IRI_ITEMS, LCO: LCO_ITEMS, SVM: SVM_ITEMS,
};

/** All 78 catalogue items, in dimension order FTV → SVM. */
export const SCREENING_ITEMS: readonly ScreeningItem[] = Object.freeze(SCREENING_DIMENSIONS.flatMap(dim => BY_DIMENSION[dim]));

export function itemsFor(dim: ScreeningDimension): readonly ScreeningItem[] {
  return BY_DIMENSION[dim];
}

export function itemsForStage(stage: ScreeningStage): ScreeningItem[] {
  return SCREENING_ITEMS.filter(item => item.stages.includes(stage));
}

/** Dimension lead (§4.4) — the owner of every item in that dimension by default. */
export function ownerFor(dim: ScreeningDimension): AgentRole {
  return DIMENSION_LEAD[dim];
}

export function screeningItem(id: string): ScreeningItem | undefined {
  return SCREENING_ITEMS.find(item => item.id === id);
}

export type { EmphasisBand, EvidenceTier, ScreeningDimension, ScreeningItem, ScreeningRedFlag, ScreeningStage } from "./types";
