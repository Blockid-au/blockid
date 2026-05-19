import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FileText, Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function EvidencePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/evidence");
  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-50">Evidence Vault</h1>
            <p className="text-sm text-slate-500 mt-1">Upload and manage your startup evidence to lift your SVI.</p>
          </div>
          <a href="/dashboard/svi" className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800 transition-colors">
            <Plus strokeWidth={1.75} className="h-4 w-4" />Add Evidence
          </a>
        </div>
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-16 text-center">
          <FileText strokeWidth={1.25} className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">Evidence Vault coming soon</p>
          <p className="text-slate-600 text-sm mt-1">Upload pitch decks, cap tables, revenue proofs, and more.</p>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
