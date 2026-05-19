import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EvidenceVaultClient } from "@/components/svi/evidence-vault-client";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence");

  // Load evidence from DB
  let evidence: Record<string, unknown>[] = [];
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: account } = await supabase
      .from("svi_accounts")
      .select("id")
      .eq("email", user.email)
      .maybeSingle();

    if (account) {
      const { data: rows } = await supabase
        .from("svi_evidence")
        .select("*")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false });

      if (rows) {
        evidence = rows;
      }
    }
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        <EvidenceVaultClient initialEvidence={evidence as any} />
      </div>
    </WorkspaceLayout>
  );
}
