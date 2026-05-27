"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Bot,
  BrainCircuit,
  ChevronDown,
  Clock,
  Cpu,
  Database,
  DollarSign,
  FileSearch,
  Globe,
  Layers,
  Lightbulb,
  Mail,
  Megaphone,
  RefreshCw,
  Route,
  ScrollText,
  Server,
  Settings,
  Sparkles,
  Timer,
  TrendingUp,
  UserCircle,
  Users,
  Wrench,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/admin-layout";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface TeamMember {
  id: string;
  name: string;
  role: string;
  initial: string;
  color: string;
  bgColor: string;
  borderColor: string;
  responsibilities: string[];
  priorities: string[];
  contact?: string;
  status: "Active" | "Hiring" | "Planned";
}

interface AIAgent {
  name: string;
  shortName: string;
  description: string;
  model: string;
  cost: string;
  status: "Active" | "Planned";
  statusDetail?: string;
  icon: typeof Bot;
  department: string;
  deptColor: string;
  deptIconBg: string;
}

/* ── Data ───────────────────────────────────────────────────────────────── */

const TEAM_MEMBERS: TeamMember[] = [
  {
    id: "ceo",
    name: "Do Van Long",
    role: "Founder & CEO",
    initial: "L",
    color: "text-brand-600",
    bgColor: "bg-brand-50",
    borderColor: "border-brand-300",
    responsibilities: [
      "Product vision and strategy",
      "Architecture and technical decisions",
      "Investor relations and fundraising",
      "Business development and partnerships",
      "AI agent orchestration and oversight",
    ],
    priorities: [
      "Scale to 200 users by Aug 2026",
      "Close Founding 50 cohort",
      "Launch Phase 3 growth features",
      "Secure pre-seed funding",
    ],
    contact: "admin@blockid.au",
    status: "Active",
  },
  {
    id: "cto",
    name: "CTO / Technical Lead",
    role: "CTO / Technical Lead",
    initial: "T",
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-300",
    responsibilities: [
      "System architecture and infrastructure",
      "Code quality and security audits",
      "CI/CD pipeline and deployment",
      "Database schema and performance",
      "API design and developer experience",
    ],
    priorities: [
      "Horizontal scaling for multi-tenant",
      "SOC2 Type II compliance",
      "API developer portal (B2B)",
      "Performance monitoring and alerting",
    ],
    status: "Hiring",
  },
  {
    id: "head-product",
    name: "Head of Product",
    role: "Head of Product",
    initial: "P",
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-300",
    responsibilities: [
      "Feature prioritization and roadmap",
      "User research and feedback loops",
      "Product analytics and A/B testing",
      "Onboarding flows and UX optimization",
      "Cross-functional alignment",
    ],
    priorities: [
      "SEO landing pages for each tool",
      "PDF export for SVI reports",
      "Accelerator dashboard (multi-startup)",
      "White-label for advisors",
    ],
    status: "Hiring",
  },
  {
    id: "head-growth",
    name: "Head of Growth / CMO",
    role: "Head of Growth / CMO",
    initial: "G",
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-300",
    responsibilities: [
      "User acquisition and retention",
      "Content marketing and SEO",
      "Referral and partnership programs",
      "Community building (founders/investors)",
      "Brand positioning in AU market",
    ],
    priorities: [
      "Referral program (invite-to-earn credits)",
      "Accelerator partnership outreach",
      "Content strategy: founder guides",
      "Social proof and case studies",
    ],
    status: "Hiring",
  },
  {
    id: "head-ops",
    name: "Head of Operations",
    role: "Head of Operations",
    initial: "O",
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    responsibilities: [
      "Customer support and success",
      "Billing and subscription management",
      "Compliance and legal (ASIC, AUSTRAC)",
      "Vendor management and contracts",
      "Operations automation",
    ],
    priorities: [
      "ASIC compliance checkers",
      "Support ticket system",
      "Automated due diligence reports",
      "AU tax and franking credit automation",
    ],
    status: "Planned",
  },
  {
    id: "ai-engineer",
    name: "AI / ML Engineer",
    role: "AI / ML Engineer",
    initial: "A",
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-300",
    responsibilities: [
      "AI agent development and fine-tuning",
      "SVI scoring model improvements",
      "Prompt engineering and evaluation",
      "Model cost optimization",
      "ML pipeline and data quality",
    ],
    priorities: [
      "SVI v3 scoring with metrics bonus",
      "R&D Research Agent (auto proposals)",
      "AI co-pilot for founders",
      "Model benchmarking and eval suite",
    ],
    status: "Planned",
  },
];

