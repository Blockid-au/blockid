import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  DollarSign,
  Flame,
  Lightbulb,
  Shield,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Growth Intelligence — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface GrowthInsight {
  insight_date: string;
  visitors_total: number;
  svi_started: number;
  svi_completed: number;
  signups: number;
  leads_captured: number;
  checkouts_started: number;
  checkouts_completed: number;
  evidence_uploaded: number;
  scores_shared: number;
  revenue_aud: number;
  paying_users: number;
  svi_start_rate: number;
  svi_complete_rate: number;
  signup_rate: number;
  checkout_rate: number;
  payment_rate: number;
  recommendations: Array<{
    priority: "critical" | "high" | "medium";
    title: string;
    detail: string;
    impact: string;
    action_type: string;
  }>;
  plan_distribution: Record<string, number>;
  biggest_drop_off: string | null;
  drop_off_rate: number;
}

const PRIORITY_STYLES = {
  critical: { bg: "bg-red-50 border-red-200", text: "text-red-700", badge: "bg-red-100 text-red-700", icon: AlertTriangle },
  high: { bg: "bg-amber-50 border-amber-200", text: "text-amber-700", badge: "bg-amber-100 text-amber-700", icon: Flame },
  medium: { bg: "bg-blue-50 border-blue-200", text: "text-blue-700", badge: "bg-blue-100 text-blue-700", icon: Lightbulb },
} as const;

const ACTION_TYPE_LABELS: Record<string, string> = {
  pricing: "Pricing",
  ux: "UX/Conversion",
  marketing: "Marketing",
  product: "Product",
  retention: "Retention",
};

