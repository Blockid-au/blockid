// Per-user feature grants — the layer that lets a paid add-on widen a plan.
//
// Why this exists
// ---------------
// `getEntitlements(planId)` resolves features from a plan id, which is right
// for everything a subscriber gets *because of their plan*. It cannot express
// "this founder also pays A$59/month for the Equity add-on", because a plan id
// is not a user. This module supplies the missing half: the set of features
// granted to one specific user, read from the `entitlements` table
// (0075, given a reader by 0306).
//
// Direction of effect — union only
// -------------------------------
// Rows here only ever ADD features. A user with no rows resolves to exactly
// their plan bundle, which is what every existing subscriber already gets, so
// nothing can lose access by this module existing. Rows are never used to
// subtract a plan feature: `allowed = false` rows are ignored rather than
// treated as a deny, so a stray or stale row cannot lock a paying customer out
// of something their plan includes. Revocation is a DELETE, not a flip.
//
// Fail-closed
// -----------
// Every failure path — no service-role client, query error, malformed row,
// expired row — yields the empty set. Because the empty set is also the
// "no add-on" answer, a broken lookup denies add-on features and leaves plan
// features untouched. There is no code path where a failure widens access, and
// nothing here throws: a database outage must not 500 a page whose content the
// user's plan already covers.

import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase";
import type { Feature } from "@/lib/entitlements";

// ---------------------------------------------------------------------------
// Add-on catalog
// ---------------------------------------------------------------------------

/** Key stored in `entitlements.detail.addon`. Stable — it is persisted data. */
export const SHARE_MANAGEMENT_ADDON = "share_management";

/**
 * What each add-on unlocks.
 *
 * The Equity add-on (A$59/month) grants exactly the four flags that already
 * gate ESOP administration, vesting schedules and on-chain sync — see
 * `feature-gates.manifest.ts`. Those routes are Scale/Enterprise-only today,
 * so the add-on makes them *reachable* for a Growth subscriber; it takes
 * nothing from anyone.
 *
 * Deliberately NOT included:
 *
 *   • `share_management` / `cap_table.*` / `data_room.*` — the cap table, the
 *     data room and the register itself are the founder's own statutory
 *     records. They stay on Growth. Moving them behind an add-on would be
 *     paywalling a company's own books.
 *
 *   • Dividend runs, the shareholder/employee portal and ATO ESS reporting.
 *     These are named in the add-on's pricing design but have no feature gate
 *     in the product today — `/api/dividends` checks authentication only.
 *     Inventing gates for them here would REMOVE access that current Growth
 *     subscribers have, which is the wrong direction and is not something a
 *     pricing change may do silently. They need their own consent-designed
 *     rollout, not a side effect of wiring the add-on.
 */
export const ADDON_FEATURES: Readonly<Record<string, readonly Feature[]>> =
  Object.freeze({
    [SHARE_MANAGEMENT_ADDON]: Object.freeze([
      "esop.manage",
      "vesting.read",
      "vesting.write",
      "blockchain.sync",
    ] as readonly Feature[]),
  });

