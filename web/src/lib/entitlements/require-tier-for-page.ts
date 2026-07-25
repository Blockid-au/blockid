// Server-side page-level entitlement gate.
//
// Called at the top of every gated `page.tsx` in the App Router. Resolves the
// current session, checks the feature and/or minimum plan tier, fires a
// gate-hit analytics event, then either returns silently (allow) or short-
// circuits with `redirect()` from `next/navigation` (deny).
//
// The nav-hiding layer (filterNavForUser) is UX only — this helper is the
// security boundary. A user typing a URL for a page they cannot afford lands
// on `/pricing?feature=<slug>&from=<pathname>` instead of a broken page.
//
// Safe-list: /pricing, /auth/login, /login, /workspace/billing and
// /workspace/upgrade are never gated so redirects can never loop.

import "server-only";

import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth";
import {
  can,
  recordGateHit,
  type Feature,
  type UserWithPlan,
} from "@/lib/entitlements";
import { meetsMinPlan, type PlanTier } from "@/lib/segments";

/** URLs that must never be passed to this gate — they are the escape hatches. */
export const SAFE_LIST: readonly string[] = Object.freeze([
  "/pricing",
  "/login",
  "/auth/login",
  "/workspace/billing",
  "/workspace/upgrade",
]);

export interface RequireTierOptions {
  /** Feature flag the page needs. Optional if `minTier` alone is enough. */
  feature?: Feature;
  /** Minimum plan tier the page needs. Optional if `feature` alone is enough. */
  minTier?: PlanTier;
  /**
   * Current pathname (e.g. "/workspace/cap-table") — used to build the
   * `?from=` query on the pricing redirect. Callers pass this explicitly
   * because next/navigation cannot infer it inside an RSC without a request
   * ambient (headers()) which is expensive per-page.
   */
  fromPath: string;
}

/**
 * Assert the current user can access this page. Redirects on miss; returns
 * `void` on allow so the caller can `await requireTierForPage(...)` at the
 * top of the RSC and continue rendering.
 */
export async function requireTierForPage(opts: RequireTierOptions): Promise<void> {
  const { feature, minTier, fromPath } = opts;

  // Defensive safe-list guard so a copy-paste never gates the escape hatches.
  if (SAFE_LIST.some((p) => fromPath === p || fromPath.startsWith(p + "?"))) {
    return;
  }

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/auth/login?next=${encodeURIComponent(fromPath)}`);
  }

  const plan = user.plan ?? "free";
  const uwp: UserWithPlan = { id: user.id, plan, segment: "founder" };

  // Tier check (cheap, in-memory) first — short-circuits before hitting the
  // plans-db lookup that `can()` performs.
  if (minTier && !meetsMinPlan(plan, minTier)) {
    await maybeRecordGateHit(uwp, feature);
    redirectToPricing(fromPath, feature);
  }

  if (feature) {
    const ok = await can(uwp, feature);
    if (!ok) {
      await maybeRecordGateHit(uwp, feature);
      redirectToPricing(fromPath, feature);
    }
  }
}

function redirectToPricing(fromPath: string, feature?: Feature): never {
  const params = new URLSearchParams();
  if (feature) params.set("feature", feature);
  params.set("from", fromPath);
  redirect(`/pricing?${params.toString()}`);
}

async function maybeRecordGateHit(
  user: UserWithPlan,
  feature: Feature | undefined,
): Promise<void> {
  if (!feature) return;
  try {
    await recordGateHit(user, feature, "menu");
  } catch {
    // Analytics failures must never block the redirect.
  }
}