export default async function GrowthPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/growth");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">← Back to home</Link>
        </div>
      </div>
    );
  }

  const supabase = getSupabaseAdmin();
  let today: GrowthInsight | null = null;
  let yesterday: GrowthInsight | null = null;
  let weekHistory: GrowthInsight[] = [];

  // Live metrics from DB
  let liveMetrics = { totalUsers: 0, totalAnalyses: 0, totalAccounts: 0, totalLeads: 0, payingUsers: 0 };

  if (supabase) {
    const { headers } = await import("next/headers");
    const h = await headers();
    const dateStr = h.get("date") ?? new Date().toUTCString();
    const reqTime = new Date(dateStr).getTime();
    const todayStr = new Date(reqTime).toISOString().split("T")[0];
    const yesterdayStr = new Date(reqTime - 86400000).toISOString().split("T")[0];
    const weekAgoStr = new Date(reqTime - 7 * 86400000).toISOString().split("T")[0];

    const [todayRes, yesterdayRes, weekRes, usersRes, analysesRes, accountsRes, leadsRes, paidRes] = await Promise.all([
      supabase.from("growth_insights").select("*").eq("insight_date", todayStr).single(),
      supabase.from("growth_insights").select("*").eq("insight_date", yesterdayStr).single(),
      supabase.from("growth_insights").select("*").gte("insight_date", weekAgoStr).order("insight_date", { ascending: true }),
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }).neq("plan", "free"),
    ]);

    today = (todayRes.data as GrowthInsight) ?? null;
    yesterday = (yesterdayRes.data as GrowthInsight) ?? null;
    weekHistory = ((weekRes.data ?? []) as GrowthInsight[]);

    liveMetrics = {
      totalUsers: usersRes.count ?? 0,
      totalAnalyses: analysesRes.count ?? 0,
      totalAccounts: accountsRes.count ?? 0,
      totalLeads: leadsRes.count ?? 0,
      payingUsers: paidRes.count ?? 0,
    };
  }

  // Parse recommendations
  let recommendations = today?.recommendations ?? [];
  if (typeof recommendations === "string") {
    try { recommendations = JSON.parse(recommendations); } catch { recommendations = []; }
  }

  const planDist = typeof today?.plan_distribution === "string"
    ? JSON.parse(today.plan_distribution)
    : (today?.plan_distribution ?? {});

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      {/* Header */}
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 rounded px-2 py-0.5">
            GROWTH
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-700">{new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</span>
          <RefreshButton />
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
            <BarChart3 strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            Growth Intelligence
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            AI-powered funnel analysis and revenue recommendations — updated daily.
          </p>
        </div>

        {/* Live Stats Bar */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard label="Total Users" value={liveMetrics.totalUsers} icon={Users} color="text-brand-600" />
          <StatCard label="SVI Analyses" value={liveMetrics.totalAnalyses} icon={Target} color="text-teal-500" />
          <StatCard label="SVI Accounts" value={liveMetrics.totalAccounts} icon={TrendingUp} color="text-emerald-500" />
          <StatCard label="Leads" value={liveMetrics.totalLeads} icon={Zap} color="text-amber-500" />
          <StatCard label="Paying Users" value={liveMetrics.payingUsers} icon={DollarSign} color="text-green-500" />
        </div>

        {/* AI Recommendations */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Lightbulb strokeWidth={1.75} className="h-5 w-5 text-gold-500" />
            AI Growth Recommendations
          </h2>

          {recommendations.length === 0 ? (
            <div className="rounded-2xl border border-surface-200 bg-white p-8 text-center">
              <p className="text-ink-600 text-sm mb-3">No insights yet. Run the daily cron to generate recommendations.</p>
              <code className="text-xs bg-surface-100 px-3 py-1.5 rounded font-mono text-ink-700">
                curl -H &quot;Authorization: Bearer $CRON_SECRET&quot; https://blockid.au/api/cron/growth-insights
              </code>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map((rec, i) => {
                const style = PRIORITY_STYLES[rec.priority] ?? PRIORITY_STYLES.medium;
                const Icon = style.icon;
                return (
                  <div key={i} className={`rounded-xl border ${style.bg} p-5`}>
                    <div className="flex items-start gap-3">
                      <Icon strokeWidth={1.75} className={`h-5 w-5 ${style.text} shrink-0 mt-0.5`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className={`text-sm font-semibold ${style.text}`}>{rec.title}</h3>
                          <span className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${style.badge}`}>
                            {rec.priority.toUpperCase()}
                          </span>
                          <span className="text-[10px] font-medium rounded px-1.5 py-0.5 bg-surface-100 text-ink-700">
                            {ACTION_TYPE_LABELS[rec.action_type] ?? rec.action_type}
                          </span>
                        </div>
                        <p className="text-sm text-ink-700 leading-relaxed">{rec.detail}</p>
                        <p className="text-xs text-ink-600 mt-2 flex items-center gap-1">
                          <TrendingUp strokeWidth={1.75} className="h-3 w-3" />
                          Expected impact: <span className="font-medium text-ink-800">{rec.impact}</span>
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Funnel Visualization */}
        {today && (
          <section>
            <h2 className="text-lg font-semibold text-ink-800 mb-4">Conversion Funnel (This Week)</h2>
            <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
              <div className="p-6">
                <FunnelStep label="Visitors / Users" count={today.visitors_total} rate={100} prev={yesterday?.visitors_total} isFirst />
                <FunnelStep label="SVI Started" count={today.svi_started} rate={today.svi_start_rate} prev={yesterday?.svi_started} />
                <FunnelStep label="Leads Captured" count={today.leads_captured} rate={today.visitors_total > 0 ? Math.round(today.leads_captured / today.visitors_total * 100) : 0} prev={yesterday?.leads_captured} />
                <FunnelStep label="Signups" count={today.signups} rate={today.signup_rate} prev={yesterday?.signups} />
                <FunnelStep label="Paying Users" count={today.paying_users} rate={today.payment_rate} prev={yesterday?.paying_users} />
              </div>
              {today.biggest_drop_off && (
                <div className="px-6 py-3 bg-red-50 border-t border-red-100 flex items-center gap-2">
                  <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-red-500 shrink-0" />
                  <p className="text-xs text-red-700">
                    Biggest drop-off: <strong>{today.biggest_drop_off}</strong> ({today.drop_off_rate}% lost)
                  </p>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Plan Distribution + Weekly Trend */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Plan Distribution */}
          <section className="rounded-2xl border border-surface-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-ink-800 mb-4">Plan Distribution</h2>
            {Object.keys(planDist).length === 0 ? (
              <p className="text-xs text-ink-600">No data yet</p>
            ) : (
              <div className="space-y-3">
                {Object.entries(planDist as Record<string, number>)
                  .sort(([, a], [, b]) => b - a)
                  .map(([plan, count]) => {
                    const total = Object.values(planDist as Record<string, number>).reduce((s: number, v: number) => s + v, 0);
                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                    return (
                      <div key={plan}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-medium text-ink-700 capitalize">{plan}</span>
                          <span className="text-ink-600">{count} ({pct}%)</span>
                        </div>
                        <div className="h-2 rounded-full bg-surface-200">
                          <div
                            className={`h-full rounded-full ${plan === "free" ? "bg-surface-400" : "bg-brand-500"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </section>

          {/* 7-Day Trend */}
          <section className="rounded-2xl border border-surface-200 bg-white p-6">
            <h2 className="text-sm font-semibold text-ink-800 mb-4">7-Day Activity Trend</h2>
            {weekHistory.length === 0 ? (
              <p className="text-xs text-ink-600">Run the daily cron for at least a few days to see trends.</p>
            ) : (
              <div className="space-y-2">
                {weekHistory.map((day) => (
                  <div key={day.insight_date} className="flex items-center gap-3 text-xs">
                    <span className="text-ink-600 w-20 shrink-0 font-mono">
                      {new Date(day.insight_date + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" })}
                    </span>
                    <div className="flex-1 flex items-center gap-2">
                      <div className="flex-1 h-4 bg-surface-100 rounded overflow-hidden flex">
                        <div className="bg-brand-400 h-full" style={{ width: `${Math.min(day.svi_started * 5, 100)}%` }} title={`SVI: ${day.svi_started}`} />
                        <div className="bg-emerald-400 h-full" style={{ width: `${Math.min(day.signups * 10, 50)}%` }} title={`Signups: ${day.signups}`} />
                        <div className="bg-gold-400 h-full" style={{ width: `${Math.min(day.leads_captured * 10, 30)}%` }} title={`Leads: ${day.leads_captured}`} />
                      </div>
                      <span className="text-ink-600 w-16 text-right">
                        {day.svi_started} SVI
                      </span>
                    </div>
                  </div>
                ))}
                <div className="flex items-center gap-3 text-[10px] text-ink-600 mt-2 pt-2 border-t border-surface-200">
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-brand-400" /> SVI</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-emerald-400" /> Signups</span>
                  <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-gold-400" /> Leads</span>
                </div>
              </div>
            )}
          </section>
        </div>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/admin" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Admin Dashboard</p>
              <p className="text-xs text-ink-600 mt-0.5">Users, accounts, analyses</p>
            </Link>
            <Link href="/admin/users" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Manage Users</p>
              <p className="text-xs text-ink-600 mt-0.5">Plans, roles, activity</p>
            </Link>
            <a href="https://analytics.google.com" target="_blank" rel="noopener" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">GA4 Dashboard</p>
              <p className="text-xs text-ink-600 mt-0.5">Real-time traffic & events</p>
            </a>
            <a href="https://tagmanager.google.com" target="_blank" rel="noopener" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">GTM Container</p>
              <p className="text-xs text-ink-600 mt-0.5">Tags, triggers, variables</p>
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Users; color: string }) {
  return (
    <div className="rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">{label}</p>
        <Icon strokeWidth={1.75} className={`h-3.5 w-3.5 ${color}`} />
      </div>
      <p className="text-2xl font-bold font-mono text-ink-800">{value.toLocaleString()}</p>
    </div>
  );
}

function FunnelStep({ label, count, rate, prev, isFirst }: { label: string; count: number; rate: number; prev?: number; isFirst?: boolean }) {
  const delta = prev !== undefined ? count - prev : null;
  return (
    <div className={`flex items-center gap-4 ${isFirst ? "" : "mt-3 pt-3 border-t border-surface-200/60"}`}>
      <div className="w-36 shrink-0">
        <p className="text-xs font-medium text-ink-700">{label}</p>
      </div>
      <div className="flex-1">
        <div className="h-6 bg-surface-100 rounded-lg overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-lg transition-all duration-500"
            style={{ width: `${Math.max(rate, 2)}%` }}
          />
        </div>
      </div>
      <div className="w-20 text-right">
        <span className="font-mono text-sm font-bold text-ink-800">{count}</span>
      </div>
      <div className="w-16 text-right">
        <span className="text-xs text-ink-600">{rate}%</span>
      </div>
      <div className="w-16 text-right">
        {delta !== null && delta !== 0 && (
          <span className={`text-xs flex items-center justify-end gap-0.5 ${delta > 0 ? "text-emerald-600" : "text-red-500"}`}>
            {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(delta)}
          </span>
        )}
      </div>
    </div>
  );
}

function RefreshButton() {
  return (
    <form action={`/api/cron/growth-insights`} method="get">
      <input type="hidden" name="manual" value="1" />
      <button
        type="button"
        onClick={() => {
          // Client-side fetch to refresh (avoids exposing CRON_SECRET)
          window.location.reload();
        }}
        className="text-xs text-brand-600 hover:text-brand-700 transition-colors font-medium"
      >
        Refresh
      </button>
    </form>
  );
}
