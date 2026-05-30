"use client";

import { cn } from "@/lib/utils";
import { Lightbulb, Wrench, Building2, Rocket, TrendingUp, DollarSign } from "lucide-react";

const PHASES = [
  { key: "idea", label: "Idea", sub: "Validate &\nDefine", icon: Lightbulb, color: "brand" },
  { key: "mvp", label: "MVP", sub: "Build &\nTest", icon: Wrench, color: "blue" },
  { key: "structure", label: "Structure", sub: "Ownership &\nCap Table", icon: Building2, color: "purple" },
  { key: "launch", label: "Launch", sub: "Go-to-Market\nStrategy", icon: Rocket, color: "emerald" },
  { key: "scale", label: "Scale", sub: "Growth &\nOptimization", icon: TrendingUp, color: "amber" },
  { key: "raise", label: "Raise", sub: "Investor\nFunding", icon: DollarSign, color: "rose" },
];

// Map color names to Tailwind classes
const COLOR_MAP: Record<string, { bg: string; border: string; text: string; line: string }> = {
  brand: { bg: "bg-brand-100", border: "border-brand-300", text: "text-brand-600", line: "bg-brand-400" },
  blue: { bg: "bg-blue-100", border: "border-blue-300", text: "text-blue-600", line: "bg-blue-400" },
  purple: { bg: "bg-purple-100", border: "border-purple-300", text: "text-purple-600", line: "bg-purple-400" },
  emerald: { bg: "bg-emerald-100", border: "border-emerald-300", text: "text-emerald-600", line: "bg-emerald-400" },
  amber: { bg: "bg-amber-100", border: "border-amber-300", text: "text-amber-600", line: "bg-amber-400" },
  rose: { bg: "bg-rose-100", border: "border-rose-300", text: "text-rose-600", line: "bg-rose-400" },
};

interface GrowthRoadmapProps {
  currentPhase: number; // 0-5
}

export function GrowthRoadmap({ currentPhase }: GrowthRoadmapProps) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white p-6">
      <h3 className="text-sm font-bold text-ink-800 mb-1">Growth Roadmap</h3>
      <p className="text-xs text-ink-500 mb-5">Your startup development journey</p>

      <div className="flex items-start justify-between relative">
        {/* Connecting line */}
        <div className="absolute top-5 left-8 right-8 h-0.5 bg-surface-200" />
        <div
          className="absolute top-5 left-8 h-0.5 bg-brand-500 transition-all duration-500"
          style={{ width: `${Math.min(100, (currentPhase / (PHASES.length - 1)) * 100)}%`, maxWidth: "calc(100% - 64px)" }}
        />

        {PHASES.map((phase, i) => {
          const isComplete = i < currentPhase;
          const isCurrent = i === currentPhase;
          const isFuture = i > currentPhase;
          const colors = COLOR_MAP[phase.color];
          const Icon = phase.icon;

          return (
            <div key={phase.key} className="flex flex-col items-center relative z-10 flex-1">
              {/* Icon circle */}
              <div
                className={cn(
                  "h-10 w-10 rounded-full flex items-center justify-center border-2 transition-all",
                  isComplete && `${colors.bg} ${colors.border} ${colors.text}`,
                  isCurrent && `${colors.bg} ${colors.border} ${colors.text} ring-4 ring-brand-100 animate-pulse`,
                  isFuture && "bg-surface-100 border-surface-300 text-ink-400",
                )}
              >
                {isComplete ? (
                  <svg viewBox="0 0 16 16" fill="none" className="h-4 w-4">
                    <path d="M4 8l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <Icon strokeWidth={1.75} className="h-4 w-4" />
                )}
              </div>

              {/* Labels */}
              <p className={cn(
                "text-[11px] font-bold mt-2 text-center",
                isFuture ? "text-ink-400" : "text-ink-800",
              )}>
                {phase.label}
              </p>
              <p className={cn(
                "text-[9px] text-center leading-tight mt-0.5 whitespace-pre-line",
                isFuture ? "text-ink-300" : "text-ink-500",
              )}>
                {phase.sub}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
