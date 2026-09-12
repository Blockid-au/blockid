// Reseller customer pipeline stage — vocabulary, transitions, auto-derivation.
//
// Real-world workflow parity audit gap #7
// (docs/plans/real-world-workflow-parity-audit-2026-07-23.md §6): a channel
// partner's CRM tracks *where each referred customer sits in the partner's
// own pipeline* (lead → onboarded → … → invested / churned), which is a
// different question from the founder's VC-journey stage that
// `customer-journey.ts` derives from the SVI score. Both columns show on
// /reseller/customers; this module owns the pipeline one.
//
// Vocabulary parity: every non-terminal pipeline stage is pinned to the
// growth phase the founder is working through when the reseller sees that
// signal (`CUSTOMER_STAGE_TO_GROWTH_PHASE`), and through the H.21 bucket map
// to the canonical 8-stage vocabulary. The colocated test asserts the ladder
// is monotonic in the founder's own taxonomy so the two never drift apart.
//
// Persistence: `reseller_customers` (migration 0333) — one row per
// (reseller, customer), `stage` + `stage_updated_at` + `stage_source`.
//
// Transition rules (pure, tested):
//   * `auto` never moves a customer backwards and never leaves a terminal
//     stage (`invested`, `churned`).
//   * `auto` never overrides a `manual` stage unless a *new* signal (dated
//     after the manual override) puts the customer strictly further along.
//   * `manual` can move anywhere in the ladder, both directions.

import { GROWTH_PHASE_TO_STAGE, type GrowthPhaseId } from "@/lib/journey-map";
import { CANONICAL_STAGES, type StageKey } from "@/lib/journey-vocabulary";

/** Channel-partner pipeline, earliest → latest. `churned` is the side exit. */
export const CUSTOMER_STAGES = [
  "lead",
  "onboarded",
  "scored",
  "data_room",
  "fundraising",
  "invested",
  "churned",
] as const;

export type CustomerStage = (typeof CUSTOMER_STAGES)[number];

export const CUSTOMER_STAGE_SOURCES = ["auto", "manual"] as const;
export type CustomerStageSource = (typeof CUSTOMER_STAGE_SOURCES)[number];

/** Terminal stages: `auto` never moves a customer out of these. */
export const TERMINAL_CUSTOMER_STAGES: ReadonlySet<CustomerStage> = new Set<CustomerStage>([
  "invested",
  "churned",
]);

/** Stages `auto` may *land on* from a real product signal. */
export const AUTO_REACHABLE_STAGES = [
  "onboarded",
  "scored",
  "data_room",
  "fundraising",
] as const satisfies readonly CustomerStage[];

export type AutoReachableStage = (typeof AUTO_REACHABLE_STAGES)[number];

export const CUSTOMER_STAGE_LABELS: Record<
  CustomerStage,
  { label_en: string; label_vi: string; hint_en: string }
> = {
  lead: {
    label_en: "Lead",
    label_vi: "Khách hàng tiềm năng",
    hint_en: "Attributed via your code — no startup profile yet",
  },
  onboarded: {
    label_en: "Onboarded",
    label_vi: "Đã tiếp nhận",
    hint_en: "First startup profile created",
  },
  scored: {
    label_en: "Scored",
    label_vi: "Đã chấm điểm",
    hint_en: "First SVI analysis run",
  },
  data_room: {
    label_en: "Data room",
    label_vi: "Phòng dữ liệu",
    hint_en: "Investor data room generated",
  },
  fundraising: {
    label_en: "Fundraising",
    label_vi: "Đang gọi vốn",
    hint_en: "Funding report or fundraise round started",
  },
  invested: {
    label_en: "Invested",
    label_vi: "Đã nhận đầu tư",
    hint_en: "Round closed — set manually when you confirm it",
  },
  churned: {
    label_en: "Churned",
    label_vi: "Đã rời bỏ",
    hint_en: "No longer active — set manually",
  },
};

/**
 * Pipeline stage → the founder's own growth phase at the moment the reseller
 * sees the signal. `churned` has no phase (it is an exit, not a position).
 * Vocabulary parity with `journey-vocabulary.ts` is enforced through the
 * H.21 bucket map (`GROWTH_PHASE_TO_STAGE`) in the colocated test.
 */
