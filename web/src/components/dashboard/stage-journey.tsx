"use client";

import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { cn } from "@/lib/utils";

const STAGE_MILESTONES: Record<number, string> = {
  0: "Problem validated",
  1: "MVP shipped",
  2: "First users",
  3: "Repeatable traction",
  4: "Revenue proven",
  5: "Scaling channels",
  6: "Market expansion",
  7: "Exit-ready",
};

interface Props {
  currentStage: number;
}

export function StageJourney({ currentStage }: Props) {
  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm p-5">
      <p className="text-[11px] uppercase tracking-[0.15em] text-brand-600 font-medium mb-4">Your Startup Journey</p>

      <div className="relative">
        {/* Connection line */}
        <div className="absolute top-3 left-3 right-3 h-0.5 bg-surface-200" />
        <div
          className="absolute top-3 left-3 h-0.5 bg-brand-500 transition-all duration-700"
          style={{ width: `${Math.min((currentStage / 7) * 100, 100)}%` }}
        />

        {/* Stage dots */}
        <div className="relative flex justify-between">
          {SVI_STAGE_LABELS.map((label, i) => {
            const isCurrent = i === currentStage;
            const isPast = i < currentStage;
            const isNext = i === currentStage + 1;

            return (
              <div key={i} className="flex flex-col items-center" style={{ width: "12.5%" }}>
                <div
                  className={cn(
                    "h-6 w-6 rounded-full border-2 flex items-center justify-center relative z-10 transition-all",
                    isCurrent
                      ? "border-brand-600 bg-brand-600 ring-4 ring-brand-100"
                      : isPast
                        ? "border-brand-500 bg-brand-500"
                        : isNext
                          ? "border-brand-300 bg-white"
                          : "border-surface-300 bg-white",
                  )}
                >
                  {(isCurrent || isPast) && (
                    <svg viewBox="0 0 12 12" className="h-3 w-3 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                  {isNext && (
                    <div className="h-2 w-2 rounded-full bg-brand-300" />
                  )}
                </div>
                <p className={cn(
                  "text-[9px] text-center mt-1.5 leading-tight",
                  isCurrent ? "text-brand-700 font-semibold" : isPast ? "text-ink-600" : "text-ink-400",
                )}>
                  {label}
                </p>
                {isCurrent && (
                  <span className="text-[8px] text-brand-500 font-medium mt-0.5">YOU</span>
                )}
                {isNext && (
                  <p className="text-[8px] text-ink-400 mt-0.5 text-center leading-tight">
                    {STAGE_MILESTONES[i]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
