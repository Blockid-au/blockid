import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getActiveProject,
  getCurrentProjectIsSandbox,
} from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ESIC_DISCLAIMER,
  type ESICInput,
  type ESICResult,
} from "@/lib/compliance/esic-eligibility";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EsicAssessmentClient } from "./esic-assessment-client";

export const metadata: Metadata = {
  title: "ESIC Self-Assessment | BlockID",
  description:
    "Walk the two-limb ESIC test under Div 360 ITAA97 and save a self-assessment to your data room.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadLatest(userId: string, projectId: string | null): Promise<{
  input: ESICInput | null;
  result: ESICResult | null;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { input: null, result: null };
  const { data } = await supabase
    .from("compliance_esic_assessments")
    .select("input_json, result_json")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { input: null, result: null };
  return {
    input: (data.input_json as ESICInput | null) ?? null,
    result: (data.result_json as ESICResult | null) ?? null,
  };
}

export default async function EsicAssessmentPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/esic-assessment");

  const isSandbox = await getCurrentProjectIsSandbox();
  const project = await getActiveProject(user.id);
  const { input, result } = await loadLatest(user.id, project?.id ?? null);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto">
        <EsicAssessmentClient
          initialInput={input}
          initialResult={result}
          disclaimer={ESIC_DISCLAIMER}
        />
      </div>
    </WorkspaceLayout>
  );
}
