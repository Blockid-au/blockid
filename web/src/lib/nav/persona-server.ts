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
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { NavSeat } from "./founder-phase-shared";
import { PERSONAS, personaFor, type Persona, type PersonaKey, type PersonaSeatInput } from "./persona";

export interface PersonaRow {
  accountType: string | null;
  segment: string | null;
  onboardingCompleted: boolean;
  /** false when Supabase was unavailable or the row is missing — callers must not trap the user on a guess. */
  loaded: boolean;
}

/**
 * `app_users.{account_type, segment, onboarding_completed}` for one user id.
 *
 * G36 — per-request memo (React `cache`, the same pattern as `getCurrentUser`
 * and `hasCapTable`): the `(founder)` layout seeds the sidebar seat from this
 * row while its /dashboard redirect (`resolvePersonaForUser`) and the
 * dashboard / evaluator-hub pages read the same row in the same request — one
 * app_users read now serves all of them. Outside a render (route handlers)
 * `cache` is a pass-through, so the login resolver still reads fresh.
 */
export const loadPersonaRow = cache(loadPersonaRowUncached);

/** The uncached read behind `loadPersonaRow` (exported for tests). */
export async function loadPersonaRowUncached(userId: string | null | undefined): Promise<PersonaRow> {
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

/**
 * The sidebar seat the `(founder)` layout seeds (G36) — the SAME inputs, with
 * the SAME fallbacks, that `/api/entitlement/me` hands the client hook, so the
 * server-rendered persona never flips once the client snapshot lands:
 *
 *   plan     ← `getCurrentUser().plan` (a fresh `app_users.plan` read per
 *              request — not a session copy) `?? "free"`, exactly the route
 *   segment  ← `app_users.segment` `?? "founder"` (route `resolveProfile`)
 *   account  ← `app_users.account_type` `?? null`
 *
 * `null` when the row could not be read — the client then keeps the founder
 * default until the snapshot answers, as before the seed.
 */
export function navSeatFor(user: { plan?: string | null } | null | undefined, row: PersonaRow | null | undefined): NavSeat | null {
  if (!user || !row?.loaded) return null;
  return { accountType: row.accountType, segment: row.segment ?? "founder", plan: user.plan ?? "free" };
}

export async function getPersonaForUser(user: { id: string; role?: string | null; plan?: string | null } | null | undefined): Promise<Persona> {
  return PERSONAS[await resolvePersonaForUser(user)];
}
