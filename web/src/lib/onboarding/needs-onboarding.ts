// needsOnboarding — the ONE gate that decides whether a signed-in user is
// sent into the single /onboarding wizard (G13-W4-IA4, spec §B.3).
//
// It replaces the inline check the founder landing carried
// (`dashboard/page.tsx`: `!user.onboardingCompleted` + zero `svi_analyses`
// + zero intake analyses) and is shared by /dashboard and the evaluator
// landings (/workspace/investor, /workspace/advisor, /workspace/accelerator).
//
// Per persona (`PERSONAS[persona].onboardingFlow`):
//
//   founder    → not completed AND no scored analysis (svi_analyses by email,
//                `analyses` by user id — an /analyze run counts, S31-B) AND
//                the caller is not a project MEMBER (S18-B P2-6: a member
//                invited into someone else's startup is never bounced).
//   evaluator  → not completed AND holds zero evaluations (an evaluator who
//                already added a startup has done the wizard's step 3).
//   none       → never (reseller / mentor / innovator / journalist / admin
//                run their own consoles).
//
// Pure decision in `decideOnboarding()`; `needsOnboarding()` does the reads.

import "server-only";
import { PERSONAS, type PersonaKey } from "@/lib/nav/persona";
import { countIntakeAnalysesForUser } from "@/lib/analyses/dashboard-bridge";

export interface OnboardingFacts {
  persona: PersonaKey;
  onboardingCompleted: boolean;
  /** Founder: scored analyses on record (svi_analyses + analyses). */
  analysisCount: number;
  /** Evaluator: evaluations held. */
  evaluationCount: number;
  /** Founder: caller is a member of someone else's project. */
  isMember: boolean;
}

/** Pure — pinned by needs-onboarding.test.ts. */
export function decideOnboarding(f: OnboardingFacts): boolean {
  const flow = PERSONAS[f.persona].onboardingFlow;
  if (flow === "none") return false;
  if (f.onboardingCompleted) return false;
  if (flow === "founder") return !f.isMember && f.analysisCount === 0;
  return f.evaluationCount === 0;
}

/** Minimal Supabase surface the reads use (typed loosely so tests can stub). */
export interface OnboardingDb {
  from(table: string): any; // eslint-disable-line @typescript-eslint/no-explicit-any
}

export interface NeedsOnboardingInput {
  user: { id: string; email: string; onboardingCompleted?: boolean | null };
  persona: PersonaKey;
  /** From `loadPersonaRow()` when the page already has it; falls back to `user.onboardingCompleted`. */
  onboardingCompleted?: boolean | null;
  isMember?: boolean;
  supabase: OnboardingDb | null | undefined;
}

async function countHead(db: OnboardingDb, table: string, col: string, value: string): Promise<number> {
  try {
    const { count } = await db.from(table).select("id", { count: "exact", head: true }).eq(col, value);
    return typeof count === "number" ? count : 0;
  } catch {
    return 0;
  }
}

/** Reads only what the persona's flow needs, then `decideOnboarding()`. Never throws. */
export async function needsOnboarding(input: NeedsOnboardingInput): Promise<boolean> {
  const { user, persona, supabase } = input;
  const flow = PERSONAS[persona].onboardingFlow;
  const onboardingCompleted = input.onboardingCompleted ?? user.onboardingCompleted ?? false;
  const isMember = input.isMember === true;
  if (flow === "none" || onboardingCompleted || (flow === "founder" && isMember)) {
    return decideOnboarding({ persona, onboardingCompleted, analysisCount: 0, evaluationCount: 0, isMember });
  }
  if (!supabase) return false; // no DB → never trap a user in the wizard
  if (flow === "founder") {
    const scored = await countHead(supabase, "svi_analyses", "email", user.email);
    const intake = scored > 0 ? 0 : await countIntakeAnalysesForUser(supabase as Parameters<typeof countIntakeAnalysesForUser>[0], user.id);
    return decideOnboarding({ persona, onboardingCompleted, analysisCount: scored + intake, evaluationCount: 0, isMember });
  }
  const evaluations = await countHead(supabase, "evaluations", "evaluator_user_id", user.id);
  return decideOnboarding({ persona, onboardingCompleted, analysisCount: 0, evaluationCount: evaluations, isMember });
}
