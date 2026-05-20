import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  ArrowUpRight,
  BarChart3,
  Bot,
  CheckCircle2,
  Circle,
  CreditCard,
  Database,
  FileText,
  Globe,
  Layers,
  Lightbulb,
  Map,
  Rocket,
  Shield,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Product Roadmap — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ── Roadmap Data ─────────────────────────────────────────────────────────── */

interface RoadmapItem {
  label: string;
  done: boolean;
}

interface Phase {
  number: number;
  name: string;
  dateRange: string;
  status: "Completed" | "Current" | "Upcoming";
  items: RoadmapItem[];
}

const PHASES: Phase[] = [
  {
    number: 1,
    name: "Foundation",
    dateRange: "May 1-12, 2026",
    status: "Completed",
    items: [
      { label: "SVI v2 engine (8-dimension scoring)", done: true },
      { label: "Homepage redesign (Google-style hero)", done: true },
      { label: "Auth system (Google OAuth + magic link)", done: true },
      { label: "Supabase self-hosted (22 tables)", done: true },
      { label: "Docker + GitLab CI deployment", done: true },
      { label: "Email system (magic links + SMTP)", done: true },
    ],
  },
  {
    number: 2,
    name: "Monetization & AI",
    dateRange: "May 12-19, 2026",
    status: "Completed",
    items: [
      { label: "Stripe full lifecycle (checkout/cancel/reactivate)", done: true },
      { label: "Credit/usage system (trial + credits + subscription)", done: true },
      { label: "Founding 50 offer ($49 + payment link)", done: true },
      { label: "5 pricing tiers + credit packs", done: true },
      { label: "8 email templates (welcome, reports, billing)", done: true },
      { label: "Evidence Vault + Google Drive integration", done: true },
      { label: "10-page AI-powered SVI report", done: true },
      { label: "Workspace (billing, reports, roadmap, profile)", done: true },
      { label: "Admin panel + growth analytics + AI agents", done: true },
      { label: "Term Sheet AI analyzer", done: true },
      { label: "Competitive Research Agent (web search)", done: true },
      { label: "Growth Intelligence Agent (daily cron)", done: true },
      { label: "i18n EN/VI localization", done: true },
      { label: "62 unit + integration tests", done: true },
      { label: "Investor/partner sharing with tokens", done: true },
      { label: "SVI stage tracking + progression system", done: true },
      { label: "Idea Value Estimator (guided wizard)", done: true },
      { label: "Enterprise workspace with team management", done: true },
    ],
  },
  {
    number: 3,
    name: "Growth & Distribution",
    dateRange: "May-June 2026",
    status: "Current",
    items: [
      { label: "SEO landing pages for each tool", done: false },
      { label: "Referral program (invite-to-earn credits)", done: false },
      { label: "PDF export for SVI reports", done: false },
      { label: "Accelerator dashboard (multi-startup)", done: false },
      { label: "White-label for advisors/accountants", done: false },
      { label: "R&D Research Agent (auto feature proposals)", done: false },
    ],
  },
  {
    number: 4,
    name: "Scale & Compliance",
    dateRange: "July-Sep 2026",
    status: "Upcoming",
    items: [
      { label: "ASIC compliance checkers", done: false },
      { label: "Investor heat scoring & matching", done: false },
      { label: "API developer portal (B2B)", done: false },
      { label: "Multi-entity cap table management", done: false },
      { label: "Automated due diligence reports", done: false },
    ],
  },
  {
    number: 5,
    name: "Ecosystem & Marketplace",
    dateRange: "Q4 2026+",
    status: "Upcoming",
    items: [
      { label: "Investor marketplace (deal flow)", done: false },
      { label: "AI co-pilot for founders", done: false },
      { label: "Community forums + peer benchmarking", done: false },
      { label: "Blockchain anchoring (immutable records)", done: false },
      { label: "International expansion (NZ, SG, UK)", done: false },
    ],
  },
];

/* ── Achievement Stats ────────────────────────────────────────────────────── */

