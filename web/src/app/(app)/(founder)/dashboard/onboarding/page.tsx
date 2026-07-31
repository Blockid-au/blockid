import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WelcomeWizard } from "@/components/onboarding/welcome-wizard";

export const metadata = { title: "Welcome to BlockID.au" };
export const dynamic = "force-dynamic";

export default async function DashboardOnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/onboarding");

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("onboarding_completed")
      .eq("email", user.email)
      .single();
    if (data?.onboarding_completed) redirect("/dashboard");
  }

  return <WelcomeWizard user={user} />;
}
