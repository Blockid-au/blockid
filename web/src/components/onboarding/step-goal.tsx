"use client";

import type { Dispatch } from "react";
import { Check } from "lucide-react";
import type { Segment, WizardAction, WizardState } from "./wizard-types";

const GOALS_BY_SEGMENT: Record<Segment, { id: string; label: string }[]> = {
  founder: [
    { id: "raise_funding", label: "Raise funding" },
    { id: "validate_idea", label: "Validate idea" },
    { id: "track_cap_table", label: "Track cap table" },
  ],
  investor_angel: [
    { id: "screen_deals", label: "Screen deals" },
    { id: "track_watchlist", label: "Track watchlist" },
    { id: "portfolio_dd", label: "Portfolio due-diligence" },
  ],
  investor_vc: [
    { id: "deal_flow_pipeline", label: "Deal-flow pipeline" },
    { id: "portfolio_monitoring", label: "Portfolio monitoring" },
    { id: "lp_reports", label: "LP reports" },
  ],
  advisor: [
    { id: "manage_clients", label: "Manage clients" },
    { id: "white_label_reports", label: "White-label reports" },
    { id: "weekly_digests", label: "Weekly digests" },
  ],
  accelerator: [
    { id: "run_cohort", label: "Run cohort" },
    { id: "applicant_screening", label: "Applicant screening" },
    { id: "lp_ready_reports", label: "LP-ready reports" },
  ],
};

export function StepGoal({
  state,
  dispatch,
}: {
  state: WizardState;
  dispatch: Dispatch<WizardAction>;
}) {
  const segment = state.segment ?? "founder";
  const goals = GOALS_BY_SEGMENT[segment];

  function choose(goalId: string) {
    dispatch({ type: "SET_GOAL", goal: goalId });
    dispatch({ type: "NEXT" });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-brand-ink sm:text-3xl">
        What do you want to do first?
      </h1>
      <p className="mt-2 text-brand-ink-muted">
        Pick your main goal — you can explore everything else later.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        {goals.map((goal) => {
          const selected = state.goal === goal.id;
          return (
            <button
              key={goal.id}
              type="button"
              onClick={() => choose(goal.id)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-2 rounded-full border px-5 py-3 text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy ${
                selected
                  ? "border-brand-cyan bg-brand-cyan/10 text-brand-cyan"
                  : "border-brand-cyan/15 bg-brand-navy-elev-1 text-brand-ink hover:border-brand-cyan/40 hover:bg-brand-navy-elev-2"
              }`}
            >
              {selected && (
                <Check aria-hidden="true" className="h-4 w-4" />
              )}
              {goal.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
