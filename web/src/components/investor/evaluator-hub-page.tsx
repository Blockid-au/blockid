// Shared server page for the three evaluator hub roots — G13-W4-IA4.
//
// /workspace/investor, /workspace/advisor and /workspace/accelerator call
// `loadEvaluatorHub()`: auth → persona → onboarding gate (`needsOnboarding`,
// the same helper /dashboard uses) → the four landing loaders in one round
// → the landing element. Each page mounts `WorkspaceLayout` itself (the
// shell-coverage guard wants the import on the page). Hub tabs stay off for
// evaluators (workspace-layout gates them on persona, §A.2).
//
// A non-evaluator who types the URL (a founder on a plan without
// `investor.dealflow`) keeps the pre-S-IA4 behaviour: the FeatureGate
// upgrade CTA. Evaluators always see their landing — the quota block is
// where a lapsed plan is explained.

import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { PageTracker } from "@/components/analytics/page-tracker";
import { FeatureGate } from "@/components/access/FeatureGate";
import { getCurrentUser, type AppUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isEvaluatorPersona, PERSONAS, resolvePersona, type PersonaKey } from "@/lib/nav/persona";
import { loadPersonaRow } from "@/lib/nav/persona-server";
import { needsOnboarding } from "@/lib/onboarding/needs-onboarding";
import { loadInvestorLanding, type LandingPersona } from "@/lib/investors/landing-data";
import { InvestorLanding } from "./investor-landing";

export type EvaluatorHubRoute = "investor" | "advisor" | "accelerator";

/** The landing persona for a route given the signed-in persona (pure, pinned by the test). */
export function landingPersonaFor(route: EvaluatorHubRoute, userPersona: PersonaKey): LandingPersona {
  if (route === "advisor") return "advisor";
  if (route === "accelerator") return "accelerator";
  return userPersona === "investor_vc" ? "investor_vc" : "investor_angel";
}

const PAGE_NAME: Record<EvaluatorHubRoute, string> = {
  investor: "workspace-investor",
  advisor: "workspace-advisor",
  accelerator: "workspace-accelerator",
};

export interface EvaluatorHubSearchParams {
  onboarding?: string | string[];
}

export interface EvaluatorHub {
  user: AppUser;
  isSandbox: boolean;
  /** True for an evaluator persona (G21 P2-C: the accelerator page renders the BlockID Cohort journey only for them). */
  evaluator: boolean;
  /** Tracker + banner + landing — render inside the page's WorkspaceLayout. */
  content: ReactNode;
}

export async function loadEvaluatorHub({ route, searchParams, landingHeading = "h1" }: { route: EvaluatorHubRoute; searchParams?: Promise<EvaluatorHubSearchParams>; /** "h2" when the page renders its own h1 above the landing (G21 P2-C). */ landingHeading?: "h1" | "h2" }): Promise<EvaluatorHub> {
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/${route}`);
  const sp = (await searchParams) ?? {};

  const personaRow = await loadPersonaRow(user.id);
  const userPersona = resolvePersona({ role: user.role, accountType: personaRow.accountType, segment: personaRow.segment });
  const evaluator = isEvaluatorPersona(userPersona);

  if (evaluator && (await needsOnboarding({ user, persona: userPersona, onboardingCompleted: user.onboardingCompleted || personaRow.onboardingCompleted, supabase: getSupabaseAdmin() }))) {
    redirect("/onboarding");
  }

  const persona = landingPersonaFor(route, userPersona);
  const [data, isSandbox] = await Promise.all([loadInvestorLanding(user, persona), getCurrentProjectIsSandbox()]);
  const justOnboarded = (Array.isArray(sp.onboarding) ? sp.onboarding[0] : sp.onboarding) === "complete";

  const landing = (
    <>
      {justOnboarded ? (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <div className="flex items-start gap-3 rounded-xl border border-action/25 bg-action/5 p-4" data-landing-banner="onboarding">
            <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-action" aria-hidden="true" />
            <div>
              <p className="font-semibold text-primary">You&apos;re set up. This is your {PERSONAS[persona].label.toLowerCase()} desk.</p>
              <p className="mt-1 text-sm text-secondary">Add the startups you assess, keep your mandate current, and every Trusted Business Report you run lands here.</p>
            </div>
          </div>
        </div>
      ) : null}
      <InvestorLanding data={data} user={user} headingLevel={landingHeading} />
    </>
  );

  const content = (
    <>
      <PageTracker page={PAGE_NAME[route]} />
      {evaluator ? landing : <FeatureGate feature="investor.dealflow" label="Evaluator workspace">{landing}</FeatureGate>}
    </>
  );
  return { user, isSandbox, evaluator, content };
}
