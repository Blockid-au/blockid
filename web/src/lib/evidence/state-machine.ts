/**
 * Verification-state transition table for public.evidence rows.
 *
 * The DB (migration 0210) enforces only the enum. This module is the
 * single source of truth for legal transitions and is imported by
 * every writer (upload handler, extraction worker, human review UI,
 * nightly expiry cron).
 *
 *   uploaded ──start_processing──> processing
 *   processing ──extraction_complete──> classified
 *   classified ──classify_high_confidence──> verified
 *   classified ──classify_low_confidence──> validation_required
 *   validation_required ──human_approve──> verified
 *   validation_required ──human_reject──> rejected
 *   *any live state* ──expire──> expired         (if now > expires_at)
 *   verified ──archive──> archived
 *   expired  ──archive──> archived
 *
 * Illegal transitions (e.g. uploaded → verified) return null so
 * callers can distinguish "no-op" from "illegal" — pure function,
 * safe to import in edge / worker / test contexts.
 *
 * Master Upgrade Plan Phase 3 §12.4 / §5.3.
 */

import { z } from "zod";

export const EvidenceStateSchema = z.enum([
  "uploaded",
  "processing",
  "classified",
  "validation_required",
  "verified",
  "rejected",
  "expired",
  "archived",
]);
export type EvidenceState = z.infer<typeof EvidenceStateSchema>;

export const EvidenceTransitionSchema = z.enum([
  "start_processing",
  "extraction_complete",
  "classify_high_confidence",
  "classify_low_confidence",
  "human_approve",
  "human_reject",
  "expire",
  "archive",
]);
export type EvidenceTransition = z.infer<typeof EvidenceTransitionSchema>;

// States that may transition to `expired` when the expires_at date
// passes. Terminal states (rejected, archived) and expired itself are
// excluded so the cron does not thrash rows it already retired.
const EXPIRABLE_STATES: ReadonlySet<EvidenceState> = new Set<EvidenceState>([
  "uploaded",
  "processing",
  "classified",
  "validation_required",
  "verified",
]);

/**
 * Return the next state for a (current, transition) pair, or null if
 * the transition is illegal from that state.
 */
export function nextEvidenceState(
  current: EvidenceState,
  transition: EvidenceTransition,
): EvidenceState | null {
  switch (transition) {
    case "start_processing":
      return current === "uploaded" ? "processing" : null;

    case "extraction_complete":
      return current === "processing" ? "classified" : null;

    case "classify_high_confidence":
      return current === "classified" ? "verified" : null;

    case "classify_low_confidence":
      return current === "classified" ? "validation_required" : null;

    case "human_approve":
      return current === "validation_required" ? "verified" : null;

    case "human_reject":
      return current === "validation_required" ? "rejected" : null;

    case "expire":
      return EXPIRABLE_STATES.has(current) ? "expired" : null;

    case "archive":
      return current === "verified" || current === "expired"
        ? "archived"
        : null;

    default: {
      // Exhaustiveness guard — a new transition without a case falls
      // through here and the type-checker refuses to compile.
      const _exhaustive: never = transition;
      return _exhaustive;
    }
  }
}
