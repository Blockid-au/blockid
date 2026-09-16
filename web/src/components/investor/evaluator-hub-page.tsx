// Shared server page for the three evaluator hub roots — G13-W4-IA4.
//
// /workspace/investor, /workspace/advisor and /workspace/accelerator are
// thin wrappers around `EvaluatorHubPage`: auth → persona → onboarding
// gate (`needsOnboarding`, the same helper /dashboard uses) → the four
// landing loaders in one round → `<InvestorLanding>` inside the workspace
// shell. Hub tabs stay off for evaluators (workspace-layout gates them on
// persona, §A.2).
//
// A non-evaluator who types the URL (a founder on a plan without
// `investor.dealflow`) keeps the pre-S-IA4 behaviour: the FeatureGate
// upgrade CTA. Evaluators always see their landing — the quota block is
// where a lapsed plan is explained.

import { redirect } from "next/navigation";
import { Sparkles } from "lucide-react";
import { PageTracker } from "@/components/analytics/page-tracker";
import { FeatureGate } from "@/components/access/FeatureGate";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentUser } from "@/lib/auth";
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

export async function EvaluatorHubPage({ route, searchParams }: { route: EvaluatorHubRoute; searchParams?: Promise<EvaluatorHubSearchParams> }) {
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
      <InvestorLanding data={data} user={user} />
    </>
  );

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker page={PAGE_NAME[route]} />
      {evaluator ? landing : <FeatureGate feature="investor.dealflow" label="Evaluator workspace">{landing}</FeatureGate>}
    </WorkspaceLayout>
  );
}
