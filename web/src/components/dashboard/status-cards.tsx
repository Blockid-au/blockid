"use client";

import { ShieldCheck, Target, TrendingUp, Flag } from "lucide-react";
import { cn } from "@/lib/utils";

interface StatusCardsProps {
  sviScore: number | null;
  evidenceCount: number;
  phase: number;
  phaseName: string;
  hasCapTable: boolean;
  hasEquity: boolean;
}

export function StatusCards({ sviScore, evidenceCount, phase, phaseName, hasCapTable, hasEquity }: StatusCardsProps) {
  // Compute statuses
  const ownershipHealth = hasCapTable && hasEquity ? "Excellent" : hasCapTable ? "Good" : "Setup needed";
  const ownershipColor = hasCapTable && hasEquity ? "text-emerald-600" : hasCapTable ? "text-amber-600" : "text-red-500";
  const ownershipSub = hasCapTable ? "Up to date" : "Create your cap table";

  const readiness = sviScore != null ? Math.min(100, Math.round(sviScore * 0.8 + evidenceCount * 2)) : 0;
  const readinessColor = readiness >= 80 ? "text-emerald-600" : readiness >= 50 ? "text-amber-600" : "text-ink-500";
  const readinessSub = readiness >= 80 ? "Strong" : readiness >= 50 ? "Moderate" : "Building";

  const growthStatus = phase >= 3 ? "On Track" : phase >= 1 ? "Building" : "Getting Started";
  const growthColor = phase >= 3 ? "text-emerald-600" : phase >= 1 ? "text-amber-600" : "text-brand-600";
  const growthSub = phase >= 3 ? "All key milestones" : phase >= 1 ? "Core foundations" : "First steps";

  const milestoneTargets = ["Get SVI Score", "Validate Idea", "Build Valuation", "Setup Equity", "Fundraise Ready", "Growth Mode"];
  const nextMilestone = milestoneTargets[Math.min(phase, milestoneTargets.length - 1)];

  const cards = [
    { icon: ShieldCheck, label: "Ownership Health", value: ownershipHealth, sub: ownershipSub, color: ownershipColor },
    { icon: Target, label: "Investor Readiness", value: `${readiness}%`, sub: readinessSub, color: readinessColor },
    { icon: TrendingUp, label: "Growth Execution", value: growthStatus, sub: growthSub, color: growthColor },
    { icon: Flag, label: "Next Milestone", value: nextMilestone, sub: `Phase ${phase + 1}`, color: "text-brand-600" },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div key={card.label} className="rounded-xl border border-surface-200 bg-white px-4 py-3">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-ink-500 uppercase tracking-wider font-medium">{card.label}</p>
              <Icon strokeWidth={1.75} className={cn("h-4 w-4", card.color)} />
            </div>
            <p className={cn("text-sm font-bold", card.color)}>{card.value}</p>
            <p className="text-[10px] text-ink-400 mt-0.5">{card.sub}</p>
          </div>
        );
      })}
    </div>
  );
}