const AI_AGENTS: AIAgent[] = [
  {
    name: "SVI Analysis Agent",
    shortName: "SVI Agent",
    description:
      "Analyzes startup descriptions, extracts signals, computes 8-dimension score",
    model: "Claude Haiku 4.5",
    cost: "~$0.003/req",
    status: "Active",
    icon: BrainCircuit,
    department: "Product & Tech",
    deptColor: "text-brand-600",
    deptIconBg: "bg-brand-100",
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
    department: "Product & Tech",
    deptColor: "text-brand-600",
    deptIconBg: "bg-brand-100",
  },
  {
    name: "Competitive Research Agent",
    shortName: "Comp Research Agent",
    description: "Web search + market/competitive scoring",
    model: "Claude Haiku 4.5",
    cost: "~$0.01/req",
    status: "Active",
    icon: Globe,
    department: "Product & Tech",
    deptColor: "text-brand-600",
    deptIconBg: "bg-brand-100",
  },
  {
    name: "SVI Report Agent",
    shortName: "SVI Report Agent",
    description: "Generates 10-page AI-powered SVI report",
    model: "Claude Haiku 4.5",
    cost: "~$0.003/req",
    status: "Active",
    icon: FileSearch,
    department: "Product & Tech",
    deptColor: "text-brand-600",
    deptIconBg: "bg-brand-100",
  },
  {
    name: "Growth Intelligence Agent",
    shortName: "Growth Intel Agent",
    description: "Daily cron, analyzes user behavior + funnel metrics",
    model: "Claude Haiku 4.5",
    cost: "~$0.002/day",
    status: "Active",
    statusDetail: "daily cron",
    icon: TrendingUp,
    department: "Growth",
    deptColor: "text-emerald-600",
    deptIconBg: "bg-emerald-100",
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
    department: "Growth",
    deptColor: "text-emerald-600",
    deptIconBg: "bg-emerald-100",
  },
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
    department: "Operations",
    deptColor: "text-amber-600",
    deptIconBg: "bg-amber-100",
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
    department: "Operations",
    deptColor: "text-amber-600",
    deptIconBg: "bg-amber-100",
  },
];

/* ── Component ──────────────────────────────────────────────────────────── */

interface TeamClientProps {
  user: { email: string; displayName?: string | null };
  emailsSent: number;
}

