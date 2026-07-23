// Portfolio row derivation helpers.
//
// Pure functions that turn raw project / SVI / usage-log data into a
// portfolio-row shape rendered by the /dashboard/portfolio surface.
// Kept in its own module so the API route handler and the vitest unit
// test can both consume the same derivation without pulling in the
// full server / Supabase runtime.
//
// Anchors:
//   - Canonical 8-stage bucket → `sviStageToCanonical` (web/src/lib/journey-vocabulary.ts)
//   - Legacy SVI stage index → `analysis_json.stage` on svi_analyses
//   - Next-action copy is stage-aware and mirrors the single-project
//     dashboard's `computeNextAction` (web/src/app/dashboard/page.tsx).

import { sviStageToCanonical, type StageKey } from "./journey-vocabulary";

/**
 * Derive the canonical 8-stage bucket for a project row.
 *
 * Precedence:
 *   1. `sviStage` (0-7) from the latest analysis_json.stage — highest
 *      fidelity because it reflects the AI's classification of the
 *      startup's current phase.
 *   2. Fall back to SVI score bands when we only have `totalSvi`.
 *   3. Default to `"idea"` when neither is available.
 */
export function deriveCanonicalStage(
  sviStage: number | null | undefined,
  totalSvi: number | null | undefined,
): StageKey {
  if (typeof sviStage === "number" && Number.isFinite(sviStage)) {
    return sviStageToCanonical(sviStage);
  }
  if (typeof totalSvi === "number" && Number.isFinite(totalSvi)) {
    if (totalSvi < 30) return "idea";
    if (totalSvi <= 50) return "validation";
    if (totalSvi <= 70) return "mvp_early_revenue";
    if (totalSvi <= 85) return "seed";
    if (totalSvi <= 120) return "series_a";
    if (totalSvi <= 160) return "series_b_c";
    if (totalSvi <= 200) return "late_stage";
    return "public_exit";
  }
  return "idea";
}

/**
 * Phase-aware next-action copy for a portfolio row.
 *
 * Mirrors the single-project dashboard's step ladder so both surfaces
 * suggest the same "do this next" prompt for the same SVI score.
 */
export function deriveNextAction(
  totalSvi: number | null | undefined,
): { label: string; url: string } {
  if (typeof totalSvi !== "number" || !Number.isFinite(totalSvi)) {
    return { label: "Get your first SVI score", url: "/" };
  }
  if (totalSvi < 30) return { label: "Refine your idea", url: "/" };
  if (totalSvi <= 50) return { label: "Strengthen your profile", url: "/workspace/evidence" };
  if (totalSvi <= 70) return { label: "Set up equity", url: "/workspace/equity-setup" };
  if (totalSvi <= 85) return { label: "Build data room", url: "/workspace/data-room" };
  return { label: "Start fundraising", url: "/workspace/fundraise" };
}

export interface PortfolioRow {
  id: string;
  slug: string;
  name: string;
  current_svi_score: number | null;
  canonical_stage: StageKey;
  credits_used_mtd: number;
  last_activity_at: string | null;
  next_action: { label: string; url: string };
}