export function addonFeatures(addon: string): readonly Feature[] {
  return ADDON_FEATURES[addon] ?? [];
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------
//
// `can()` runs on every gate check, so a per-user round trip would be a very
// different cost profile from `getPlanCached` (one row shared by every user on
// that plan). Three things keep it cheap and correct:
//
//   1. A short positive TTL (30s). This bounds how long a revoked add-on can
//      still resolve if the invalidation below is missed — e.g. because the
//      webhook landed on a different Node process.
//   2. Explicit invalidation on every write. The webhook and the change-plan
//      route call `invalidateUserGrants(userId)` immediately after granting or
//      revoking, so in the common single-process case the change is instant
//      and the TTL never comes into play.
//   3. A much shorter failure TTL (5s). A transient database blip must not
//      lock a paying customer out for half a minute, but it also must not turn
//      into a retry storm against a database that is already unhappy.
//
// The map is bounded so a large user base cannot grow it without limit; on
// overflow the oldest inserted entries are dropped (Map preserves insertion
// order), which costs at worst a re-read.

const OK_TTL_MS = 30_000;
const FAIL_TTL_MS = 5_000;
const MAX_ENTRIES = 5_000;

interface CacheEntry {
  flags: readonly string[];
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

function cacheSet(userId: string, flags: readonly string[], ttlMs: number): void {
  if (cache.size >= MAX_ENTRIES) {
    // Drop the oldest ~10% rather than one entry per insert, so a hot cache at
    // capacity does not pay an eviction on every single write.
    let toDrop = Math.max(1, Math.floor(MAX_ENTRIES / 10));
    for (const key of cache.keys()) {
      cache.delete(key);
      if (--toDrop <= 0) break;
    }
  }
  cache.set(userId, { flags, expiresAt: Date.now() + ttlMs });
}

/**
 * Drop the cached grants for one user (or everyone, if no id is given).
 * Call this from any code path that writes to `entitlements`.
 */
export function invalidateUserGrants(userId?: string | null): void {
  if (userId) cache.delete(userId);
  else cache.clear();
}

/** Test seam — inspect what is currently memoised. */
export function __cacheSizeForTest(): number {
  return cache.size;
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

interface EntitlementRow {
  feature?: unknown;
  expires_at?: unknown;
}

function liveFeatures(rows: readonly EntitlementRow[], now: number): string[] {
  const out: string[] = [];
  for (const row of rows) {
    const feature = row?.feature;
    if (typeof feature !== "string" || feature.length === 0) continue;

    const expires = row?.expires_at;
    if (typeof expires === "string" && expires.length > 0) {
      const at = Date.parse(expires);
      // An unparseable expiry is treated as expired — fail closed.
      if (!Number.isFinite(at) || at <= now) continue;
    }
    out.push(feature);
  }
  return Array.from(new Set(out));
}

/** Uncached read. Returns `[]` on every failure. Never throws. */
export async function loadUserGrantedFeatures(userId: string): Promise<string[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("feature, expires_at")
      .eq("user_id", userId)
      .eq("allowed", true);

    if (error) {
      console.error("[blockid:entitlements] user grant lookup failed", error);
      return [];
    }
    return liveFeatures((data ?? []) as EntitlementRow[], Date.now());
  } catch (err) {
    console.error("[blockid:entitlements] user grant lookup threw", err);
    return [];
  }
}

/**
 * Cached read used by `getEntitlements`. Returns `[]` for a falsy user id, so
 * an anonymous session can never pick up someone else's grants.
 */
export async function getUserGrantedFeatures(
  userId: string | null | undefined,
): Promise<readonly string[]> {
  if (!userId) return [];

  const hit = cache.get(userId);
  if (hit && hit.expiresAt > Date.now()) return hit.flags;

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Not configured is a lasting condition, not a blip — but still cache it
    // briefly so a mid-request config change is picked up quickly.
    cacheSet(userId, [], FAIL_TTL_MS);
    return [];
  }

  let flags: string[] = [];
  let ok = false;
  try {
    const { data, error } = await supabase
      .from("entitlements")
      .select("feature, expires_at")
      .eq("user_id", userId)
      .eq("allowed", true);

    if (error) {
      console.error("[blockid:entitlements] user grant lookup failed", error);
    } else {
      flags = liveFeatures((data ?? []) as EntitlementRow[], Date.now());
      ok = true;
    }
  } catch (err) {
    console.error("[blockid:entitlements] user grant lookup threw", err);
  }

  cacheSet(userId, flags, ok ? OK_TTL_MS : FAIL_TTL_MS);
  return flags;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

export interface GrantAddonArgs {
  userId: string;
  addon: string;
  detail?: Record<string, unknown>;
}

/**
 * Record an add-on's features for a user. Idempotent: the (user_id, feature)
 * primary key means a repeated webhook delivery upserts the same rows.
 *
 * Returns `false` if nothing could be written, so the caller can decide
 * whether to make Stripe retry. It never throws — an entitlement write must
 * not be the reason a webhook 500s and Stripe starts backing off.
 */
export async function grantAddon(args: GrantAddonArgs): Promise<boolean> {
  const { userId, addon, detail = {} } = args;
  const features = addonFeatures(addon);
  if (!userId || features.length === 0) return false;

  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  const grantedAt = new Date().toISOString();
  const rows = features.map((feature) => ({
    user_id: userId,
    feature,
    allowed: true,
    source: "addon",
    granted_at: grantedAt,
    expires_at: null,
    detail: { ...detail, addon },
  }));

  try {
    const { error } = await supabase
      .from("entitlements")
      .upsert(rows, { onConflict: "user_id,feature" });
    if (error) {
      console.error("[blockid:entitlements] addon grant failed", error);
      return false;
    }
  } catch (err) {
    console.error("[blockid:entitlements] addon grant threw", err);
    return false;
  } finally {
    invalidateUserGrants(userId);
  }

  console.info(
    `[blockid:entitlements] granted add-on "${addon}" to user ${userId} (${features.join(", ")})`,
  );
  return true;
}

export interface RevokeAddonArgs {
  userId: string;
  addon: string;
  reason: string;
}

/**
 * Remove an add-on's features from a user.
 *
 * Scoped to `source = 'addon'` so it can never delete a manual support
 * override or a grandfathered grant, and to this add-on's own feature list so
 * one add-on's cancellation cannot revoke another's.
 */
export async function revokeAddon(args: RevokeAddonArgs): Promise<boolean> {
  const { userId, addon, reason } = args;
  const features = addonFeatures(addon);
  if (!userId || features.length === 0) return false;

  const supabase = getSupabaseAdmin();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("entitlements")
      .delete()
      .eq("user_id", userId)
      .eq("source", "addon")
      .in("feature", features as string[]);
    if (error) {
      console.error("[blockid:entitlements] addon revoke failed", error);
      return false;
    }
  } catch (err) {
    console.error("[blockid:entitlements] addon revoke threw", err);
    return false;
  } finally {
    invalidateUserGrants(userId);
  }

  console.info(
    `[blockid:entitlements] revoked add-on "${addon}" from user ${userId} (${reason})`,
  );
  return true;
}
