import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getUserProjects } from "@/lib/projects";
import { OnboardingWizard } from "./onboarding-wizard";

export const metadata: Metadata = {
  title: "Onboarding",
  description: "Set up your startup project on BlockID. Create your first project and start tracking your Startup Value Index.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/onboarding");

  // If user already has projects, skip onboarding
  const projects = await getUserProjects(user.id);
  if (projects.length > 0) {
    redirect("/dashboard/svi");
  }

  return (
    <main className="min-h-svh bg-surface-50 text-ink-800 flex items-center justify-center px-6 py-16">
      <OnboardingWizard userEmail={user.email} />
    </main>
  );
}
