import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  Calendar,
  Clock,
  Cpu,
  DollarSign,
  FileSearch,
  Globe,
  Lightbulb,
  Mail,
  RefreshCw,
  Rocket,
  ScrollText,
  Shield,
  Sparkles,
  TrendingUp,
  UserCircle,
  Users,
  Wrench,
  Zap,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Team & AI Agents — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ── Data ──────────────────────────────────────────────────────────────────── */

interface AIAgent {
  name: string;
  shortName: string;
  description: string;
  model: string;
  cost: string;
  status: "Active" | "Planned";
  statusDetail?: string;
  icon: typeof Bot;
}

interface Department {
  name: string;
  color: string;
  bgColor: string;
  borderColor: string;
  iconBg: string;
  icon: typeof Bot;
  agents: AIAgent[];
}

const DEPARTMENTS: Department[] = [
  {
    name: "Product & Tech",
    color: "text-brand-600",
    bgColor: "bg-brand-50",
    borderColor: "border-brand-200",
    iconBg: "bg-brand-100",
    icon: Cpu,
    agents: [
      {
        name: "SVI Analysis Agent",
        shortName: "SVI Agent",
        description:
          "Analyzes startup descriptions, extracts signals, computes 8-dimension score",
        model: "Claude Haiku 4.5",
        cost: "~$0.003/req",
        status: "Active",
        icon: BrainCircuit,
      },
      {
        name: "Term Sheet AI Agent",
        shortName: "Term Sheet Agent",
        description:
          "Analyzes term sheets, AU market comparison, dilution modeling",
        model: "Claude Sonnet 4.6",
        cost: "~$0.10/req",
        status: "Active",
        icon: ScrollText,
      },
      {
        name: "Competitive Research Agent",
        shortName: "Comp Research Agent",
        description: "Web search + market/competitive scoring",
        model: "Claude Haiku 4.5",
        cost: "~$0.01/req",
        status: "Active",
        icon: Globe,
      },
      {
        name: "SVI Report Agent",
        shortName: "SVI Report Agent",
        description: "Generates 10-page AI-powered SVI report",
        model: "Claude Haiku 4.5",
        cost: "~$0.003/req",
        status: "Active",
        icon: FileSearch,
      },
    ],
  },
  {
    name: "Growth",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-200",
    iconBg: "bg-emerald-100",
    icon: TrendingUp,
    agents: [
      {
        name: "Growth Intelligence Agent",
        shortName: "Growth Intel Agent",
        description: "Daily cron, analyzes user behavior + funnel metrics",
        model: "Claude Haiku 4.5",
        cost: "~$0.002/day",
        status: "Active",
        statusDetail: "daily cron",
        icon: TrendingUp,
      },
      {
        name: "R&D Research Agent",
        shortName: "R&D Agent",
        description:
          "Market research, feature proposals, pricing optimization",
        model: "TBD",
        cost: "TBD",
        status: "Planned",
        statusDetail: "Phase 3",
        icon: Wrench,
      },
    ],
  },
  {
    name: "Operations",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-200",
    iconBg: "bg-amber-100",
    icon: Zap,
    agents: [
      {
        name: "Email Notification Agent",
        shortName: "Email Agent",
        description:
          "Welcome, weekly reports, payment confirmations. 8 templates via Gmail SMTP.",
        model: "Gmail SMTP",
        cost: "N/A",
        status: "Active",
        statusDetail: "daily cron",
        icon: Mail,
      },
      {
        name: "Cron Scheduler Agent",
        shortName: "Cron Agent",
        description:
          "Orchestrates scheduled tasks: snapshots, notifications, growth insights",
        model: "Vercel Cron",
        cost: "N/A",
        status: "Active",
        statusDetail: "3 jobs",
        icon: Clock,
      },
    ],
  },
];

const ALL_AGENTS = DEPARTMENTS.flatMap((d) => d.agents);

/* ── Workflow steps ───────────────────────────────────────────────────────── */

interface WorkflowStep {
  label: string;
  description: string;
  icon: typeof Bot;
  color: string;
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    label: "R&D Agent Research",
    description: "Scan market trends, competitors, and user requests",
    icon: Lightbulb,
    color: "text-purple-600",
  },
  {
    label: "Feature Development",
    description: "Build and test new capabilities using AI-assisted coding",
    icon: Wrench,
    color: "text-brand-600",
  },
  {
    label: "Deploy & Release",
    description: "CI/CD pipeline, Docker build, production deploy",
    icon: Rocket,
    color: "text-emerald-600",
  },
  {
    label: "Customer Usage Data",
    description: "Track user interactions, conversion events, feedback",
    icon: BarChart3,
    color: "text-teal-600",
  },
  {
    label: "Growth Intelligence",
    description: "Analyze funnel, retention, engagement patterns daily",
    icon: TrendingUp,
    color: "text-amber-600",
  },
  {
    label: "Analyze & Optimize",
    description: "Generate insights, prioritize backlog, optimize CTAs",
    icon: RefreshCw,
    color: "text-red-500",
  },
];

