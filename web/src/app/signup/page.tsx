// /signup — thin redirect shim to the passwordless magic-link login page.
// Homepage v2 CTAs (nav-v2, hero-v2, trial-strip) all deep-link to
// /signup?trial=…; forward to /auth/login with next=/onboarding so the
// trial flow resumes right after email verify.

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SignupRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const trial = typeof sp.trial === "string" ? sp.trial : "1";
  const plan = typeof sp.plan === "string" ? `&plan=${encodeURIComponent(sp.plan)}` : "";
  const segment = typeof sp.segment === "string" ? `&segment=${encodeURIComponent(sp.segment)}` : "";
  const nextPath = `/onboarding?trial=${encodeURIComponent(trial)}${plan}${segment}`;
  redirect(`/auth/login?next=${encodeURIComponent(nextPath)}`);
}
