/**
 * PersonaRail pure logic — extracted so the workspace-codebase pattern
 * (pure helpers with .test.ts, components not directly render-tested
 * because @testing-library/react is not on the dependency graph) applies
 * cleanly to the v3 nav rail.
 *
 * All exports here are sync + side-effect free and safe in RSC.
 */

import type { Persona } from "@/components/workspace/nav-groups";

/** Personas the rail knows how to render, in canonical order. */
export const PERSONA_ICON_KEYS: readonly Persona[] = [
  "founder",
  "investor",
  "accelerator",
  "reseller",
  "enterprise",
  "admin",
] as const;

/** Human-readable label shown next to the icon when the rail is expanded. */
export const PERSONA_LABELS: Record<Persona, string> = {
  founder: "Founder",
  investor: "Investor",
  accelerator: "Accelerator",
  reseller: "Reseller",
  enterprise: "Enterprise",
  admin: "Admin",
};

/**
 * Auto-hide rule (§16.2 layer B) — a rail with only one option is noise,
 * so the shell falls back to the legacy one-sidebar layout.
 */
export function shouldRenderPersonaRail(availableCount: number): boolean {
  return availableCount > 1;
}

/**
 * Roving-tabindex arrow-key navigation. Wraps around both ends so the
 * user never dead-ends. `direction === "next"` moves down (ArrowDown),
 * `"prev"` moves up (ArrowUp).
 */
export function computeNextPersonaIndex(
  currentIndex: number,
  total: number,
  direction: "next" | "prev",
): number {
  if (total <= 0) return 0;
  const step = direction === "next" ? 1 : -1;
  return (currentIndex + step + total) % total;
}

/**
 * Which item should own the tabindex=0 slot. Falls back to index 0 when
 * the "active" persona isn't actually in the list — defensive for
 * mismatched claims / feature-flag drift.
 */
export function resolveTabbableIndex(
  available: readonly Persona[],
  active: Persona,
): number {
  const idx = available.indexOf(active);
  return idx >= 0 ? idx : 0;
}
