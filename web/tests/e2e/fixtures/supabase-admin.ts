// Service-role Supabase client for Playwright fixtures.
//
// Used by reseller P10 dry-run specs (attribution-timing, audit-log) that need
// to peek at DB rows the founder-facing / reseller-facing routes deliberately
// do not expose. Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (same env
// contract as web/src/lib/supabase.ts::getSupabaseAdmin), returns null when
// either is unset so specs test.skip() rather than throw. This mirrors the
// harnessSkipReason() pattern already used across the reseller fixture module.
//
// Kept out of web/src/lib/** to preserve the plan's stated boundary — no
// non-Route-Handler code path holds a service-role client. Only Playwright,
// running out-of-band during E2E, uses this file. If a downstream author is
// tempted to import from src/, don't: use resellerSupabase() + scopedReseller()
// from lib/reseller/supabase.ts instead.
//
// The helpers below cover the read paths the reseller P10 dry-run specs need:
// attribution-timing (reseller_attributions row-count) and audit-log-writes
// (reseller_audit_log row-count by action + actor + subject). Add more helpers
// as future spec ticks land (credit-grant mirror row lookup, etc.) — keep them
// single-table and read-only.
//
// Write paths are deliberately absent: seeding QA rows lives in
// scripts/seed-test-users.mjs; specs must not mutate DB state.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null | undefined;

export function loadSupabaseAdmin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    cached = null;
    return null;
  }
  cached = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: "public" },
  });
  return cached;
}

export function supabaseAdminSkipReason(): string {
  return (
    "Service-role Supabase fixture not provisioned — set SUPABASE_URL + " +
    "SUPABASE_SERVICE_ROLE_KEY in the Playwright env to activate DB " +
    "inspection specs (attribution-timing row 2, audit-log Verification #5). " +
    "Match values from the same Supabase project that hosts the QA harness."
  );
}

/**
 * Count reseller_attributions rows for a user. Filters on subject_user_id and
 * (optionally) subject_type. Used by the attribution-timing spec to assert
 * that no attribution row exists until the founder creates their first
 * workspace (U.6 per-workspace attribution invariant).
 *
 * The reseller_attributions table's subject can be either a user_id or a
 * project_id (per D.1). This helper looks at subject_user_id only; row 3 of
 * the attribution-timing spec (post-createProject) will need a project-scoped
 * lookup instead, but that path is still blocked on the retail-side createProject
 * gap (see spec comment).
 */
export async function countResellerAttributionsFor(
  supabase: SupabaseClient,
  userId: string,
  opts?: { subjectType?: "user" | "project" },
): Promise<number> {
  let query = supabase
    .from("reseller_attributions")
    .select("id", { count: "exact", head: true })
    .eq("subject_user_id", userId);
  if (opts?.subjectType) {
    query = query.eq("subject_type", opts.subjectType);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`countResellerAttributionsFor failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Count reseller_attributions rows scoped to a projects.id. Used by the
 * attribution-timing spec row 3 to assert that createProject() writes exactly
 * one subject_type='project' row for a founder carrying the ?via= cookie
 * (closes the tick 91 frontier gap; retail-attribution.ts adapter).
 */
export async function countResellerAttributionsForProject(
  supabase: SupabaseClient,
  projectId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("reseller_attributions")
    .select("id", { count: "exact", head: true })
    .eq("subject_type", "project")
    .eq("subject_project_id", projectId)
    .eq("status", "active")
    .eq("opted_out", false);
  if (error) {
    throw new Error(`countResellerAttributionsForProject failed: ${error.message}`);
  }
  return count ?? 0;
}

/**
 * Look up an app_user id by email (case-insensitive). Playwright-only helper
 * used to translate the QA account email → user_id for downstream row-count
 * queries. Returns null when the row is not found so specs can distinguish
 * "harness misconfigured" from "user missing".
 */
export async function findUserIdByEmail(
  supabase: SupabaseClient,
  email: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("app_users")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  if (error) {
    throw new Error(`findUserIdByEmail failed: ${error.message}`);
  }
  return (data?.id as string | undefined) ?? null;
}

/**
 * Look up the reseller_id an admin QA account is a member of. Playwright-only
 * helper used by the audit-anomaly spec (Verification #5 second half) to pin
 * ?reseller_id= on the scan endpoint so a stray audit row on another tenant
 * cannot inflate the harness hotspot count. Resolves via reseller_admins
 * (user_id → reseller_id) filtered to status='active'; returns null when the
 * QA admin has no active membership so specs can distinguish "harness
 * misconfigured" from "wrong role".
 */
export async function findResellerIdForAdmin(
  supabase: SupabaseClient,
  userId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("reseller_admins")
    .select("reseller_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    throw new Error(`findResellerIdForAdmin failed: ${error.message}`);
  }
  return (data?.reseller_id as string | undefined) ?? null;
}

/**
 * Count reseller_audit_log rows matching an (action, actor, subject) triple,
 * optionally filtered to rows created at or after a captured timestamp.
 * Used by the audit-log-writes spec (plan Verification #5) to assert that a
 * privileged read — /api/reseller/customers/[id]/{drawer, reveal-email} —
 * produces a durable audit row before the response returns.
 *
 * The `since` cursor is required in practice because reseller_audit_log is
 * append-only (0093 mutation triggers block UPDATE/DELETE), so cross-run
 * accumulation would otherwise poison count-based assertions. Callers should
 * capture `new Date().toISOString()` immediately before firing the request
 * and pass it here.
 */
export async function countResellerAuditLogFor(
  supabase: SupabaseClient,
  opts: {
    action: string;
    actorUserId: string;
    subjectUserId: string;
    since?: string;
  },
): Promise<number> {
  let query = supabase
    .from("reseller_audit_log")
    .select("id", { count: "exact", head: true })
    .eq("action", opts.action)
    .eq("actor_user_id", opts.actorUserId)
    .eq("subject_user_id", opts.subjectUserId);
  if (opts.since) {
    query = query.gte("created_at", opts.since);
  }
  const { count, error } = await query;
  if (error) {
    throw new Error(`countResellerAuditLogFor failed: ${error.message}`);
  }
  return count ?? 0;
}
