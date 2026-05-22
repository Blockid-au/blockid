import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { RoadmapSteps } from "@/components/workspace/roadmap-steps";

export const metadata: Metadata = {
  title: "Growth Roadmap",
  description: "Follow guided steps to grow your SVI score and attract investors on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function getCompletedSteps(email: string): Promise<number[]> {
  const sb = getSupabaseAdmin();
  if (!sb) return [];

  const completed: number[] = [];

  // Resolve active project
  const projectId = await getProjectIdFromRequest();

  // Step 1: Get SVI Baseline — at least 1 svi_analyses record (project-scoped)
  const countQuery = sb
    .from("svi_analyses")
    .select("id", { count: "exact", head: true })
    .eq("email", email);
  if (projectId) countQuery.eq("project_id", projectId);
  else countQuery.is("project_id", null);

  const { count: analysisCount } = await countQuery;
  if (analysisCount && analysisCount > 0) completed.push(1);

  // Find the user's svi_account (project-scoped)
  const accountId = await findOrCreateSVIAccount(email, projectId);

  if (accountId) {
    const { data: evidence } = await sb
      .from("svi_evidence")
      .select("evidence_type, label, dimension")
      .eq("account_id", accountId);

    if (evidence && evidence.length > 0) {
      for (const ev of evidence) {
        const label = (ev.label ?? "").toLowerCase();
        const type = ev.evidence_type as string;
        const dim = (ev.dimension ?? "").toLowerCase();

        // Step 2: Add Website URL
        if (type === "public_url") completed.push(2);

        // Step 3: Upload Pitch Deck
        if (
          type === "document_uploaded" &&
          (label.includes("pitch") || label.includes("deck"))
        )
          completed.push(3);

        // Step 4: Build Cap Table
        if (dim === "cgh") completed.push(4);

        // Step 5: Connect GitHub
        if (type === "connected_source" && label.includes("github"))
          completed.push(5);

        // Step 6: Connect Analytics
        if (type === "connected_source" && label.includes("analytics"))
          completed.push(6);

        // Step 7: Add Revenue Proof
        if (
          type === "connected_source" &&
          (label.includes("stripe") || label.includes("revenue"))
        )
          completed.push(7);
      }
    }
  }

  // Deduplicate in case multiple evidence rows satisfy the same step
  return Array.from(new Set(completed));
}

export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/roadmap");

  const completedSteps = await getCompletedSteps(user.email);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Growth Roadmap</h1>
          <p className="text-sm text-ink-700 mt-1">Complete these steps to grow your SVI score and attract investors.</p>
        </div>
        <RoadmapSteps completedSteps={completedSteps} />
      </div>
    </WorkspaceLayout>
  );
}
