// Server-only helpers for the founder profile.
//
// Types + pure helpers live in lib/founder-profile-types.ts (client-safe).
// This file imports the supabase service-role client, so anything importing it
// must run server-side only.

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { FounderProfile } from "@/lib/founder-profile-types";

export type { CoFounder, Advisor, FounderProfile } from "@/lib/founder-profile-types";
export { EMPTY_PROFILE, profileCompletionPct, profileToSviInputText } from "@/lib/founder-profile-types";

export async function loadFounderProfile(accountId: string): Promise<FounderProfile | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("founder_profiles")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error || !data) return null;
  return data as unknown as FounderProfile;
}

export async function loadFounderProfileByEmail(email: string): Promise<FounderProfile | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("founder_profiles")
    .select("*")
    .eq("email", email.toLowerCase().trim())
    .maybeSingle();
  if (!data) return null;
  return data as unknown as FounderProfile;
}

export async function saveFounderProfile(p: FounderProfile): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const payload = {
    account_id: p.account_id,
    email: p.email.toLowerCase().trim(),
    full_name: p.full_name,
    role: p.role,
    linkedin_url: p.linkedin_url,
    bio: p.bio,
    prev_employers: p.prev_employers,
    ship_history: p.ship_history,
    years_in_domain: p.years_in_domain,
    domain_insight: p.domain_insight,
    ambition: p.ambition,
    co_founders: p.co_founders,
    advisors: p.advisors,
    notable_hires: p.notable_hires,
    public_visible: p.public_visible,
    contactable_by_investors: p.contactable_by_investors,
  };
  const { error } = await supabase.from("founder_profiles").upsert(payload, { onConflict: "account_id" });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
