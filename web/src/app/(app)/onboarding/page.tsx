// /onboarding — the single wizard (G13-W4-IA4, spec §B.3). Lives under
// `(app)` (not `(founder)`) so evaluators reach it too. Three steps × two
// flows; the flow is decided by the persona picked in step 1 (preselected
// from `app_users.account_type` when signup already set it).
//
// An onboarded user who lands here with a pricing-card `?plan=` goes
// straight to Billing (S31-B) with the interval intact; without a plan
// they go to their persona landing — unless `?step=` asks for a specific
// step (the founder landing's "Complete profile → /onboarding?step=2").
//
// Rollback: `ONBOARDING_V4=off` mounts the legacy 6-step page for one deploy.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { landingHrefFor } from "@/lib/auth/post-login";
import { PERSONAS, resolvePersona } from "@/lib/nav/persona";
import { loadPersonaRow } from "@/lib/nav/persona-server";
import { isWizardPersona, type WizardPersona } from "@/lib/onboarding/flow";
import { signedInSignupRedirect } from "@/lib/plans/signed-in-upgrade";
import { NavV2 } from "@/components/landing/nav-v2";
import { Footer } from "@/components/marketing/footer";
import { OnboardingWizard, type OnboardingInitialParams } from "./onboarding-wizard";
import { LegacyOnboardingPage } from "./page.legacy";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Set up your desk — BlockID.au",
  description: "Who you are, your startup or mandate, and your first analysis — three steps, under two minutes.",
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function toQueryString(sp: SearchParams): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = first(value);
    if (v !== undefined) params.set(key, v);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Pure: where an already-onboarded visitor goes (pinned by page.test.tsx). */
export function onboardedRedirect(sp: { plan?: string; interval?: string; step?: string }, landing: string): string | null {
  if (sp.step) return null; // asked for a specific step — let them in
  if (sp.plan) return signedInSignupRedirect(sp.plan, sp.interval);
  return landing;
}

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (process.env.ONBOARDING_V4 === "off") return <LegacyOnboardingPage searchParams={searchParams} />;

  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/onboarding${toQueryString(sp)}`)}`);

  const row = await loadPersonaRow(user.id);
  const persona = resolvePersona({ role: user.role, accountType: row.accountType, segment: row.segment });
  const landing = landingHrefFor(persona);

  // Personas without a wizard flow (reseller / mentor / innovator / admin /
  // journalist) never see this page.
  if (PERSONAS[persona].onboardingFlow === "none") redirect(landing);

  const params = { plan: first(sp.plan), interval: first(sp.interval), step: first(sp.step) };
  if (row.loaded && row.onboardingCompleted) {
    const target = onboardedRedirect(params, landing);
    if (target) redirect(target);
  }

  const initialParams: OnboardingInitialParams = {
    ...params,
    trial: first(sp.trial),
    segment: first(sp.segment),
    persona: first(sp.persona),
    via: first(sp.via),
  };
  const defaultPersona: WizardPersona | null = isWizardPersona(persona) ? persona : null;

  return <OnboardingWizard user={user} initialParams={initialParams} defaultPersona={defaultPersona} nav={<NavV2 />} footer={<Footer />} />;
}