interface AchievementGroup {
  label: string;
  icon: typeof Bot;
  color: string;
  items: string[];
}

const ACHIEVEMENT_GROUPS: AchievementGroup[] = [
  {
    label: "Core Platform",
    icon: Layers,
    color: "text-brand-600",
    items: [
      "SVI v2 (8-dimension engine)",
      "Auth (OAuth + magic link)",
      "22-table Supabase schema",
      "Docker CI/CD pipeline",
      "i18n EN/VI",
      "Stage tracking system",
    ],
  },
  {
    label: "Payments & Billing",
    icon: CreditCard,
    color: "text-emerald-600",
    items: [
      "Stripe lifecycle",
      "5 pricing tiers",
      "Credit system",
      "Founding 50 offer",
      "Billing workspace",
    ],
  },
  {
    label: "AI Agents",
    icon: Bot,
    color: "text-purple-600",
    items: [
      "SVI Analysis Agent",
      "Term Sheet Agent",
      "Competitive Research",
      "Growth Intelligence",
      "SVI Report Agent",
      "Email Agent",
    ],
  },
  {
    label: "Workspace & Admin",
    icon: Users,
    color: "text-amber-600",
    items: [
      "Enterprise workspace",
      "Admin analytics",
      "Evidence Vault",
      "Reports dashboard",
      "Investor sharing",
      "Idea Estimator",
    ],
  },
];

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
          <h1 className="text-2xl font-bold text-ink-800 mb-2">
            Access Denied
          </h1>
          <Link
            href="/"
            className="text-brand-600 hover:text-brand-700 text-sm"
          >
            &larr; Back to home
          </Link>
        </div>
      </div>
    );
  }

  /* ── Live stats from DB ──────────────────────────────────────── */
  let liveStats = {
    totalUsers: 0,
    totalAnalyses: 0,
    totalLeads: 0,
    payingUsers: 0,
    totalNotifications: 0,
    totalAccounts: 0,
  };
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const [usersRes, analysesRes, leadsRes, paidRes, notifRes, accountsRes] =
      await Promise.all([
        supabase.from("app_users").select("id", { count: "exact", head: true }),
        supabase
          .from("svi_analyses")
          .select("id", { count: "exact", head: true }),
        supabase.from("leads").select("id", { count: "exact", head: true }),
        supabase
          .from("svi_accounts")
          .select("id", { count: "exact", head: true })
          .neq("plan", "free"),
        supabase
          .from("svi_notifications")
          .select("id", { count: "exact", head: true }),
        supabase
          .from("svi_accounts")
          .select("id", { count: "exact", head: true }),
      ]);

    liveStats = {
      totalUsers: usersRes.count ?? 0,
      totalAnalyses: analysesRes.count ?? 0,
      totalLeads: leadsRes.count ?? 0,
      payingUsers: paidRes.count ?? 0,
      totalNotifications: notifRes.count ?? 0,
      totalAccounts: accountsRes.count ?? 0,
    };
  }

  const totalDelivered = PHASES.filter(
    (p) => p.status === "Completed",
  ).flatMap((p) => p.items).length;

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
          <Link
            href="/admin"
            className="text-ink-600 hover:text-ink-800 transition-colors"
          >
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-blue-600 bg-blue-500/10 border border-blue-500/20 rounded px-2 py-0.5">
            ROADMAP
          </span>
        </div>
        <span className="text-xs text-ink-700">{todayStr}</span>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* ════════════════════════════════════════════════════════════
            HERO HEADER
           ════════════════════════════════════════════════════════════ */}
        <div className="text-center py-8">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl gradient-brand flex items-center justify-center shadow-lg">
              <Map strokeWidth={1.75} className="h-7 w-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900 tracking-tight">
            BlockID.au Product Roadmap
          </h1>
          <p className="text-sm md:text-base text-ink-600 mt-3 max-w-2xl mx-auto leading-relaxed">
            From idea to investable business — building the trust layer for
            private capital markets
          </p>
          <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Completed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse-dot" />
              Current
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface-300" />
              Upcoming
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            TIMELINE VISUALIZATION
           ════════════════════════════════════════════════════════════ */}
        <section>
          {/* Desktop horizontal timeline */}
          <div className="hidden lg:block">
            <div className="relative">
              {/* Timeline bar */}
              <div className="absolute top-6 left-0 right-0 h-1 bg-surface-200 rounded-full" />
              <div
                className="absolute top-6 left-0 h-1 bg-emerald-500 rounded-full transition-all"
                style={{
                  width: `${(PHASES.filter((p) => p.status === "Completed").length / PHASES.length) * 100}%`,
                }}
              />

              {/* Phase nodes */}
              <div className="relative grid grid-cols-5 gap-2">
                {PHASES.map((phase) => {
                  const isCompleted = phase.status === "Completed";
                  const isCurrent = phase.status === "Current";
                  return (
                    <div key={phase.number} className="flex flex-col items-center">
                      {/* Node */}
                      <div
                        className={`relative z-10 h-12 w-12 rounded-full flex items-center justify-center border-[3px] text-sm font-bold transition-all ${
                          isCompleted
                            ? "bg-emerald-500 border-emerald-500 text-white"
                            : isCurrent
                              ? "bg-white border-brand-500 text-brand-600 shadow-lg ring-4 ring-brand-100"
                              : "bg-white border-surface-300 text-ink-500"
                        }`}
                      >
                        {isCompleted ? (
                          <CheckCircle2
                            strokeWidth={2.5}
                            className="h-5 w-5"
                          />
                        ) : (
                          phase.number
                        )}
                        {isCurrent && (
                          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-brand-500 animate-pulse-dot" />
                        )}
                      </div>

                      {/* Label */}
                      <div className="mt-4 text-center">
                        <p className="text-xs font-bold text-ink-800">
                          {phase.name}
                        </p>
                        <p className="text-[10px] text-ink-500 mt-0.5">
                          {phase.dateRange}
                        </p>
                        <p className="text-[10px] text-ink-400 mt-1">
                          {phase.items.length} milestones
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile vertical timeline */}
          <div className="lg:hidden space-y-0">
            {PHASES.map((phase, idx) => {
              const isCompleted = phase.status === "Completed";
              const isCurrent = phase.status === "Current";
              return (
                <div key={phase.number} className="flex gap-4">
                  {/* Vertical line + node */}
                  <div className="flex flex-col items-center">
                    <div
                      className={`h-10 w-10 rounded-full flex items-center justify-center border-[3px] text-xs font-bold shrink-0 ${
                        isCompleted
                          ? "bg-emerald-500 border-emerald-500 text-white"
                          : isCurrent
                            ? "bg-white border-brand-500 text-brand-600 ring-4 ring-brand-100"
                            : "bg-white border-surface-300 text-ink-500"
                      }`}
                    >
                      {isCompleted ? (
                        <CheckCircle2 strokeWidth={2.5} className="h-4 w-4" />
                      ) : (
                        phase.number
                      )}
                    </div>
                    {idx < PHASES.length - 1 && (
                      <div
                        className={`w-0.5 flex-1 min-h-[24px] ${
                          isCompleted ? "bg-emerald-300" : "bg-surface-200"
                        }`}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="pb-6 pt-1 flex-1 min-w-0">
                    <p className="text-sm font-bold text-ink-800">
                      Phase {phase.number}: {phase.name}
                    </p>
                    <p className="text-[10px] text-ink-500">
                      {phase.dateRange} | {phase.items.length} milestones
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            COMPLETED ACHIEVEMENTS
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-2 flex items-center gap-2">
            <CheckCircle2
              strokeWidth={1.75}
              className="h-5 w-5 text-emerald-500"
            />
            Delivered So Far
          </h2>
          <p className="text-sm text-ink-600 mb-6">
            <span className="font-bold text-ink-800">{totalDelivered} features</span>{" "}
            shipped in Phases 1-2 — in 19 days.
          </p>

          {/* Key build metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
            {[
              { label: "TypeScript Files", value: "173+", icon: FileText },
              { label: "API Routes", value: "38", icon: Globe },
              { label: "Database Tables", value: "22", icon: Database },
              { label: "Test Coverage", value: "62 tests", icon: Target },
            ].map(({ label, value, icon: Icon }) => (
              <div
                key={label}
                className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 text-center"
              >
                <Icon
                  strokeWidth={1.75}
                  className="h-4 w-4 text-emerald-600 mx-auto mb-2"
                />
                <p className="text-lg font-bold font-mono text-ink-800">
                  {value}
                </p>
                <p className="text-[10px] text-ink-500 mt-0.5">{label}</p>
              </div>
            ))}
          </div>

          {/* Grouped achievements */}
          <div className="grid md:grid-cols-2 gap-4">
            {ACHIEVEMENT_GROUPS.map((group) => {
              const GroupIcon = group.icon;
              return (
                <div
                  key={group.label}
                  className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-center gap-2 mb-3">
                    <GroupIcon
                      strokeWidth={1.75}
                      className={`h-4 w-4 ${group.color}`}
                    />
                    <h3 className="text-xs font-bold text-ink-800 uppercase tracking-wider">
                      {group.label}
                    </h3>
                    <span className="ml-auto text-[10px] font-mono text-ink-400">
                      {group.items.length}
                    </span>
                  </div>
                  <ul className="space-y-1.5">
                    {group.items.map((item) => (
                      <li key={item} className="flex items-center gap-2">
                        <CheckCircle2
                          strokeWidth={2}
                          className="h-3 w-3 text-emerald-500 shrink-0"
                        />
                        <span className="text-[11px] text-ink-700">{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            CURRENT SPRINT
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-2 flex items-center gap-2">
            <Zap strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Current Sprint
            <span className="ml-2 h-2 w-2 rounded-full bg-brand-500 animate-pulse-dot" />
          </h2>
          <p className="text-sm text-ink-600 mb-4">
            Phase 3: Growth &amp; Distribution — what&apos;s being built now.
          </p>

          <div className="rounded-2xl border-2 border-brand-200 bg-brand-50/30 p-6 shadow-sm">
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
              {PHASES.find((p) => p.status === "Current")?.items.map((item) => (
                <div
                  key={item.label}
                  className="flex items-start gap-2 bg-white rounded-lg p-3 border border-surface-200"
                >
                  <Circle
                    strokeWidth={1.5}
                    className="h-4 w-4 text-brand-400 shrink-0 mt-0.5"
                  />
                  <span className="text-xs text-ink-700 leading-relaxed">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            UPCOMING PHASES
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Rocket strokeWidth={1.75} className="h-5 w-5 text-ink-500" />
            Upcoming Phases
          </h2>

          <div className="grid md:grid-cols-2 gap-4">
            {PHASES.filter((p) => p.status === "Upcoming").map((phase) => (
              <div
                key={phase.number}
                className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm"
              >
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="h-7 w-7 rounded-full bg-surface-200 flex items-center justify-center text-xs font-bold text-ink-600">
                        {phase.number}
                      </span>
                      <h3 className="text-sm font-bold text-ink-800">
                        {phase.name}
                      </h3>
                    </div>
                    <p className="text-[10px] text-ink-500 mt-1 ml-9">
                      {phase.dateRange}
                    </p>
                  </div>
                  <span className="text-[10px] font-medium rounded-full px-2.5 py-0.5 bg-surface-200 text-ink-500">
                    Upcoming
                  </span>
                </div>
                <ul className="space-y-2">
                  {phase.items.map((item) => (
                    <li key={item.label} className="flex items-start gap-2">
                      <Circle
                        strokeWidth={1.5}
                        className="h-3.5 w-3.5 text-ink-300 shrink-0 mt-0.5"
                      />
                      <span className="text-[11px] text-ink-600">
                        {item.label}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            BUSINESS METRICS DASHBOARD (Live from DB)
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <BarChart3 strokeWidth={1.75} className="h-5 w-5 text-teal-500" />
            Live Business Metrics
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              {
                label: "Total Users",
                value: liveStats.totalUsers,
                icon: Users,
                color: "text-brand-600",
                bg: "bg-brand-50",
              },
              {
                label: "SVI Analyses Run",
                value: liveStats.totalAnalyses,
                icon: Sparkles,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "Leads Captured",
                value: liveStats.totalLeads,
                icon: TrendingUp,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
              {
                label: "Paying Users",
                value: liveStats.payingUsers,
                icon: CreditCard,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "SVI Accounts",
                value: liveStats.totalAccounts,
                icon: FileText,
                color: "text-teal-600",
                bg: "bg-teal-50",
              },
              {
                label: "Notifications Sent",
                value: liveStats.totalNotifications,
                icon: Zap,
                color: "text-red-500",
                bg: "bg-red-50",
              },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <div
                key={label}
                className="rounded-2xl border border-surface-200 bg-white p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium">
                    {label}
                  </p>
                  <div
                    className={`h-8 w-8 rounded-lg ${bg} flex items-center justify-center`}
                  >
                    <Icon strokeWidth={1.75} className={`h-4 w-4 ${color}`} />
                  </div>
                </div>
                <p className="text-3xl font-bold font-mono text-ink-800">
                  {value.toLocaleString()}
                </p>
              </div>
            ))}
          </div>

          {/* Conversion funnel */}
          <div className="mt-4 rounded-2xl border border-surface-200 bg-white p-6 shadow-sm">
            <h3 className="text-xs font-bold text-ink-800 uppercase tracking-wider mb-4">
              Conversion Funnel
            </h3>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-0">
              {[
                {
                  label: "Leads",
                  value: liveStats.totalLeads,
                  width: "100%",
                },
                {
                  label: "Users",
                  value: liveStats.totalUsers,
                  width:
                    liveStats.totalLeads > 0
                      ? `${Math.max(30, (liveStats.totalUsers / liveStats.totalLeads) * 100)}%`
                      : "60%",
                },
                {
                  label: "Accounts",
                  value: liveStats.totalAccounts,
                  width:
                    liveStats.totalLeads > 0
                      ? `${Math.max(20, (liveStats.totalAccounts / liveStats.totalLeads) * 100)}%`
                      : "40%",
                },
                {
                  label: "Paying",
                  value: liveStats.payingUsers,
                  width:
                    liveStats.totalLeads > 0
                      ? `${Math.max(10, (liveStats.payingUsers / liveStats.totalLeads) * 100)}%`
                      : "20%",
                },
              ].map((step, i) => (
                <div key={step.label} className="flex items-center flex-1">
                  <div
                    className="rounded-lg px-4 py-3 text-center flex-1"
                    style={{
                      width: step.width,
                      background: `rgba(37, 99, 235, ${0.08 + i * 0.06})`,
                    }}
                  >
                    <p className="text-lg font-bold font-mono text-ink-800">
                      {step.value.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-ink-500">{step.label}</p>
                  </div>
                  {i < 3 && (
                    <ArrowUpRight
                      strokeWidth={2}
                      className="h-4 w-4 text-brand-400 mx-1 shrink-0 hidden sm:block rotate-45"
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            KPI TARGETS
           ════════════════════════════════════════════════════════════ */}
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
                    <th className="text-left px-6 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      Metric
                    </th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      Current
                    </th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      3-Month
                    </th>
                    <th className="text-right px-6 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      6-Month
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    {
                      metric: "Total Users",
                      current: liveStats.totalUsers.toLocaleString(),
                      three: "200",
                      six: "1,000",
                    },
                    {
                      metric: "Paying Users",
                      current: liveStats.payingUsers.toLocaleString(),
                      three: "50",
                      six: "200",
                    },
                    {
                      metric: "MRR",
                      current: "$0",
                      three: "$5K",
                      six: "$30K",
                    },
                    {
                      metric: "SVI Analyses/mo",
                      current: liveStats.totalAnalyses.toLocaleString(),
                      three: "500",
                      six: "3,000",
                    },
                  ].map((row) => (
                    <tr
                      key={row.metric}
                      className="border-b border-surface-200/50"
                    >
                      <td className="px-6 py-3 text-xs font-medium text-ink-800">
                        {row.metric}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-ink-600">
                        {row.current}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-brand-600 font-semibold">
                        {row.three}
                      </td>
                      <td className="px-6 py-3 text-right font-mono text-xs text-emerald-600 font-semibold">
                        {row.six}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            INVESTMENT THESIS
           ════════════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-8 shadow-sm">
          <h2 className="text-lg font-bold text-ink-900 mb-1 flex items-center gap-2">
            <Lightbulb strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Why BlockID
          </h2>
          <p className="text-xs text-ink-500 mb-6">
            The investment thesis in 60 seconds
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Left: Market + Problem */}
            <div className="space-y-5">
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-brand-600 font-bold mb-2">
                  Total Addressable Market
                </h3>
                <p className="text-2xl font-bold text-ink-800">
                  ~600,000{" "}
                  <span className="text-sm font-normal text-ink-600">
                    private companies in Australia
                  </span>
                </p>
                <p className="text-xs text-ink-500 mt-1">
                  $3.2B annual spend on corporate advisory + compliance
                </p>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-red-500 font-bold mb-2">
                  The Problem
                </h3>
                <p className="text-sm text-ink-700 leading-relaxed">
                  <span className="font-bold">70%</span> of startups have cap
                  table issues at Series A. Most founders cannot articulate
                  their valuation story. Investors waste 80+ hours on due
                  diligence per deal.
                </p>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-emerald-600 font-bold mb-2">
                  Our Solution
                </h3>
                <p className="text-sm text-ink-700 leading-relaxed">
                  AI-powered startup valuation intelligence + ownership
                  management platform. One place for founders to understand,
                  track, and communicate their equity story.
                </p>
              </div>
            </div>

            {/* Right: Traction + Model */}
            <div className="space-y-5">
              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-purple-600 font-bold mb-2">
                  Traction (Live)
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    {
                      label: "Users",
                      value: liveStats.totalUsers.toLocaleString(),
                    },
                    {
                      label: "Analyses",
                      value: liveStats.totalAnalyses.toLocaleString(),
                    },
                    {
                      label: "Leads",
                      value: liveStats.totalLeads.toLocaleString(),
                    },
                    {
                      label: "Paying",
                      value: liveStats.payingUsers.toLocaleString(),
                    },
                  ].map((s) => (
                    <div
                      key={s.label}
                      className="rounded-lg bg-white border border-surface-200 p-3 text-center"
                    >
                      <p className="text-lg font-bold font-mono text-ink-800">
                        {s.value}
                      </p>
                      <p className="text-[10px] text-ink-500">{s.label}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-amber-600 font-bold mb-2">
                  Business Model
                </h3>
                <p className="text-sm text-ink-700 leading-relaxed mb-2">
                  <span className="font-bold">SaaS + credit-based hybrid.</span>{" "}
                  Monthly subscriptions ($29-$499/mo) for ongoing access +
                  credit packs for pay-as-you-go users.
                </p>
                <div className="flex flex-wrap gap-2">
                  {["Free Trial", "$29 Starter", "$79 Growth", "$199 Pro", "$499 Enterprise"].map(
                    (tier) => (
                      <span
                        key={tier}
                        className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                      >
                        {tier}
                      </span>
                    ),
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-[10px] uppercase tracking-wider text-teal-600 font-bold mb-2">
                  Unfair Advantage
                </h3>
                <ul className="space-y-1">
                  {[
                    "8 AI agents running autonomously",
                    "19-day launch (full product)",
                    "AU-market-specific scoring algorithms",
                    "Solo founder = lean burn rate",
                  ].map((item) => (
                    <li
                      key={item}
                      className="flex items-center gap-2 text-xs text-ink-700"
                    >
                      <CheckCircle2
                        strokeWidth={2}
                        className="h-3 w-3 text-teal-500 shrink-0"
                      />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
