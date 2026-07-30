/**
 * report-order-state.ts — Trust Business Report state machine (Zod).
 *
 * Master Upgrade Plan §8.4 + Stage 3 Batch A sub-task A3.
 *
 * The state machine gates the full Trust Business Report. It is enforced
 * in three places:
 *
 *   1. Migration 0270_report_orders.sql — CHECK constraint on the status
 *      column keeps illegal values out at the DB level.
 *   2. The webhook (sub-task A1) and worker (sub-task A2) use `nextState()`
 *      to guard every transition before issuing an UPDATE.
 *   3. The UI (§8.4 UX) uses the same enum to render lifecycle badges.
 *
 * Legal transitions (mirrors 0270 header comment):
 *
 *   NOT_PURCHASED        → CHECKOUT_INITIATED (user hits Confirm on the
 *                          A$5.50 Path A modal)
 *                        → PAID              (Path B credit debit succeeds)
 *
 *   CHECKOUT_INITIATED   → PAYMENT_PENDING   (Stripe returned a session but
 *                          async payment methods take time to settle)
 *                        → PAID              (Stripe webhook fires
 *                          checkout.session.completed with payment_status
 *                          == paid)
 *                        → FAILED            (Stripe checkout expired /
 *                          the user cancelled)
 *
 *   PAYMENT_PENDING      → PAID              (payment settled)
 *                        → FAILED            (charge failed)
 *
 *   PAID                 → GENERATING        (queue worker picked the order)
 *                        → REFUNDED          (support-side refund before
 *                          generation started)
 *
 *   GENERATING           → READY             (orchestrator returned the
 *                          assembled report and report_id landed)
 *                        → FAILED            (retry exhausted / permanent
 *                          orchestrator error)
 *
 *   READY                → SHARED            (owner minted a share link)
 *                        → EXPIRED           (paid_at + 90 days elapsed —
 *                          nightly cron flip, §8.4 policy)
 *
 *   SHARED               → EXPIRED           (same 90-day policy)
 *
 *   FAILED               → REFUNDED          (auto-refund cron issued the
 *                          Stripe refund / credit reversal)
 *
 *   EXPIRED / REFUNDED   → (terminal — no outgoing transitions)
 *
 * Design notes:
 *   * The Zod enum here is exhaustive — adding a state requires bumping
 *     both this file AND the migration CHECK, so the compiler catches
 *     drift the first time either side changes.
 *   * Transition names ("checkout_created", "payment_settled", …) are
 *     opaque strings, not event bus topics — they exist purely to make
 *     the transition table readable in tests and code review.
 *   * `nextState()` returns null for illegal transitions rather than
 *     throwing so callers can decide whether an out-of-order webhook is
 *     an error worth surfacing (usually) or a silent dedupe.
 */

import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// State enum
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_ORDER_STATES = [
  "NOT_PURCHASED",
  "CHECKOUT_INITIATED",
  "PAYMENT_PENDING",
  "PAID",
  "GENERATING",
  "READY",
  "SHARED",
  "EXPIRED",
  "FAILED",
  "REFUNDED",
] as const;

export const ReportOrderStateSchema = z.enum(REPORT_ORDER_STATES);
export type ReportOrderState = z.infer<typeof ReportOrderStateSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Transition vocabulary
// ─────────────────────────────────────────────────────────────────────────────

export const REPORT_ORDER_TRANSITIONS = [
  "checkout_created",
  "payment_pending",
  "payment_settled",
  "credit_debited",
  "checkout_failed",
  "queue_picked",
  "generation_succeeded",
  "generation_failed",
  "share_link_minted",
  "expiry_reached",
  "refund_issued",
] as const;

export const ReportOrderTransitionSchema = z.enum(REPORT_ORDER_TRANSITIONS);
export type ReportOrderTransition = z.infer<typeof ReportOrderTransitionSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Transition matrix — sole source of truth for `nextState`.
//
// Nested Partial<> instead of a flat set-of-pairs so a reader can eyeball the
// legal moves per state at a glance and IDE go-to-definition on any transition
// name lands here.
// ─────────────────────────────────────────────────────────────────────────────

type TransitionMap = {
  [S in ReportOrderState]?: {
    [T in ReportOrderTransition]?: ReportOrderState;
  };
};

const TRANSITIONS: TransitionMap = {
  NOT_PURCHASED: {
    checkout_created: "CHECKOUT_INITIATED",
    credit_debited: "PAID",
  },
  CHECKOUT_INITIATED: {
    payment_pending: "PAYMENT_PENDING",
    payment_settled: "PAID",
    checkout_failed: "FAILED",
  },
  PAYMENT_PENDING: {
    payment_settled: "PAID",
    checkout_failed: "FAILED",
  },
  PAID: {
    queue_picked: "GENERATING",
    refund_issued: "REFUNDED",
  },
  GENERATING: {
    generation_succeeded: "READY",
    generation_failed: "FAILED",
  },
  READY: {
    share_link_minted: "SHARED",
    expiry_reached: "EXPIRED",
  },
  SHARED: {
    expiry_reached: "EXPIRED",
  },
  FAILED: {
    refund_issued: "REFUNDED",
  },
  // Terminal states — no outgoing transitions.
  EXPIRED: {},
  REFUNDED: {},
};

// ─────────────────────────────────────────────────────────────────────────────
// nextState — pure lookup, no side effects
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Given a current state + a transition, return the next state, or `null`
 * if the transition is illegal from that state. Never throws — callers
 * decide whether a null result is a bug or a benign no-op.
 */
export function nextState(
  current: ReportOrderState,
  transition: ReportOrderTransition,
): ReportOrderState | null {
  const outgoing = TRANSITIONS[current];
  if (!outgoing) return null;
  return outgoing[transition] ?? null;
}

/**
 * Terminal-state predicate. Callers that iterate over historical rows can
 * skip these — no further transitions can ever be applied.
 */
export function isTerminalState(state: ReportOrderState): boolean {
  const outgoing = TRANSITIONS[state];
  return !outgoing || Object.keys(outgoing).length === 0;
}

/**
 * Enumerate every legal outgoing transition from a state. Useful for
 * building admin UI dropdowns and defensive test assertions.
 */
export function legalTransitions(
  state: ReportOrderState,
): ReportOrderTransition[] {
  const outgoing = TRANSITIONS[state] ?? {};
  return Object.keys(outgoing) as ReportOrderTransition[];
}
