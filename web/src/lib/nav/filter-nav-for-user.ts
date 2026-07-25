// filterNavForUser — server-side, pure, hide-not-lock nav filter.
//
// Walks a NavGroupV2[] tree and drops any group / subgroup / leaf whose gates
// are not satisfied by the current user's context. Empty subgroups + groups
// are pruned so the accordion never renders an empty header. The input tree
// is never mutated — a fresh array is returned every call.
//
// Called server-side inside workspace-layout.tsx (RSC boundary) so the
// sidebar renders pre-filtered — no locked-item flash, no client round-trip.
// The client `<NestedSidebar />` only ever sees permitted items.
//
// The server-only marker below fails the Next.js build if a client component
// accidentally imports this module (see `import "server-only"` docs). In the
// vitest environment the alias in vitest.config.ts remaps `server-only` to a
// no-op shim so the tests still resolve.

import "server-only";

import type { NavGroupV2, NavLeaf, NavSubgroup } from "@/lib/nav/nav-schema";
import {
  planTierRank,
  type AccountType,
  type PlanTier,
  type Segment,
} from "@/lib/segments";

export interface NavFilterContext {
  /** Resolved PlanTier for the user (see getCurrentUserTier). */
  tier: PlanTier;
  /** Optional account-type role — mentor, reseller, etc. */
  role?: AccountType | null;
  /** Audience segment (founder, investor_angel, …). */
  segment?: Segment | null;
  /** Startup lifecycle phase (0-5). Leaves with a higher growthPhase hide. */
  growthPhase?: number;
  /** Granted feature flags. `has` is used for O(1) lookup. */
  features: ReadonlySet<string>;
}

function meetsTier(userTier: PlanTier, minTier: PlanTier | undefined): boolean {
  if (!minTier) return true;
  return planTierRank(userTier) >= planTierRank(minTier);
}

function meetsSegment(
  userSegment: Segment | null | undefined,
  allowed: Segment[] | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!userSegment) return false;
  return allowed.includes(userSegment);
}

function meetsRole(
  userRole: AccountType | null | undefined,
  allowed: AccountType[] | undefined,
): boolean {
  if (!allowed || allowed.length === 0) return true;
  if (!userRole) return false;
  return allowed.includes(userRole);
}

function leafPasses(leaf: NavLeaf, ctx: NavFilterContext): boolean {
  if (!meetsTier(ctx.tier, leaf.minTier)) return false;
  if (leaf.growthPhase != null && (ctx.growthPhase ?? 0) < leaf.growthPhase) return false;
  if (!meetsSegment(ctx.segment ?? null, leaf.segments)) return false;
  if (!meetsRole(ctx.role ?? null, leaf.role)) return false;
  if (leaf.requiredFeature && !ctx.features.has(leaf.requiredFeature)) return false;
  return true;
}

function filterSubgroup(
  subgroup: NavSubgroup,
  ctx: NavFilterContext,
): NavSubgroup | null {
  if (!meetsTier(ctx.tier, subgroup.minTier)) return null;
  if (!meetsSegment(ctx.segment ?? null, subgroup.segments)) return null;
  if (!meetsRole(ctx.role ?? null, subgroup.role)) return null;

  const items = subgroup.items.filter((leaf) => leafPasses(leaf, ctx));
  if (items.length === 0) return null;
  return { ...subgroup, items };
}

/**
 * filterNavForUser — recursive, pure, non-mutating filter.
 *
 * Rules (in order):
 *   1. group.minTier / minPhase / segments / role — hide the whole group
 *   2. Filter each subgroup recursively; drop empties
 *   3. Filter flat `items[]` (backwards-compat with pre-V2 groups)
 *   4. If both `subgroups` and `items` end up empty, drop the group
 */
export function filterNavForUser(
  navTree: readonly NavGroupV2[],
  ctx: NavFilterContext,
): NavGroupV2[] {
  const out: NavGroupV2[] = [];
  for (const group of navTree) {
    if (!meetsTier(ctx.tier, group.minTier)) continue;
    if (group.minPhase != null && (ctx.growthPhase ?? 0) < group.minPhase) continue;
    if (!meetsSegment(ctx.segment ?? null, group.segments)) continue;
    if (!meetsRole(ctx.role ?? null, group.role)) continue;

    const subgroups = (group.subgroups ?? [])
      .map((sg) => filterSubgroup(sg, ctx))
      .filter((sg): sg is NavSubgroup => sg !== null);

    const items = (group.items ?? []).filter((leaf) => leafPasses(leaf, ctx));

    if (subgroups.length === 0 && items.length === 0) continue;

    const next: NavGroupV2 = { ...group };
    if (group.subgroups) next.subgroups = subgroups;
    if (group.items) next.items = items;
    out.push(next);
  }
  return out;
}
