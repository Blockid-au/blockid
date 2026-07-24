/**
 * Mentor console — pure access guards.
 *
 * All /api/mentor/** routes and every write to mentor_notes /
 * mentor_check_ins / mentor_engagement_snapshots MUST pass through these
 * functions BEFORE hitting the DB. The functions are intentionally pure
 * (Supabase client is passed in) so they can be unit-tested in
 * access-guards.test.ts without a running Postgres.
 *
 * Design invariants:
 *   - Denial always throws MentorAccessDenied with code === MENTOR_ACCESS_DENIED
 *     so API-route callers can `if (err.code === MENTOR_ACCESS_DENIED)` switch
 *     to a 403 without inspecting the error type by reference.
 *   - loadActiveTier resolves the highest non-revoked, non-expired tier
 *     stored in mentor_access_grants for a (reseller, subject) pair. When
 *     no matching row exists the result is 0 / NONE.
 *   - serviceRoleBypass() short-circuits the guard to tier 3 for the nightly
 *     cron and other server-only jobs that write engagement snapshots.
 *   - assertAttributionExists() enforces the seed→consent invariant (R1):
 *     you cannot grant mentor access to a founder who has no live reseller
 *     attribution, because it would create a phantom grant.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { MENTOR_TIER, type MentorTier, type SubjectRef } from "./types";

export const MENTOR_ACCESS_DENIED = "MENTOR_ACCESS_DENIED" as const;

export class MentorAccessDenied extends Error {
  readonly code = MENTOR_ACCESS_DENIED;
  constructor(
    message: string,
    readonly required: MentorTier,
    readonly actual: MentorTier,
    readonly subject: SubjectRef,
  ) {
    super(message);
    this.name = "MentorAccessDenied";
  }
}

/**
 * Throw MentorAccessDenied when the actor's actual tier is below required.
 * Otherwise return silently.
 */
export function assertTier(
  actual: MentorTier,
  required: MentorTier,
  subject: SubjectRef,
): void {
  if (actual < required) {
    throw new MentorAccessDenied(
      `mentor tier ${actual} insufficient (required ${required})`,
      required,
      actual,
      subject,
    );
  }
}

/**
 * Load the highest non-revoked, non-expired mentor tier a reseller currently
 * holds for the given subject. Returns 0 (NONE) when no grant is active.
 */
export async function loadActiveTier(
  supabase: Pick<SupabaseClient, "from">,
  resellerId: string,
  subject: SubjectRef,
): Promise<MentorTier> {
  const subjectColumn = subject.founder_user_id ? "founder_user_id" : "project_id";
  const subjectValue = subject.founder_user_id ?? subject.project_id;
  if (!subjectValue) return MENTOR_TIER.NONE;

  const nowIso = new Date().toISOString();

  const query = supabase
    .from("mentor_access_grants")
    .select("tier, expires_at, revoked_at");

  // Chain the equality filters; using `.eq` twice keeps this compatible with
  // both the real supabase-js client and the in-file mock in the test file.
  const { data, error } = await query
    .eq("reseller_id", resellerId)
    .eq(subjectColumn, subjectValue)
    .is("revoked_at", null);

  if (error || !data || data.length === 0) return MENTOR_TIER.NONE;

  let highest: MentorTier = MENTOR_TIER.NONE;
  for (const row of data as Array<{ tier: number; expires_at: string | null; revoked_at: string | null }>) {
    if (row.revoked_at) continue;
    if (row.expires_at && row.expires_at <= nowIso) continue;
    const t = row.tier as MentorTier;
    if (t > highest) highest = t;
  }
  return highest;
}

/**
 * Precondition for grant creation: a live reseller_attributions row must
 * exist for (reseller, founder|project). Throws MentorAccessDenied if not.
 *
 * This enforces the seed→consent invariant (R1). Without it, a reseller admin
 * could grant themselves mentor access to a founder who never opted into
 * their attribution — producing phantom grants that visibly break audit.
 */
export async function assertAttributionExists(
  supabase: Pick<SupabaseClient, "from">,
  resellerId: string,
  subject: SubjectRef,
): Promise<void> {
  const q = supabase
    .from("reseller_attributions")
    .select("id")
    .eq("reseller_id", resellerId)
    .eq("status", "active")
    .eq("opted_out", false);

  const { data, error } = subject.founder_user_id
    ? await q.eq("subject_type", "user").eq("subject_user_id", subject.founder_user_id)
    : await q.eq("subject_type", "project").eq("subject_project_id", subject.project_id!);

  if (error || !data || (Array.isArray(data) && data.length === 0)) {
    throw new MentorAccessDenied(
      "no live reseller_attributions row for subject — cannot grant mentor access",
      MENTOR_TIER.OVERVIEW,
      MENTOR_TIER.NONE,
      subject,
    );
  }
}

// ---------------------------------------------------------------------------
// Composed helpers — the surface used by scope.ts.
// ---------------------------------------------------------------------------

export interface GateNoteInput {
  sharedWithFounder: boolean;
}

/**
 * Guard a note READ. A mentor at any tier >= PROGRESSION (2) can read
 * private notes; only tier FULL (3) can read notes marked
 * shared_with_founder=true (because those are visible to the founder too).
 */
export function gateNoteRead(actual: MentorTier, input: GateNoteInput, subject: SubjectRef): void {
  const required = input.sharedWithFounder ? MENTOR_TIER.FULL : MENTOR_TIER.PROGRESSION;
  assertTier(actual, required, subject);
}

/**
 * Guard a note WRITE. Private notes need tier PROGRESSION; shared notes
 * (that will land in the founder's inbox) need tier FULL.
 */
export function gateNoteWrite(actual: MentorTier, input: GateNoteInput, subject: SubjectRef): void {
  const required = input.sharedWithFounder ? MENTOR_TIER.FULL : MENTOR_TIER.PROGRESSION;
  assertTier(actual, required, subject);
}

/** Guard a check-in WRITE. Weekly check-ins require tier >= PROGRESSION. */
export function gateCheckInWrite(actual: MentorTier, subject: SubjectRef): void {
  assertTier(actual, MENTOR_TIER.PROGRESSION, subject);
}

/**
 * Nightly cron / service-role callers bypass tier checks — they need tier 3
 * to write engagement snapshots regardless of any grant state.
 */
export function serviceRoleBypass(): MentorTier {
  return MENTOR_TIER.FULL;
}
