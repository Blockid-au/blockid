// Persona resolution for server code — G13-W4-IA4 (spec §C.1, §C.3).
//
// `AppUser` (lib/auth.ts) does not carry `account_type` / `segment`, so every
// server surface that needs the persona (the /dashboard redirect, the
// evaluator landings, the post-login `next` resolver, the onboarding gate)
// reads the two columns once here and hands them to the pure
// `resolvePersona()` in ./persona.ts. One read, one resolver, no drift.
//
// Non-fatal: no Supabase / missing row / thrown error → founder (the same
// default `resolvePersona(null)` returns).

import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PERSONAS, personaFor, type Persona, type PersonaKey, type PersonaSeatInput } from "./persona";

export interface PersonaRow {
  accountType: string | null;
  segment: string | null;
  onboardingCompleted: boolean;
  /** false when Supabase was unavailable or the row is missing — callers must not trap the user on a guess. */
  loaded: boolean;
}

/** `app_users.{account_type, segment, onboarding_completed}` for one user id. */
export async function loadPersonaRow(userId: string | null | undefined): Promise<PersonaRow> {
  const empty: PersonaRow = { accountType: null, segment: null, onboardingCompleted: false, loaded: false };
  const supabase = getSupabaseAdmin();
  if (!supabase || !userId) return empty;
  try {
    const { data } = await supabase
      .from("app_users")
      .select("account_type, segment, onboarding_completed")
      .eq("id", userId)
      .maybeSingle();
    const row = data as { account_type?: string | null; segment?: string | null; onboarding_completed?: boolean | null } | null;
    return {
      loaded: row != null,
      accountType: typeof row?.account_type === "string" && row.account_type.length > 0 ? row.account_type : null,
      segment: typeof row?.segment === "string" && row.segment.length > 0 ? row.segment : null,
      onboardingCompleted: row?.onboarding_completed === true,
    };
  } catch {
    return empty;
  }
}

/**
 * Persona for a signed-in SEAT (`role` + `plan` from the session, columns
 * from the DB). G29-C: goes through `personaFor()`, so a founder-typed row on
 * an evaluator plan (Scout / Firm / Program / Cohort) lands on the evaluator
 * hub and never gets founder chrome — the same rule `isEvaluatorUser()`
 * applies to page gates. Callers that hand in an `AppUser` pass its plan.
 */
export async function resolvePersonaForUser(user: { id: string; role?: string | null; plan?: string | null } | null | undefined): Promise<PersonaKey> {
  if (!user) return "founder";
  if (user.role === "admin") return "admin";
  const row = await loadPersonaRow(user.id);
  return personaFor({ role: user.role ?? null, accountType: row.accountType, segment: row.segment, plan: user.plan ?? null } satisfies PersonaSeatInput);
}

export async function getPersonaForUser(user: { id: string; role?: string | null; plan?: string | null } | null | undefined): Promise<Persona> {
  return PERSONAS[await resolvePersonaForUser(user)];
}
