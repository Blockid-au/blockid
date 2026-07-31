import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const metadata: Metadata = {
  title: "Admin — Usage Analytics — BlockID",
};

export const dynamic = "force-dynamic";

function fmt(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

async function getUsageStats() {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * 24 * 3600_000).toISOString();
  const d7 = new Date(now.getTime() - 7 * 24 * 3600_000).toISOString();

  const [
    { count: totalUsers },
    { count: activeUsers30d },
    { count: activeUsers7d },
    { count: totalAnalyses },
    { count: analyses30d },
    { count: paidUsers },
    { count: evidenceCount },
    { count: oauthCount },
  ] = await Promise.all([
    supabase.from("users").select("id", { count: "exact", head: true }),
    supabase.from("svi_analyses").select("email", { count: "exact", head: true }).gte("created_at", d30),
    supabase.from("svi_analyses").select("email", { count: "exact", head: true }).gte("created_at", d7),
    supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
    supabase.from("svi_analyses").select("id", { count: "exact", head: true }).gte("created_at", d30),
    supabase.from("users").select("id", { count: "exact", head: true }).neq("plan_id", "free").not("plan_id", "is", null),
    supabase.from("svi_evidence").select("id", { count: "exact", head: true }),
    supabase.from("oauth_connections").select("id", { count: "exact", head: true }),
  ]);

  // Daily analyses last 14 days
  const { data: dailyRaw } = await supabase
    .from("svi_analyses")
    .select("created_at")
    .gte("created_at", new Date(now.getTime() - 14 * 24 * 3600_000).toISOString())
    .order("created_at", { ascending: true });

  const dailyMap: Record<string, number> = {};
  for (const row of dailyRaw ?? []) {
    const day = (row.created_at as string).slice(0, 10);
    dailyMap[day] = (dailyMap[day] ?? 0) + 1;
  }

  // Last 14 days with zeros filled in
  const daily: Array<{ date: string; count: number }> = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(now.getTime() - i * 24 * 3600_000).toISOString().slice(0, 10);
    daily.push({ date: d, count: dailyMap[d] ?? 0 });
  }

  // Recent signups
  const { data: recentSignups } = await supabase
    .from("users")
    .select("email, plan_id, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  const conversionRate =
    totalUsers && totalUsers > 0 ? ((paidUsers ?? 0) / totalUsers) * 100 : 0;
  const analysesPerUser =
    totalUsers && totalUsers > 0 ? ((totalAnalyses ?? 0) / totalUsers).toFixed(1) : "0";

  return {
    totalUsers: totalUsers ?? 0,
    activeUsers30d: activeUsers30d ?? 0,
    activeUsers7d: activeUsers7d ?? 0,
    totalAnalyses: totalAnalyses ?? 0,
    analyses30d: analyses30d ?? 0,
    paidUsers: paidUsers ?? 0,
    evidenceCount: evidenceCount ?? 0,
    oauthCount: oauthCount ?? 0,
    conversionRate,
    analysesPerUser,
    daily,
    recentSignups: recentSignups ?? [],
  };
}

export default async function AdminUsagePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/admin/usage");
  if (user.role !== "admin") redirect("/dashboard");

  const stats = await getUsageStats();
  const generatedAt = new Date().toISOString();

  const metrics = stats
    ? [
        { label: "Total Users", value: fmt(stats.totalUsers), sub: `${stats.paidUsers} paid` },
        { label: "Active (30d)", value: fmt(stats.activeUsers30d), sub: "unique analysts" },
        { label: "Active (7d)", value: fmt(stats.activeUsers7d), sub: "this week" },
        { label: "Total Analyses", value: fmt(stats.totalAnalyses), sub: `${stats.analysesPerUser}/user avg` },
        { label: "Analyses (30d)", value: fmt(stats.analyses30d), sub: "last 30 days" },
        { label: "Conversion", value: `${stats.conversionRate.toFixed(1)}%`, sub: "free → paid" },
        { label: "Evidence Items", value: fmt(stats.evidenceCount), sub: "evidence vault" },
        { label: "OAuth Connections", value: fmt(stats.oauthCount), sub: "connected sources" },
      ]
    : [];

  const maxDaily = stats ? Math.max(...stats.daily.map((d) => d.count), 1) : 1;

  return (
    <WorkspaceLayout user={user}>
      <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-ink-900">Usage Analytics</h1>
            <p className="text-sm text-ink-500 mt-1">
              <span className="font-mono">{generatedAt.slice(0, 10)}</span> ·{" "}
              <a href="/dashboard/admin" className="text-brand-600 hover:underline">← Rate Limits</a>
            </p>
          </div>
        </div>

        {!stats ? (
          <div className="rounded-xl border border-surface-200 bg-surface-50 px-6 py-12 text-center text-ink-400">
            Supabase not configured.
          </div>
        ) : (
          <>
            {/* KPI grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-xl border border-surface-200 bg-white p-4">
                  <p className="text-xs text-ink-500 font-medium mb-1">{m.label}</p>
                  <p className="text-2xl font-bold text-ink-900">{m.value}</p>
                  <p className="text-xs text-ink-400 mt-0.5">{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Daily analyses chart (14d) */}
            <div className="rounded-xl border border-surface-200 bg-white p-6">
              <h2 className="text-sm font-semibold text-ink-700 mb-4">Daily Analyses — last 14 days</h2>
              <div className="flex items-end gap-1.5 h-32">
                {stats.daily.map((d) => {
                  const pct = (d.count / maxDaily) * 100;
                  return (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                      <div
                        className="w-full rounded-t bg-brand-400 group-hover:bg-brand-600 transition-colors"
                        style={{ height: `${Math.max(pct, 2)}%` }}
                      />
                      <span className="text-[9px] text-ink-400 rotate-45 origin-left whitespace-nowrap">
                        {d.date.slice(5)}
                      </span>
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-ink-600 opacity-0 group-hover:opacity-100 bg-white border border-surface-200 rounded px-1">
                        {d.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent signups */}
            <div className="rounded-xl border border-surface-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-surface-200 bg-surface-50">
                <h2 className="text-sm font-semibold text-ink-700">Recent Signups</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-100 bg-surface-50">
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Email</th>
                    <th className="px-4 py-2 text-left text-xs font-semibold text-ink-500">Plan</th>
                    <th className="px-4 py-2 text-right text-xs font-semibold text-ink-500">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100">
                  {stats.recentSignups.map((u, i) => (
                    <tr key={i} className="bg-white hover:bg-surface-50">
                      <td className="px-4 py-2.5 text-ink-700 font-mono text-xs truncate max-w-[240px]">
                        {u.email as string}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${
                          u.plan_id && u.plan_id !== "free"
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-surface-100 text-ink-500"
                        }`}>
                          {(u.plan_id as string) ?? "free"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right text-xs text-ink-400 font-mono">
                        {(u.created_at as string).slice(0, 10)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </WorkspaceLayout>
  );
}
