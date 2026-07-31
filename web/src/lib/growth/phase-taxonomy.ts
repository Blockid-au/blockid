// G8-P0 — the single source of truth for growth-phase gating keys.
//
// BlockID carries two different 12-phase taxonomies:
//
//   A. string-id  — startup-growth-phases.ts GROWTH_PHASES[].id
//                   ("vision" … "funding"). This is what the DB stores in
//                   startup_phase_progress.phase_id and
//                   projects.growth_phase_current.
//   B. numeric    — showcase/gallery.ts PHASE_LABELS (1 "Vision / Day-0 Idea"
//                   … 12 "Exit / Beyond"). Display-only, and the taxonomy the
//                   Atlassian data-room fixture's phaseSlug refers to.
//
// Their phase-N semantics DIFFER — string #6 is `legal_equity` (Legal &
// Equity) while numeric #6 is "Revenue / Business Model". Before this module,
// nudge/next-steps.ts bridged them with `indexOfGrowthPhase(id) + 1`, i.e. it
// fed a string ordinal into numeric-keyed tables. That mis-labelled the
// founder's phase and mis-selected both the criterion subset and the
// compliance gates.
//
// Per the G8 decision (docs/plans/unlock-next-level-2026-07-31.md §0 D1),
// taxonomy A is canonical for ALL progress and gating. Taxonomy B survives
// only for showcase display and the data-room template. Any crossing between
// them must go through the explicit map below — never through a bare ordinal.
//
// Pure module: no I/O, no network.

import { GROWTH_PHASES } from "@/lib/startup-growth-phases";
import {
  GROWTH_PHASE_IDS,
  type GrowthPhaseId,
  type PhaseKey,
} from "@/lib/journey-map";

export { GROWTH_PHASE_IDS };
export type { GrowthPhaseId };

/** 1-based position of each growth phase. Mirrors GROWTH_PHASES[].order. */
export const GROWTH_PHASE_ORDER: Record<GrowthPhaseId, number> =
  GROWTH_PHASE_IDS.reduce(
    (acc, id, index) => {
      acc[id] = index + 1;
      return acc;
    },
    {} as Record<GrowthPhaseId, number>,
  );

export interface GrowthPhaseLabel {
  readonly en: string;
  readonly vi: string;
}

/**
 * Display copy per growth phase. English mirrors GROWTH_PHASES[].title;
 * Vietnamese is authored here because `GrowthPhase` carries no `titleVi`.
 */
export const GROWTH_PHASE_LABELS: Record<GrowthPhaseId, GrowthPhaseLabel> = {
  vision: { en: "Vision & Mission", vi: "Tầm nhìn & Sứ mệnh" },
  customer_dev: { en: "Customer Development", vi: "Phát triển khách hàng" },
  revenue_model: { en: "Revenue & Business Models", vi: "Mô hình doanh thu" },
  pitch: { en: "Pitch Mastery", vi: "Kỹ năng thuyết trình" },
  mentor_review: { en: "Mentor Idea Review", vi: "Cố vấn đánh giá ý tưởng" },
  legal_equity: { en: "Legal & Equity", vi: "Pháp lý & Cổ phần" },
  go_to_market: { en: "Go-to-Market & Scale", vi: "Ra thị trường & Mở rộng" },
  product_dev: { en: "Product Development", vi: "Phát triển sản phẩm" },
  investor_review: {
    en: "Investor Progress Review",
    vi: "Nhà đầu tư đánh giá tiến độ",
  },
  team: { en: "Co-Founders & Team", vi: "Đồng sáng lập & Đội ngũ" },
  growth: { en: "Growth", vi: "Tăng trưởng" },
  funding: { en: "Funding", vi: "Gọi vốn" },
};

/**
 * Explicit bridge from the canonical string taxonomy to the numeric one.
 *
 * Only used where a numeric-taxonomy artefact must be consulted — today that
 * is the Atlassian data-room template, whose `phaseSlug` is a numeric ordinal
 * (see dataroom/atlassian-template.ts:23).
 *
 * The mapping is ordinal-preserving, and that is a deliberate, checked
 * choice rather than an accident: journey-map.ts buckets both taxonomies to
 * the same canonical 8 stage at every ordinal (PHASE_TO_STAGE vs
 * GROWTH_PHASE_TO_STAGE agree 1:1). A phase-taxonomy.test.ts assertion pins
 * that agreement, so if either taxonomy is ever re-ordered this map fails
 * loudly instead of silently drifting.
 */
export const GROWTH_PHASE_TO_TEMPLATE_PHASE: Record<GrowthPhaseId, PhaseKey> = {
  vision: 1,
  customer_dev: 2,
  revenue_model: 3,
  pitch: 4,
  mentor_review: 5,
  legal_equity: 6,
  go_to_market: 7,
  product_dev: 8,
  investor_review: 9,
  team: 10,
  growth: 11,
  funding: 12,
};

export function isGrowthPhaseId(value: unknown): value is GrowthPhaseId {
  return (
    typeof value === "string" &&
    (GROWTH_PHASE_IDS as readonly string[]).includes(value)
  );
}

/**
 * 1-based order for a growth phase. Unknown ids fall back to 1 (`vision`) —
 * the safe earliest phase, matching journey-map's `"idea"` fallback posture.
 */
export function growthPhaseOrder(
  id: GrowthPhaseId | string | null | undefined,
): number {
  if (!isGrowthPhaseId(id)) return 1;
  return GROWTH_PHASE_ORDER[id];
}

/** Inverse of {@link growthPhaseOrder}. Out-of-range orders clamp to the ends. */
export function orderToGrowthPhase(order: number | null | undefined): GrowthPhaseId {
  if (typeof order !== "number" || !Number.isFinite(order)) {
    return GROWTH_PHASE_IDS[0];
  }
  const idx = Math.round(order) - 1;
  if (idx <= 0) return GROWTH_PHASE_IDS[0];
  if (idx >= GROWTH_PHASE_IDS.length) {
    return GROWTH_PHASE_IDS[GROWTH_PHASE_IDS.length - 1];
  }
  return GROWTH_PHASE_IDS[idx];
}

/** The next phase in sequence, or null when already at `funding`. */
export function nextGrowthPhase(
  id: GrowthPhaseId | string | null | undefined,
): GrowthPhaseId | null {
  const order = growthPhaseOrder(id);
  if (order >= GROWTH_PHASE_IDS.length) return null;
  return GROWTH_PHASE_IDS[order];
}

/** True when `a` is at or beyond `b` in the growth sequence. */
export function growthPhaseAtLeast(
  a: GrowthPhaseId | string | null | undefined,
  b: GrowthPhaseId,
): boolean {
  return growthPhaseOrder(a) >= GROWTH_PHASE_ORDER[b];
}

/** Numeric data-room-template ordinal for a growth phase. */
export function templatePhaseFor(
  id: GrowthPhaseId | string | null | undefined,
): PhaseKey {
  if (!isGrowthPhaseId(id)) return 1;
  return GROWTH_PHASE_TO_TEMPLATE_PHASE[id];
}

/** Deliverables declared for a phase in startup-growth-phases.ts. */
export function deliverablesFor(
  id: GrowthPhaseId | string | null | undefined,
): readonly string[] {
  if (!isGrowthPhaseId(id)) return [];
  return GROWTH_PHASES.find((p) => p.id === id)?.deliverables ?? [];
}
