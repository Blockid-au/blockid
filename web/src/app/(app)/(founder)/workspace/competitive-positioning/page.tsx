import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { CompetitivePositioningClient } from "./competitive-positioning-client";

export const metadata: Metadata = {
  title: "Competitive Positioning | BlockID",
  description: "Build your competitive matrix and AI-generated positioning statement.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function Page() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/competitive-positioning");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <CompetitivePositioningClient />
    </WorkspaceLayout>
  );
}
