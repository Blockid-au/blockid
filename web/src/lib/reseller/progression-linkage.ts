// Track B B8 — progression-timeline ↔ guide-chapter linkage (pure).
//
// Maps a customer-drawer progression event to the U.9 12-phase journey and,
// through it, to the matching startup-journey guide chapter slug. Kept
// separate from customer-drawer.ts so the phase taxonomy is defined in one
// place — the same PHASE_LABELS used by /guide, /workspace/guide,
// /guide/reports, /showcase/blockid and the product tour (B7) — and the
// mapping is unit-testable without touching the reseller supabase wrapper.
//
// Deep-links resolve to the public /guide/<slug> route (not
// /workspace/guide/<slug>) because the reseller viewing the drawer is not
// the founder who owns the workspace — the public marketing surface is the
// appropriate landing spot to share with the attributed customer.
//
// Non-phase-specific events (plan_change, credit_grant) return null for
// both phase and chapterSlug — the drawer renders them without a link.

import type { ChapterSlug } from "@/lib/guide/startup-journey";
import { chapterSlugForPhase } from "@/lib/product-tour/tour-state";
import type { ProgressionEvent, ProgressionEventKind } from "./customer-drawer";

/** Fixed mapping — event kind → U.9 phase order (1..12) or null when cross-cutting. */
const PHASE_BY_KIND: Record<ProgressionEventKind, number | null> = {
  signup: 1,             // Vision / Day-0 Idea
  onboarding_completed: 1,
  first_svi_run: 2,      // Idea Validation
  svi_score_update: 2,
  report_generated: null, // cross-cutting; per-report phase lives on the artefact itself
  plan_change: null,      // billing action — no direct journey phase
  credit_grant: null,     // billing action — no direct journey phase
};

export function phaseForEventKind(kind: ProgressionEventKind): number | null {
  return PHASE_BY_KIND[kind] ?? null;
}

export interface EventLinkage {
  phase: number | null;
  chapterSlug: ChapterSlug | null;
  href: string | null;
}

/** Deep-link envelope for one progression event. */
export function linkageForEvent(event: Pick<ProgressionEvent, "kind">): EventLinkage {
  const phase = phaseForEventKind(event.kind);
  if (phase == null) return { phase: null, chapterSlug: null, href: null };
  const slug = chapterSlugForPhase(phase);
  if (slug == null) return { phase, chapterSlug: null, href: null };
  return { phase, chapterSlug: slug, href: `/guide/${slug}` };
}

/**
 * Fold linkage back onto each event so the API response and the client
 * component can rely on the same phase/chapterSlug/href triple without
 * re-running the mapping in two places.
 */
export function annotateProgression<
  T extends Pick<ProgressionEvent, "kind">,
>(events: T[]): (T & EventLinkage)[] {
  return events.map((e) => ({ ...e, ...linkageForEvent(e) }));
}
