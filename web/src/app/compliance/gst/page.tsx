import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  GST_DISCLAIMER,
  type GSTInput,
  type GSTResult,
} from "@/lib/compliance/gst-threshold";
import { GstFormClient } from "./gst-form-client";

export const metadata: Metadata = {
  title: "GST registration threshold | BlockID",
  description:
    "Track whether your rolling 12-month turnover crosses the A$75,000 GST registration threshold set by the ATO.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadLatest(
  userId: string,
  projectId: string | null,
): Promise<{ input: GSTInput | null; result: GSTResult | null }> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { input: null, result: null };
  const { data } = await supabase
    .from("compliance_gst_status")
    .select("input_json, result_json")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { input: null, result: null };
  return {
    input: (data.input_json as GSTInput | null) ?? null,
    result: (data.result_json as GSTResult | null) ?? null,
  };
}

export default async function GstCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/gst");

  const project = await getActiveProject(user.id);
  const { input, result } = await loadLatest(user.id, project?.id ?? null);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6">
        <GstFormClient
          initialInput={input}
          initialResult={result}
          disclaimer={GST_DISCLAIMER}
        />
      </div>
    </div>
  );
}
