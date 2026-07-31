// G8-P1 — growth-phase advance gate.
//
// The 12-phase model tracked `completion_pct` and nothing else, so nothing in
// the product could answer "has this founder actually earned the next phase?".
// Unicorn S0-S5 has such an engine (`unicorn/framework.ts:computeStageProgress`);
// this is its counterpart for the taxonomy the DB actually stores, and it
// deliberately mirrors that module's shape so the two stay comparable.
//
// A phase is cleared when ALL THREE hold:
//   1. every required evaluation criterion sits at >= `good`
//   2. every SVI dimension floor for the phase is met
//   3. every declared deliverable for the phase is marked done
//
// Exit criteria are the table in
// docs/plans/unlock-next-level-2026-07-31.md §2c.
//
// Pure module: no I/O, no network. Inputs are plain rows so the API route,
// the nightly cron and unit tests all drive the same code.

import { QUALITY_LEVELS, type CriterionKey, type QualityLevel } from "@/lib/evaluation-criteria";
import {
  deliverablesFor,
  growthPhaseOrder,
  GROWTH_PHASE_IDS,
  GROWTH_PHASE_LABELS,
  isGrowthPhaseId,
  nextGrowthPhase,
  type GrowthPhaseId,
} from "./phase-taxonomy";

/** SVI business dimensions (svi-analysis.ts). `svm` is a multiplier, never a floor. */
export type SviDimension = "ftv" | "mpc" | "ptd" | "tre" | "cgh" | "iri" | "lco";

export type PhaseBlockerCode =
  | "missing_required_criteria"
  | "criteria_below_threshold"
  | "dimension_below_floor"
  | "deliverables_incomplete";

export interface PhaseBlocker {
  readonly code: PhaseBlockerCode;
  /** Criterion key, dimension key, or deliverable label this blocker is about. */
  readonly subject: string;
  /** Founder-facing one-liner. */
  readonly detail: string;
}

export interface PhaseExitRule {
  readonly requiredCriteria: readonly CriterionKey[];
  readonly dimensionFloors: Partial<Record<SviDimension, number>>;
}

export interface PhaseGateResult {
  readonly currentPhase: GrowthPhaseId;
  readonly currentPhaseLabel: string;
  readonly nextPhase: GrowthPhaseId | null;
  readonly phaseOrder: number;
  /** 0..100 — share of this phase's exit conditions already satisfied. */
  readonly completionPct: number;
  readonly canAdvance: boolean;
  readonly blockers: readonly PhaseBlocker[];
}

/** Minimum quality a required criterion must reach to clear a phase. */
export const REQUIRED_QUALITY: QualityLevel = "good";

const QUALITY_RANK: Record<QualityLevel, number> = QUALITY_LEVELS.reduce(
  (acc, level, index) => {
    acc[level] = index;
    return acc;
  },
  {} as Record<QualityLevel, number>,
);

/**
 * Exit rules per phase. Criteria are keys from evaluation-criteria.ts (weights
 * sum to 100); floors are 0-100 scores on the 8 SVI dimensions.
 *
 * `funding` is the terminal phase and requires the full criterion set — a
 * founder does not "graduate" out of it, so nextPhase is null there.
 */
export const PHASE_EXIT_RULES: Record<GrowthPhaseId, PhaseExitRule> = {
  vision: {
    requiredCriteria: ["idea", "founder_profile"],
    dimensionFloors: { mpc: 40 },
  },
  customer_dev: {
    requiredCriteria: ["market", "customer_size"],
    dimensionFloors: { mpc: 55 },
  },
  revenue_model: {
    requiredCriteria: ["revenue", "gtm_strategy"],
    dimensionFloors: { tre: 40 },
  },
  pitch: {
    requiredCriteria: ["documents", "website"],
    dimensionFloors: { iri: 45 },
  },
  mentor_review: {
    requiredCriteria: ["roadmap"],
    dimensionFloors: {},
  },
  legal_equity: {
    requiredCriteria: ["team_structure", "documents"],
    dimensionFloors: { cgh: 50, lco: 45 },
  },
  go_to_market: {
    requiredCriteria: ["gtm_strategy", "customer_size"],
    dimensionFloors: { tre: 55 },
  },
  product_dev: {
    requiredCriteria: ["code_git", "website"],
    dimensionFloors: { ptd: 55 },
  },
  investor_review: {
    requiredCriteria: ["dataroom", "documents"],
    dimensionFloors: { iri: 65 },
  },
  team: {
    requiredCriteria: ["team", "team_structure"],
    dimensionFloors: { ftv: 60 },
  },
  growth: {
    requiredCriteria: ["revenue", "customer_size"],
    dimensionFloors: { tre: 70 },
  },
  funding: {
    requiredCriteria: [
      "idea",
      "market",
      "founder_profile",
      "code_git",
      "website",
      "team",
      "customer_size",
      "gtm_strategy",
      "documents",
      "dataroom",
      "team_structure",
      "roadmap",
      "revenue",
    ],
    dimensionFloors: { iri: 75, cgh: 65 },
  },
};

export interface PhaseGateCriterionRow {
  criterion_key: string;
  quality_level?: string | null;
}

