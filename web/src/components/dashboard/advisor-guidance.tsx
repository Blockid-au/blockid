"use client";

import * as React from "react";
import { Lightbulb, AlertTriangle, Target, ChevronDown, ChevronUp, Quote } from "lucide-react";
import { getStageAdvice } from "@/lib/advisor-content";
import { cn } from "@/lib/utils";

interface Props {
  sviStage: number;
  riskCount: number;
}

export function AdvisorGuidance({ sviStage, riskCount }: Props) {
  const advice = getStageAdvice(sviStage);
  const [showPitfalls, setShowPitfalls] = React.useState(false);

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-5 py-4 border-b border-surface-200 bg-gradient-to-r from-brand-50 to-emerald-50/30">
        <div className="flex items-center gap-2">
          <Lightbulb strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-semibold text-ink-900">Your Advisor</h3>
        </div>
        <p className="text-[11px] text-ink-500 mt-0.5">Guidance for your current stage</p>
      </div>

      <div className="p-5 flex-1 flex flex-col gap-4">
        {/* Focus areas */}
        <div>
          <p className="text-[10px] uppercase tracking-[0.15em] text-brand-600 font-medium mb-2">Focus this week</p>
          <div className="space-y-2">
            {advice.focusAreas.map((area, i) => (
              <div key={i} className="flex items-start gap-2">
                <Target strokeWidth={1.75} className="h-3.5 w-3.5 mt-0.5 text-brand-500 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-ink-800">{area.title}</p>
                  <p className="text-[11px] text-ink-500 leading-relaxed">{area.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Weekly challenge */}
        <div className="rounded-xl bg-brand-50 border border-brand-100 px-4 py-3">
          <p className="text-[10px] uppercase tracking-[0.15em] text-brand-700 font-medium mb-1">Weekly Challenge</p>
          <p className="text-xs text-brand-800 font-medium">{advice.weeklyChallenge}</p>
        </div>

        {/* Risk warning */}
        {riskCount > 0 && (
          <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5">
            <AlertTriangle strokeWidth={1.75} className="h-3.5 w-3.5 mt-0.5 text-amber-600 shrink-0" />
            <p className="text-xs text-amber-700">
              {riskCount} risk factor{riskCount !== 1 ? "s" : ""} detected. Upload evidence to resolve.
            </p>
          </div>
        )}

        {/* Pitfalls (collapsible) */}
        <button
          type="button"
          onClick={() => setShowPitfalls(!showPitfalls)}
          className="flex items-center justify-between w-full text-left cursor-pointer"
        >
          <span className="text-[10px] uppercase tracking-[0.15em] text-ink-500 font-medium">Pitfalls to avoid</span>
          {showPitfalls
            ? <ChevronUp strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-400" />
            : <ChevronDown strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-400" />
          }
        </button>
        {showPitfalls && (
          <ul className="space-y-1.5">
            {advice.pitfalls.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-ink-600">
                <span className="text-red-400 shrink-0 mt-px">&#x2022;</span>
                {p}
              </li>
            ))}
          </ul>
        )}

        {/* Mentor quote */}
        <div className={cn("mt-auto pt-3 border-t border-surface-100")}>
          <div className="flex items-start gap-2">
            <Quote strokeWidth={1.75} className="h-3.5 w-3.5 text-ink-300 shrink-0 mt-0.5" />
            <p className="text-[11px] text-ink-500 italic leading-relaxed">
              &ldquo;{advice.mentorQuote}&rdquo;
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
