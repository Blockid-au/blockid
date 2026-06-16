import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { TeamClient } from "./team-client";

export const metadata: Metadata = {
  title: "Team & Salary Benchmarks · BlockID",
  description: "AU startup salary benchmarks 2026, Division 83A ESOP tax guide, and grant value calculator.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/team");

  return (
    <WorkspaceLayout user={user}>
      <TeamClient />
    </WorkspaceLayout>
  );
}
