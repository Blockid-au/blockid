// Per-phase investor readiness helper (P5a).
//
// Contract: docs/plans/atlassian-standard-mapping-goal.md
//   §P5_investor_readiness_score exit criterion —
//     "readiness_by_phase(input) returning Record<PhaseKey,
//      {score, band, missing_top3}>"
//
// Pure, no I/O. Takes the same inputs the blended `computeReadiness`
// consumes and projects them across all 12 phases so the founder tile
// can render a per-phase view instead of the single blended tuple.
//
// Score model:
//   - For each phase P (1..12) we score the CRITERIA subset that phase
//     actually gates (see PHASE_CRITERION_SUBSET below — derived from the
//     phase gap matrix in §1).
//   - Weight each criterion by evaluation-criteria.ts CRITERIA[i].weight
//     (the 100-point weights that already power the composite enhanced
//     score) so the readiness signal stays consistent with the SVI report.
//   - Missing top-3 = phase-scoped raise-blockers-first, tie-broken by
//     original template order (matches computeMissing's sort).
//   - Band matches the tile's UX contract: >=75 investor-ready,
//     >=50 warming-up, else not-ready.

import {
  CRITERIA,
  type CriterionKey,
} from "@/lib/evaluation-criteria";
import { ALL_PHASE_KEYS, type PhaseKey } from "@/lib/journey-map";
import {
  ATLASSIAN_DATAROOM_TEMPLATE,
  type DataRoomTemplateRow,
} from "@/lib/dataroom/atlassian-template";
import type {
  NudgeDataroomRow,
  NudgeMissingItem,
  NudgeSviScoreRow,
} from "./next-steps";

export type ReadinessBand = "not-ready" | "warming-up" | "investor-ready";

export interface PhaseReadinessEntry {
  score: number;
  band: ReadinessBand;
  missing_top3: NudgeMissingItem[];
  /** Criteria that fed the score — useful for debugging + downstream copy. */
  criteria_used: CriterionKey[];
}

export type ReadinessByPhase = Record<PhaseKey, PhaseReadinessEntry>;

// ---------------------------------------------------------------------------
// Phase → SVI criterion subset. Sourced from §1 of the goal file (each
// row's "AU investor standard artefacts expected here" column) crossed
// with evaluation-criteria.ts CRITERION_KEYS. Missing keys are OK — a
// phase can care about a criterion that has no evidence yet (it just
// drags the score down).
// ---------------------------------------------------------------------------

export const PHASE_CRITERION_SUBSET: Record<PhaseKey, readonly CriterionKey[]> = {
  1: ["idea", "founder_profile"],
  2: ["idea", "market", "founder_profile", "customer_size"],
  3: ["market", "customer_size", "gtm_strategy"],
  4: ["code_git", "website", "roadmap"],
  5: ["customer_size", "revenue", "roadmap"],
  6: ["revenue", "gtm_strategy", "dataroom"],
  7: ["revenue", "customer_size", "gtm_strategy", "website"],
  8: ["team", "team_structure", "founder_profile", "documents"],
  9: ["documents", "dataroom", "revenue", "team", "gtm_strategy"],
  10: ["documents", "dataroom", "revenue", "team_structure"],
  11: ["revenue", "team", "team_structure", "dataroom"],
  12: ["revenue", "documents", "team_structure", "dataroom"],
} as const;

const CRITERION_WEIGHT: Record<CriterionKey, number> = CRITERIA.reduce(
  (acc, c) => {
    acc[c.key] = c.weight;
    return acc;
  },
  {} as Record<CriterionKey, number>,
);

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export interface ComputeReadinessByPhaseInput {
  sviScores: NudgeSviScoreRow[];
  dataroomRows: NudgeDataroomRow[];
}

