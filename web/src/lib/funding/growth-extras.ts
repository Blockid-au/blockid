// Growth-rung gate for the Money Radar extras (T0251, plan §4h Growth row):
// investor reverse-match, unlimited application drafts, quarterly expert
// analysis refresh.
//
// Deliberately NOT a new feature flag (task rule: prefer gating on the plan
// id via existing helpers). "Growth extras" = founder tier ≥ growth
// (`planIdToTier`, which grandfathers legacy `growth` / `growth_annual`) OR
// an active Startup Package purchase (the A$149 SKU includes the
// Growth-level drafts per §4h).
//
// Why the purchase and not `can(user, "startup_package")` (review 2026-09-10
// #4): nothing ever grants that feature to a buyer — the package webhook
// (`handleStartupPackagePurchase`) stamps credits + `app_users.money_radar_until`
// and, when a project was attached, a `startup_package_purchases` row, but
// never changes `app_users.plan` nor writes an `entitlements` row. Gating on
// the feature gave buyers nothing and (through the free-tier fallback
// bundle) gave every free user unlimited drafts during a plans-table miss.
//
// "Active Startup Package" = `money_radar_until > now()` — the 90-day window
// the webhook stamps for every package purchase, project or not, and the
// only thing the re-purchase path extends (#12) — AND a purchase marker for
// this user: a `startup_package_purchases` row (status = active) or the
// `package_seed` credit grant the webhook writes for every purchase. The
// marker keeps a support-granted radar window on a plain Starter account
// from unlocking Growth extras.
//
// `planHasGrowthExtras` is pure (client-safe). `hasGrowthExtras` and
// `listActiveStartupPackageUserIds` are the server versions.

import { planIdToTier, planTierRank } from "@/lib/segments";

/** Pure: founder plan id at or above the Growth rung. */
export function planHasGrowthExtras(planId: string | null | undefined): boolean {
  const tier = planIdToTier(planId);
  // Only the founder ladder — evaluator tiers rank ≥ 20 too but have no startup to draft for.
  if (!["growth", "scale", "enterprise"].includes(tier)) return false;
  return planTierRank(tier) >= planTierRank("growth");
}

export interface GrowthExtrasUser {
  id: string;
  plan: string | null | undefined;
}

/** Minimal query-builder surface the package lookups need (Supabase admin client or a test fake). */
export interface GrowthExtrasDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/** Pure: is the timed radar window open at `now`? Unparseable / NULL → closed. */
export function radarWindowOpen(until: unknown, now: Date): boolean {
  if (typeof until !== "string" || !until) return false;
  const t = Date.parse(until);
  return Number.isFinite(t) && t > now.getTime();
}

/**
 * Server: user ids with an active Startup Package among `userIds` (or every
 * user when `userIds` is omitted). Never throws — a missing table / column
 * (migration not applied) yields the empty set.
 */
export async function listActiveStartupPackageUserIds(
  db: GrowthExtrasDb,
  opts: { now?: Date; userIds?: readonly string[] } = {},
): Promise<Set<string>> {
  const now = opts.now ?? new Date();
  const out = new Set<string>();
  if (opts.userIds && opts.userIds.length === 0) return out;
  try {
    // 1. Open radar windows.
    let q = db.from("app_users").select("id, money_radar_until").gt("money_radar_until", now.toISOString());
    if (opts.userIds) q = q.in("id", opts.userIds);
    const { data: users, error: usersErr } = await q.limit(10_000);
    if (usersErr) return out;
    const windowed = ((users ?? []) as Array<{ id: string; money_radar_until: unknown }>)
      .filter((u) => u.id && radarWindowOpen(u.money_radar_until, now))
      .map((u) => u.id);
    if (windowed.length === 0) return out;

    // 2. Purchase marker — either table proves the A$149 payment.
    const { data: purchases } = await db
      .from("startup_package_purchases")
      .select("user_id")
      .eq("status", "active")
      .in("user_id", windowed);
    for (const p of (purchases ?? []) as Array<{ user_id: string }>) if (p.user_id) out.add(p.user_id);

    const remaining = windowed.filter((id) => !out.has(id));
    if (remaining.length > 0) {
      const { data: seeds } = await db
        .from("credit_transactions")
        .select("user_id")
        .eq("reason", "package_seed")
        .in("user_id", remaining);
      for (const t of (seeds ?? []) as Array<{ user_id: string }>) if (t.user_id) out.add(t.user_id);
    }
  } catch {
    return out;
  }
  return out;
}

/** Server: does this one user hold an active Startup Package? Never throws. */
export async function hasActiveStartupPackage(
  userId: string,
  deps: { db?: GrowthExtrasDb | null; now?: Date } = {},
): Promise<boolean> {
  if (!userId) return false;
  try {
    const db = deps.db ?? (await import("@/lib/supabase")).getSupabaseAdmin();
    if (!db) return false;
    const ids = await listActiveStartupPackageUserIds(db, { now: deps.now, userIds: [userId] });
    return ids.has(userId);
  } catch {
    return false;
  }
}

/** Server: plan rung OR an active Startup Package purchase. Never throws. */
export async function hasGrowthExtras(
  user: GrowthExtrasUser,
  deps: { hasActivePackage?: (userId: string) => Promise<boolean> } = {},
): Promise<boolean> {
  if (planHasGrowthExtras(user.plan)) return true;
  try {
    const check = deps.hasActivePackage ?? ((id: string) => hasActiveStartupPackage(id));
    return await check(user.id);
  } catch {
    return false;
  }
}
