// Mentor founder console shell. RSC.
//
// Verifies attribution + consent tier server-side before rendering any
// tab. Missing attribution => notFound() (avoids leaking a partial view).

import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  heatFromDays,
  phaseFromSviScore,
  recommendForFounder,
} from "@/lib/mentor/journey-stages";
import MentorHeader from "@/components/mentor/mentor-header";
import MentorTabs from "@/components/mentor/mentor-tabs";

export const dynamic = "force-dynamic";

export default async function MentorFounderLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ founderId: string }>;
}) {
  const { founderId } = await params;
  const user = await getCurrentUser();
  if (!user) return <p className="text-sm text-red-600">Not signed in.</p>;

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) notFound();
    throw err;
  }

  const allowed = await scope.allowedCustomerIds();
  if (!allowed.includes(founderId)) notFound();

  const db = resellerSupabase(scope);
  const [customers, sviRaw, consent, days] = await Promise.all([
    db.attributedCustomers(),
    db.portfolioSviRaw(),
    db.mentorConsent(founderId),
    db.mentorActivityDays([founderId]),
  ]);
  const founder = customers.find((c) => c.user_id === founderId);
  if (!founder) notFound();

  const scores = sviRaw
    .filter((r) => r.project_id === founderId && typeof r.score === "number")
    .slice(-6)
    .map((r) => r.score as number);
  const latestScore = scores.length > 0 ? scores[scores.length - 1] : null;
  const phase = phaseFromSviScore(latestScore);
  const d = days.get(founderId) ?? null;
  const heat = heatFromDays(d);
  const rec = recommendForFounder(phase, heat, d);

  return (
    <div className="rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900">
      <MentorHeader
        founderId={founderId}
        displayName={founder.display_name}
        startup={null}
        phase={phase}
        heat={heat}
        consentTier={consent?.tier ?? null}
        sparkline={scores}
        nextStep={rec.suggestedNextStep}
      />
      <MentorTabs founderId={founderId} />
      <div className="p-4">{children}</div>
    </div>
  );
}
