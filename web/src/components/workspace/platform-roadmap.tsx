"use client";

import * as React from "react";
import {
  BarChart3,
  Briefcase,
  CheckCircle2,
  Circle,
  Coins,
  DollarSign,
  Gavel,
  Lightbulb,
  LogOut,
  PieChart,
  Scale,
  Shield,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Types ──────────────────────────────────────────────────────────────── */

type PhaseStatus = "live" | "building" | "planned";

interface Phase {
  number: number;
  name: string;
  subtitle: string;
  description: string;
  status: PhaseStatus;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
  features: string[];
}

/* ── Data ───────────────────────────────────────────────────────────────── */

const PHASES: Phase[] = [
  {
    number: 1,
    name: "Idea",
    subtitle: "SVI Analysis",
    description: "Submit your startup idea and get an AI-powered 8-dimension Startup Viability Index score with actionable insights.",
    status: "live",
    icon: Lightbulb,
    color: "text-brand-600",
    bgColor: "bg-brand-50",
    borderColor: "border-brand-300",
    features: [
      "8-dimension SVI scoring",
      "AI-powered competitive analysis",
      "Progressive report generation",
      "Evidence vault & proof upload",
      "Shareable score links",
      "Multi-project support",
    ],
  },
  {
    number: 2,
    name: "Valuation",
    subtitle: "Multi-method valuation engine",
    description: "Calculate your startup's fair value using multiple methodologies tailored to your stage and industry.",
    status: "building",
    icon: TrendingUp,
    color: "text-purple-600",
    bgColor: "bg-purple-50",
    borderColor: "border-purple-300",
    features: [
      "DCF, Berkus, Scorecard methods",
      "Comparable company analysis",
      "Stage-adjusted multipliers",
      "AU market benchmarks",
      "Valuation range confidence bands",
    ],
  },
  {
    number: 3,
    name: "Equity",
    subtitle: "Cap table, vesting, ESOP",
    description: "Build and manage your cap table with vesting schedules, ESOP pools, and scenario modeling.",
    status: "building",
    icon: PieChart,
    color: "text-teal-600",
    bgColor: "bg-teal-50",
    borderColor: "border-teal-300",
    features: [
      "Interactive cap table builder",
      "Vesting schedule management",
      "ESOP pool allocation",
      "Dilution scenario modeling",
      "Term sheet AI analysis",
      "Waterfall distribution charts",
    ],
  },
  {
    number: 4,
    name: "Tokenization",
    subtitle: "Blockchain equity tokens",
    description: "Convert equity into on-chain tokens using Cosmos SDK for transparent, verifiable ownership records.",
    status: "planned",
    icon: Coins,
    color: "text-amber-600",
    bgColor: "bg-amber-50",
    borderColor: "border-amber-300",
    features: [
      "Cosmos SDK equity tokens",
      "NASDAQ-style token registry",
      "MetaMask wallet connection",
      "On-chain cap table sync",
      "Token transfer restrictions",
    ],
  },
  {
    number: 5,
    name: "Dividend",
    subtitle: "Revenue sharing, distributions",
    description: "Automate dividend calculations and distributions based on shareholding and token ownership.",
    status: "planned",
    icon: DollarSign,
    color: "text-emerald-600",
    bgColor: "bg-emerald-50",
    borderColor: "border-emerald-300",
    features: [
      "Automated dividend calculations",
      "Revenue sharing agreements",
      "Franking credit tracking (AU)",
      "Distribution scheduling",
      "Tax reporting integration",
    ],
  },
  {
    number: 6,
    name: "Investment",
    subtitle: "Data room, term sheets, fundraise",
    description: "Create investor-ready data rooms, generate term sheets, and manage your fundraising pipeline.",
    status: "planned",
    icon: Briefcase,
    color: "text-blue-600",
    bgColor: "bg-blue-50",
    borderColor: "border-blue-300",
    features: [
      "Secure virtual data room",
      "AI term sheet generation",
      "Investor CRM & pipeline",
      "Due diligence checklists",
      "Fundraise progress tracking",
    ],
  },
  {
    number: 7,
    name: "Governance",
    subtitle: "Board tools, compliance",
    description: "Board meeting management, voting, compliance tracking, and corporate governance automation.",
    status: "planned",
    icon: Gavel,
    color: "text-indigo-600",
    bgColor: "bg-indigo-50",
    borderColor: "border-indigo-300",
    features: [
      "Board meeting scheduling",
      "Resolution voting (on-chain)",
      "ASIC compliance automation",
      "Shareholder communication",
      "Corporate register management",
    ],
  },
  {
    number: 8,
    name: "Exit",
    subtitle: "Exit modeling, secondary markets",
    description: "Model exit scenarios, facilitate secondary sales, and manage the full lifecycle of your startup equity.",
    status: "planned",
    icon: LogOut,
    color: "text-rose-600",
    bgColor: "bg-rose-50",
    borderColor: "border-rose-300",
    features: [
      "Exit scenario modeling",
      "Secondary market listings",
      "Buyback programs",
      "M&A due diligence tools",
      "Liquidation waterfall analysis",
    ],
  },
];

/* ── Status Badge ──────────────────────────────────────────────────────── */

function PhaseBadge({ status }: { status: PhaseStatus }) {
  const config = {
    live: { label: "Live", bg: "bg-emerald-100", text: "text-emerald-700", icon: CheckCircle2 },
    building: { label: "Building", bg: "bg-amber-100", text: "text-amber-700", icon: Circle },
    planned: { label: "Planned", bg: "bg-surface-200", text: "text-ink-500", icon: Circle },
  }[status];
  const BadgeIcon = config.icon;

  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2.5 py-0.5", config.bg, config.text)}>
      <BadgeIcon strokeWidth={2} className="h-3 w-3" />
      {config.label}
    </span>
  );
}

