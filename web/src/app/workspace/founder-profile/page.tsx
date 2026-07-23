import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { loadFounderProfile, EMPTY_PROFILE } from "@/lib/founder-profile";
import { FounderProfileClient } from "./founder-profile-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Founder Profile · BlockID",
  description: "Surface your ship history, domain insight, and team — the Antler Team-signal evidence investors look for first.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function FounderProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/founder-profile");

  const isSandbox = await getCurrentProjectIsSandbox();

  const profile = (await loadFounderProfile(user.id)) ?? EMPTY_PROFILE(user.id, user.email);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <FounderProfileClient initialProfile={profile} />
    </WorkspaceLayout>
  );
}
