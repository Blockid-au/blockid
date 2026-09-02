import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox, getProjectIdFromRequest } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PitchdeckAnalyzeClient } from "./pitchdeck-analyze-client";

export const metadata: Metadata = {
  title: "Pitchdeck coverage-gated analysis — BlockID",
  description:
    "Upload your pitchdeck, see which SVI dimensions the deck covers, and gate speculative analyses behind credit spend.",
};

export const dynamic = "force-dynamic";

export default async function PitchdeckAnalyzePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/pitchdeck-analyze");
  const [isSandbox, projectId] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectIdFromRequest(),
  ]);
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <PitchdeckAnalyzeClient projectId={projectId ?? ""} />
      </div>
    </WorkspaceLayout>
  );
}
