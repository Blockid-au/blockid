"use client";

import * as React from "react";
import {
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  Circle,
  CreditCard,
  Database,
  FileText,
  Globe,
  Lightbulb,
  Map,
  Rocket,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AdminLayout } from "@/components/admin/admin-layout";

/* ── Types ──────────────────────────────────────────────────────────────── */

interface SubGoal {
  label: string;
  done: boolean;
}

interface PhaseSubSection {
  title: string;
  priority?: string;
  goals: SubGoal[];
  acceptance: string;
}

interface Phase {
  number: number;
  name: string;
  timeline: string;
  status: "Complete" | "In Progress" | "Planned";
  fullGoal: string;
  subSections: PhaseSubSection[];
}

/* ── Data (from .claude/goals/phase-*.md) ───────────────────────────────── */

const PHASES: Phase[] = [
  {
    number: 1,
    name: "Idea & Analysis",
    timeline: "Complete",
    status: "Complete",
    fullGoal: "AI-powered startup analysis from Day 0",
    subSections: [
      {
        title: "Core Analysis Engine",
        goals: [
          { label: "R&D Agent with SSE streaming (3 parallel AI batches)", done: true },
          { label: "Input detection: idea text / URL scraping / document upload", done: true },
          { label: "10-page report (Executive, Market, Product, Business, Competition, Traction, Team, Financial, Risk, Recommendations)", done: true },
          { label: "Tiered reports: Preview (free) / Standard (1 credit) / Deep Dive (3 credits)", done: true },
          { label: "SVI Scoring v2.0 (8 dimensions, 30-300 range)", done: true },
          { label: "Server-side analysis gate (per-email, cross-device)", done: true },
          { label: "Actionable report with CTA buttons per recommendation", done: true },
          { label: "Shareable report links + PDF export", done: true },
          { label: "Stripe payment integration (A$1/analysis, A$49 Founder, A$499 Growth)", done: true },
        ],
        acceptance: "Full AI-powered analysis pipeline from input to scored report with payment",
      },
    ],
  },
  {
    number: 2,
    name: "Validation & Evidence",
    timeline: "In Progress",
    status: "In Progress",
    fullGoal: "Transform one-shot analysis into a living, updatable score",
    subSections: [
      {
        title: "Evidence-to-SVI Feedback Loop",
        priority: "P0",
        goals: [
          { label: "Extend extractSignals() to accept evidence items", done: false },
          { label: "Auto-rescore API: POST /api/svi/rescore-from-evidence", done: false },
          { label: "Post-evidence-upload trigger (auto-rescore after upload)", done: false },
          { label: "Evidence Vault SVI impact display (toast: \"SVI +X points\")", done: false },
          { label: "Living Report auto-update after evidence changes", done: false },
        ],
        acceptance: "Adding evidence visibly changes SVI score within 5 seconds",
      },
      {
        title: "OAuth Evidence Connectors",
        priority: "P3",
        goals: [
          { label: "GitHub connector (repo stats -> hasSourceCode, commit frequency)", done: false },
          { label: "Google Analytics connector (MAU/DAU -> hasAnalytics)", done: false },
          { label: "Stripe connector (MRR/ARR -> hasRevenue, revenueBand)", done: false },
          { label: "Connector status dashboard in Evidence Vault", done: false },
        ],
        acceptance: "Connected source raises confidence from 20% to 75%",
      },
      {
        title: "Milestone Badges",
        priority: "P1",
        goals: [
          { label: "Define 15 badges (first_analysis, evidence_uploaded, svi_100, etc.)", done: false },
          { label: "Badge award engine (checkAndAwardBadges after each rescore)", done: false },
          { label: "Badge display UI (BadgeShelf component)", done: false },
          { label: "Badge notification (in-app toast + email)", done: false },
        ],
        acceptance: "User earns visible badge after completing first evidence upload",
      },
      {
        title: "Enhanced Weekly Reports",
        priority: "P2",
        goals: [
          { label: "Week-over-week dimension comparison", done: false },
          { label: "AI-generated weekly summary", done: false },
          { label: "Email delivery with SVI chart", done: false },
          { label: "Historical SVI line chart in workspace/reports", done: false },
        ],
        acceptance: "User receives weekly email with actionable insights",
      },
    ],
  },
  {
    number: 3,
    name: "MVP & Valuation",
    timeline: "Q4 2026",
    status: "Planned",
    fullGoal: "Track product metrics and evolve SVI into MVP Value Index",
    subSections: [
      {
        title: "Product Metrics Tracking",
        goals: [
          { label: "Metrics input form (/workspace/metrics)", done: false },
          { label: "startup_metrics database table", done: false },
          { label: "Auto-import from OAuth connectors (GitHub, Analytics, Stripe)", done: false },
          { label: "Metrics dashboard with trends", done: false },
        ],
        acceptance: "Founder can see MAU, MRR, retention over time",
      },
      {
        title: "MVP Value Index",
        goals: [
          { label: "Metric-aware SVI dimensions (PTD, TRE use real data)", done: false },
          { label: "SVI v3 scoring: Base SVI + Metrics Bonus (0-50 points)", done: false },
          { label: "Stage-appropriate benchmarks per metric", done: false },
        ],
        acceptance: "SVI automatically incorporates connected product metrics",
      },
      {
        title: "Comparable Startup Benchmarking",
        goals: [
          { label: "Benchmark data model (anonymized sector/stage data)", done: false },
          { label: "Percentile rank UI in SVI results", done: false },
          { label: "AI comparable analysis in R&D report", done: false },
        ],
        acceptance: "User sees \"Your startup is in the 75th percentile for your stage\"",
      },
    ],
  },
  {
    number: 4,
    name: "Equity & Cap Table",
    timeline: "Q1 2027",
    status: "Planned",
    fullGoal: "Persistent cap table with vesting and ESOP management",
    subSections: [
      {
        title: "Unified Cap Table Engine",
        goals: [
          { label: "Persistent cap_tables table (versioned, audit trail)", done: false },
          { label: "Workspace cap table page (/workspace/cap-table)", done: false },
          { label: "Tool-to-Workspace bridge (\"Save to Workspace\" on all tools)", done: false },
          { label: "Dilution scenario modeling", done: false },
          { label: "Cap table to SVI feed (auto-set hasCapTable, hasVesting signals)", done: false },
        ],
        acceptance: "Cap table persists across sessions, feeds SVI",
      },
      {
        title: "Vesting Schedule Manager",
        goals: [
          { label: "Vesting parameters in shareholder data (cliff, total, start)", done: false },
          { label: "Vesting timeline visualization", done: false },
          { label: "Cliff alerts and milestone notifications", done: false },
        ],
        acceptance: "User can see each stakeholder's vesting progress",
      },
      {
        title: "ESOP Management",
        goals: [
          { label: "ESOP pool configuration (total, granted, unallocated)", done: false },
          { label: "Individual grant tracking (esop_grants table)", done: false },
          { label: "ESOP dilution preview before granting", done: false },
        ],
        acceptance: "Full ESOP lifecycle managed in workspace",
      },
    ],
  },
  {
    number: 5,
    name: "Tokenization (Cosmos)",
    timeline: "Q2-Q3 2027",
    status: "Planned",
    fullGoal: "Map equity to on-chain tokens for transparent ownership",
    subSections: [
      {
        title: "Cosmos Chain Setup",
        goals: [
          { label: "Cosmos SDK app-chain scaffold (Ignite CLI)", done: false },
          { label: "Token standard: Startup Token (name, symbol, total supply = total shares)", done: false },
          { label: "Wallet infrastructure (custodial initially, self-custody later via Keplr/Leap)", done: false },
        ],
        acceptance: "Private Cosmos chain running with token minting",
      },
      {
        title: "Equity-to-Token Mapping",
        goals: [
          { label: "Tokenization engine (cap table snapshot -> mint tokens)", done: false },
          { label: "CosmWasm vesting smart contracts", done: false },
          { label: "Bi-directional cap table <-> chain sync", done: false },
        ],
        acceptance: "Equity changes in web app reflected on-chain",
      },
      {
        title: "On-Chain Transparency",
        goals: [
          { label: "Block explorer for BlockID chain", done: false },
          { label: "Cryptographic proof of ownership (for investor decks)", done: false },
          { label: "IBC readiness for future interoperability (USDC on Osmosis)", done: false },
        ],
        acceptance: "Investor can verify ownership on public explorer",
      },
    ],
  },
  {
    number: 6,
    name: "Investment & Fundraise",
    timeline: "Q3-Q4 2027",
    status: "Planned",
    fullGoal: "Full fundraise workflow from data room to share issuance",
    subSections: [
      {
        title: "Investor Data Room",
        goals: [
          { label: "One-click data room generation from Evidence Vault", done: false },
          { label: "Document-level analytics (view time, completion)", done: false },
          { label: "Investor CRM (contacts, status, notes, linked term sheets)", done: false },
        ],
        acceptance: "Investor receives personalized data room link",
      },
      {
        title: "Fundraise Workflow",
        goals: [
          { label: "Round configuration wizard (target, valuation, instrument type)", done: false },
          { label: "Auto share-price calculation (pre-money / shares = price)", done: false },
          { label: "Investor allocation tool (amount -> shares -> dilution impact)", done: false },
          { label: "Side-by-side term sheet comparison", done: false },
        ],
        acceptance: "Full round can be configured and allocated in workspace",
      },
      {
        title: "Investor-Ready Score v2",
        goals: [
          { label: "Separate IRS from SVI (investor-weighted dimensions)", done: false },
          { label: "IRS report with data room completeness checklist", done: false },
        ],
        acceptance: "Distinct score focused on investor readiness",
      },
    ],
  },
  {
    number: 7,
    name: "Revenue & Dividends",
    timeline: "2028",
    status: "Planned",
    fullGoal: "Track revenue and automate dividend distribution via tokens",
    subSections: [
      {
        title: "Revenue Dashboard",
        goals: [
          { label: "Stripe/Xero/QuickBooks connectors (OAuth)", done: false },
          { label: "Real-time P&L dashboard (revenue, COGS, margin, expenses, net income)", done: false },
          { label: "Revenue-to-SVI feed (TRE dimension at 90% confidence)", done: false },
        ],
        acceptance: "Live revenue data auto-updates SVI",
      },
      {
        title: "Dividend Distribution",
        goals: [
          { label: "Dividend calculation engine (net income x policy -> per-share amount)", done: false },
          { label: "Token-based dividend minting (on Cosmos chain, proportional to holdings)", done: false },
          { label: "Dividend history + AU tax reporting (franking credits, CGT)", done: false },
        ],
        acceptance: "Dividends auto-distributed to token holders",
      },
    ],
  },
  {
    number: 8,
    name: "Growth Journal & Exit",
    timeline: "2028+",
    status: "Planned",
    fullGoal: "Continuous revaluation, growth journaling, and exit preparation",
    subSections: [
      {
        title: "Growth Journal",
        goals: [
          { label: "Journal entry system (decisions, pivots, milestones, learnings)", done: false },
          { label: "AI monthly reflection narrative", done: false },
          { label: "Public startup profile (optional, like a verified startup resume)", done: false },
        ],
        acceptance: "Founder has a searchable growth diary with AI insights",
      },
      {
        title: "Periodic Revaluation",
        goals: [
          { label: "Quarterly dollar valuation (revenue multiples, comparable exits, growth rate)", done: false },
          { label: "409A-style valuation report (for ESOP pricing, tax, investor discussions)", done: false },
        ],
        acceptance: "Quarterly report with estimated dollar value",
      },
      {
        title: "Exit Preparation",
        goals: [
          { label: "Exit readiness score (clean cap table, audited financials, IP, governance)", done: false },
          { label: "Exit scenario modeling (acquisition, IPO, secondary — per-shareholder outcomes)", done: false },
          { label: "Tax implications (CGT, franking credits)", done: false },
        ],
        acceptance: "Founder can model exit at various multiples with per-shareholder breakdown",
      },
    ],
  },
];

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function getPhaseProgress(phase: Phase): number {
  const allGoals = phase.subSections.flatMap((s) => s.goals);
  if (allGoals.length === 0) return 0;
  const done = allGoals.filter((g) => g.done).length;
  return Math.round((done / allGoals.length) * 100);
}

