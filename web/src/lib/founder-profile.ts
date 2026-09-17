// Server-only helpers for the founder profile.
//
// Types + pure helpers live in lib/founder-profile-types.ts (client-safe).
// This file imports the supabase service-role client, so anything importing it
// must run server-side only.
//
// G14-S37 (0408): the structured execution fields (prior_exits, prior_raises,
// github_url, full_time_pct, worked_together_before, roles, execution_*) are
// read + written here. Reads normalise a pre-0408 row (columns absent) to the
// empty execution fields; the upsert retries WITHOUT those columns when the
// migration is not applied yet, so the founder can still save the legacy
// fields (never a 500 on a pending migration).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { EMPTY_EXECUTION_FIELDS, EMPTY_ROLES, ROLE_KEYS, type FounderProfile, type FounderRoles } from "@/lib/founder-profile-types";

export type { CoFounder, Advisor, FounderProfile } from "@/lib/founder-profile-types";
export { EMPTY_PROFILE, profileCompletionPct, profileToSviInputText } from "@/lib/founder-profile-types";

type Row = Record<string, unknown>;

const isMissingColumn = (message: string | undefined): boolean =>
  /column .* does not exist|schema cache|could not find the '.*' column/i.test(message ?? "");

/** Coerce a raw founder_profiles row (any migration level) into the full shape. */
export function normaliseProfileRow(row: Row): FounderProfile {
  const empty = EMPTY_EXECUTION_FIELDS();
  const roles: FounderRoles = EMPTY_ROLES();
  const rawRoles = row.roles && typeof row.roles === "object" && !Array.isArray(row.roles) ? (row.roles as Row) : {};
  for (const k of ROLE_KEYS) {
    const v = rawRoles[k];
    roles[k] = typeof v === "string" && v.trim() ? v : null;
  }
  const num = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  return {
    ...(row as unknown as FounderProfile),
    prev_employers: Array.isArray(row.prev_employers) ? (row.prev_employers as string[]) : [],
    ship_history: Array.isArray(row.ship_history) ? (row.ship_history as string[]) : [],
    co_founders: Array.isArray(row.co_founders) ? (row.co_founders as FounderProfile["co_founders"]) : [],
    advisors: Array.isArray(row.advisors) ? (row.advisors as FounderProfile["advisors"]) : [],
    notable_hires: Array.isArray(row.notable_hires) ? (row.notable_hires as FounderProfile["notable_hires"]) : [],
    public_visible: row.public_visible !== false,
    contactable_by_investors: row.contactable_by_investors === true,
    prior_exits: Array.isArray(row.prior_exits) ? (row.prior_exits as FounderProfile["prior_exits"]) : empty.prior_exits,
    prior_raises: Array.isArray(row.prior_raises) ? (row.prior_raises as FounderProfile["prior_raises"]) : empty.prior_raises,
    github_url: typeof row.github_url === "string" && row.github_url ? row.github_url : null,
    full_time_pct: num(row.full_time_pct),
    worked_together_before: typeof row.worked_together_before === "boolean" ? row.worked_together_before : null,
    roles,
    execution_score: num(row.execution_score),
    execution_computed_at: typeof row.execution_computed_at === "string" ? row.execution_computed_at : null,
    execution_source:
      row.execution_source && typeof row.execution_source === "object" && !Array.isArray(row.execution_source)
        ? (row.execution_source as FounderProfile["execution_source"])
        : {},
  };
}

export async function loadFounderProfile(accountId: string): Promise<FounderProfile | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("founder_profiles")
    .select("*")
    .eq("account_id", accountId)
    .maybeSingle();
  if (error || !data) return null;
  return normaliseProfileRow(data as Row);
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
  return normaliseProfileRow(data as Row);
}

/** The G14-S37 columns (0408) — stripped from the upsert when the migration is pending. */
const EXECUTION_COLUMNS = ["prior_exits", "prior_raises", "github_url", "full_time_pct", "worked_together_before", "roles", "execution_source"] as const;

export async function saveFounderProfile(p: FounderProfile): Promise<{ ok: boolean; error?: string; executionFieldsSaved?: boolean }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { ok: false, error: "Database not configured" };
  const payload: Row = {
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
    // G14-S37 (0408)
    prior_exits: p.prior_exits ?? [],
    prior_raises: p.prior_raises ?? [],
    github_url: p.github_url ?? null,
    full_time_pct: p.full_time_pct ?? null,
    worked_together_before: p.worked_together_before ?? null,
    roles: p.roles ?? EMPTY_ROLES(),
    execution_source: p.execution_source ?? {},
  };
  const { error } = await supabase.from("founder_profiles").upsert(payload, { onConflict: "account_id" });
  if (!error) return { ok: true, executionFieldsSaved: true };
  if (!isMissingColumn(error.message)) return { ok: false, error: error.message };
  // 0408 not applied yet — save the legacy fields so the founder loses nothing.
  const legacy: Row = { ...payload };
  for (const c of EXECUTION_COLUMNS) delete legacy[c];
  const retry = await supabase.from("founder_profiles").upsert(legacy, { onConflict: "account_id" });
  if (retry.error) return { ok: false, error: retry.error.message };
  return { ok: true, executionFieldsSaved: false };
}

/**
 * G14-S37: persist the rubric result next to the profile (read by the
 * dashboard nag + the dossier). Best-effort: a pending 0408 or a missing
 * row is swallowed — the score itself lives in the analysis JSON.
 */
export async function persistExecutionScore(accountId: string, score: number, computedAt: string = new Date().toISOString()): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return false;
  try {
    const { error } = await supabase
      .from("founder_profiles")
      .update({ execution_score: Math.max(0, Math.min(100, Math.round(score))), execution_computed_at: computedAt })
      .eq("account_id", accountId);
    return !error;
  } catch {
    return false;
  }
}
