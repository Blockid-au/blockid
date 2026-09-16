// S-IA2 — ex /workspace/esic-assessment ("ESIC Self-Assessment"), now the
// "ESIC self-assessment" section of /workspace/documents/compliance. Async
// server component: loads the latest saved assessment for the active project
// and mounts the two-limb worksheet; the composed page authenticates once and
// passes `user` down.

import type { AppUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ESIC_DISCLAIMER,
  type ESICInput,
  type ESICResult,
} from "@/lib/compliance/esic-eligibility";
import { EsicAssessmentClient } from "./esic-assessment-client";

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

export async function EsicAssessmentSection({ user }: { user: AppUser }) {
  const project = await getActiveProject(user.id);
  const { input, result } = await loadLatest(user.id, project?.id ?? null);

  // <EsicAssessmentClient> renders the `#esic` h2 anchor in its own header.
  return (
    <section aria-labelledby="esic" data-testid="esic-assessment-section">
      <EsicAssessmentClient
        initialInput={input}
        initialResult={result}
        disclaimer={ESIC_DISCLAIMER}
      />
    </section>
  );
}