function statusBadge(status: Phase["status"]) {
  switch (status) {
    case "Complete":
      return "bg-emerald-100 text-emerald-700";
    case "In Progress":
      return "bg-brand-100 text-brand-700";
    case "Planned":
      return "bg-surface-200 text-ink-500";
  }
}

/* ── Phase Card Component ───────────────────────────────────────────────── */

function PhaseCard({ phase }: { phase: Phase }) {
  const [open, setOpen] = React.useState(false);
  const progress = getPhaseProgress(phase);
  const totalGoals = phase.subSections.flatMap((s) => s.goals).length;
  const doneGoals = phase.subSections
    .flatMap((s) => s.goals)
    .filter((g) => g.done).length;

  return (
    <div
      className={cn(
        "rounded-2xl border bg-white shadow-sm transition-all duration-300",
        phase.status === "Complete"
          ? "border-emerald-200"
          : phase.status === "In Progress"
            ? "border-brand-200"
            : "border-surface-200",
        open && "shadow-md",
      )}
    >
      {/* Collapsed header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full p-5 flex items-center gap-4 text-left cursor-pointer group"
      >
        {/* Phase number circle */}
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center border-[3px] text-sm font-bold shrink-0 transition-all",
            phase.status === "Complete"
              ? "bg-emerald-500 border-emerald-500 text-white"
              : phase.status === "In Progress"
                ? "bg-white border-brand-500 text-brand-600 ring-4 ring-brand-100"
                : "bg-white border-surface-300 text-ink-500",
          )}
        >
          {phase.status === "Complete" ? (
            <CheckCircle2 strokeWidth={2.5} className="h-5 w-5" />
          ) : (
            phase.number
          )}
        </div>

        {/* Title area */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-ink-800">
              Phase {phase.number}: {phase.name}
            </h3>
            <span
              className={cn(
                "text-[10px] font-semibold rounded-full px-2.5 py-0.5",
                statusBadge(phase.status),
              )}
            >
              {phase.status}
            </span>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-[11px] text-ink-500">{phase.timeline}</p>
            <span className="text-[10px] text-ink-400">
              {doneGoals}/{totalGoals} goals
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 w-full max-w-xs bg-surface-200 rounded-full overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                phase.status === "Complete"
                  ? "bg-emerald-500"
                  : phase.status === "In Progress"
                    ? "bg-brand-500"
                    : "bg-surface-300",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Chevron */}
        <ChevronDown
          strokeWidth={1.75}
          className={cn(
            "h-5 w-5 text-ink-400 shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* Expanded details */}
      <div
        className={cn(
          "overflow-hidden transition-all duration-300 ease-in-out",
          open ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0",
        )}
      >
        <div className="px-5 pb-5 border-t border-surface-200 pt-4 space-y-5">
          {/* Full goal */}
          <div className="rounded-lg bg-surface-50 border border-surface-200 p-3">
            <p className="text-[10px] uppercase tracking-wider text-ink-500 font-semibold mb-1">
              Goal
            </p>
            <p className="text-sm text-ink-700 font-medium">
              {phase.fullGoal}
            </p>
          </div>

          {/* Sub-sections */}
          {phase.subSections.map((section) => (
            <div key={section.title} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-xs font-bold text-ink-800">
                  {section.title}
                </h4>
                {section.priority && (
                  <span
                    className={cn(
                      "text-[9px] font-semibold rounded px-1.5 py-0.5",
                      section.priority === "P0"
                        ? "bg-red-100 text-red-700"
                        : section.priority === "P1"
                          ? "bg-amber-100 text-amber-700"
                          : section.priority === "P2"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-surface-200 text-ink-500",
                    )}
                  >
                    {section.priority}
                  </span>
                )}
              </div>

              {/* Goals checklist */}
              <ul className="space-y-1.5 ml-1">
                {section.goals.map((goal) => (
                  <li
                    key={goal.label}
                    className="flex items-start gap-2 text-xs"
                  >
                    {goal.done ? (
                      <CheckCircle2
                        strokeWidth={2}
                        className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5"
                      />
                    ) : (
                      <Circle
                        strokeWidth={1.5}
                        className="h-3.5 w-3.5 text-ink-300 shrink-0 mt-0.5"
                      />
                    )}
                    <span
                      className={cn(
                        "leading-relaxed",
                        goal.done
                          ? "text-ink-500 line-through"
                          : "text-ink-700",
                      )}
                    >
                      {goal.label}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Acceptance criteria */}
              <div className="rounded-lg bg-emerald-50/50 border border-emerald-100 p-2.5 ml-1">
                <p className="text-[10px] uppercase tracking-wider text-emerald-600 font-semibold mb-0.5">
                  Acceptance Criteria
                </p>
                <p className="text-[11px] text-ink-600 leading-relaxed">
                  {section.acceptance}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────────────────────── */

interface RoadmapClientProps {
  user: { email: string; displayName?: string | null };
  liveStats: {
    totalUsers: number;
    totalAnalyses: number;
    totalLeads: number;
    payingUsers: number;
    totalNotifications: number;
    totalAccounts: number;
  };
}

export function RoadmapClient({ user, liveStats }: RoadmapClientProps) {
  const completedPhases = PHASES.filter((p) => p.status === "Complete");
  const totalDelivered = completedPhases.flatMap((p) =>
    p.subSections.flatMap((s) => s.goals),
  ).length;

  const todayStr = new Date().toLocaleDateString("en-AU", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <AdminLayout user={user}>
      <div className="max-w-7xl mx-auto px-6 py-8 space-y-12">
        {/* ════════════════════════════════════════════════════════════
            HERO HEADER
           ════════════════════════════════════════════════════════════ */}
        <div className="text-center py-4">
          <div className="flex justify-center mb-4">
            <div className="h-14 w-14 rounded-2xl gradient-brand flex items-center justify-center shadow-lg">
              <Map strokeWidth={1.75} className="h-7 w-7 text-white" />
            </div>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-ink-900 tracking-tight">
            BlockID.au Product Roadmap
          </h1>
          <p className="text-sm md:text-base text-ink-600 mt-3 max-w-2xl mx-auto leading-relaxed">
            8-phase plan — from idea to investable business
          </p>
          <p className="text-xs text-ink-400 mt-2">{todayStr}</p>
          <div className="flex items-center justify-center gap-4 mt-5 text-[11px] text-ink-500">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              Complete
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-brand-500 animate-pulse-dot" />
              In Progress
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-surface-300" />
              Planned
            </span>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════════
            PHASE CARDS (expandable)
           ════════════════════════════════════════════════════════════ */}
        <section className="space-y-4">
          {PHASES.map((phase) => (
            <PhaseCard key={phase.number} phase={phase} />
          ))}
        </section>

        {/* ════════════════════════════════════════════════════════════
            BUSINESS METRICS DASHBOARD (Live from DB)
           ════════════════════════════════════════════════════════════ */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <BarChart3
              strokeWidth={1.75}
              className="h-5 w-5 text-teal-500"
            />
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
            <Lightbulb
              strokeWidth={1.75}
              className="h-5 w-5 text-brand-600"
            />
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
                  <span className="font-bold">70%</span> of startups have
                  cap table issues at Series A. Most founders cannot
                  articulate their valuation story. Investors waste 80+ hours
                  on due diligence per deal.
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
                  <span className="font-bold">
                    SaaS + credit-based hybrid.
                  </span>{" "}
                  Monthly subscriptions ($29-$499/mo) for ongoing access +
                  credit packs for pay-as-you-go users.
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    "Free Trial",
                    "$29 Starter",
                    "$79 Growth",
                    "$199 Pro",
                    "$499 Enterprise",
                  ].map((tier) => (
                    <span
                      key={tier}
                      className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700"
                    >
                      {tier}
                    </span>
                  ))}
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
      </div>
    </AdminLayout>
  );
}