function TeamMemberCard({ member }: { member: TeamMember }) {
  const [open, setOpen] = React.useState(false);

  return (
    <div
      className={cn(
        "rounded-2xl border-2 bg-white shadow-sm transition-all duration-300 cursor-pointer",
        member.borderColor,
        open && "shadow-md",
      )}
      onClick={() => setOpen((v) => !v)}
    >
      {/* Collapsed header - always visible */}
      <div className="p-5 flex items-center gap-4">
        <div
          className={cn(
            "h-12 w-12 rounded-full flex items-center justify-center text-white font-bold text-lg shrink-0",
            member.id === "ceo" ? "bg-brand-600" : "bg-surface-400",
            member.status === "Active" && "bg-brand-600",
            member.status === "Hiring" && "bg-purple-500",
            member.status === "Planned" && "bg-surface-300",
          )}
        >
          {member.initial}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-ink-800 truncate">
            {member.name}
          </h3>
          <p className="text-xs text-ink-500 mt-0.5">{member.role}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={cn(
              "text-[10px] font-semibold rounded-full px-2.5 py-0.5",
              member.status === "Active" &&
                "bg-emerald-100 text-emerald-700",
              member.status === "Hiring" &&
                "bg-purple-100 text-purple-700",
              member.status === "Planned" &&
                "bg-surface-200 text-ink-500",
            )}
          >
            {member.status}
          </span>
          <ChevronDown
            strokeWidth={1.75}
            className={cn(
              "h-4 w-4 text-ink-400 transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </div>
      </div>

      {/* Expanded details */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="px-5 pb-5 border-t border-surface-200 pt-4 space-y-4">
          {/* Responsibilities */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
              Responsibilities
            </h4>
            <ul className="space-y-1">
              {member.responsibilities.map((r) => (
                <li
                  key={r}
                  className="flex items-start gap-2 text-xs text-ink-700"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-brand-400 mt-1.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>

          {/* Priorities */}
          <div>
            <h4 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-2">
              Current Priorities
            </h4>
            <ul className="space-y-1">
              {member.priorities.map((p) => (
                <li
                  key={p}
                  className="flex items-start gap-2 text-xs text-ink-700"
                >
                  <Zap
                    strokeWidth={2}
                    className="h-3 w-3 text-amber-500 shrink-0 mt-0.5"
                  />
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          {member.contact && (
            <div>
              <h4 className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
                Contact
              </h4>
              <p className="text-xs text-ink-600 font-mono">
                {member.contact}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function TeamClient({ user, emailsSent }: TeamClientProps) {
  const activeAgents = AI_AGENTS.filter((a) => a.status === "Active").length;
  const plannedAgents = AI_AGENTS.filter(
    (a) => a.status === "Planned",
  ).length;

  return (
    <AdminLayout user={user}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* ── Hero Title ──────────────────────────────────────────── */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-ink-800 flex items-center justify-center gap-3">
            <Users strokeWidth={1.75} className="h-7 w-7 text-brand-600" />
            Team &amp; AI Agent Ecosystem
          </h1>
          <p className="text-sm text-ink-600 mt-2 max-w-xl mx-auto">
            One founder, eight AI agents — building the trust layer for
            private capital markets.
          </p>
        </div>

        {/* ════════════════════════════════════════════════════════════
            SYSTEM STATS + ARCHITECTURE LINK
           ════════════════════════════════════════════════════════════ */}
        <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-5">
            <div className="flex items-center gap-2">
              <Layers strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
              <h2 className="text-lg font-semibold text-ink-800">System Stats</h2>
            </div>
            <Link
              href="/admin/architecture"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 bg-brand-50 hover:bg-brand-100 rounded-xl px-4 py-2 transition-colors"
            >
              View System Architecture
              <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { icon: Zap, label: "AI Providers", value: "9", sub: "14 free models", color: "text-brand-600", bg: "bg-brand-50" },
              { icon: Route, label: "API Routes", value: "143", sub: "12 domains", color: "text-purple-600", bg: "bg-purple-50" },
              { icon: Database, label: "DB Tables", value: "68", sub: "6 groups", color: "text-teal-600", bg: "bg-teal-50" },
              { icon: Server, label: "Microservices", value: "4", sub: "2 live, 2 ready", color: "text-emerald-600", bg: "bg-emerald-50" },
              { icon: Timer, label: "Cron Jobs", value: "12", sub: "automated", color: "text-amber-600", bg: "bg-amber-50" },
              { icon: Settings, label: "Env Vars", value: "72", sub: "configured", color: "text-rose-600", bg: "bg-rose-50" },
            ].map(({ icon: Icon, label, value, sub, color, bg }) => (
              <div key={label} className="rounded-xl border border-surface-100 bg-surface-50 p-3 text-center">
                <div className={cn("h-7 w-7 rounded-lg flex items-center justify-center mx-auto mb-2", bg)}>
                  <Icon strokeWidth={1.75} className={cn("h-3.5 w-3.5", color)} />
                </div>
                <p className="text-lg font-bold font-mono text-ink-800">{value}</p>
                <p className="text-[10px] font-medium text-ink-600">{label}</p>
                <p className="text-[9px] text-ink-400">{sub}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 1: TEAM ORG CHART (Expandable Cards)
           ════════════════════════════════════════════════════════════ */}
        <section className="space-y-6">
          <h2 className="text-lg font-semibold text-ink-800 flex items-center gap-2">
            <Sparkles
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
            />
            Organisation Hierarchy
          </h2>

          {/* Founder card - prominent */}
          <TeamMemberCard member={TEAM_MEMBERS[0]} />

          {/* Connector */}
          <div className="flex justify-center">
            <div className="w-px h-6 bg-surface-300" />
          </div>

          {/* Team members grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEAM_MEMBERS.slice(1).map((member) => (
              <TeamMemberCard key={member.id} member={member} />
            ))}
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 2: AI AGENTS
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <Bot strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            AI Agent Roster
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
                  {AI_AGENTS.map((agent) => {
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
                              className={cn(
                                "h-8 w-8 rounded-lg flex items-center justify-center shrink-0",
                                agent.deptIconBg,
                              )}
                            >
                              <AgentIcon
                                strokeWidth={1.75}
                                className={cn("h-4 w-4", agent.deptColor)}
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
                            className={cn(
                              "text-[10px] font-medium",
                              agent.deptColor,
                            )}
                          >
                            {agent.department}
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
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5",
                              isActive
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-surface-200 text-ink-500",
                            )}
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
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* ════════════════════════════════════════════════════════════
            SECTION 3: TEAM STATS
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-6 flex items-center gap-2">
            <BarChart3
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
            />
            Team Stats at a Glance
          </h2>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              {
                label: "Total AI Agents",
                value: `${AI_AGENTS.length}`,
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
                    className={cn(
                      "h-8 w-8 rounded-lg flex items-center justify-center",
                      bg,
                    )}
                  >
                    <Icon
                      strokeWidth={1.75}
                      className={cn("h-4 w-4", color)}
                    />
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
      </div>
    </AdminLayout>
  );
}
