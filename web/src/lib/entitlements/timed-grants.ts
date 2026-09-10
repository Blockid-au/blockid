// Time-boxed feature grants — the layer that lets a one-off purchase widen a
// plan for a fixed number of days.
//
// Why this exists
// ---------------
// `user-grants.ts` expresses "this user also pays for an add-on" as rows in
// the `entitlements` table. The Startup Package (founder_package, A$149 once)
// needs something slightly different: three months of Founder Radar after a
// single payment, with no subscription to cancel and no row to delete when
// the window closes. A single timestamp on `app_users` is the honest shape
// for that — `money_radar_until` (migration 0319). This module turns that
// column into the `money_radar` feature flag while the stamp is in the future
// and into nothing once it has passed.
//
// Same two rules as user-grants.ts:
//   • Union only. A stamp can only ever ADD a feature; a NULL or past stamp
//     is the empty set, so nothing a plan grants can be lost here.
//   • Fail closed. No service-role client, a query error, a thrown driver, a
//     malformed timestamp — all resolve to the empty set. An outage denies the
//     timed grant and leaves the plan layer intact; nothing here throws.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { Feature } from "@/lib/entitlements";

/**
 * `app_users` timestamp columns that carry a timed grant, and the feature
 * each one unlocks while it is in the future. One entry today; a second
 * one-off SKU with a window would add a column + a line here and nothing
 * else.
 */
export const TIMED_GRANT_COLUMNS: Readonly<Record<string, Feature>> = Object.freeze({
  money_radar_until: "money_radar",
});

const SELECT_COLUMNS = Object.keys(TIMED_GRANT_COLUMNS).join(", ");

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/**
 * Features whose window is still open at `now`. Exported for the colocated
 * test and for anything that already holds the row (the digest, the sweep).
 */
export function liveTimedGrants(
  row: Record<string, unknown> | null | undefined,
  now: number = Date.now(),
): Feature[] {
  if (!row) return [];
  const out: Feature[] = [];
  for (const [column, feature] of Object.entries(TIMED_GRANT_COLUMNS)) {
    const raw = row[column];
    if (typeof raw !== "string" || raw.length === 0) continue;
    const until = Date.parse(raw);
    // Unparseable → treated as expired — fail closed.
    if (!Number.isFinite(until) || until <= now) continue;
    out.push(feature);
  }
  return out;
}

/** ISO stamp `days` from `from` — what the webhook writes. */
export function timedGrantUntil(days: number, from: number = Date.now()): string {
  return new Date(from + days * 24 * 60 * 60 * 1000).toISOString();
}

// ---------------------------------------------------------------------------
// Cache — same shape and reasoning as user-grants.ts (30s hit, 5s miss,
// bounded, invalidated on write).
// ---------------------------------------------------------------------------

const OK_TTL_MS = 30_000;
const FAIL_TTL_MS = 5_000;
const MAX_ENTRIES = 5_000;

interface CacheEntry {
  flags: readonly Feature[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheSet(userId: string, flags: readonly Feature[], ttlMs: number): void {
  if (cache.size >= MAX_ENTRIES) {
    let toDrop = Math.max(1, Math.floor(MAX_ENTRIES / 10));
    for (const key of cache.keys()) {
      cache.delete(key);
      if (--toDrop <= 0) break;
    }
  }
  cache.set(userId, { flags, expiresAt: Date.now() + ttlMs });
}

/** Drop the cached stamp for one user (or everyone). Call after any write. */
export function invalidateTimedGrants(userId?: string | null): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Test seam. */
export function __timedCacheSizeForTest(): number {
  return cache.size;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/**
 * Cached read used by `getEntitlements`. `[]` for a falsy user id, so an
 * anonymous session can never pick up someone else's window.
 */
export async function getUserTimedGrants(
  userId: string | null | undefined,
): Promise<readonly Feature[]> {
  if (!userId) return [];

  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.flags;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    cacheSet(userId, [], FAIL_TTL_MS);
    return [];
  }

  let flags: Feature[] = [];
  let ok = false;
  try {
    const { data, error } = await supabase
      .from("app_users")
      .select(SELECT_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      // 42703 = column missing (0319 not applied yet) — still fail closed,
      // but do not spam the log for a known pre-migration state.
      if ((error as { code?: string }).code !== "42703") {
        console.error("[blockid:entitlements] timed grant lookup failed", error);
      }
    } else {
      flags = liveTimedGrants((data ?? null) as Record<string, unknown> | null);
      ok = true;
    }
  } catch (err) {
    console.error("[blockid:entitlements] timed grant lookup threw", err);
  }

  cacheSet(userId, flags, ok ? OK_TTL_MS : FAIL_TTL_MS);
  return flags;
}
