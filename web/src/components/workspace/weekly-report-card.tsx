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
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5 space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-medium">Báo cáo tuần / Weekly Report</p>
          <p className="text-xs text-slate-400 mt-0.5">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "short" })}</p>
        </div>
        {/* Delta badge */}
        <div className={cn(
          "flex items-center gap-1.5 rounded-xl px-3 py-1.5 font-mono font-bold text-lg",
          positive ? "bg-green-500/10 text-green-400" : "bg-red-500/10 text-red-400",
        )}>
          {positive ? <TrendingUp strokeWidth={1.75} className="h-4 w-4" /> : <TrendingDown strokeWidth={1.75} className="h-4 w-4" />}
          {positive ? "+" : ""}{delta}
        </div>
      </div>

      {/* SVI score */}
      <div className="flex items-baseline gap-2">
        <span className={cn(
          "font-mono text-4xl font-bold",
          currentSVI >= 140 ? "text-green-400" : currentSVI >= 120 ? "text-brand-400" : currentSVI >= 100 ? "text-amber-400" : "text-red-400"
        )}>{currentSVI}</span>
        <span className="text-slate-500 text-sm font-mono">SVI</span>
        <span className="text-slate-500 text-xs ml-1">vs {previousSVI} tuần trước</span>
      </div>

      {/* Stage progress */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-brand-300 font-medium">{stageLabel}</span>
          {nextStageLabel && <span className="text-slate-500">→ {nextStageLabel}</span>}
        </div>
        <div className="h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
          <div className="h-full rounded-full bg-brand-500 transition-all duration-700" style={{ width: `${Math.min(100, Math.max(0, stageProgress))}%` }} />
        </div>
      </div>

      {/* Wins & Gaps */}
      <div className="grid grid-cols-2 gap-3">
        {wins.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-green-400 font-medium mb-1.5">Wins</p>
            <ul className="space-y-1">{wins.slice(0, 3).map(w => <li key={w} className="flex items-start gap-1.5 text-xs text-slate-400"><CheckCircle2 strokeWidth={1.75} className="h-3 w-3 text-green-400 mt-0.5 shrink-0" />{w}</li>)}</ul>
          </div>
        )}
        {gaps.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-[0.12em] text-amber-400 font-medium mb-1.5">Gaps</p>
            <ul className="space-y-1">{gaps.slice(0, 3).map(g => <li key={g} className="flex items-start gap-1.5 text-xs text-slate-400"><AlertTriangle strokeWidth={1.75} className="h-3 w-3 text-amber-400 mt-0.5 shrink-0" />{g}</li>)}</ul>
          </div>
        )}
      </div>

      {/* CTAs */}
      <div className="flex gap-2 pt-1">
        <a href={reportHref} className="flex-1 h-8 flex items-center justify-center gap-1.5 rounded-lg border border-ink-700 text-xs text-slate-400 hover:text-slate-200 hover:border-ink-600 transition-colors">
          <ArrowRight strokeWidth={1.75} className="h-3.5 w-3.5" />
          Xem báo cáo đầy đủ
        </a>
        {onAddEvidence && (
          <button type="button" onClick={onAddEvidence} className="flex-1 h-8 rounded-lg bg-brand-700/40 border border-brand-600/30 text-xs font-medium text-brand-300 hover:bg-brand-700/60 transition-colors cursor-pointer">
            + Thêm bằng chứng
          </button>
        )}
      </div>
    </div>
  );
}
