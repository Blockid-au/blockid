// Reseller session scoping — belt-and-braces on top of resellerSupabase().
//
// Per docs/plans/reseller-module-plan.md § E.2 (RBAC allow/deny matrix),
// § U.15.12 R-01 (CI grep enforcement), § U.15.13.
//
// Every `/api/reseller/*` route MUST call scopedReseller(user) as its first
// line. Returns the reseller_id + the set of subject_user_ids (attributed
// customers + sandbox owner) that the session is allowed to read.

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { AppUser } from "@/lib/auth";
import {
  gateCheckInWrite as _gateCheckInWrite,
  gateNoteRead as _gateNoteRead,
  gateNoteWrite as _gateNoteWrite,
  loadActiveTier,
  type GateNoteInput,
} from "@/lib/mentor/access-guards";
import type { MentorTier, SubjectRef } from "@/lib/mentor/types";

/**
 * Mentor sub-scope — pure delegation to lib/mentor/access-guards.ts.
 * Callers under /api/mentor/** should reach for `mentorScope(session)`
 * rather than touching `session` directly.
 */
export interface MentorSubScope {
  /** Highest live mentor tier this reseller currently holds for `subject`. */
  tierFor(subject: SubjectRef): Promise<MentorTier>;
  /** Throws MentorAccessDenied when the caller cannot read a note. */
  gateNoteRead(subject: SubjectRef, input: GateNoteInput): Promise<void>;
  /** Throws MentorAccessDenied when the caller cannot write a note. */
  gateNoteWrite(subject: SubjectRef, input: GateNoteInput): Promise<void>;
  /** Throws MentorAccessDenied when the caller cannot write a check-in. */
  gateCheckInWrite(subject: SubjectRef): Promise<void>;
}

export interface ScopedResellerSession {
  reseller_id: string;
  role: "owner" | "admin" | "viewer";
  /** Cached list of allowed customer subject_user_ids (attributed startups). */
  allowedCustomerIds: () => Promise<string[]>;
  /** The sandbox project id owned by this reseller org, if any. */
  sandboxProjectId: () => Promise<string | null>;
  /** Mentor console sub-scope — tier-gated per (reseller, founder|project). */
  mentor: MentorSubScope;
}

/**
 * Build a MentorSubScope from a supabase client + reseller_id. Exported so
 * unit tests can exercise the sub-scope without going through the full
 * scopedReseller() → getSupabaseAdmin() bootstrap.
 */
export function createMentorScope(
  supabase: Pick<SupabaseClient, "from">,
  resellerId: string,
): MentorSubScope {
  return {
    async tierFor(subject) {
      return loadActiveTier(supabase, resellerId, subject);
    },
    async gateNoteRead(subject, input) {
      const tier = await loadActiveTier(supabase, resellerId, subject);
      _gateNoteRead(tier, input, subject);
    },
    async gateNoteWrite(subject, input) {
      const tier = await loadActiveTier(supabase, resellerId, subject);
      _gateNoteWrite(tier, input, subject);
    },
    async gateCheckInWrite(subject) {
      const tier = await loadActiveTier(supabase, resellerId, subject);
      _gateCheckInWrite(tier, subject);
    },
  };
}

/**
 * Thin accessor for /api/mentor/** routes — returns only the mentor sub-scope.
 * Prefer this over reaching into `session.mentor` so a future refactor can
 * layer additional cross-cutting behaviour (audit, rate-limit) in one place.
 */
export function mentorScope(session: ScopedResellerSession): MentorSubScope {
  return session.mentor;
}

export class ResellerScopeError extends Error {
  constructor(msg: string, public code: "no_membership" | "revoked" | "no_reseller" = "no_membership") {
    super(msg);
    this.name = "ResellerScopeError";
  }
}

/**
 * Establish a reseller-scoped session from an authenticated app user.
 * Throws ResellerScopeError if the user is not an active reseller admin.
 *
 * The returned object's `allowedCustomerIds()` is lazy — it hits DB on first
 * call and caches for the session's lifetime.
 */
export async function scopedReseller(user: AppUser): Promise<ScopedResellerSession> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    throw new ResellerScopeError("supabase not configured", "no_reseller");
  }

  const { data: membership, error } = await supabase
    .from("reseller_admins")
    .select("reseller_id, role, status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (error || !membership) {
    throw new ResellerScopeError("user is not a reseller admin", "no_membership");
  }

  let cachedAllowed: string[] | null = null;
  let cachedSandbox: string | null | undefined = undefined; // undefined = not fetched

  return {
    reseller_id: membership.reseller_id as string,
    role: membership.role as "owner" | "admin" | "viewer",

    async allowedCustomerIds() {
      if (cachedAllowed) return cachedAllowed;
      const { data } = await supabase
        .from("reseller_attributions")
        .select("subject_user_id, subject_project_id, subject_type")
        .eq("reseller_id", membership.reseller_id)
        .eq("status", "active")
        .eq("opted_out", false);

      const users = new Set<string>();
      const projectIds = new Set<string>();
      for (const row of data ?? []) {
        if (row.subject_type === "user" && row.subject_user_id) users.add(row.subject_user_id);
        if (row.subject_type === "project" && row.subject_project_id) projectIds.add(row.subject_project_id);
      }

      // Resolve project attributions to their owning user_ids so downstream
      // reads by user_id also succeed for per-workspace attributions.
      if (projectIds.size > 0) {
        const { data: projRows } = await supabase
          .from("projects")
          .select("user_id")
          .in("id", Array.from(projectIds));
        for (const p of projRows ?? []) users.add(p.user_id);
      }

      cachedAllowed = Array.from(users);
      return cachedAllowed;
    },

    async sandboxProjectId(): Promise<string | null> {
      if (cachedSandbox !== undefined) return cachedSandbox as string | null;
      const { data } = await supabase
        .from("projects")
        .select("id")
        .eq("reseller_sandbox_id", membership.reseller_id)
        .maybeSingle();
      cachedSandbox = (data?.id as string | undefined) ?? null;
      return cachedSandbox as string | null;
    },

    mentor: createMentorScope(supabase, membership.reseller_id as string),
  };
}
