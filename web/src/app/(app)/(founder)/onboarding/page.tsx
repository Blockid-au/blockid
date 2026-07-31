import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import {
  OnboardingWizard,
  type OnboardingInitialParams,
} from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Start your 7-day trial — BlockID.au",
  description:
    "Segment, goal, plan, trial and payment — set up your BlockID.au workspace in under two minutes.",
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

export default async function OnboardingPage({
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
    if (data?.onboarding_completed) redirect("/dashboard/svi");
  }

  const initialParams: OnboardingInitialParams = {
    trial: first(sp.trial),
    plan: first(sp.plan),
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
