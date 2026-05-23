"use client";

import { Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { getGreetingByTime, STAGE_CONTEXT, CELEBRATION_COPY, GOAL_TIPS } from "@/lib/advisor-content";

interface Props {
  userName: string | null;
  startupName: string | null;
  stage: string | null;
  sviStage: number;
  goals: string[] | null;
  sviDelta?: number;
  isFirstAnalysis: boolean;
}

export function AdvisorGreeting({ userName, startupName, stage, sviStage, goals, sviDelta, isFirstAnalysis }: Props) {
  const greeting = getGreetingByTime();
  const name = userName ?? "Founder";
  const stageContext = STAGE_CONTEXT[stage ?? ""] ?? STAGE_CONTEXT[String(sviStage)] ?? STAGE_CONTEXT["0"];

  // SVI change message
  let deltaMessage: string;
  let DeltaIcon = Minus;
  let deltaColor = "text-ink-500";
  if (isFirstAnalysis) {
    deltaMessage = CELEBRATION_COPY.sviFirst;
    DeltaIcon = Sparkles;
    deltaColor = "text-brand-600";
  } else if (sviDelta && sviDelta > 0) {
    deltaMessage = CELEBRATION_COPY.sviUp(sviDelta);
    DeltaIcon = TrendingUp;
    deltaColor = "text-emerald-600";
  } else if (sviDelta && sviDelta < 0) {
    deltaMessage = CELEBRATION_COPY.sviDown(sviDelta);
    DeltaIcon = TrendingDown;
    deltaColor = "text-amber-600";
  } else {
    deltaMessage = CELEBRATION_COPY.sviStable;
    deltaColor = "text-ink-500";
  }

  // Get first goal tip
  const firstGoal = goals?.[0];
  const goalTip = firstGoal ? GOAL_TIPS[firstGoal] : null;

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-white to-emerald-50/40 px-6 py-6 shadow-sm">
      <div className="flex items-start gap-3 mb-3">
        <div className="h-10 w-10 rounded-xl bg-brand-100 flex items-center justify-center shrink-0">
          <Sparkles strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-ink-900">
            {greeting}, {name}.
          </h1>
          {startupName && (
            <p className="text-sm text-ink-600 mt-0.5">
              {startupName} &middot; {stageContext}
            </p>
          )}
          {!startupName && (
            <p className="text-sm text-ink-600 mt-0.5">{stageContext}</p>
          )}
        </div>
      </div>

      {/* SVI delta message */}
      <div className={`flex items-center gap-2 mt-3 ${deltaColor}`}>
        <DeltaIcon strokeWidth={1.75} className="h-4 w-4 shrink-0" />
        <p className="text-sm font-medium">{deltaMessage}</p>
      </div>

      {/* Goal-specific tip */}
      {goalTip && (
        <p className="text-xs text-ink-500 mt-2 pl-7 italic">{goalTip}</p>
      )}
    </div>
  );
}