export function computeReadinessByPhase(
  input: ComputeReadinessByPhaseInput,
): ReadinessByPhase {
  const criterionScores = indexSviScores(input.sviScores);
  const presentKeys = indexDataroomPresent(input.dataroomRows);

  const out = {} as ReadinessByPhase;
  for (const phase of ALL_PHASE_KEYS) {
    const criteria = PHASE_CRITERION_SUBSET[phase];
    const score = weightedScore(criteria, criterionScores);
    const missing_top3 = phaseMissing(phase, presentKeys).slice(0, 3);
    out[phase] = {
      score,
      band: bandOfScore(score),
      missing_top3,
      criteria_used: [...criteria],
    };
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function indexSviScores(rows: NudgeSviScoreRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const key = (row.criterion_key ?? row.dimension ?? "").toLowerCase();
    if (!key) continue;
    const raw = row.score;
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    const norm = raw <= 1 ? raw * 100 : raw;
    const clamped = Math.max(0, Math.min(100, norm));
    // Keep the highest score seen if the same key repeats — matches how
    // the blended computeReadiness averages then max-clamps.
    const prior = map.get(key);
    map.set(key, prior === undefined ? clamped : Math.max(prior, clamped));
  }
  return map;
}

function indexDataroomPresent(rows: NudgeDataroomRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    if (row.status && row.status !== "missing" && row.status !== "archived") {
      set.add(`${row.svi_dimension}::${row.file_name}`);
    }
  }
  return set;
}

function weightedScore(
  criteria: readonly CriterionKey[],
  scores: Map<string, number>,
): number {
  let numerator = 0;
  let denominator = 0;
  for (const key of criteria) {
    const w = CRITERION_WEIGHT[key] ?? 1;
    denominator += w;
    const s = scores.get(key);
    // A missing criterion scores 0 (it drags the phase readiness down —
    // this is deliberate so an empty SVI never returns > 0).
    numerator += w * (typeof s === "number" ? s : 0);
  }
  if (denominator === 0) return 0;
  return Math.round(numerator / denominator);
}

function bandOfScore(score: number): ReadinessBand {
  if (score >= 75) return "investor-ready";
  if (score >= 50) return "warming-up";
  return "not-ready";
}

function phaseMissing(
  phase: PhaseKey,
  presentKeys: Set<string>,
): NudgeMissingItem[] {
  const inScope: DataRoomTemplateRow[] = ATLASSIAN_DATAROOM_TEMPLATE.filter(
    (r) => {
      const p = Number.parseInt(r.phaseSlug, 10);
      return Number.isFinite(p) && p <= phase;
    },
  );

  const missing: NudgeMissingItem[] = [];
  for (const tpl of inScope) {
    if (presentKeys.has(`${tpl.category}::${tpl.title}`)) continue;
    const raiseBlocker = isRaiseBlocker(tpl.title);
    missing.push({
      category: tpl.category,
      title: tpl.title,
      phase_slug: tpl.phaseSlug,
      why_it_matters: raiseBlocker
        ? `Raise-blocker at Phase ${tpl.phaseSlug} — investors will ask for this before term-sheet.`
        : `Standard due-diligence artefact for Phase ${tpl.phaseSlug} — supplies evidence for the ${tpl.category.replace(/^\d+\.\s*/, "")} folder.`,
      raise_blocker: raiseBlocker,
      cta_url: `/dashboard/data-room?add=${encodeURIComponent(tpl.category)}`,
    });
  }

  missing.sort((a, b) => {
    if (a.raise_blocker !== b.raise_blocker) return a.raise_blocker ? -1 : 1;
    const pa = Number.parseInt(a.phase_slug, 10);
    const pb = Number.parseInt(b.phase_slug, 10);
    if (pa !== pb) return pa - pb;
    return a.title.localeCompare(b.title);
  });
  return missing;
}

// Deliberately duplicated with next-steps.ts to keep the module import-safe
// (no circular dependency risk); kept in sync via unit tests over the same
// title strings.
const RAISE_BLOCKER_TITLE_HINTS: readonly string[] = [
  "esic",
  "s708",
  "wholesale",
  "constitution",
  "safe / convertible",
  "convertible note",
  "safe agreement",
  "abn",
  "acn",
  "gst",
  "r&d tax",
  "esop",
  "share purchase",
  "ip assignment",
  "founder agreement",
  "founder vesting",
  "cap table",
];

function isRaiseBlocker(title: string): boolean {
  const lower = title.toLowerCase();
  return RAISE_BLOCKER_TITLE_HINTS.some((hint) => lower.includes(hint));
}