export const CUSTOMER_STAGE_TO_GROWTH_PHASE: Record<CustomerStage, GrowthPhaseId | null> = {
  lead: "vision",
  onboarded: "customer_dev",
  scored: "pitch",
  data_room: "legal_equity",
  fundraising: "investor_review",
  invested: "funding",
  churned: null,
};

/** Canonical 8-stage bucket for a pipeline stage (null for `churned`). */
export function customerStageToCanonical(stage: CustomerStage): StageKey | null {
  const phase = CUSTOMER_STAGE_TO_GROWTH_PHASE[stage];
  return phase ? GROWTH_PHASE_TO_STAGE[phase] : null;
}

export function isCustomerStage(v: unknown): v is CustomerStage {
  return typeof v === "string" && (CUSTOMER_STAGES as readonly string[]).includes(v);
}

export function isCustomerStageSource(v: unknown): v is CustomerStageSource {
  return typeof v === "string" && (CUSTOMER_STAGE_SOURCES as readonly string[]).includes(v);
}

/** Ladder position; `churned` sorts last so it is "after" everything. */
export function customerStageRank(stage: CustomerStage): number {
  return CUSTOMER_STAGES.indexOf(stage);
}

/** Canonical-vocabulary rank (used by the parity test); -1 for `churned`. */
export function customerStageCanonicalRank(stage: CustomerStage): number {
  const c = customerStageToCanonical(stage);
  return c ? CANONICAL_STAGES.indexOf(c) : -1;
}

// ─── Signals ────────────────────────────────────────────────────────────────

/**
 * First-seen timestamps (ISO) of the real product events that advance a
 * customer automatically. `null` = never happened. Every timestamp is the
 * *earliest* occurrence so a re-run is idempotent.
 */
export interface CustomerStageSignals {
  /** `projects.created_at` (min) — founder created a startup profile. */
  first_project_at: string | null;
  /** `svi_analyses.created_at` (min) — first SVI analysis. */
  first_svi_at: string | null;
  /** `data_rooms.created_at` / `last_generated_at` (min) — data room generated. */
  first_data_room_at: string | null;
  /** `funding_reports.created_at` or `fundraise_rounds.created_at` (min). */
  first_fundraising_at: string | null;
}

export const EMPTY_SIGNALS: CustomerStageSignals = Object.freeze({
  first_project_at: null,
  first_svi_at: null,
  first_data_room_at: null,
  first_fundraising_at: null,
});

const SIGNAL_FOR_STAGE: Record<AutoReachableStage, keyof CustomerStageSignals> = {
  onboarded: "first_project_at",
  scored: "first_svi_at",
  data_room: "first_data_room_at",
  fundraising: "first_fundraising_at",
};

