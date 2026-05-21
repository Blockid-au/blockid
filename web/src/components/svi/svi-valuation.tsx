"use client";

import { cn } from "@/lib/utils";
import { estimateValuation, formatAUD } from "@/lib/valuation";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { TrendingUp, Info } from "lucide-react";

export function SVIValuation({ analysis, className }: { analysis: SVIAnalysis; className?: string }) {
  const est = estimateValuation(analysis.totalSVI, analysis.stage ?? 0);

  return (
    <div className={cn("rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden", className)}>
      <div className="px-5 py-4 border-b border-surface-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Estimated Valuation</h3>
        </div>
        <span className="text-[10px] text-ink-400 flex items-center gap-1">
          <Info strokeWidth={1.75} className="h-3 w-3" /> Indicative only
        </span>
      </div>
      <div className="p-5">
        <div className="text-center mb-4">
          <p className="text-xs text-ink-500 uppercase tracking-wider mb-1">Pre-money estimate</p>
          <p className="text-4xl font-extrabold text-brand-600">{formatAUD(est.mid)}</p>
          <p className="text-sm text-ink-500 mt-1">{formatAUD(est.low)} — {formatAUD(est.high)} range</p>
        </div>
        <div className="flex items-center justify-center gap-4 text-xs text-ink-500">
          <span>Method: {est.method}</span>
          <span>Confidence: {est.confidence}%</span>
        </div>
        <p className="mt-4 text-[11px] text-ink-400 text-center leading-relaxed">
          Based on your SVI score, stage, and AU market benchmarks. Upload revenue data and evidence to improve accuracy. Not financial advice.
        </p>
      </div>
    </div>
  );
}
