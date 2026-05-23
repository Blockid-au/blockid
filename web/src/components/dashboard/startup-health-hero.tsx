"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { estimateValuation, formatAUD } from "@/lib/valuation";
import { cn } from "@/lib/utils";

interface Props {
  analysis: SVIAnalysis;
  lastAnalysisDate?: string;
  previousSVI?: number;
}

function scoreColor(svi: number): string {
  if (svi >= 200) return "text-violet-500";
  if (svi >= 170) return "text-emerald-500";
  if (svi >= 140) return "text-brand-500";
  if (svi >= 110) return "text-blue-500";
  if (svi >= 80) return "text-amber-500";
  return "text-red-500";
}

function scoreLabel(svi: number): string {
  if (svi >= 200) return "Elite";
  if (svi >= 170) return "Exceptional";
  if (svi >= 140) return "Strong";
  if (svi >= 110) return "Promising";
  if (svi >= 80) return "Developing";
  return "Early Stage";
}

function ringColor(svi: number): string {
  if (svi >= 200) return "stroke-violet-500";
  if (svi >= 170) return "stroke-emerald-500";
  if (svi >= 140) return "stroke-brand-500";
  if (svi >= 110) return "stroke-blue-500";
  if (svi >= 80) return "stroke-amber-500";
  return "stroke-red-500";
}

export function StartupHealthHero({ analysis, lastAnalysisDate, previousSVI }: Props) {
  const svi = analysis.totalSVI;
  const stage = analysis.stage ?? 0;
  const stageLabel = SVI_STAGE_LABELS[stage] ?? "Concept";
  const delta = previousSVI != null ? svi - previousSVI : undefined;
  const val = estimateValuation(svi, stage);
  const percentile = analysis.percentileRank ?? 50;

  // Ring progress (capped at 250 for visual)
  const maxSVI = 250;
  const pct = Math.min(svi / maxSVI, 1);
  const circumference = 2 * Math.PI * 54; // radius 54
  const dashOffset = circumference * (1 - pct);

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.15em] text-brand-600 font-medium">Startup Health</p>
          <p className="text-xs text-ink-500 mt-0.5">{stageLabel} Stage</p>
        </div>
        {lastAnalysisDate && (
          <Link
            href="/"
            className="flex items-center gap-1.5 text-[11px] font-medium text-brand-600 hover:text-brand-700 transition-colors"
          >
            <RefreshCw strokeWidth={1.75} className="h-3 w-3" />
            Re-analyze
          </Link>
        )}
      </div>

      {/* Score ring */}
      <div className="flex items-center gap-6">
        <div className="relative h-32 w-32 shrink-0">
          <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
            <circle cx="60" cy="60" r="54" fill="none" strokeWidth="8" className="stroke-surface-200" />
            <circle
              cx="60" cy="60" r="54" fill="none" strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              className={cn("transition-all duration-1000", ringColor(svi))}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-3xl font-bold", scoreColor(svi))}>{svi}</span>
            <span className="text-[10px] text-ink-500 font-medium">{scoreLabel(svi)}</span>
          </div>
        </div>

        <div className="flex-1 space-y-3">
          {/* Delta */}
          {delta != null && delta !== 0 && (
            <div className={cn("text-sm font-semibold", delta > 0 ? "text-emerald-600" : "text-red-500")}>
              {delta > 0 ? "+" : ""}{delta} pts since last analysis
            </div>
          )}

          {/* Valuation estimate */}
          <div className="rounded-lg bg-surface-50 border border-surface-200 px-3 py-2">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">Est. Valuation</p>
            <p className="text-sm font-semibold text-ink-800">
              {formatAUD(val.low)} – {formatAUD(val.high)}
            </p>
          </div>

          {/* Percentile */}
          <p className="text-xs text-ink-500">
            Top <span className="font-semibold text-ink-700">{100 - percentile}%</span> of {stageLabel} startups in AU
          </p>

          {/* Confidence */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-surface-200 overflow-hidden">
              <div
                className="h-full rounded-full bg-brand-500 transition-all duration-700"
                style={{ width: `${Math.round(analysis.confidenceMultiplier * 100)}%` }}
              />
            </div>
            <span className="text-[10px] text-ink-500 font-mono">
              {Math.round(analysis.confidenceMultiplier * 100)}% confidence
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
