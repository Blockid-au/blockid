// Nested nav schema (V2) — typed shapes shared by the future menu-regroup
// branch and the new nested-sidebar renderer.
//
// This module is intentionally dependency-free (only types + `Object.freeze`)
// so it can be imported from server components, client components, and unit
// tests without dragging in Supabase, Next server APIs, or React internals.
//
// Rendering rule:
//   NavGroupV2 → 0..N NavSubgroup → 0..N NavLeaf
// A group may also carry a flat `items[]` for backwards compatibility with the
// pre-V2 flat NAV_GROUPS shape — the nested renderer treats a group with no
// `subgroups` as a single implicit "default" subgroup so the accordion still
// works uniformly.

import type { LucideIcon } from "lucide-react";
import type { AccountType, PlanTier, Segment } from "@/lib/segments";

export type FeatureLifecycle = "beta" | "live" | "stable";

/**
 * Sidebar pillar bucket — see workspace-layout for legacy behaviour.
 *   overview   — always-expanded landing surfaces
 *   now        — phase-anchored founder groups
 *   coming_up  — next-phase preview
 *   later      — later-phase groups (P5 disclosure)
 *   role       — audience overlays (investor/advisor/reseller/mentor)
 *   account    — utility group
 */
export type NavPillar =
  | "overview"
  | "now"
  | "coming_up"
  | "later"
  | "role"
  | "account";

/**
 * NavLeaf — terminal (clickable) row in the sidebar. Renders as a `<Link>`.
 *
 * Gate fields all use "hide" semantics inside filterNavForUser — a failing
 * gate causes the leaf to be absent from the tree, not rendered locked.
 *   requiredFeature — entitlement flag string; fails ⇒ hidden
 *   minTier         — required plan tier; fails ⇒ hidden
 *   growthPhase     — earliest lifecycle phase (0-5); fails ⇒ hidden
 *   segments        — audience allow-list; fails ⇒ hidden
 *   role            — account-type allow-list (mentor/reseller/etc); hidden
 *   addOnKey        — reserved for the workspace-billing add-on drawer
 */
export interface NavLeaf {
  href: string;
  label: string;
  icon: LucideIcon;
  requiredFeature?: string;
  minTier?: PlanTier;
  growthPhase?: number;
  segments?: Segment[];
  role?: AccountType[];
  lifecycle?: FeatureLifecycle;
  addOnKey?: string;
}

/**
 * NavSubgroup — a labelled cluster of leaves inside a NavGroupV2. Renders as
 * a nested `<details>` block (submenu-of-submenu).
 */
export interface NavSubgroup {
  id: string;
  label: string;
  minTier?: PlanTier;
  segments?: Segment[];
  role?: AccountType[];
  items: NavLeaf[];
}

/**
 * NavGroupV2 — top-level workflow-step group in the accordion.
 *
 * Either `subgroups` (nested) OR `items` (flat, backwards-compat) — the
 * renderer normalises a flat group into a single implicit subgroup.
 */
export interface NavGroupV2 {
  id: string;
  label: string;
  pillar: NavPillar;
  stage?: string;
  minPhase?: number;
  minTier?: PlanTier;
  segments?: Segment[];
  role?: AccountType[];
  defaultCollapsed?: boolean;
  subgroups?: NavSubgroup[];
  items?: NavLeaf[];
}

/** Freeze a NavGroupV2[] tree defensively — nested arrays and objects too. */
export function freezeNavTree<T extends readonly NavGroupV2[]>(tree: T): T {
  for (const g of tree) {
    if (g.items) Object.freeze(g.items);
    if (g.subgroups) {
      for (const sg of g.subgroups) {
        Object.freeze(sg.items);
        Object.freeze(sg);
      }
      Object.freeze(g.subgroups);
    }
    Object.freeze(g);
  }
  return Object.freeze(tree) as T;
}
