// Server-only DB accessors for mentor_access_grants. Split from access-tiers.ts
// so the pure logic + types in that file stay client-safe (e.g. the mentor-invite
// consent form is a client component that only needs CONSENT_LIFETIME_DAYS +
// tierLabel + MentorAccessTier — pulling supabase.ts into it broke the build).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  TIER_RANK,
  type MentorAccessGrant,
} from "./access-tiers";

/**
 * Returns the highest-tier non-revoked, non-expired grant that authorises
 * `mentorResellerId` (or its members) to view `founderUserId`, optionally
 * scoped to `projectId`. Returns null when no such grant exists — callers
 * MUST treat null as "no access above attributed_only".
 */
export async function loadActiveGrant(
  mentorResellerId: string,
  founderUserId: string,
  projectId?: string | null,
): Promise<MentorAccessGrant | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const nowIso = new Date().toISOString();

  let query = supabase
    .from("mentor_access_grants")
    .select(
      "id, reseller_id, mentor_user_id, founder_user_id, project_id, tier, granted_at, expires_at, revoked_at, report_toggles, reminder_30d_sent_at, reminder_7d_sent_at",
    )
    .eq("reseller_id", mentorResellerId)
    .eq("founder_user_id", founderUserId)
    .is("revoked_at", null);

  if (projectId) {
    query = query.or(`project_id.eq.${projectId},project_id.is.null`);
  }

  const { data, error } = await query;
  if (error || !data) return null;

  const effective = (data as MentorAccessGrant[]).filter(
    (g) => !g.expires_at || g.expires_at > nowIso,
  );
  if (effective.length === 0) return null;

  effective.sort((a, b) => TIER_RANK[b.tier] - TIER_RANK[a.tier]);
  return effective[0] ?? null;
}

/**
 * All grants (active + revoked + expired) that mention `founderUserId` —
 * used by the founder-side /dashboard/settings/mentor-access page.
 */
export async function loadAllGrantsForFounder(
  founderUserId: string,
): Promise<MentorAccessGrant[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("mentor_access_grants")
    .select(
      "id, reseller_id, mentor_user_id, founder_user_id, project_id, tier, granted_at, expires_at, revoked_at, report_toggles, reminder_30d_sent_at, reminder_7d_sent_at",
    )
    .eq("founder_user_id", founderUserId)
    .order("granted_at", { ascending: false });
  if (error || !data) return [];
  return data as MentorAccessGrant[];
}
