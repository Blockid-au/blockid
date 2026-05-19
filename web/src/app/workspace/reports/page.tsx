import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { BarChart3 } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/reports");
  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Weekly Reports</h1>
          <p className="text-sm text-slate-500 mt-1">Track your SVI progress week by week.</p>
        </div>
        <div className="rounded-2xl border border-dashed border-ink-600 bg-ink-900/50 px-6 py-16 text-center">
          <BarChart3 strokeWidth={1.25} className="mx-auto h-10 w-10 text-slate-600 mb-3" />
          <p className="text-slate-400 font-medium">Weekly Reports coming soon</p>
          <p className="text-slate-600 text-sm mt-1">Weekly SVI snapshots, wins, gaps, and growth summaries will appear here.</p>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
