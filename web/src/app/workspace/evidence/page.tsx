import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EvidenceVaultClient } from "@/components/svi/evidence-vault-client";
import { PageTracker } from "@/components/analytics/page-tracker";
import type { SVIEvidenceGap } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "Evidence Vault",
  description: "Upload and manage evidence to boost your Startup Value Index score on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence");

  let evidence: Record<string, unknown>[] = [];
  let evidenceGaps: SVIEvidenceGap[] = [];
  let currentSVI: number | null = null;

  const supabase = getSupabaseAdmin();
  if (supabase) {
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);

    if (accountId) {
      const { data: accountRow } = await supabase
        .from("svi_accounts")
        .select("id, current_svi")
        .eq("id", accountId)
        .single();

      if (accountRow) {
        currentSVI = accountRow.current_svi as number | null;

        // Load evidence items
        const { data: rows } = await supabase
          .from("svi_evidence")
          .select("*")
          .eq("account_id", accountRow.id)
          .order("created_at", { ascending: false });
        if (rows) evidence = rows;
      }
    }

    // Load latest SVI analysis to get evidence gaps (project-scoped)
    const projectId2 = await getProjectIdFromRequest();
    const analysisQuery = supabase
      .from("svi_analyses")
      .select("analysis_json")
      .eq("email", user.email);
    if (projectId2) analysisQuery.eq("project_id", projectId2);
    else analysisQuery.is("project_id", null);

    const { data: latestAnalysis } = await analysisQuery
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAnalysis?.analysis_json) {
      const analysis = latestAnalysis.analysis_json as Record<string, unknown>;
      if (Array.isArray(analysis.evidenceGaps)) {
        evidenceGaps = analysis.evidenceGaps as SVIEvidenceGap[];
      }
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <PageTracker page="evidence" />
      <div className="p-6 max-w-3xl mx-auto">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <EvidenceVaultClient
          initialEvidence={evidence as any}
          evidenceGaps={evidenceGaps}
          currentSVI={currentSVI}
        />
      </div>
    </WorkspaceLayout>
  );
}
