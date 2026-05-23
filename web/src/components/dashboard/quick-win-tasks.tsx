"use client";

import { Zap } from "lucide-react";
import type { SVIAnalysis } from "@/lib/svi-analysis";
import { generatePriorityTasks, PriorityTasks } from "@/components/workspace/priority-tasks";

interface Props {
  analysis: SVIAnalysis;
  stage: number;
}

export function QuickWinTasks({ analysis, stage }: Props) {
  const tasks = generatePriorityTasks(analysis, stage);
  if (tasks.length === 0) return null;

  const totalPotential = analysis.evidenceGaps
    ?.slice(0, 5)
    .reduce((sum, g) => sum + (g.impact ?? 0), 0) ?? 0;

  return (
    <div>
      {/* Advisor framing header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Zap strokeWidth={1.75} className="h-4 w-4 text-amber-500" />
          <h3 className="text-sm font-semibold text-ink-900">Quick Wins Your Advisor Recommends</h3>
        </div>
        {totalPotential > 0 && (
          <span className="text-xs font-mono font-semibold text-emerald-600">
            +{totalPotential} SVI potential
          </span>
        )}
      </div>
      <p className="text-xs text-ink-500 mb-3">
        Based on your stage, these actions will have the highest impact on your startup&rsquo;s valuation.
      </p>

      <PriorityTasks tasks={tasks} />
    </div>
  );
}
