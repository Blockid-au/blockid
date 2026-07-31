// Reseller startup-roster helper (v3 upgrade Track K sub-L2).
//
// Wraps SELECTs against the public.reseller_startup_roster view added in
// migration 0295. The view is one row per (reseller × attributed business);
// this helper adds:
//
//   1. Owner-only guard. `resellers.owner_user_id` does not exist as a
//      column — ownership lives in `reseller_admins(role='owner', status=
//      'active')`. Callers pass the authenticated `userId`; we verify
//      membership before returning any row. Non-owner (or unknown) callers
//      get [] back, never a leak.
//   2. Filter + sort. Callers can filter by derived status pill and sort
//      by trust_score / last_activity_at / first_touch_at, asc or desc.
//
// The helper accepts an injectable supabase client so it can be exercised
// with a hand-rolled mock in the colocated vitest suite without spinning up
// a live Postgres.

import "server-only";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";

/* -------------------------------------------------------------------- */
/* Row shape (mirrors migration 0295 SELECT list — keep in lock-step). */
/* -------------------------------------------------------------------- */

export type RosterStatus =
  | "onboarding"
  | "active"
  | "stalled"
  | "paying"
  | "churned";

export interface StartupRosterEntry {
  reseller_id: string;
  reseller_slug: string;
  business_id: string;
  founder_user_id: string;
  founder_email: string;
  business_name: string;
  abn: string | null;
  verification_level: number;
  trust_score: number | null;
  unicorn_stage_id: string | null;
  growth_phase: string | null;
  evidence_count: number;
  report_count: number;
  credit_balance: number;
  first_touch_at: string;
  last_activity_at: string | null;
  status: RosterStatus;
}

/* -------------------------------------------------------------------- */
/* Zod filter/sort schema exposed to route handlers + client forms.    */
/* -------------------------------------------------------------------- */

export const RosterFiltersSchema = z
  .object({
    status: z
      .enum(["all", "onboarding", "active", "stalled", "paying", "churned"])
      .default("all"),
    sortBy: z
      .enum(["trust_score", "last_activity_at", "first_touch_at"])
      .default("last_activity_at"),
    sortDir: z.enum(["asc", "desc"]).default("desc"),
  })
  .strict();

export type RosterFilters = z.infer<typeof RosterFiltersSchema>;

/* -------------------------------------------------------------------- */
/* Minimal supabase surface we actually call — kept narrow so tests    */
/* only stub what they need to.                                        */
/* -------------------------------------------------------------------- */

interface AdminsQueryResult {
  data: Array<{ reseller_id: string; role: string; status: string }> | null;
  error: unknown;
}
interface RosterQueryResult {
  data: StartupRosterEntry[] | null;
  error: unknown;
}
export interface RosterSupabaseLike {
  from(table: "reseller_admins"): {
    select(cols: string): {
      eq(col: string, val: string): {
        eq(col: string, val: string): {
          eq(col: string, val: string): Promise<AdminsQueryResult>;
        };
      };
    };
  };
  from(table: "reseller_startup_roster"): {
    select(cols: string): {
      eq(col: string, val: string): {
        order(col: string, opts: { ascending: boolean }): Promise<RosterQueryResult>;
      };
    };
  };
}

/* -------------------------------------------------------------------- */
/* Owner-only guard.                                                    */
/* -------------------------------------------------------------------- */

/**
 * Return `true` iff `userId` is an active `owner` on the given reseller.
 * Anything else (missing membership, revoked, wrong role, DB error) → false.
 * Exposed for direct use by the /reseller/roster page + /api/reseller/note
 * route handler where we do not want to re-fetch the roster just to gate.
 */
export async function isResellerOwner(
  resellerId: string,
  userId: string,
  supabase: RosterSupabaseLike | null = null,
): Promise<boolean> {
  const db = supabase ?? (getSupabaseAdmin() as unknown as RosterSupabaseLike | null);
  if (!db) return false;
  const { data, error } = await db
    .from("reseller_admins")
    .select("reseller_id, role, status")
    .eq("reseller_id", resellerId)
    .eq("user_id", userId)
    .eq("status", "active");
  if (error || !data || data.length === 0) return false;
  return data.some((row) => row.role === "owner");
}

/* -------------------------------------------------------------------- */
/* Main read.                                                           */
/* -------------------------------------------------------------------- */

/**
 * Read the roster for `resellerId`, filtered + sorted per `filters`.
 * Returns `[]` when `userId` is not an active owner of the reseller.
 */
export async function readResellerRoster(
  resellerId: string,
  userId: string,
  rawFilters: unknown = {},
  supabase: RosterSupabaseLike | null = null,
): Promise<StartupRosterEntry[]> {
  const db = supabase ?? (getSupabaseAdmin() as unknown as RosterSupabaseLike | null);
  if (!db) return [];

  const filters = RosterFiltersSchema.parse(rawFilters);

  // 1. Owner gate (empty [] on any failure — never leak).
  const owner = await isResellerOwner(resellerId, userId, db);
  if (!owner) return [];

  // 2. Fetch rows. Sorting is pushed to Postgres; status filtering happens
  //    in JS because the derived pill lives in the view but the caller may
  //    have passed `status: 'all'`.
  const { data, error } = await db
    .from("reseller_startup_roster")
    .select("*")
    .eq("reseller_id", resellerId)
    .order(filters.sortBy, { ascending: filters.sortDir === "asc" });

  if (error || !data) return [];

  const rows = filters.status === "all"
    ? data
    : data.filter((r) => r.status === filters.status);

  return rows;
}

/* -------------------------------------------------------------------- */
/* Aggregate summary shown in the roster page top strip.               */
/* -------------------------------------------------------------------- */

export interface RosterSummary {
  total: number;
  avg_trust_score: number | null;
  by_stage: Record<string, number>;
  by_status: Record<RosterStatus, number>;
}

export function summariseRoster(rows: StartupRosterEntry[]): RosterSummary {
  const by_stage: Record<string, number> = {};
  const by_status: Record<RosterStatus, number> = {
    onboarding: 0,
    active: 0,
    stalled: 0,
    paying: 0,
    churned: 0,
  };
  let scoreSum = 0;
  let scoreCount = 0;
  for (const r of rows) {
    const stage = r.unicorn_stage_id ?? "unknown";
    by_stage[stage] = (by_stage[stage] ?? 0) + 1;
    by_status[r.status] += 1;
    if (typeof r.trust_score === "number" && Number.isFinite(r.trust_score)) {
      scoreSum += r.trust_score;
      scoreCount += 1;
    }
  }
  return {
    total: rows.length,
    avg_trust_score: scoreCount > 0 ? Math.round(scoreSum / scoreCount) : null,
    by_stage,
    by_status,
  };
}
