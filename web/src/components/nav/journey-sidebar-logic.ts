/**
 * JourneySidebar pure logic — extracted for the same reason as
 * persona-rail-logic.ts (no RTL/jsdom on the dep graph; vitest.config
 * only picks up .test.ts).
 *
 * Consumers:
 *   • journey-sidebar.tsx — reads groupItemsByJourney + JOURNEY_GROUP_ORDER
 *     to build the section tree; calls filterHideWhenLocked (from
 *     lib/nav/hide-when-locked) BEFORE grouping so locked v3-default rows
 *     drop out.
 *   • journey-sidebar.test.ts — pins ordering, growth-phase auto-open,
 *     hide-not-teaser default, add-on dim marker survival.
 */

import type {
  JourneyGroup,
  NavLeaf,
} from "@/components/workspace/nav-groups";
import type { GrowthPhase } from "@/lib/nav/workflow-steps";

/**
 * Founder-locked ordering per §16.6. Items with no `journeyGroup` fall
 * into "settings" (a permissive bucket for legacy rows the migration
 * hasn't touched yet).
 */
export const JOURNEY_GROUP_ORDER: readonly JourneyGroup[] = [
  "onboarding",
  "analysis",
  "maturity",
  "reports",
  "permissions",
  "hierarchy",
  "ecosystem",
  "settings",
] as const;

/** Section labels — plain-English, no punctuation for the collapsible summary. */
export const JOURNEY_GROUP_LABELS: Record<JourneyGroup, string> = {
  onboarding: "Onboarding",
  analysis: "Analysis",
  maturity: "Maturity",
  reports: "Reports",
  permissions: "Permissions",
  hierarchy: "Hierarchy",
  ecosystem: "Ecosystem",
  settings: "Settings",
};

export interface JourneySection<T extends NavLeaf = NavLeaf> {
  key: JourneyGroup;
  label: string;
  items: T[];
}

/**
 * Group leaves by their `journeyGroup`, preserving the §16.6 order.
 * Empty sections are omitted so the sidebar doesn't render blank
 * disclosures. Items whose `journeyGroup` is undefined bucket into
 * "settings" — the permissive fallback.
 */
export function groupItemsByJourney<T extends NavLeaf>(
  items: readonly T[],
): JourneySection<T>[] {
  const buckets = new Map<JourneyGroup, T[]>();
  for (const g of JOURNEY_GROUP_ORDER) buckets.set(g, []);
  for (const item of items) {
    const key: JourneyGroup = item.journeyGroup ?? "settings";
    buckets.get(key)!.push(item);
  }
  const out: JourneySection<T>[] = [];
  for (const g of JOURNEY_GROUP_ORDER) {
    const rows = buckets.get(g)!;
    if (rows.length === 0) continue;
    out.push({ key: g, label: JOURNEY_GROUP_LABELS[g], items: rows });
  }
  return out;
}

/**
 * Auto-open rule (§16.3): a group opens by default when it contains any
 * item whose `growthPhase` matches the user's current phase. Every other
 * group renders collapsed so the founder isn't drowned in disclosures.
 *
 * `currentGrowthPhase === undefined` ⇒ nothing auto-opens (defensive; the
 * caller can still click to expand).
 */
export function shouldAutoOpenSection<T extends NavLeaf>(
  section: JourneySection<T>,
  currentGrowthPhase: GrowthPhase | undefined,
): boolean {
  if (currentGrowthPhase === undefined) return false;
  for (const item of section.items) {
    if (item.growthPhase === currentGrowthPhase) return true;
  }
  return false;
}
