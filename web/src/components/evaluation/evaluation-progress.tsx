"use client";

import { cn } from "@/lib/utils";
import type { QualityLevel } from "@/lib/evaluation-criteria";
import { Sparkles, CheckCircle2, AlertCircle } from "lucide-react";

interface QualityBreakdown {
  exceptional: number;
  strong: number;
  good: number;
  basic: number;
  incomplete: number;
}

interface EvaluationProgressProps {
  progress: number;
  qualityBreakdown: QualityBreakdown;
  totalCriteria: number;
  onGenerateReport?: () => void;
}

const QUALITY_CONFIG: Record<
  QualityLevel,
  { label: string; color: string; bgColor: string }
> = {
  exceptional: {
    label: "Exceptional",
    color: "text-emerald-600 dark:text-emerald-400",
    bgColor: "bg-emerald-500",
  },
  strong: {
    label: "Strong",
    color: "text-brand-600 dark:text-brand-400",
    bgColor: "bg-brand-500",
  },
  good: {
    label: "Good",
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-500",
  },
  basic: {
    label: "Basic",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
  },
  incomplete: {
    label: "Incomplete",
    color: "text-ink-400 dark:text-ink-500",
    bgColor: "bg-ink-300",
  },
};

export function EvaluationProgress({
  progress,
  qualityBreakdown,
  totalCriteria,
  onGenerateReport,
}: EvaluationProgressProps) {
  const completedCount = totalCriteria - qualityBreakdown.incomplete;

  // Determine the progress ring colour
  const ringColor =
    progress >= 80
      ? "stroke-emerald-500"
      : progress >= 50
        ? "stroke-brand-500"
        : progress >= 25
          ? "stroke-amber-500"
          : "stroke-ink-300";

  // SVG circular progress
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  return (
    <div className="bg-white dark:bg-ink-900 rounded-2xl border border-ink-200 dark:border-ink-700 p-6">
      <div className="flex flex-col sm:flex-row items-center gap-6">
        {/* Circular progress */}
        <div className="relative shrink-0">
          <svg width="132" height="132" className="-rotate-90">
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="10"
              className="text-ink-100 dark:text-ink-800"
            />
            <circle
              cx="66"
              cy="66"
              r={radius}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              className={cn("transition-all duration-700 ease-out", ringColor)}
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-ink-900 dark:text-ink-100">
              {progress}%
            </span>
            <span className="text-[11px] text-ink-500 dark:text-ink-400">
              readiness
            </span>
          </div>
        </div>

        {/* Stats and breakdown */}
        <div className="flex-1 min-w-0 w-full">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-lg font-semibold text-ink-900 dark:text-ink-100">
              Evaluation Progress
            </h3>
            {completedCount === totalCriteria && (
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
            )}
          </div>
          <p className="text-sm text-ink-500 dark:text-ink-400 mb-4">
            {completedCount} of {totalCriteria} criteria have evidence
          </p>

          {/* Quality breakdown bars */}
          <div className="space-y-2">
            {(
              Object.entries(QUALITY_CONFIG) as [
                QualityLevel,
                (typeof QUALITY_CONFIG)[QualityLevel],
              ][]
            ).map(([level, config]) => {
              const count = qualityBreakdown[level];
              if (count === 0) return null;
              return (
                <div key={level} className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-2.5 h-2.5 rounded-full shrink-0",
                      config.bgColor,
                    )}
                  />
                  <span
                    className={cn(
                      "text-xs font-medium w-20 shrink-0",
                      config.color,
                    )}
                  >
                    {config.label}
                  </span>
                  <div className="flex-1 h-1.5 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        config.bgColor,
                      )}
                      style={{
                        width: `${(count / totalCriteria) * 100}%`,
                      }}
                    />
                  </div>
                  <span className="text-xs text-ink-500 dark:text-ink-400 w-5 text-right tabular-nums">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Generate Report CTA */}
          {progress >= 50 ? (
            <button
              type="button"
              onClick={onGenerateReport}
              className="mt-4 inline-flex items-center gap-2 bg-brand-600 hover:bg-brand-700 text-white rounded-xl px-4 py-2 text-sm font-medium transition-colors"
            >
              <Sparkles className="h-4 w-4" />
              Generate Enhanced Report
            </button>
          ) : (
            <div className="mt-4 flex items-center gap-2 text-xs text-ink-400 dark:text-ink-500">
              <AlertCircle className="h-3.5 w-3.5" />
              Complete at least 50% to unlock AI-enhanced reports
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
