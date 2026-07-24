import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  WGEA_DISCLAIMER,
  type WGEAInput,
  type WGEAResult,
} from "@/lib/compliance/wgea-threshold";
import { WgeaFormClient } from "./wgea-form-client";

export const metadata: Metadata = {
  title: "WGEA reporting threshold | BlockID",
  description:
    "Check whether your Australian headcount crosses the 100-employee Workplace Gender Equality Act 2012 (Cth) reporting threshold.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadLatest(
  userId: string,
  projectId: string | null,
): Promise<{ input: WGEAInput | null; result: WGEAResult | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { input: null, result: null };
  const { data } = await supabase
    .from("compliance_wgea_status")
    .select("input_json, result_json")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { input: null, result: null };
  return {
    input: (data.input_json as WGEAInput | null) ?? null,
    result: (data.result_json as WGEAResult | null) ?? null,
  };
}

export default async function WgeaCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/wgea");

  const project = await getActiveProject(user.id);
  const { input, result } = await loadLatest(user.id, project?.id ?? null);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6">
        <WgeaFormClient
          initialInput={input}
          initialResult={result}
          disclaimer={WGEA_DISCLAIMER}
        />
      </div>
    </div>
  );
}
