// Wave 26C — /workspace/svi-trend: historical SVI trend dashboard.
//
// Renders the last 12 snapshots for the current project as a hero + line
// chart + 8 dim sparklines + delta table. Pure server-authed shell; the
// interactive client component does the fetch and rendering.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox, getProjectIdFromRequest } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { SviTrendClient } from "./svi-trend-client";

export const metadata: Metadata = {
  title: "SVI Trend | BlockID",
  description: "Historical trend of your Startup Value Index across the last 12 snapshots.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SviTrendPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/svi-trend");
  const isSandbox = await getCurrentProjectIsSandbox();
  const projectId = await getProjectIdFromRequest();
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <SviTrendClient projectId={projectId ?? "default"} />
    </WorkspaceLayout>
  );
}
