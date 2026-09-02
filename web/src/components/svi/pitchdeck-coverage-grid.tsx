"use client";

import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  Check,
  CircleAlert,
  CircleDashed,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Keep in sync with svi-stream-analysis.tsx DIMS + classify prompt.
const DIMS: Record<string, { label: string; short: string; Icon: LucideIcon; weight: number }> = {
  ftv: { label: "Founder & Team", short: "FTV", Icon: Users, weight: 15 },
  mpc: { label: "Market & Problem", short: "MPC", Icon: Target, weight: 18 },
  ptd: { label: "Product & Tech", short: "PTD", Icon: Cog, weight: 12 },
  tre: { label: "Traction & Revenue", short: "TRE", Icon: TrendingUp, weight: 20 },
  cgh: { label: "Cap Table & Governance", short: "CGH", Icon: Landmark, weight: 12 },
  iri: { label: "Investor Readiness", short: "IRI", Icon: Briefcase, weight: 10 },
  lco: { label: "Legal & Compliance", short: "LCO", Icon: Scale, weight: 8 },
  svm: { label: "Strategic Vision & Moat", short: "SVM", Icon: Sparkles, weight: 5 },
};

export type CoverageLevel = "strong" | "partial" | "missing";
export interface DimCoverage {
  level: CoverageLevel;
  excerpt: string;
}
export type CoverageMap = Record<string, DimCoverage>;

interface PitchdeckCoverageGridProps {
  coverage: CoverageMap;
  selected: Set<string>;
  onToggle: (dim: string) => void;
  /**
   * Credit cost per speculative dim. Zero for strong/partial. Used to
   * render the "+X cr" chip so the founder sees the price before opting in.
   */
  speculativeCostPerDim: Record<string, number>;
}

const LEVEL_LABEL: Record<CoverageLevel, string> = {
  strong: "Strong evidence in deck",
  partial: "Partial — supplement optional",
  missing: "Missing — speculative if selected",
};

function levelClass(level: CoverageLevel): string {
  if (level === "strong")
    return "border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800";
  if (level === "partial")
    return "border-amber-300 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-800";
  return "border-red-300 border-dashed bg-red-50 dark:bg-red-950/20 dark:border-red-800";
}

function LevelIcon({ level }: { level: CoverageLevel }) {
  if (level === "strong")
    return <Check className="h-3.5 w-3.5 text-emerald-700 dark:text-emerald-400" aria-label="Strong evidence" />;
  if (level === "partial")
    return <CircleDashed className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" aria-label="Partial evidence" />;
  return <CircleAlert className="h-3.5 w-3.5 text-red-700 dark:text-red-400" aria-label="Missing evidence" />;
}

export function PitchdeckCoverageGrid({
  coverage,
  selected,
  onToggle,
  speculativeCostPerDim,
}: PitchdeckCoverageGridProps) {
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 flex-wrap">
        <p className="text-xs uppercase tracking-[0.14em] font-semibold text-ink-700 dark:text-ink-300">
          Deck coverage per dimension
        </p>
        <div className="flex items-center gap-2 text-[11px] text-ink-500 dark:text-ink-400 flex-wrap">
          <span className="inline-flex items-center gap-1"><Check className="h-3 w-3 text-emerald-700 dark:text-emerald-400" /> Strong</span>
          <span className="inline-flex items-center gap-1"><CircleDashed className="h-3 w-3 text-amber-700 dark:text-amber-400" /> Partial</span>
          <span className="inline-flex items-center gap-1"><CircleAlert className="h-3 w-3 text-red-700 dark:text-red-400" /> Missing (chargeable)</span>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {Object.entries(DIMS).map(([key, meta]) => {
          const cov = coverage[key] ?? { level: "missing" as const, excerpt: "" };
          const isSelected = selected.has(key);
          const speculativeCost = speculativeCostPerDim[key] ?? 0;
          const isSpeculative = cov.level === "missing";
          return (
            <button
              key={key}
              type="button"
              onClick={() => onToggle(key)}
              aria-pressed={isSelected}
              aria-label={`${meta.label} — ${LEVEL_LABEL[cov.level]}${isSelected ? " (selected)" : ""}`}
              className={cn(
                "min-h-[44px] rounded-lg border p-3 text-left transition-all",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-950",
                levelClass(cov.level),
                isSelected
                  ? "ring-2 ring-brand-500 ring-offset-2 ring-offset-white dark:ring-offset-ink-950"
                  : "hover:shadow-md",
              )}
            >
              <div className="flex items-center gap-1.5 mb-1.5">
                <meta.Icon className="h-3.5 w-3.5 shrink-0 text-brand-600 dark:text-brand-400" aria-hidden="true" />
                <span className="text-[11px] font-semibold text-ink-800 dark:text-ink-100 uppercase tracking-wider">
                  {meta.short}
                </span>
                <span className="ml-auto"><LevelIcon level={cov.level} /></span>
              </div>
              <p className="text-[11px] text-ink-700 dark:text-ink-300 leading-tight mb-1.5 font-medium">
                {meta.label}
              </p>
              {cov.excerpt && (
                <p className="text-[10px] text-ink-500 dark:text-ink-500 leading-snug italic line-clamp-2 mb-1.5">
                  “{cov.excerpt}”
                </p>
              )}
              <div className="flex items-center justify-between gap-1 mt-1">
                <span className="text-[10px] text-ink-600 dark:text-ink-400 tabular-nums">
                  {meta.weight}% weight
                </span>
                {isSpeculative && speculativeCost > 0 && (
                  <span className="inline-flex items-center rounded-full bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-200 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums">
                    +{speculativeCost} cr
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
