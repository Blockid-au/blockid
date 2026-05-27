"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

/* ── Phase definitions ─────────────────────────────────────────── */

interface Phase {
  label: string;
  href: string;
  tooltip: string;
  sviMin: number;
  sviMax: number;
}

const PHASES: Phase[] = [
  {
    label: "Idea",
    href: "/dashboard",
    tooltip: "SVI Score, AI mentor, evidence vault",
    sviMin: 0,
    sviMax: 30,
  },
  {
    label: "Valuation",
    href: "/workspace/evidence",
    tooltip: "Evidence scoring, gap analysis, valuation model",
    sviMin: 31,
    sviMax: 50,
  },
  {
    label: "Equity",
    href: "/workspace/equity-setup",
    tooltip: "Cap table, ESOP, share classes, vesting",
    sviMin: 51,
    sviMax: 70,
  },
  {
    label: "Fundraise",
    href: "/workspace/fundraise",
    tooltip: "Pitch deck, data room, investor matching",
    sviMin: 71,
    sviMax: 85,
  },
  {
    label: "Growth",
    href: "/workspace/revenue",
    tooltip: "Revenue tracking, metrics, scaling playbook",
    sviMin: 86,
    sviMax: 100,
  },
  {
    label: "Exit",
    href: "/workspace/exit",
    tooltip: "Exit readiness, M&A prep, IPO checklist",
    sviMin: 101,
    sviMax: Infinity,
  },
];

/* ── Props ─────────────────────────────────────────────────────── */

interface JourneyBarProps {
  currentPhase: number; // 0-5
  sviScore: number;
  className?: string;
}

/* ── Component ─────────────────────────────────────────────────── */

export function JourneyBar({ currentPhase, sviScore, className }: JourneyBarProps) {
  const clampedPhase = Math.max(0, Math.min(5, currentPhase));

  return (
    <div className={cn("w-full", className)}>
      {/* Phase circles + connecting lines */}
      <div className="flex items-center justify-between w-full">
        {PHASES.map((phase, idx) => {
          const isCompleted = idx < clampedPhase;
          const isCurrent = idx === clampedPhase;
          const isFuture = idx > clampedPhase;

          return (
            <React.Fragment key={phase.label}>
              {/* Connecting line before this node (skip for first) */}
              {idx > 0 && (
                <div
                  className={cn(
                    "flex-1 h-0.5 transition-colors duration-500",
                    idx <= clampedPhase ? "bg-emerald-500" : "bg-surface-200"
                  )}
                />
              )}

              {/* Phase node */}
              <PhaseNode
                phase={phase}
                isCompleted={isCompleted}
                isCurrent={isCurrent}
                isFuture={isFuture}
              />
            </React.Fragment>
          );
        })}
      </div>

      {/* Phase counter */}
      <p className="text-center text-[11px] text-ink-500 mt-3 tracking-wide">
        Phase {clampedPhase + 1} of {PHASES.length}
        {sviScore > 0 && (
          <span className="ml-1.5 text-ink-400">
            &middot; SVI {sviScore}
          </span>
        )}
      </p>
    </div>
  );
}

/* ── Phase node (circle + label) ───────────────────────────────── */

interface PhaseNodeProps {
  phase: Phase;
  isCompleted: boolean;
  isCurrent: boolean;
  isFuture: boolean;
}

function PhaseNode({ phase, isCompleted, isCurrent, isFuture }: PhaseNodeProps) {
  const [showTooltip, setShowTooltip] = React.useState(false);

  const circle = (
    <div
      className="relative flex flex-col items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      {/* Tooltip */}
      {showTooltip && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 z-20 whitespace-nowrap rounded-lg bg-ink-900 px-3 py-1.5 text-[11px] text-white shadow-lg pointer-events-none">
          {phase.tooltip}
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-4 border-x-transparent border-t-4 border-t-ink-900" />
        </div>
      )}

      {/* Circle */}
      <div
        className={cn(
          "relative flex items-center justify-center rounded-full transition-all duration-300",
          /* sizing: 32px mobile, 40px desktop */
          "h-8 w-8 sm:h-10 sm:w-10",
          isCompleted && "bg-emerald-500",
          isCurrent && "bg-brand-600 animate-pulse",
          isFuture && "bg-surface-200"
        )}
      >
        {isCompleted && (
          <CheckCircle2 className="h-4 w-4 sm:h-5 sm:w-5 text-white" strokeWidth={2.5} />
        )}
        {isCurrent && (
          <span className="block h-2.5 w-2.5 rounded-full bg-white" />
        )}
        {isFuture && (
          <Lock className="h-3 w-3 sm:h-3.5 sm:w-3.5 text-ink-400" strokeWidth={2} />
        )}
      </div>

      {/* Label */}
      <span
        className={cn(
          "mt-1.5 text-[10px] sm:text-xs font-medium leading-none text-center select-none",
          isCompleted && "text-emerald-600",
          isCurrent && "text-brand-600",
          isFuture && "text-ink-400"
        )}
      >
        {phase.label}
      </span>
    </div>
  );

  /* Completed & current phases are clickable */
  if (isCompleted || isCurrent) {
    return (
      <Link href={phase.href} className="flex-shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-brand-500 rounded-full">
        {circle}
      </Link>
    );
  }

  /* Future phases are not clickable */
  return <div className="flex-shrink-0 cursor-default">{circle}</div>;
}
