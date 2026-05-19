"use client";

import * as React from "react";
import { CheckCircle2, AlertTriangle, TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";

interface WeeklyReportCardProps {
  currentSVI: number;
  previousSVI: number;
  currentStage: number;
  wins: string[];
  gaps: string[];
  onAddEvidence?: () => void;
  reportHref?: string;
}

export function WeeklyReportCard({
  currentSVI, previousSVI, currentStage, wins, gaps, onAddEvidence, reportHref = "#"
}: WeeklyReportCardProps) {
  const delta = currentSVI - previousSVI;
  const positive = delta >= 0;
  const stageLabel = SVI_STAGE_LABELS[currentStage] ?? "Unknown";
  const nextStageLabel = SVI_STAGE_LABELS[currentStage + 1];
  const stageProgress = ((currentSVI - 100) / (220 - 100)) * 100;

  return (
    <div className="bg-white border border-surface-200 shadow-sm rounded-2xl p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-700 font-medium">Báo cáo tuần / Weekly Report</p>
          <p className="text-xs text-ink-600 mt-0.5">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}</p>
        </div>
        {/* Delta badge */}
        <div className={cn(
          "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono font-bold text-lg",
          positive ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500",
        )}>
          {positive ? <TrendingUp strokeWidth={1.75} className="h-4 w-4" /> : <TrendingDown strokeWidth={1.75} className="h-4 w-4" />}
          {positive ? "+" : ""}{delta}
        </div>
      </div>

      {/* SVI score */}
      <div className="flex items-baseline gap-2">
        <span className={cn(
          "font-mono text-4xl font-bold",
          currentSVI >= 140 ? "text-emerald-600" : currentSVI >= 120 ? "text-brand-600" : currentSVI >= 100 ? "text-amber-600" : "text-red-500"
        )}>{currentSVI}</span>
        <span className="text-ink-700 text-sm font-mono">SVI</span>
        <span className="text-ink-700 text-xs ml-1">vs {previousSVI} tuần trước</span>
      </div>

      {/* Stage progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-brand-600 font-medium">{stageLabel}</span>
          {nextStageLabel && <span className="text-ink-700">→ {nextStageLabel}</span>}
        </div>
        <div className="h-1.5 w-full rounded-full bg-surface-200 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, stageProgress))}%` }} />
        </div>
      </div>

      {/* Wins & Gaps */}
      <div className="grid grid-cols-2 gap-3">
        {wins.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-emerald-600 font-medium mb-1.5">Wins</p>
            <ul className="space-y-1">{wins.slice(0, 3).map(w => <li key={w} className="flex items-start gap-1.5 text-xs text-ink-600"><CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-emerald-500 mt-0.5 shrink-0" />{w}</li>)}</ul>
          </div>
        )}
        {gaps.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-amber-600 font-medium mb-1.5">Gaps</p>
            <ul className="space-y-1">{gaps.slice(0, 3).map(g => <li key={g} className="flex items-start gap-1.5 text-xs text-ink-600"><AlertTriangle strokeWidth={1.75} className="h-3 w-3 text-amber-500 mt-0.5 shrink-0" />{g}</li>)}</ul>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2 pt-1">
        <a href={reportHref} className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg border border-surface-200 text-xs text-ink-600 hover:text-ink-800 hover:border-surface-200 transition-colors">
          <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
          Xem báo cáo đầy đủ
        </a>
        {onAddEvidence && (
          <button type="button" onClick={onAddEvidence} className="flex-1 h-8 rounded-lg bg-brand-50 border border-brand-200 text-xs font-medium text-brand-600 hover:bg-brand-100 transition-colors cursor-pointer">
            + Thêm bằng chứng
          </button>
        )}
      </div>
    </div>
  );
}