function ms(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/** Earliest of two ISO timestamps (either may be null). */
export function earliestIso(a: string | null | undefined, b: string | null | undefined): string | null {
  const ta = ms(a);
  const tb = ms(b);
  if (ta === null) return tb === null ? null : (b as string);
  if (tb === null) return a as string;
  return ta <= tb ? (a as string) : (b as string);
}

/**
 * Highest pipeline stage the signals support. A later-stage signal implies
 * the earlier ones (a data room without a profile is impossible in the
 * product, but a backfilled row might miss `projects`), so we take the
 * furthest signal present rather than requiring the whole chain.
 *
 * `after` (ISO) restricts consideration to signals strictly after that
 * instant — used so `auto` only overrides a `manual` stage on *new* evidence.
 */
export function deriveAutoStage(
  signals: CustomerStageSignals,
  opts: { after?: string | null } = {},
): CustomerStage {
  const floor = ms(opts.after) ?? Number.NEGATIVE_INFINITY;
  let best: CustomerStage = "lead";
  for (const stage of AUTO_REACHABLE_STAGES) {
    const at = ms(signals[SIGNAL_FOR_STAGE[stage]]);
    if (at !== null && at > floor) best = stage;
  }
  return best;
}

// ─── Transitions ────────────────────────────────────────────────────────────

export interface CurrentStage {
  stage: CustomerStage;
  stage_source: CustomerStageSource;
  stage_updated_at: string | null;
}

export interface StageTransition {
  from: CustomerStage;
  to: CustomerStage;
  source: CustomerStageSource;
  /** Why no move happened (only set when `changed` is false). */
  reason?:
    | "same_stage"
    | "terminal_stage"
    | "would_move_backwards"
    | "manual_override_holds";
  changed: boolean;
}

/**
 * Decide whether the auto-updater should move a customer. Pure.
 *
 *  - never moves backwards;
 *  - never leaves a terminal stage (`invested` / `churned`);
 *  - when the current stage was set manually, only signals dated *after* the
 *    override count, so a reseller's downgrade is not undone by old evidence.
 */
export function resolveAutoTransition(
  current: CurrentStage | null,
  signals: CustomerStageSignals,
): StageTransition {
  const from: CustomerStage = current?.stage ?? "lead";
  if (TERMINAL_CUSTOMER_STAGES.has(from)) {
    return { from, to: from, source: "auto", changed: false, reason: "terminal_stage" };
  }
  const manual = current?.stage_source === "manual";
  const candidate = deriveAutoStage(signals, {
    after: manual ? current?.stage_updated_at ?? null : null,
  });
  if (candidate === from) {
    return { from, to: from, source: "auto", changed: false, reason: "same_stage" };
  }
  if (customerStageRank(candidate) < customerStageRank(from)) {
    return {
      from,
      to: from,
      source: "auto",
      changed: false,
      reason: manual ? "manual_override_holds" : "would_move_backwards",
    };
  }
  return { from, to: candidate, source: "auto", changed: true };
}

/** Manual override: any stage, any direction. Pure; validation is the caller's. */
export function resolveManualTransition(
  current: CurrentStage | null,
  to: CustomerStage,
): StageTransition {
  const from: CustomerStage = current?.stage ?? "lead";
  if (from === to && current?.stage_source === "manual") {
    return { from, to, source: "manual", changed: false, reason: "same_stage" };
  }
  return { from, to, source: "manual", changed: true };
}

// ─── Digest ─────────────────────────────────────────────────────────────────

export interface StageMoveRow {
  reseller_id: string;
  stage: CustomerStage;
  stage_source: CustomerStageSource;
  stage_updated_at: string | null;
}

export interface ResellerStageMoves {
  reseller_id: string;
  /** Distinct customers whose stage changed inside the window. */
  moved: number;
  /** Of those, how many were manual overrides. */
  manual: number;
  /** Landing-stage histogram for the movers. */
  by_stage: Partial<Record<CustomerStage, number>>;
}

/**
 * "n customers moved stage this week" — count rows whose `stage_updated_at`
 * falls inside the trailing window. A row that is still at `lead` with a
 * `stage_updated_at` equal to its creation is not a move, so the caller
 * passes `created_at` as `stage_updated_at` only for genuine moves; here we
 * simply ignore `lead` rows from `auto` (a fresh row is seeded at `lead`).
 */
export function countStageMoves(
  rows: ReadonlyArray<StageMoveRow>,
  opts: { now: Date; windowDays?: number },
): Map<string, ResellerStageMoves> {
  const windowMs = (opts.windowDays ?? 7) * 86_400_000;
  const since = opts.now.getTime() - windowMs;
  const out = new Map<string, ResellerStageMoves>();
  for (const r of rows) {
    const t = ms(r.stage_updated_at);
    if (t === null || t < since || t > opts.now.getTime()) continue;
    if (r.stage === "lead" && r.stage_source === "auto") continue;
    const acc = out.get(r.reseller_id) ?? {
      reseller_id: r.reseller_id,
      moved: 0,
      manual: 0,
      by_stage: {},
    };
    acc.moved += 1;
    if (r.stage_source === "manual") acc.manual += 1;
    acc.by_stage[r.stage] = (acc.by_stage[r.stage] ?? 0) + 1;
    out.set(r.reseller_id, acc);
  }
  return out;
}
