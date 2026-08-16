"use client";

/**
 * OnboardingProgressBar — T_ONBOARD_0001
 *
 * Slim horizontal bar rendered at the top of the main workspace
 * content area (below the topbar, above page content). Shows how many
 * of the 12 investor-readiness steps the founder has completed, which
 * phase they're in, and a clickable step list for quick navigation.
 *
 * Dismissible via localStorage key `onboarding_dismissed`. Once all
 * 12 steps are done the bar self-hides permanently.
 */

import * as React from "react";
import Link from "next/link";
import { X, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Step definition ────────────────────────────────────────────────────────

interface OnboardingStep {
  id: string;
  label: string;
  href: string;
  phase: number;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
  { id: "profile",       label: "Complete profile",        href: "/workspace/profile",        phase: 1 },
  { id: "idea",          label: "Describe your idea",      href: "/score",                    phase: 1 },
  { id: "svi_score",     label: "Get SVI score",           href: "/dashboard/svi",            phase: 1 },
  { id: "evidence",      label: "Add evidence",            href: "/workspace/evidence",       phase: 2 },
  { id: "market",        label: "Define market size",      href: "/workspace/market-size",    phase: 2 },
  { id: "cap_table",     label: "Set up cap table",        href: "/workspace/equity-setup",   phase: 3 },
  { id: "team",          label: "Add team members",        href: "/workspace/team",           phase: 3 },
  { id: "dataroom",      label: "Start data room",         href: "/workspace/data-room",      phase: 4 },
  { id: "documents",     label: "Upload key docs",         href: "/workspace/documents",      phase: 4 },
  { id: "investor_pack", label: "Generate investor pack",  href: "/workspace/investor-pack",  phase: 5 },
  { id: "metrics",       label: "Add metrics",             href: "/workspace/metrics",        phase: 5 },
  { id: "fundraise",     label: "Set fundraise goal",      href: "/workspace/fundraise",      phase: 6 },
];

const PHASE_LABELS: Record<number, string> = {
  1: "Validate",
  2: "Evidence",
  3: "Ownership",
  4: "Data Room",
  5: "Investor Ready",
  6: "Fundraise",
};

// ── Props ──────────────────────────────────────────────────────────────────

export interface OnboardingProgressProps {
  /** Step IDs the founder has already completed (from getCompletedOnboardingSteps). */
  completedSteps: string[];
  /** Current pathname — used to highlight the active step. */
  currentPath: string;
}

// ── localStorage dismiss key ────────────────────────────────────────────────

const DISMISS_KEY = "onboarding_dismissed";

// ── Component ─────────────────────────────────────────────────────────────

export function OnboardingProgressBar({
  completedSteps,
  currentPath,
}: OnboardingProgressProps) {
  // Dismissal state — useSyncExternalStore avoids useEffect hydration flash.
  const dismissed = React.useSyncExternalStore(
    () => () => {},
    () =>
      typeof window !== "undefined"
        ? localStorage.getItem(DISMISS_KEY) === "true"
        : false,
    () => false,
  );

  const [hidden, setHidden] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);

  const completedSet = React.useMemo(
    () => new Set(completedSteps),
    [completedSteps],
  );

  const completedCount = ONBOARDING_STEPS.filter((s) =>
    completedSet.has(s.id),
  ).length;
  const totalSteps = ONBOARDING_STEPS.length;
  const pct = Math.round((completedCount / totalSteps) * 100);

  // Find the current step index (first incomplete step, or last if all done)
  const currentStepIndex = React.useMemo(() => {
    const idx = ONBOARDING_STEPS.findIndex((s) => !completedSet.has(s.id));
    return idx === -1 ? totalSteps : idx;
  }, [completedSet, totalSteps]);

  const currentStepNumber = Math.min(currentStepIndex + 1, totalSteps);
  const currentPhase =
    ONBOARDING_STEPS[Math.min(currentStepIndex, totalSteps - 1)].phase;

  // Hide when all steps done (founder is investor-ready — celebrate elsewhere).
  if (completedCount >= totalSteps) return null;
  if (dismissed || hidden) return null;

  const dismiss = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(DISMISS_KEY, "true");
    }
    setHidden(true);
  };

  return (
    <div className="border-b border-[rgba(255,255,255,0.06)] bg-[#0D1220] text-[#F8FAFC]">
      {/* ── Compact summary row ─────────────────────────────────────────── */}
      <div className="flex items-center gap-3 px-4 py-2">
        {/* Step count + phase label */}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-xs text-[#94A3B8] hover:text-[#F8FAFC] transition-colors cursor-pointer shrink-0"
          aria-expanded={expanded}
          aria-controls="onboarding-steps-panel"
        >
          <span className="font-semibold text-[#F8FAFC]">
            Step {currentStepNumber} of {totalSteps}
          </span>
          <span className="hidden sm:inline text-[#94A3B8]">
            &middot; Phase {currentPhase}: {PHASE_LABELS[currentPhase]}
          </span>
          <span className="hidden sm:inline text-[#94A3B8]">
            &middot; {pct}% complete
          </span>
        </button>

        {/* Progress bar */}
        <div className="flex-1 h-1 rounded-full bg-[rgba(255,255,255,0.08)] overflow-hidden">
          <div
            className="h-1 rounded-full bg-brand-500 transition-all duration-500"
            style={{ width: `${pct}%` }}
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`${pct}% of onboarding complete`}
          />
        </div>

        {/* Mobile step count */}
        <span className="sm:hidden text-[11px] text-[#94A3B8] shrink-0">
          {pct}%
        </span>

        {/* Expand toggle + dismiss */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="text-[11px] font-medium text-[#94A3B8] hover:text-[#F8FAFC] px-2 py-1 rounded-lg hover:bg-[rgba(255,255,255,0.06)] transition-colors cursor-pointer"
            aria-label={expanded ? "Collapse onboarding steps" : "Expand onboarding steps"}
          >
            {expanded ? "Hide steps" : "Show steps"}
          </button>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss onboarding progress bar"
            className="h-6 w-6 flex items-center justify-center rounded-full text-[#94A3B8] hover:bg-[rgba(255,255,255,0.08)] hover:text-[#F8FAFC] transition-colors cursor-pointer"
          >
            <X strokeWidth={1.75} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Expanded step list ───────────────────────────────────────────── */}
      {expanded && (
        <div
          id="onboarding-steps-panel"
          className="px-4 pb-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-x-3 gap-y-1.5"
        >
          {ONBOARDING_STEPS.map((step, idx) => {
            const done = completedSet.has(step.id);
            const active =
              currentPath === step.href ||
              currentPath.startsWith(step.href + "/");
            const isCurrent = idx === currentStepIndex;
            return (
              <Link
                key={step.id}
                href={step.href}
                className={cn(
                  "flex items-center gap-1.5 text-xs rounded-lg px-2 py-1.5 transition-colors",
                  done
                    ? "text-emerald-400 hover:text-emerald-300 hover:bg-[rgba(52,211,153,0.08)]"
                    : active || isCurrent
                    ? "text-[#00D4FF] bg-[rgba(0,212,255,0.08)] hover:bg-[rgba(0,212,255,0.12)]"
                    : "text-[#94A3B8] hover:text-[#F8FAFC] hover:bg-[rgba(255,255,255,0.06)]",
                )}
              >
                {done ? (
                  <CheckCircle2
                    strokeWidth={1.75}
                    className="h-3.5 w-3.5 shrink-0 text-emerald-400"
                  />
                ) : (
                  <Circle
                    strokeWidth={1.75}
                    className={cn(
                      "h-3.5 w-3.5 shrink-0",
                      isCurrent ? "text-[#00D4FF]" : "text-[#94A3B8]/50",
                    )}
                  />
                )}
                <span className="truncate">{step.label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
