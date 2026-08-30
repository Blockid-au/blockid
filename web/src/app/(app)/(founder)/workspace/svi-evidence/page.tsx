import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentProjectIsSandbox, getProjectIdFromRequest } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { SviEvidenceClient } from "./svi-evidence-client";

export const metadata: Metadata = {
  title: "SVI Evidence | BlockID",
  description: "Track per-dimension evidence completeness and get a prioritized fix roadmap to boost your Startup Value Index.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SviEvidencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/svi-evidence");
  const [isSandbox, projectId] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getProjectIdFromRequest(),
  ]);
  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-6xl mx-auto">
        <SviEvidenceClient projectId={projectId ?? ""} />
      </div>
    </WorkspaceLayout>
  );
}
