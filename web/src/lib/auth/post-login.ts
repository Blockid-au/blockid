// Post-login destination — G13-W4-IA4 (spec §C.1 "auth `next` resolved
// through PERSONAS").
//
// Every auth surface that used to default to a literal "/dashboard" —
// magic-link verify, Google callback, password login, register-with-card —
// now asks this helper. The rule, in order:
//
//   1. an explicit, relative `next` wins (the caller's deep link);
//   2. a persona whose wizard flow is not "none" and who has not completed
//      onboarding → "/onboarding" (one wizard, two flows — §B.3);
//   3. otherwise `PERSONAS[persona].landingHref` (founder /dashboard,
//      evaluator /workspace/{investor,advisor,accelerator}, consoles).
//
// `PERSONA_LANDING=off` is the sprint's rollback: evaluators land on
// /dashboard again (the old behaviour), everything else unchanged.

import "server-only";
import { safeNextPath } from "@/lib/security/safe-redirect";
import { PERSONAS, isEvaluatorPersona, resolvePersona, type PersonaKey } from "@/lib/nav/persona";
import { loadPersonaRow } from "@/lib/nav/persona-server";

export const ONBOARDING_HREF = "/onboarding";

export function personaLandingEnabled(): boolean {
  return process.env.PERSONA_LANDING !== "off";
}

/**
 * Pure: the landing for a persona, honouring the rollback flag. An admin
 * signs in to the founder workspace (their sidebar is founder + Admin, the
 * console bridge sits in the topbar) — `/admin` stays a deliberate click,
 * as before S-IA4.
 */
export function landingHrefFor(persona: PersonaKey): string {
  if (persona === "admin") return PERSONAS.founder.landingHref;
  if (!personaLandingEnabled() && isEvaluatorPersona(persona)) return PERSONAS.founder.landingHref;
  return PERSONAS[persona].landingHref;
}

/** Only same-origin, path-relative targets are honoured — delegates to the one guard (`security/safe-redirect.ts`). */
export function isSafeNext(next: string | null | undefined): next is string {
  return typeof next === "string" && safeNextPath(next, "") === next.trim() && next.trim().length > 0;
}

export interface PostLoginInput {
  persona: PersonaKey;
  onboardingCompleted: boolean;
  next?: string | null;
}

/** Pure resolver — pinned by post-login.test.ts. */
export function resolvePostLoginHref({ persona, onboardingCompleted, next }: PostLoginInput): string {
  if (isSafeNext(next)) return next;
  if (PERSONAS[persona].onboardingFlow !== "none" && !onboardingCompleted) return ONBOARDING_HREF;
  return landingHrefFor(persona);
}

/** DB-backed: persona + onboarding flag for `user`, then the pure rule. */
export async function postLoginHref(
  user: { id: string; role?: string | null; email?: string | null },
  opts: { next?: string | null } = {},
): Promise<string> {
  const row = await loadPersonaRow(user.id);
  const persona = resolvePersona({ role: user.role ?? null, accountType: row.accountType, segment: row.segment });
  // An unreadable row (no DB, missing user) never sends someone into the
  // wizard on a guess — the landing page re-checks with `needsOnboarding()`.
  // W4 review P2: the flag alone bounced 103 existing founders (29 with
  // analyses) into the wizard on their next login — use the same rule as
  // `/dashboard` (analysis / evaluation counts, membership) here.
  let onboardingCompleted = row.loaded ? row.onboardingCompleted : true;
  if (row.loaded && !onboardingCompleted) {
    try {
      const { needsOnboarding } = await import("@/lib/onboarding/needs-onboarding");
      const { getSupabaseAdmin } = await import("@/lib/supabase");
      onboardingCompleted = !(await needsOnboarding({
        user: { id: user.id, email: user.email ?? "", onboardingCompleted: false },
        persona,
        onboardingCompleted: false,
        supabase: getSupabaseAdmin(),
      }));
    } catch {
      onboardingCompleted = true;
    }
  }
  return resolvePostLoginHref({ persona, onboardingCompleted, next: opts.next ?? null });
}
