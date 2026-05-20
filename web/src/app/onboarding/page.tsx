import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata = { title: "Welcome to BlockID.au" };

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/onboarding");

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("onboarding_completed")
      .eq("email", user.email)
      .single();
    if (data?.onboarding_completed) redirect("/dashboard/svi");
  }

  return <OnboardingWizard user={user} />;
}
