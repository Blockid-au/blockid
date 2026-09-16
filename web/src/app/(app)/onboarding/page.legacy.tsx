// LEGACY 6-step wizard (segment → goal → tier → trial → payment → first
// startup) — kept for ONE deploy behind `ONBOARDING_V4=off` (G13-W4-IA4
// rollback, spec §E). `page.tsx` mounts this when the flag is off; delete
// both legacy files once the 3-step wizard has shipped clean.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { signedInSignupRedirect } from "@/lib/plans/signed-in-upgrade";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  OnboardingWizard,
  type OnboardingInitialParams,
} from "./onboarding-wizard.legacy";

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

export async function LegacyOnboardingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;

  const user = await getCurrentUser();
  if (!user) {
    redirect(
      `/auth/login?next=${encodeURIComponent(`/onboarding${toQueryString(sp)}`)}`,
    );
  }

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("onboarding_completed")
      .eq("email", user.email)
      .single();
    // S31-B (2026-09-13): every /pricing "Start trial" card links here with
    // ?trial=1&plan=<id>. An already-onboarded user was bounced to
    // /workspace/score with no checkout and no message — the only in-app
    // upgrade path that did not work. Carry the plan through to Billing,
    // which starts the Stripe checkout for it.
    if (data?.onboarding_completed) redirect(signedInSignupRedirect(sp.plan, sp.interval));
  }

  const initialParams: OnboardingInitialParams = {
    trial: first(sp.trial),
    plan: first(sp.plan),
    interval: first(sp.interval),
    step: first(sp.step),
    segment: first(sp.segment),
    via: first(sp.via), // reseller attribution code (mirrors ?ref=); see § C.2, § U.6
  };

  return (
    <OnboardingWizard
      user={user}
      initialParams={initialParams}
      nav={<Navbar />}
      footer={<Footer />}
    />
  );
}
