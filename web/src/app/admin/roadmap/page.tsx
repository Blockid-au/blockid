import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  CheckCircle2,
  Circle,
  Clock,
  Database,
  FileText,
  Map,
  Shield,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Product Roadmap — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ── Roadmap data ──────────────────────────────────────────────────────────── */

interface RoadmapItem {
  label: string;
  done: boolean;
}

interface Phase {
  number: number;
  name: string;
  dateRange: string;
  status: "Completed" | "In Progress" | "Planned";
  percent: number;
  items: RoadmapItem[];
}

const PHASES: Phase[] = [
  {
    number: 1,
    name: "Foundation",
    dateRange: "May 2026",
    status: "Completed",
    percent: 100,
    items: [
      { label: "SVI v2 engine (8 dimensions)", done: true },
      { label: "Homepage redesign (Google-style hero)", done: true },
      { label: "Auth (Google OAuth + magic link)", done: true },
      { label: "Supabase self-hosted (22 tables)", done: true },
      { label: "Docker + GitLab CI deployment", done: true },
      { label: "Email system (magic links)", done: true },
    ],
  },
  {
    number: 2,
    name: "Monetization",
    dateRange: "May 19, 2026",
    status: "Completed",
    percent: 100,
    items: [
      { label: "Stripe full lifecycle (checkout/cancel/reactivate)", done: true },
      { label: "Credit/usage system (trial + credits + subscription)", done: true },
      { label: "Founding 50 offer ($49 + payment link)", done: true },
      { label: "5 pricing tiers + credit packs", done: true },
      { label: "8 email templates", done: true },
      { label: "Evidence Vault + Google Drive", done: true },
      { label: "10-page SVI report", done: true },
      { label: "Workspace (billing, reports, roadmap, profile)", done: true },
      { label: "Admin panel + growth analytics", done: true },
      { label: "i18n EN/VI", done: true },
      { label: "62 unit tests", done: true },
    ],
  },
  {
    number: 3,
    name: "Growth",
    dateRange: "June\u2013July 2026",
    status: "Planned",
    percent: 0,
    items: [
      { label: "SEO landing pages for tools", done: false },
      { label: "Referral program", done: false },
      { label: "Accelerator dashboard", done: false },
      { label: "White-label for advisors", done: false },
      { label: "PDF export", done: false },
    ],
  },
  {
    number: 4,
    name: "Scale",
    dateRange: "Aug\u2013Oct 2026",
    status: "Planned",
    percent: 0,
    items: [
      { label: "Compliance checkers", done: false },
      { label: "Investor heat scoring", done: false },
      { label: "API developer portal", done: false },
      { label: "Multi-entity cap table", done: false },
    ],
  },
  {
    number: 5,
    name: "Ecosystem",
    dateRange: "Q4 2026+",
    status: "Planned",
    percent: 0,
    items: [
      { label: "Investor marketplace", done: false },
      { label: "AI co-pilot", done: false },
      { label: "Community", done: false },
      { label: "Blockchain anchoring", done: false },
    ],
  },
];