export interface PhaseGateInput {
  /** Phase the founder is standing in. Unknown/absent falls back to `vision`. */
  currentPhase?: string | null;
  /** One row per evaluation criterion the founder has evidence for. */
  criteria: readonly PhaseGateCriterionRow[];
  /** SVI dimension scores, 0-100. Absent dimensions count as 0. */
  dimensions?: Partial<Record<SviDimension, number>> | null;
  /**
   * Deliverable labels the founder has completed, matched case-insensitively
   * against `GROWTH_PHASES[].deliverables`. Omit to skip the deliverable
   * check entirely (callers without deliverable tracking stay unblocked on it).
   */
  completedDeliverables?: readonly string[] | null;
}

function qualityRank(level: string | null | undefined): number {
  if (!level) return -1;
  const rank = QUALITY_RANK[level as QualityLevel];
  return rank === undefined ? -1 : rank;
}

/**
 * Evaluate whether the founder has cleared their current phase.
 *
 * Every unmet condition becomes one blocker, and `completionPct` is the share
 * of conditions met — so a founder sees partial credit rather than a binary
 * pass/fail. `canAdvance` additionally requires a next phase to exist.
 */
export function computePhaseGate(input: PhaseGateInput): PhaseGateResult {
  const currentPhase: GrowthPhaseId = isGrowthPhaseId(input.currentPhase)
    ? input.currentPhase
    : GROWTH_PHASE_IDS[0];
  const rule = PHASE_EXIT_RULES[currentPhase];
  const blockers: PhaseBlocker[] = [];

  const byKey = new Map<string, PhaseGateCriterionRow>();
  for (const row of input.criteria) {
    if (!row?.criterion_key) continue;
    // Keep the strongest row when a criterion repeats.
    const prior = byKey.get(row.criterion_key);
    if (!prior || qualityRank(row.quality_level) > qualityRank(prior.quality_level)) {
      byKey.set(row.criterion_key, row);
    }
  }

  let conditionsTotal = 0;
  let conditionsMet = 0;

  for (const key of rule.requiredCriteria) {
    conditionsTotal += 1;
    const row = byKey.get(key);
    if (!row) {
      blockers.push({
        code: "missing_required_criteria",
        subject: key,
        detail: `No evidence submitted for "${key}" — required to clear ${GROWTH_PHASE_LABELS[currentPhase].en}.`,
      });
      continue;
    }
    if (qualityRank(row.quality_level) < QUALITY_RANK[REQUIRED_QUALITY]) {
      blockers.push({
        code: "criteria_below_threshold",
        subject: key,
        detail: `"${key}" is rated ${row.quality_level ?? "unrated"} — needs at least ${REQUIRED_QUALITY}.`,
      });
      continue;
    }
    conditionsMet += 1;
  }

  const dims = input.dimensions ?? {};
  for (const [dimension, floor] of Object.entries(rule.dimensionFloors) as Array<
    [SviDimension, number]
  >) {
    conditionsTotal += 1;
    const score = typeof dims[dimension] === "number" ? (dims[dimension] as number) : 0;
    if (score < floor) {
      blockers.push({
        code: "dimension_below_floor",
        subject: dimension,
        detail: `${dimension.toUpperCase()} scores ${Math.round(score)} — ${GROWTH_PHASE_LABELS[currentPhase].en} needs ${floor}.`,
      });
      continue;
    }
    conditionsMet += 1;
  }

  // Deliverables are optional: a caller with no tracking passes `undefined`
  // and simply is not gated on them.
  if (input.completedDeliverables) {
    const done = new Set(
      input.completedDeliverables.map((d) => d.trim().toLowerCase()),
    );
    for (const deliverable of deliverablesFor(currentPhase)) {
      conditionsTotal += 1;
      if (done.has(deliverable.trim().toLowerCase())) {
        conditionsMet += 1;
        continue;
      }
      blockers.push({
        code: "deliverables_incomplete",
        subject: deliverable,
        detail: `Deliverable "${deliverable}" is not marked complete.`,
      });
    }
  }

  const completionPct =
    conditionsTotal === 0
      ? 100
      : Math.round((conditionsMet / conditionsTotal) * 100);
  const nextPhase = nextGrowthPhase(currentPhase);

  return {
    currentPhase,
    currentPhaseLabel: GROWTH_PHASE_LABELS[currentPhase].en,
    nextPhase,
    phaseOrder: growthPhaseOrder(currentPhase),
    completionPct,
    canAdvance: blockers.length === 0 && nextPhase !== null,
    blockers,
  };
}

/**
 * Top-N blockers for a "what's next" surface, worst-first: a missing
 * criterion outranks a weak one, which outranks a dimension floor, which
 * outranks an unticked deliverable.
 */
const BLOCKER_PRIORITY: Record<PhaseBlockerCode, number> = {
  missing_required_criteria: 0,
  criteria_below_threshold: 1,
  dimension_below_floor: 2,
  deliverables_incomplete: 3,
};

export function topBlockers(
  result: PhaseGateResult,
  limit = 3,
): readonly PhaseBlocker[] {
  const cap = Math.max(0, Math.floor(limit));
  return [...result.blockers]
    .sort((a, b) => {
      const p = BLOCKER_PRIORITY[a.code] - BLOCKER_PRIORITY[b.code];
      return p !== 0 ? p : a.subject.localeCompare(b.subject);
    })
    .slice(0, cap);
}
