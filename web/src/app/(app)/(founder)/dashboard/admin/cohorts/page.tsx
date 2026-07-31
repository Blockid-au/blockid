import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Admin — Cohort Dashboard — BlockID",
};

export const dynamic = "force-dynamic";

interface CohortRow {
  label: string;
  count: number;
  avgSVI: number | null;
  topPerformer: string | null;
}

async function getCohortData(): Promise<CohortRow[] | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin()!;

  // Group users by startup_stage; fall back to cohort by join month
  const { data: users } = await supabase
    .from("app_users")
    .select("id, email, startup_stage, created_at");

  if (!users || users.length === 0) return [];

  // Fetch latest SVI per user from svi_analyses
  const { data: sviRows } = await supabase
    .from("svi_analyses")
    .select("email, total_score")
    .order("created_at", { ascending: false });

  // Build email → latest SVI map
  const sviMap = new Map<string, number>();
  for (const row of sviRows ?? []) {
    const email = row.email as string;
    if (!sviMap.has(email)) sviMap.set(email, row.total_score as number);
  }

  // Group by stage
  const byStage = new Map<string, { emails: string[]; svis: number[] }>();
  for (const u of users) {
    const stage = (u.startup_stage as string | null) ?? "Unknown";
    if (!byStage.has(stage)) byStage.set(stage, { emails: [], svis: [] });
    const group = byStage.get(stage)!;
    group.emails.push(u.email as string);
    const svi = sviMap.get(u.email as string);
    if (svi != null) group.svis.push(svi);
  }

  // If all are Unknown, group by join month instead
  const stageKeys = [...byStage.keys()].filter((k) => k !== "Unknown");
  if (stageKeys.length === 0) {
    byStage.clear();
    for (const u of users) {
      const month = (u.created_at as string).slice(0, 7); // YYYY-MM
      if (!byStage.has(month)) byStage.set(month, { emails: [], svis: [] });
      const group = byStage.get(month)!;
      group.emails.push(u.email as string);
      const svi = sviMap.get(u.email as string);
      if (svi != null) group.svis.push(svi);
    }
  }

  const cohorts: CohortRow[] = [];
  for (const [label, { emails, svis }] of byStage.entries()) {
    const avgSVI = svis.length > 0 ? svis.reduce((a, b) => a + b, 0) / svis.length : null;
    const maxSVI = svis.length > 0 ? Math.max(...svis) : -Infinity;
    const topPerformerEmail = svis.length > 0
      ? emails[svis.indexOf(maxSVI)] ?? null
      : null;
    cohorts.push({ label, count: emails.length, avgSVI, topPerformer: topPerformerEmail });
  }

  cohorts.sort((a, b) => b.count - a.count);
  return cohorts;
}

export default async function AdminCohortsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/cohorts");
  if (user.role !== "admin") redirect("/dashboard");

  const cohorts = await getCohortData();

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-ink-900">Cohort Dashboard</h1>
          <p className="text-sm text-ink-500 mt-1">
            Startup cohorts grouped by stage ·{" "}
            <a href="/dashboard/admin/usage" className="text-brand-600 hover:underline">← Usage</a>
          </p>
        </div>

        {cohorts === null ? (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-6 py-12 text-center text-ink-400">
            Supabase not configured.
          </div>
        ) : cohorts.length === 0 ? (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-6 py-12 text-center text-ink-400">
            No users found.
          </div>
        ) : (
          <div className="rounded-xl border border-surface-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
              <h2 className="text-sm font-semibold text-ink-700">{cohorts.length} cohorts · {cohorts.reduce((a, c) => a + c.count, 0)} total startups</h2>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-100 bg-surface-50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Cohort</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500"># Startups</th>
                  <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Avg SVI</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Top Performer</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-100">
                {cohorts.map((c) => (
                  <tr key={c.label} className="bg-white hover:bg-surface-50">
                    <td className="px-4 py-3 font-medium text-ink-800">{c.label}</td>
                    <td className="px-4 py-3 text-right text-ink-700 font-mono">{c.count}</td>
                    <td className="px-4 py-3 text-right">
                      {c.avgSVI != null ? (
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          c.avgSVI >= 150 ? "bg-emerald-50 text-emerald-700"
                            : c.avgSVI >= 100 ? "bg-amber-50 text-amber-700"
                            : "bg-red-50 text-red-700"
                        }`}>
                          {c.avgSVI.toFixed(0)}
                        </span>
                      ) : (
                        <span className="text-ink-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-ink-500 truncate max-w-[200px]">
                      {c.topPerformer ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
