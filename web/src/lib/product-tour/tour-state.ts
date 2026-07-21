// Track B B7 — interactive product-tour state derivation (pure helpers).
//
// The workspace shell renders a persistent overlay banner: "You are on
// Phase X of 12 — [phase label]. [Read this chapter →]". The banner
// hides after dismissal and resurfaces when the founder crosses into a
// new phase, so dismissal is keyed by the phase order (1..12) rather
// than a boolean flag.
//
// This module is intentionally pure — the client component fetches the
// phase-progress payload and feeds it in; unit tests exercise the
// derivations without touching localStorage or fetch.

import { PHASE_LABELS, type PhaseLabel } from "@/lib/showcase/gallery";
import { listChapters, type ChapterSlug } from "@/lib/guide/startup-journey";

export type TourPhaseStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed";

export interface TourPhaseInput {
  order: number;                 // 1..12
  status?: TourPhaseStatus | string | null;
  completionPct?: number | null; // 0..100
}

export interface TourState {
  currentPhase: number | null;
  chapterSlug: ChapterSlug | null;
  label: PhaseLabel | null;
}

/** Guide chapter that matches a growth-phase order (1..12). */
export function chapterSlugForPhase(phaseOrder: number): ChapterSlug | null {
  if (!Number.isFinite(phaseOrder)) return null;
  const chapter = listChapters().find((c) => c.phase === phaseOrder);
  return chapter?.slug ?? null;
}

/**
 * Return the earliest phase order (1..12) that isn't finished. When every
 * phase is completed we return the final phase order so the tour can still
 * link into the last chapter (Exit / Beyond).
 */
export function deriveTourPhase(phases: TourPhaseInput[]): number | null {
  if (!Array.isArray(phases) || phases.length === 0) return null;
  const sorted = [...phases]
    .filter((p) => Number.isFinite(p.order) && p.order >= 1)
    .sort((a, b) => a.order - b.order);
  if (sorted.length === 0) return null;
  const incomplete = sorted.find(
    (p) =>
      (p.status ?? "not_started") !== "completed" &&
      (p.completionPct ?? 0) < 100,
  );
  return (incomplete ?? sorted[sorted.length - 1]).order;
}

/**
 * Tour is visible when the derived phase differs from the last-dismissed
 * phase — a phase transition automatically re-surfaces the banner.
 */
export function shouldShowTour(args: {
  currentPhase: number | null;
  dismissedPhase: number | null;
}): boolean {
  if (args.currentPhase == null) return false;
  return args.dismissedPhase !== args.currentPhase;
}

/** Fold {phases} → tour state; caller renders when shouldShowTour returns true. */
export function buildTourState(phases: TourPhaseInput[]): TourState {
  const currentPhase = deriveTourPhase(phases);
  if (currentPhase == null) {
    return { currentPhase: null, chapterSlug: null, label: null };
  }
  return {
    currentPhase,
    chapterSlug: chapterSlugForPhase(currentPhase),
    label: PHASE_LABELS[currentPhase] ?? null,
  };
}
