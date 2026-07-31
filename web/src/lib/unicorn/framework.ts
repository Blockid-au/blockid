// web/src/lib/unicorn/framework.ts
//
// Phase 6 Batch J · sub-J2 — canonical in-code mirror of the seeded
// unicorn_stages rows (migration 0280) plus a pure engine that decides
// where a business sits on the Day-0 unicorn framework.
//
// Pure module — NO database, NO server-only imports. Safe to import
// from server components, cron routes, or client shims (the client
// bundle only picks it up if it transitively uses `computeStageProgress`).
//
// Why mirror instead of read from Postgres?
//   1. Zero network in the hot path for the dashboard SSR render.
//   2. Type-safety at the call site — the engine returns a narrowed
//      `UnicornStage` literal, not a `string`.
//   3. Framework calibration lands as a coordinated migration + code
//      change in the same PR — mirroring keeps the two in lock-step.
//
// The seeded rows are the source of truth; any edit here MUST be
// reflected in migrations/0280_unicorn_stages.sql (and vice-versa).
// The 15-case colocated test asserts the mirror shape.

import { z } from "zod";

// ─── Types ──────────────────────────────────────────────────────────

export const UNICORN_STAGE_IDS = ["S0", "S1", "S2", "S3", "S4", "S5"] as const;
export type UnicornStageId = (typeof UNICORN_STAGE_IDS)[number];

export const UnicornStageSchema = z.object({
  id: z.enum(UNICORN_STAGE_IDS),
  stageNumber: z.number().int().min(0).max(5),
  label: z.string().min(1),
  windowDaysMin: z.number().int().min(0),
  windowDaysMax: z.number().int().min(0),
  exitVerificationLevel: z.number().int().min(0).max(5),
  exitTrustScore: z.number().int().min(0).max(100),
  mandatoryAreas: z.array(z.string()),
  exitOutput: z.string().min(1),
});

export type UnicornStage = z.infer<typeof UnicornStageSchema>;

// ─── Canonical stage catalogue (mirrors 0280 seed) ──────────────────

const AREAS_S0 = ["identity", "ownership"] as const;
const AREAS_S1 = [
  ...AREAS_S0,
  "governance",
  "finance_baseline",
  "product",
] as const;
const AREAS_S2 = [...AREAS_S1, "revenue", "gtm", "customers"] as const;
const AREAS_S3 = [
  ...AREAS_S2,
  "compliance",
  "risk",
  "people",
  "ip",
] as const;
const AREAS_S4 = [...AREAS_S3, "sustainability", "data_moat"] as const;

export const UNICORN_STAGES: readonly UnicornStage[] = [
  {
    id: "S0",
    stageNumber: 0,
    label: "Genesis",
    windowDaysMin: 0,
    windowDaysMax: 14,
    exitVerificationLevel: 1,
    exitTrustScore: 20,
    mandatoryAreas: [...AREAS_S0],
    exitOutput: "Genesis Certificate PDF",
  },
  {
    id: "S1",
    stageNumber: 1,
    label: "Foundation",
    windowDaysMin: 15,
    windowDaysMax: 60,
    exitVerificationLevel: 2,
    exitTrustScore: 40,
    mandatoryAreas: [...AREAS_S1],
    exitOutput: "Foundation Trust Report (free preview)",
  },
  {
    id: "S2",
    stageNumber: 2,
    label: "Traction",
    windowDaysMin: 61,
    windowDaysMax: 180,
    exitVerificationLevel: 3,
    exitTrustScore: 60,
    mandatoryAreas: [...AREAS_S2],
    exitOutput: "Traction Trust Business Report (A$5 / credits)",
  },
  {
    id: "S3",
    stageNumber: 3,
    label: "Scale",
    windowDaysMin: 181,
    windowDaysMax: 365,
    exitVerificationLevel: 3,
    exitTrustScore: 65,
    mandatoryAreas: [...AREAS_S3],
    exitOutput: "Scale Trust Report v2 + investor share links",
  },
  {
    id: "S4",
    stageNumber: 4,
    label: "Growth",
    windowDaysMin: 366,
    windowDaysMax: 730,
    exitVerificationLevel: 4,
    exitTrustScore: 75,
    mandatoryAreas: [...AREAS_S4],
    exitOutput: "Growth-Ready Trust Report + procurement export",
  },
  {
    id: "S5",
    stageNumber: 5,
    label: "Unicorn-track",
    windowDaysMin: 731,
    windowDaysMax: 99_999,
    exitVerificationLevel: 5,
    exitTrustScore: 85,
    mandatoryAreas: [...AREAS_S4],
    exitOutput: "Unicorn Track Certification (NFT badge)",
  },
] as const;

// ─── Lookups ────────────────────────────────────────────────────────

