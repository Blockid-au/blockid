// Reseller customer-journey stage derivation.
//
// Real-world workflow parity — gap #3 in
// docs/plans/real-world-workflow-parity-audit-2026-07-23.md.
//
// The reseller Customers list historically had no notion of *where* an
// attributed customer sits on the standard VC/founder journey — it was a flat
// operational list keyed on join date. This module derives, purely from
// signals the reseller boundary is already allowed to see (the customer's
// latest SVI score, if any), which canonical VC-industry stage the customer
// currently falls into.
//
// Two-step derivation, each half re-uses an already-shipped taxonomy:
//   1. SVI score  →  12-phase Growth phase  (bands mirror
//      portfolio-phase-distribution.ts §SCORE_BANDS so the Customers list
//      stays consistent with the /reseller portfolio phase chart).
//   2. 12-phase   →  8-stage canonical VC bucket  (via
//      `phaseToStage()` from @/lib/journey-map — the H.21 bucket map).
//
// Notes on fidelity:
//  - The reseller lens intentionally excludes fine-grained workspace state
//    (revenue, cap-table entries, etc.) so this derivation is deliberately
//    low-fidelity. Scores > 100 clamp to phase 6 (Revenue / Business Model)
//    which the H.21 bucket-map lands on `"seed"` — matching the portfolio
//    phase-distribution commentary that phases 7-12 stay at zero until
//    milestone-report-state is surfaced to the reseller view.
//  - Pure function, never throws. `null`, `NaN`, negative and non-finite
//    scores all fall through to the safe earliest bucket (`"idea"`).

import { phaseToStage, type PhaseKey } from "@/lib/journey-map";
import type { StageKey } from "@/lib/journey-vocabulary";

interface ScoreBand {
  /** Inclusive lower bound on SVI score. */
  lo: number;
  /** Inclusive upper bound on SVI score. */
  hi: number;
  phase: PhaseKey;
}

/**
 * SVI 0-100 → 12-phase Growth phase. Mirrors the SCORE_BANDS in
 * `portfolio-phase-distribution.ts` so the Customers list stays consistent
 * with the /reseller portfolio phase chart the founder already ships.
 */
const SVI_SCORE_BANDS: readonly ScoreBand[] = [
  { lo: 0, hi: 20, phase: 2 },
  { lo: 21, hi: 40, phase: 3 },
  { lo: 41, hi: 60, phase: 4 },
  { lo: 61, hi: 80, phase: 5 },
  { lo: 81, hi: 100, phase: 6 },
];

function sviScoreToPhase(sviScore: number | null | undefined): PhaseKey {
  if (typeof sviScore !== "number" || !Number.isFinite(sviScore)) return 1;
  if (sviScore < 0) return 1;
  // Scores > 100 clamp to phase 6 — see module doc.
  if (sviScore > 100) return 6;
  for (const band of SVI_SCORE_BANDS) {
    if (sviScore >= band.lo && sviScore <= band.hi) return band.phase;
  }
  return 1;
}

/**
 * Derive the customer's current canonical VC-industry stage from their
 * latest SVI score. Never throws — any missing or malformed signal falls
 * back to `"idea"`, the safest earliest bucket.
 */
export function deriveCanonicalStage(sviScore: number | null | undefined): StageKey {
  return phaseToStage(sviScoreToPhase(sviScore));
}
