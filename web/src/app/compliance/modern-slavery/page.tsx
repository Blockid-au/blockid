import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  MODERN_SLAVERY_DISCLAIMER,
  type ModernSlaveryInput,
  type ModernSlaveryResult,
} from "@/lib/compliance/modern-slavery-threshold";
import { ModernSlaveryFormClient } from "./modern-slavery-form-client";

export const metadata: Metadata = {
  title: "Modern Slavery threshold | BlockID",
  description:
    "Check whether your consolidated revenue crosses the A$100M Modern Slavery Act 2018 (Cth) reporting threshold.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

async function loadLatest(
  userId: string,
  projectId: string | null,
): Promise<{
  input: ModernSlaveryInput | null;
  result: ModernSlaveryResult | null;
}> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return { input: null, result: null };
  const { data } = await supabase
    .from("compliance_modern_slavery_status")
    .select("input_json, result_json")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return { input: null, result: null };
  return {
    input: (data.input_json as ModernSlaveryInput | null) ?? null,
    result: (data.result_json as ModernSlaveryResult | null) ?? null,
  };
}

export default async function ModernSlaveryCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/modern-slavery");

  const project = await getActiveProject(user.id);
  const { input, result } = await loadLatest(user.id, project?.id ?? null);

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-4xl p-6">
        <ModernSlaveryFormClient
          initialInput={input}
          initialResult={result}
          disclaimer={MODERN_SLAVERY_DISCLAIMER}
        />
      </div>
    </div>
  );
}