export function getStage(id: UnicornStageId): UnicornStage {
  const s = UNICORN_STAGES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown unicorn stage: ${id}`);
  return s;
}

export function nextStage(id: UnicornStageId): UnicornStage | null {
  const s = getStage(id);
  const nextNum = s.stageNumber + 1;
  return UNICORN_STAGES.find((x) => x.stageNumber === nextNum) ?? null;
}

// ─── Blocker taxonomy ───────────────────────────────────────────────

export type StageBlockerCode =
  | "trust_score_below_exit"
  | "verification_level_below_exit"
  | "missing_mandatory_areas"
  | "open_critical_findings"
  | "window_overshoot";

export interface StageBlocker {
  code: StageBlockerCode;
  message: string;
  detail?: Record<string, unknown>;
}

// ─── Pure engine ────────────────────────────────────────────────────

export interface ComputeInput {
  /** Current stage id. If omitted the engine assumes S0 (fresh business). */
  currentStageId?: UnicornStageId;
  /** 0..5 identity/verification ladder position. */
  verificationLevel: number;
  /** 0..100 aggregated Trust Score. */
  trustScore: number;
  /** Area codes with fresh, non-expired evidence coverage. */
  coveredAreas: readonly string[];
  /** Count of unresolved critical AssessmentFinding rows for this business. */
  blockerCount: number;
  /** Days spent in the current stage (integer, ≥0). */
  daysInStage: number;
}

export interface ComputeResult {
  currentStage: UnicornStage;
  onTrack: boolean;
  canAdvance: boolean;
  blockers: StageBlocker[];
}

/**
 * Pure, deterministic stage-progress engine. NO I/O.
 *
 *   canAdvance = every exit predicate for the current stage passes AND
 *                there is a next stage to advance into.
 *   onTrack    = within the current stage's window AND zero hard blockers
 *                AND on pace to satisfy exit predicates by windowDaysMax.
 *
 * "On pace" is a soft check — if the business already meets every exit
 * predicate we return onTrack=true regardless of days_in_stage; if it
 * has overshot windowDaysMax without meeting them we return false.
 */
export function computeStageProgress(input: ComputeInput): ComputeResult {
  const currentStage = getStage(input.currentStageId ?? "S0");
  const blockers: StageBlocker[] = [];

  // Predicate 1: verification ladder position.
  if (input.verificationLevel < currentStage.exitVerificationLevel) {
    blockers.push({
      code: "verification_level_below_exit",
      message: `Verification level ${input.verificationLevel} < required L${currentStage.exitVerificationLevel} for ${currentStage.id} exit`,
      detail: {
        current: input.verificationLevel,
        required: currentStage.exitVerificationLevel,
      },
    });
  }

  // Predicate 2: trust score.
  if (input.trustScore < currentStage.exitTrustScore) {
    blockers.push({
      code: "trust_score_below_exit",
      message: `Trust Score ${input.trustScore} < ${currentStage.exitTrustScore} required for ${currentStage.id} exit`,
      detail: {
        current: input.trustScore,
        required: currentStage.exitTrustScore,
      },
    });
  }

  // Predicate 3: mandatory area coverage.
  const covered = new Set(input.coveredAreas);
  const missing = currentStage.mandatoryAreas.filter((a) => !covered.has(a));
  if (missing.length > 0) {
    blockers.push({
      code: "missing_mandatory_areas",
      message: `Missing evidence coverage in: ${missing.join(", ")}`,
      detail: { missing },
    });
  }

  // Predicate 4: open critical findings.
  if (input.blockerCount > 0) {
    blockers.push({
      code: "open_critical_findings",
      message: `${input.blockerCount} unresolved critical finding(s) — must be closed before exit`,
      detail: { count: input.blockerCount },
    });
  }

  const meetsExit = blockers.length === 0;
  const overshoot = input.daysInStage > currentStage.windowDaysMax;

  // Predicate 5 (soft): window overshoot only counts as a blocker when
  // exit predicates are not yet met — otherwise the business is simply
  // ready to advance and windowing is moot.
  if (overshoot && !meetsExit) {
    blockers.push({
      code: "window_overshoot",
      message: `${input.daysInStage}d in ${currentStage.id} exceeds target ${currentStage.windowDaysMax}d`,
      detail: {
        daysInStage: input.daysInStage,
        target: currentStage.windowDaysMax,
      },
    });
  }

  const next = nextStage(currentStage.id);
  const canAdvance = meetsExit && next !== null;

  // S5 saturation: the terminal stage has no next — canAdvance is false
  // by construction, and "on track" collapses to "meets current bar +
  // no open blockers" since there is no target exit date.
  const onTrack = currentStage.id === "S5"
    ? meetsExit
    : meetsExit || !overshoot;

  return { currentStage, onTrack, canAdvance, blockers };
}