/* ── Page ──────────────────────────────────────────────────────────────────── */

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/team");

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

  /* Live email count from DB */
  let emailsSent = 0;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { count } = await supabase
      .from("svi_notifications")
      .select("id", { count: "exact", head: true });
    emailsSent = count ?? 0;
  }

  const activeAgents = ALL_AGENTS.filter((a) => a.status === "Active").length;
  const plannedAgents = ALL_AGENTS.filter((a) => a.status === "Planned").length;

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
          <span className="text-xs font-medium text-purple-600 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
            TEAM
          </span>
        </div>
        <span className="text-xs text-ink-700">{user.email}</span>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* ── Hero Title ──────────────────────────────────────────── */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-ink-800 flex items-center justify-center gap-3">
            <Users strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
            Team &amp; AI Agent Ecosystem
          </h1>
          <p className="text-sm text-ink-600 mt-2 max-w-xl mx-auto">
            One founder, eight AI agents — building the trust layer for private
            capital markets.
          </p>
        </div>

        {/* ════════════════════════════════════════════════════════════
            SECTION 1: TEAM HIERARCHY ORG CHART
           ════════════════════════════════════════════════════════════ */}
        <section className="space-y-0">
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Organisation Hierarchy
          </h2>

          {/* ── Row 1: Founder ──────────────────────────────────────── */}
          <div className="flex justify-center">
            <div className="rounded-2xl border-2 border-brand-300 bg-white p-6 shadow-md w-full max-w-sm text-center">
              <div className="mx-auto h-16 w-16 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-2xl mb-3">
                A
              </div>
              <h3 className="text-lg font-bold text-ink-800">Admin</h3>
              <p className="text-xs font-mono text-ink-500 mt-0.5">
                admin@blockid.au
              </p>
              <span className="inline-block mt-2 text-[10px] font-semibold rounded-full px-3 py-1 bg-brand-100 text-brand-700 uppercase tracking-wider">
                CEO / Founder
              </span>
            </div>
          </div>

          {/* ── Connector line: Founder -> Departments ──────────────── */}
          <div className="flex justify-center">
            <div className="w-px h-8 bg-surface-300" />
          </div>
          <div className="flex justify-center">
            <div className="w-2/3 max-w-2xl h-px bg-surface-300 relative">
              {/* three ticks down */}
              <div className="absolute left-0 top-0 w-px h-4 bg-surface-300" />
              <div className="absolute left-1/2 -translate-x-px top-0 w-px h-4 bg-surface-300" />
              <div className="absolute right-0 top-0 w-px h-4 bg-surface-300" />
            </div>
          </div>

          {/* ── Row 2: Departments ──────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4">
            {DEPARTMENTS.map((dept) => {
              const DeptIcon = dept.icon;
              return (
                <div key={dept.name} className="flex flex-col items-center">
                  <div
                    className={`rounded-2xl border ${dept.borderColor} ${dept.bgColor} p-5 shadow-sm w-full text-center`}
                  >
                    <div
                      className={`mx-auto h-10 w-10 rounded-xl ${dept.iconBg} flex items-center justify-center mb-2`}
                    >
                      <DeptIcon
                        strokeWidth={1.75}
                        className={`h-5 w-5 ${dept.color}`}
                      />
                    </div>
                    <h3 className="text-sm font-bold text-ink-800">
                      {dept.name}
                    </h3>
                    <p className="text-[10px] text-ink-500 mt-0.5 uppercase tracking-wider font-medium">
                      AI Agent Team
                    </p>
                    <p className="text-[10px] text-ink-500 mt-1">
                      {dept.agents.length} agent
                      {dept.agents.length !== 1 ? "s" : ""}
                    </p>
                  </div>

                  {/* ── Connector: Department -> Agents ──────────────── */}
                  <div className="w-px h-6 bg-surface-300" />
                  {dept.agents.length > 1 && (
                    <div
                      className="h-px bg-surface-300 relative"
                      style={{
                        width: `${Math.min(100, dept.agents.length * 40)}%`,
                      }}
                    >
                      {dept.agents.map((_, i) => (
                        <div
                          key={i}
                          className="absolute top-0 w-px h-4 bg-surface-300"
                          style={{
                            left:
                              dept.agents.length === 1
                                ? "50%"
                                : `${(i / (dept.agents.length - 1)) * 100}%`,
                          }}
                        />
                      ))}
                    </div>
                  )}

                  {/* ── Row 3: Agent cards ──────────────────────────── */}
                  <div
                    className={`grid gap-2 pt-4 w-full ${
                      dept.agents.length <= 2
                        ? "grid-cols-2"
                        : "grid-cols-2 xl:grid-cols-2"
                    }`}
                  >
                    {dept.agents.map((agent) => {
                      const AgentIcon = agent.icon;
                      const isActive = agent.status === "Active";
                      return (
                        <div
                          key={agent.name}
                          className={`rounded-xl border bg-white p-3 shadow-sm ${
                            isActive
                              ? "border-surface-200"
                              : "border-dashed border-surface-300 opacity-75"
                          }`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div
                              className={`flex items-center justify-center h-8 w-8 rounded-lg ${dept.iconBg}`}
                            >
                              <AgentIcon
                                strokeWidth={1.75}
                                className={`h-4 w-4 ${dept.color}`}
                              />
                            </div>
                            <span
                              className={`text-[9px] font-semibold rounded-full px-2 py-0.5 ${
                                isActive
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-surface-200 text-ink-500"
                              }`}
                            >
                              {agent.status}
                            </span>
                          </div>
                          <h4 className="text-[11px] font-bold text-ink-800 leading-tight">
                            {agent.shortName}
                          </h4>
                          <p className="text-[9px] text-ink-500 mt-1 leading-relaxed line-clamp-2">
                            {agent.description}
                          </p>
                          <div className="mt-2 pt-2 border-t border-surface-200 space-y-0.5">
                            <div className="flex justify-between text-[9px]">
                              <span className="text-ink-400">Model</span>
                              <span className="text-ink-700 font-mono font-medium truncate ml-1">
                                {agent.model}
                              </span>
                            </div>
                            <div className="flex justify-between text-[9px]">
                              <span className="text-ink-400">Cost</span>
                              <span className="text-ink-700 font-mono font-medium">
                                {agent.cost}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 2: AI AGENT WORKFLOW CYCLE
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <RefreshCw strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Continuous Improvement Cycle
          </h2>

          {/* Desktop: 3x2 grid with arrows */}
          <div className="hidden md:block">
            <div className="rounded-2xl border border-surface-200 bg-white p-8 shadow-sm">
              {/* Top row: steps 1-3 left to right */}
              <div className="grid grid-cols-3 gap-0 items-center">
                {WORKFLOW_STEPS.slice(0, 3).map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={step.label} className="flex items-center">
                      <div className="flex-1 rounded-xl border border-surface-200 p-5 text-center bg-surface-50">
                        <div className="flex justify-center mb-3">
                          <div className="h-12 w-12 rounded-xl bg-surface-200 flex items-center justify-center">
                            <Icon
                              strokeWidth={1.75}
                              className={`h-6 w-6 ${step.color}`}
                            />
                          </div>
                        </div>
                        <h4 className="text-xs font-bold text-ink-800 mb-1">
                          {step.label}
                        </h4>
                        <p className="text-[10px] text-ink-500 leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                      {i < 2 && (
                        <div className="flex items-center px-2 shrink-0">
                          <ArrowRight
                            strokeWidth={2}
                            className="h-5 w-5 text-brand-400"
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Down arrow on right */}
              <div className="flex justify-end pr-[15%] py-2">
                <svg
                  width="20"
                  height="28"
                  viewBox="0 0 20 28"
                  fill="none"
                  className="text-brand-400"
                >
                  <path
                    d="M10 0v22m0 0l-6-6m6 6l6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>

              {/* Bottom row: steps 6-4 right to left */}
              <div className="grid grid-cols-3 gap-0 items-center">
                {[...WORKFLOW_STEPS.slice(3)]
                  .reverse()
                  .map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.label} className="flex items-center">
                        {i > 0 && (
                          <div className="flex items-center px-2 shrink-0">
                            <ArrowLeft
                              strokeWidth={2}
                              className="h-5 w-5 text-brand-400"
                            />
                          </div>
                        )}
                        <div className="flex-1 rounded-xl border border-surface-200 p-5 text-center bg-surface-50">
                          <div className="flex justify-center mb-3">
                            <div className="h-12 w-12 rounded-xl bg-surface-200 flex items-center justify-center">
                              <Icon
                                strokeWidth={1.75}
                                className={`h-6 w-6 ${step.color}`}
                              />
                            </div>
                          </div>
                          <h4 className="text-xs font-bold text-ink-800 mb-1">
                            {step.label}
                          </h4>
                          <p className="text-[10px] text-ink-500 leading-relaxed">
                            {step.description}
                          </p>
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Up arrow on left */}
              <div className="flex justify-start pl-[15%] py-2">
                <svg
                  width="20"
                  height="28"
                  viewBox="0 0 20 28"
                  fill="none"
                  className="text-brand-400"
                >
                  <path
                    d="M10 28V6m0 0l-6 6m6-6l6 6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            </div>
          </div>

          {/* Mobile: vertical list with down arrows */}
          <div className="md:hidden space-y-0">
            {WORKFLOW_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div key={step.label}>
                  <div className="flex items-center gap-4 rounded-xl border border-surface-200 bg-white p-4 shadow-sm">
                    <div className="h-10 w-10 rounded-lg bg-surface-200 flex items-center justify-center shrink-0">
                      <Icon
                        strokeWidth={1.75}
                        className={`h-5 w-5 ${step.color}`}
                      />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-ink-800">
                        {step.label}
                      </h4>
                      <p className="text-[10px] text-ink-500 mt-0.5">
                        {step.description}
                      </p>
                    </div>
                  </div>
                  {i < WORKFLOW_STEPS.length - 1 ? (
                    <div className="flex justify-center py-1">
                      <svg
                        width="16"
                        height="20"
                        viewBox="0 0 16 20"
                        fill="none"
                        className="text-brand-400"
                      >
                        <path
                          d="M8 0v14m0 0l-4-4m4 4l4-4"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  ) : (
                    /* Loop-back arrow */
                    <div className="flex justify-center py-2">
                      <div className="flex items-center gap-1 text-[10px] text-brand-500 font-medium">
                        <RefreshCw className="h-3 w-3" />
                        Loops back to R&amp;D
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 3: TEAM STATS
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <BarChart3 strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Team Stats at a Glance
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total AI Agents",
                value: `${ALL_AGENTS.length}`,
                sub: `${activeAgents} active, ${plannedAgents} planned`,
                icon: Bot,
                color: "text-brand-600",
                bg: "bg-brand-50",
              },
              {
                label: "Models Used",
                value: "2",
                sub: "Haiku 4.5, Sonnet 4.6",
                icon: Cpu,
                color: "text-purple-600",
                bg: "bg-purple-50",
              },
              {
                label: "Daily AI Budget",
                value: "~$5",
                sub: "Capped at $100/month",
                icon: DollarSign,
                color: "text-emerald-600",
                bg: "bg-emerald-50",
              },
              {
                label: "Emails Sent",
                value: emailsSent.toLocaleString(),
                sub: "Via Gmail SMTP",
                icon: Mail,
                color: "text-amber-600",
                bg: "bg-amber-50",
              },
            ].map(({ label, value, sub, icon: Icon, color, bg }) => (
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
                  {value}
                </p>
                <p className="text-[10px] text-ink-500 mt-1">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 4: FULL AGENT ROSTER (detail table)
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <UserCircle
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
            />
            Full Agent Roster
          </h2>

          <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-100">
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      Agent
                    </th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium hidden sm:table-cell">
                      Department
                    </th>
                    <th className="text-left px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium hidden md:table-cell">
                      Model
                    </th>
                    <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium hidden md:table-cell">
                      Cost
                    </th>
                    <th className="text-right px-5 py-3 text-[10px] uppercase tracking-wider text-ink-500 font-medium">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {DEPARTMENTS.flatMap((dept) =>
                    dept.agents.map((agent) => {
                      const AgentIcon = agent.icon;
                      const isActive = agent.status === "Active";
                      return (
                        <tr
                          key={agent.name}
                          className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors"
                        >
                          <td className="px-5 py-3">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-8 w-8 rounded-lg ${dept.iconBg} flex items-center justify-center shrink-0`}
                              >
                                <AgentIcon
                                  strokeWidth={1.75}
                                  className={`h-4 w-4 ${dept.color}`}
                                />
                              </div>
                              <div>
                                <p className="text-xs font-semibold text-ink-800">
                                  {agent.name}
                                </p>
                                <p className="text-[10px] text-ink-500 mt-0.5 line-clamp-1 max-w-[200px]">
                                  {agent.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-5 py-3 hidden sm:table-cell">
                            <span
                              className={`text-[10px] font-medium ${dept.color}`}
                            >
                              {dept.name}
                            </span>
                          </td>
                          <td className="px-5 py-3 hidden md:table-cell">
                            <span className="text-[11px] font-mono text-ink-600">
                              {agent.model}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right hidden md:table-cell">
                            <span className="text-[11px] font-mono text-ink-600">
                              {agent.cost}
                            </span>
                          </td>
                          <td className="px-5 py-3 text-right">
                            <span
                              className={`inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5 ${
                                isActive
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-surface-200 text-ink-500"
                              }`}
                            >
                              {isActive && (
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse-dot" />
                              )}
                              {agent.status}
                              {agent.statusDetail
                                ? ` (${agent.statusDetail})`
                                : ""}
                            </span>
                          </td>
                        </tr>
                      );
                    }),
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
