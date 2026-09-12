import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectScope, getCurrentProjectIsSandbox } from "@/lib/projects";
import { resolveSVIAccountIdForPage } from "@/lib/project-members/page-scope";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { AcceleratorClient } from "./accelerator-client";

export const metadata: Metadata = {
  title: "Accelerator Tracker · BlockID",
  description: "Track AU accelerator deadlines and your readiness for Antler, Startmate, YC, and more.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export interface AcceleratorPageProps {
  currentSvi: number;
  stage: number;
  startupName: string;
  milestones: Array<{ id: string; title: string; completedAt: string }>;
}

export default async function AcceleratorPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/accelerator");

  const isSandbox = await getCurrentProjectIsSandbox();

  const supabase = getSupabaseAdmin();
  let currentSvi = 0;
  let stage = 0;
  let startupName = user.startupName ?? "Your Startup";
  const milestones: Array<{ id: string; title: string; completedAt: string }> = [];

  if (supabase) {
    // S18-B review P2-5 — svi_accounts has no `account_id` / `score` /
    // `stage` columns (migrations 0008 + 0020: id, email, project_id,
    // current_svi, current_stage, startup_name) and svi_milestones.account_id
    // references svi_accounts.id — so the old `.eq("account_id", userId)`
    // read always came back empty. Resolve the project's account id (owner
    // find-or-creates, member reads the OWNER's row) and key both reads on it.
    const scope = await getProjectScope("viewer");
    const accountId = await resolveSVIAccountIdForPage(scope, user);

    if (accountId) {
      const { data } = await supabase
        .from("svi_accounts")
        .select("current_svi, current_stage, startup_name")
        .eq("id", accountId)
        .maybeSingle();
      if (data) {
        currentSvi = (data.current_svi as number) ?? 0;
        stage = (data.current_stage as number) ?? 0;
        startupName = (data.startup_name as string) ?? startupName;
      }

      // Completed milestone badges for this account
      const { data: mData } = await supabase
        .from("svi_milestones")
        .select("id, badge_label, achieved_at")
        .eq("account_id", accountId)
        .order("achieved_at", { ascending: false })
        .limit(10);

      if (mData) {
        for (const m of mData) {
          milestones.push({
            id: m.id as string,
            title: m.badge_label as string,
            completedAt: m.achieved_at as string,
          });
        }
      }
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <AcceleratorClient
        currentSvi={currentSvi}
        stage={stage}
        startupName={startupName}
        milestones={milestones}
      />
    </WorkspaceLayout>
  );
}