/* ── Component ─────────────────────────────────────────────────────────── */

export function PlatformRoadmap() {
  return (
    <section>
      <div className="mb-6">
        <h2 className="text-lg font-bold text-ink-800 flex items-center gap-2">
          <Scale strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
          Platform Roadmap
        </h2>
        <p className="text-sm text-ink-600 mt-1">
          BlockID&apos;s 8-phase spiral — from idea validation to exit.
        </p>
      </div>

      {/* Horizontal scroll on mobile, grid on desktop */}
      <div className="flex gap-4 overflow-x-auto pb-4 snap-x snap-mandatory lg:grid lg:grid-cols-4 lg:overflow-visible lg:pb-0">
        {PHASES.map((phase) => {
          const PhaseIcon = phase.icon;
          return (
            <div
              key={phase.number}
              className={cn(
                "shrink-0 w-[280px] lg:w-auto snap-start rounded-2xl border-2 bg-white shadow-sm transition-all duration-200 hover:shadow-md",
                phase.borderColor,
                phase.status === "live" && "ring-2 ring-brand-200 ring-offset-2",
              )}
            >
              {/* Phase header */}
              <div className={cn("px-5 pt-5 pb-3")}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className={cn("h-9 w-9 rounded-xl flex items-center justify-center", phase.bgColor)}>
                      <PhaseIcon strokeWidth={1.75} className={cn("h-4.5 w-4.5", phase.color)} />
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-ink-400 font-semibold">Phase {phase.number}</p>
                      <p className="text-sm font-bold text-ink-800">{phase.name}</p>
                    </div>
                  </div>
                  <PhaseBadge status={phase.status} />
                </div>
                <p className={cn("text-xs font-medium mb-2", phase.color)}>{phase.subtitle}</p>
                <p className="text-[11px] text-ink-600 leading-relaxed">{phase.description}</p>
              </div>

              {/* Features list */}
              <div className="px-5 pb-5 pt-2 border-t border-surface-100">
                <ul className="space-y-1.5">
                  {phase.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2 text-[11px] text-ink-700">
                      <span className={cn("h-1.5 w-1.5 rounded-full mt-1.5 shrink-0", phase.color.replace("text-", "bg-"))} />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress indicator */}
      <div className="mt-6 flex items-center gap-2 justify-center">
        {PHASES.map((phase) => (
          <div
            key={phase.number}
            className={cn(
              "h-2 rounded-full transition-all",
              phase.status === "live" ? "w-8 bg-emerald-500" : phase.status === "building" ? "w-6 bg-amber-400" : "w-4 bg-surface-300",
            )}
            title={`Phase ${phase.number}: ${phase.name} (${phase.status})`}
          />
        ))}
      </div>
    </section>
  );
}
