import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  FileSearch,
  Globe,
  Mail,
  ScrollText,
  Shield,
  Sparkles,
  TrendingUp,
  UserCircle,
  Users,
  Wrench,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Team & AI Agents — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ── Data ──────────────────────────────────────────────────────────────────── */

interface TeamMember {
  name: string;
  email: string;
  role: string;
  avatar: string | null;
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    name: "Admin",
    email: "admin@blockid.au",
    role: "Admin, Founder",
    avatar: null,
  },
];

interface AIAgent {
  name: string;
  description: string;
  model: string;
  cost: string;
  status: "Active" | "Planned";
  statusDetail?: string;
  icon: typeof Bot;
}

const AI_AGENTS: AIAgent[] = [
  {
    name: "SVI Analysis Agent",
    description: "Analyzes startup descriptions, extracts signals, computes 8-dimension score",
    model: "Claude Haiku 4.5",
    cost: "~$0.003/analysis",
    status: "Active",
    icon: BrainCircuit,
  },
  {
    name: "Term Sheet AI Agent",
    description: "Analyzes term sheets, AU market comparison, dilution modeling",
    model: "Claude Sonnet 4.6",
    cost: "~$0.10/analysis",
    status: "Active",
    icon: ScrollText,
  },
  {
    name: "Competitive Research Agent",
    description: "Web search + market/competitive scoring",
    model: "Claude Haiku 4.5 + Web Search",
    cost: "~$0.01/research",
    status: "Active",
    icon: Globe,
  },
  {
    name: "SVI Report Agent",
    description: "Generates 10-page AI-powered report",
    model: "Claude Haiku 4.5",
    cost: "~$0.003/report",
    status: "Active",
    icon: FileSearch,
  },
  {
    name: "Growth Intelligence Agent",
    description: "Daily cron, analyzes user behavior + funnel",
    model: "Claude Haiku 4.5",
    cost: "~$0.002/day",
    status: "Active",
    statusDetail: "daily cron",
    icon: TrendingUp,
  },
  {
    name: "Email Notification Agent",
    description: "Welcome, weekly reports, payment confirmations. Sends via Gmail SMTP (ceo@longcare.au). 8 templates.",
    model: "Gmail SMTP",
    cost: "N/A",
    status: "Active",
    statusDetail: "daily cron",
    icon: Mail,
  },
  {
    name: "R&D Research Agent",
    description: "Market research, feature proposals, pricing optimization. Analyze competitors, suggest features, optimize CTAs.",
    model: "TBD",
    cost: "TBD",
    status: "Planned",
    statusDetail: "Phase 3",
    icon: Wrench,
  },
];

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  Active: { bg: "bg-emerald-100", text: "text-emerald-700" },
  Planned: { bg: "bg-surface-200", text: "text-ink-600" },
};

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
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      {/* Header */}
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-purple-600 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
            TEAM
          </span>
        </div>
        <span className="text-xs text-ink-700">{user.email}</span>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
            <Users strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            Team &amp; AI Agents
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Team members and the AI agent ecosystem powering BlockID.
          </p>
        </div>

        {/* Team Members */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <UserCircle strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            Team Members
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {TEAM_MEMBERS.map((member) => (
              <div
                key={member.email}
                className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm flex items-start gap-4"
              >
                {member.avatar ? (
                  <img
                    src={member.avatar}
                    alt={member.name}
                    className="h-12 w-12 rounded-full object-cover border border-surface-200"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-full bg-brand-600 flex items-center justify-center text-white font-bold text-lg shrink-0">
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink-800">{member.name}</p>
                  <p className="text-xs text-ink-600 font-mono truncate">{member.email}</p>
                  <span className="inline-block mt-2 text-[10px] font-medium rounded px-2 py-0.5 bg-brand-100 text-brand-700">
                    {member.role}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* AI Agents */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Sparkles strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            AI Agent Ecosystem
          </h2>
          <p className="text-sm text-ink-600 mb-6">
            {AI_AGENTS.filter((a) => a.status === "Active").length} active agents
            {" / "}
            {AI_AGENTS.filter((a) => a.status === "Planned").length} planned
          </p>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {AI_AGENTS.map((agent) => {
              const style = STATUS_STYLES[agent.status] ?? STATUS_STYLES.Planned;
              const Icon = agent.icon;
              return (
                <div
                  key={agent.name}
                  className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm flex flex-col"
                >
                  {/* Top row: icon + status */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-brand-50 border border-brand-100">
                      <Icon strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
                    </div>
                    <span className={`text-[10px] font-medium rounded px-2 py-0.5 ${style.bg} ${style.text}`}>
                      {agent.status}
                      {agent.statusDetail ? ` (${agent.statusDetail})` : ""}
                    </span>
                  </div>

                  {/* Name + description */}
                  <h3 className="text-sm font-semibold text-ink-800 mb-1">{agent.name}</h3>
                  <p className="text-xs text-ink-600 leading-relaxed mb-4 flex-1">{agent.description}</p>

                  {/* Meta */}
                  <div className="border-t border-surface-200 pt-3 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">Model</span>
                      <span className="text-ink-700 font-medium font-mono text-[11px]">{agent.model}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-ink-500">Cost</span>
                      <span className="text-ink-700 font-medium font-mono text-[11px]">{agent.cost}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