const KPI_ROWS = [
  { metric: "Users", current: "0", threeMonth: "200", sixMonth: "1,000" },
  { metric: "Paying", current: "0", threeMonth: "50", sixMonth: "200" },
  { metric: "MRR", current: "$0", threeMonth: "$5K", sixMonth: "$30K" },
];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
  "In Progress": { bg: "bg-amber-100", text: "text-amber-700" },
  Planned: { bg: "bg-surface-200", text: "text-ink-600" },
};

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/roadmap");

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  /* Live stats from DB */
  let liveStats = { totalUsers: 0, totalAnalyses: 0, totalLeads: 0, payingUsers: 0 };
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const [usersRes, analysesRes, leadsRes, paidRes] = await Promise.all([
      supabase.from("app_users").select("id", { count: "exact", head: true }),
      supabase.from("svi_analyses").select("id", { count: "exact", head: true }),
      supabase.from("leads").select("id", { count: "exact", head: true }),
      supabase.from("svi_accounts").select("id", { count: "exact", head: true }).neq("plan", "free"),
    ]);

    liveStats = {
      totalUsers: usersRes.count ?? 0,
      totalAnalyses: analysesRes.count ?? 0,
      totalLeads: leadsRes.count ?? 0,
      payingUsers: paidRes.count ?? 0,
    };
  }

  const todayStr = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      {/* Header */}
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-blue-600 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5">
            ROADMAP
          </span>
        </div>
        <span className="text-xs text-ink-700">{todayStr}</span>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
            <Map strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            Product Roadmap
          </h1>
          <p className="text-sm text-ink-700 mt-1">{todayStr}</p>
        </div>

        {/* Phase Timeline */}
        <section className="space-y-6">
          {PHASES.map((phase) => {
            const style = STATUS_STYLES[phase.status] ?? STATUS_STYLES.Planned;
            return (
              <div
                key={phase.number}
                className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden"
              >
                {/* Phase header */}
                <div className="px-6 py-4 border-b border-surface-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center justify-center h-7 w-7 rounded-full bg-brand-600 text-white text-xs font-bold">
                      {phase.number}
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold text-ink-800">
                        Phase {phase.number}: {phase.name}
                      </h2>
                      <p className="text-xs text-ink-600">{phase.dateRange}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-medium rounded px-2 py-0.5 ${style.bg} ${style.text}`}>
                      {phase.status}
                    </span>
                    <span className="text-xs font-mono font-bold text-ink-700">{phase.percent}%</span>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="px-6 pt-4">
                  <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        phase.percent === 100
                          ? "bg-emerald-500"
                          : phase.percent > 0
                            ? "bg-brand-500"
                            : "bg-surface-300"
                      }`}
                      style={{ width: `${Math.max(phase.percent, 0)}%` }}
                    />
                  </div>
                </div>

                {/* Items */}
                <div className="px-6 py-4 grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
                  {phase.items.map((item) => (
                    <div key={item.label} className="flex items-start gap-2 py-1">
                      {item.done ? (
                        <CheckCircle2 strokeWidth={2} className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                      ) : (
                        <Circle strokeWidth={1.5} className="h-4 w-4 text-ink-400 shrink-0 mt-0.5" />
                      )}
                      <span className={`text-xs leading-relaxed ${item.done ? "text-ink-700 line-through decoration-ink-400/40" : "text-ink-800"}`}>
                        {item.label}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>

        {/* KPI Targets */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Target strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            KPI Targets
          </h2>
          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-100">
                    <th className="text-left px-6 py-3 text-xs text-ink-700 font-medium">Metric</th>
                    <th className="text-right px-6 py-3 text-xs text-ink-700 font-medium">Current</th>
                    <th className="text-right px-6 py-3 text-xs text-ink-700 font-medium">3-Month Target</th>
                    <th className="text-right px-6 py-3 text-xs text-ink-700 font-medium">6-Month Target</th>
                  </tr>
                </thead>
                <tbody>
                  {KPI_ROWS.map((row) => (
                    <tr key={row.metric} className="border-b border-surface-200/50">
                      <td className="px-6 py-3 text-ink-800 font-medium text-xs">{row.metric}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-ink-600">{row.current}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-brand-600 font-semibold">{row.threeMonth}</td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-emerald-600 font-semibold">{row.sixMonth}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Live DB Stats */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Database strokeWidth={1.75} className="h-5 w-5 text-teal-500" />
            Live Database Stats
          </h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: "Total Users", value: liveStats.totalUsers, icon: Users, color: "text-brand-600" },
              { label: "SVI Analyses", value: liveStats.totalAnalyses, icon: FileText, color: "text-teal-500" },
              { label: "Leads", value: liveStats.totalLeads, icon: TrendingUp, color: "text-amber-500" },
              { label: "Paying Users", value: liveStats.payingUsers, icon: Clock, color: "text-emerald-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="rounded-xl border border-surface-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-ink-600 font-medium">{label}</p>
                  <Icon strokeWidth={1.75} className={`h-3.5 w-3.5 ${color}`} />
                </div>
                <p className="text-2xl font-bold font-mono text-ink-800">{value.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
