// Cofounder Match — server-only Supabase helpers.
//
// Split from `cofounder-match.ts` so the client form can import the schema +
// option lists without pulling the supabase admin client (which is bound to
// `server-only` and the SERVICE_ROLE_KEY).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  anonymizeName,
  type CofounderProfileInput,
  type DirectoryProfile,
} from "@/lib/cofounder-match";

// -----------------------------------------------------------------------------
// Supabase row shape (snake_case, matches 0004 migration).
// -----------------------------------------------------------------------------

interface CofounderProfileRow {
  id: string;
  full_name: string;
  location: string;
  looking_for: string[] | null;
  i_am: string[] | null;
  time_commitment: string;
  stage: string;
  created_at: string;
}

// Fetch the most recent directory-visible, non-flagged profiles.
// Returns [] when Supabase isn't configured (Phase-1 graceful degradation),
// matching the pattern used by /api/lead.
export async function fetchRecentDirectoryProfiles(
  limit = 12,
): Promise<DirectoryProfile[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cofounder_profiles")
    .select(
      "id, full_name, location, looking_for, i_am, time_commitment, stage, created_at",
    )
    .eq("visibility", "directory")
    .is("flagged_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error(
      "[blockid:cofounder-match] fetchRecentDirectoryProfiles failed",
      error,
    );
    return [];
  }
  const rows = (data ?? []) as CofounderProfileRow[];
  return rows.map((r) => ({
    id: r.id,
    displayName: anonymizeName(r.full_name),
    location: r.location,
    lookingFor: r.looking_for ?? [],
    iAm: r.i_am ?? [],
    timeCommitment: r.time_commitment,
    stage: r.stage,
    createdAt: r.created_at,
  }));
}

// Insert helper used by the API route. Returns the new row id on success.
export async function insertCofounderProfile(args: {
  input: CofounderProfileInput;
  ipHash: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; reason: string }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    // Phase-1 graceful degradation: log and pretend it worked so the funnel
    // keeps moving in dev/preview without secrets.
    const fauxId = `local-${Date.now()}`;
    console.warn(
      "[blockid:cofounder-match] Supabase not configured — logging only",
      { id: fauxId, email: args.input.email },
    );
    return { ok: true, id: fauxId };
  }
  const { data, error } = await supabase
    .from("cofounder_profiles")
    .insert({
      full_name: args.input.fullName,
      email: args.input.email,
      location: args.input.location,
      looking_for: args.input.lookingFor,
      i_am: args.input.iAm,
      skills: args.input.skills || null,
      idea_pitch: args.input.ideaPitch || null,
      time_commitment: args.input.timeCommitment,
      stage: args.input.stage,
      linkedin_url: args.input.linkedinUrl || null,
      visibility: args.input.visibility,
      ip_hash: args.ipHash,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("[blockid:cofounder-match] insert failed", error);
    return { ok: false, reason: "db_error" };
  }
  return { ok: true, id: data.id as string };
}
