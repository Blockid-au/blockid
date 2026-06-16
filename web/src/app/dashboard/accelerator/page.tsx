import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest } from "@/lib/projects";
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

  const supabase = getSupabaseAdmin();
  let currentSvi = 0;
  let stage = 0;
  let startupName = user.startupName ?? "Your Startup";
  const milestones: Array<{ id: string; title: string; completedAt: string }> = [];

  if (supabase) {
    const projectId = await getProjectIdFromRequest();

    // Fetch latest SVI
    const sviQuery = supabase
      .from("svi_accounts")
      .select("score, stage, startup_name, updated_at")
      .eq("account_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);

    if (projectId) {
      const { data } = await sviQuery.eq("project_id", projectId).maybeSingle();
      if (data) {
        currentSvi = (data.score as number) ?? 0;
        stage = (data.stage as number) ?? 0;
        startupName = (data.startup_name as string) ?? startupName;
      }
    } else {
      const { data } = await sviQuery.maybeSingle();
      if (data) {
        currentSvi = (data.score as number) ?? 0;
        stage = (data.stage as number) ?? 0;
        startupName = (data.startup_name as string) ?? startupName;
      }
    }

    // Fetch completed milestones from svi_milestones
    const { data: mData } = await supabase
      .from("svi_milestones")
      .select("id, milestone_label, achieved_at")
      .eq("account_id", user.id)
      .order("achieved_at", { ascending: false })
      .limit(10);

    if (mData) {
      for (const m of mData) {
        milestones.push({
          id: m.id as string,
          title: m.milestone_label as string,
          completedAt: m.achieved_at as string,
        });
      }
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <AcceleratorClient
        currentSvi={currentSvi}
        stage={stage}
        startupName={startupName}
        milestones={milestones}
      />
    </WorkspaceLayout>
  );
}
