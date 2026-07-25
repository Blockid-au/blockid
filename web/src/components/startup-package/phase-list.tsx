"use client";

// Startup Package — vertical 12-phase progress list (left rail).
//
// Pure display component: renders one row per GROWTH_PHASES entry, with
// completion state pulled from `startup_package_progress`. Click a row →
// scrolls to the phase-card in the center column via anchor id
// `#phase-<phaseId>`. Kept dumb so the parent RSC page owns state.
//
// SUBGOAL 6 (spawn-agent-v-d-ng-cosmic-aho plan).

import { CheckCircle2, Circle, Loader2, Play } from "lucide-react";
import type { GrowthPhase } from "@/lib/startup-growth-phases";
import { cn } from "@/lib/utils";

export type PhaseStatus =
  | "not_started"
  | "in_progress"
  | "review"
  | "completed";

export interface PhaseListItem {
  phase: GrowthPhase;
  status: PhaseStatus;
  completionPct: number;
}

interface Props {
  items: PhaseListItem[];
  currentPhaseId: string;
  onSelect?: (phaseId: string) => void;
}

export function PhaseList({ items, currentPhaseId, onSelect }: Props) {
  return (
    <nav aria-label="Startup Package phases" className="space-y-1">
      <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
        12-phase journey
      </p>
      <ol className="space-y-1">
        {items.map((item) => {
          const isActive = item.phase.id === currentPhaseId;
          return (
            <li key={item.phase.id}>
              <a
                href={`#phase-${item.phase.id}`}
                onClick={() => onSelect?.(item.phase.id)}
                className={cn(
                  "group flex items-start gap-3 rounded-xl px-3 py-2.5 transition-colors",
                  isActive
                    ? "bg-brand-50 ring-1 ring-brand-200"
                    : "hover:bg-surface-50",
                )}
              >
                <PhaseIcon status={item.status} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={cn(
                        "truncate text-sm font-semibold",
                        isActive ? "text-brand-700" : "text-ink-800",
                      )}
                    >
                      {item.phase.order}. {item.phase.title}
                    </p>
                    <span className="shrink-0 text-[10px] font-medium uppercase tracking-wider text-ink-500">
                      {statusLabel(item.status)}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500">
                    {item.phase.subtitle}
                  </p>
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-surface-200">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        item.status === "completed"
                          ? "bg-emerald-500"
                          : "bg-brand-500",
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(0, item.completionPct))}%`,
                      }}
                    />
                  </div>
                </div>
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function PhaseIcon({ status }: { status: PhaseStatus }) {
  if (status === "completed") {
    return (
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500"
      />
    );
  }
  if (status === "in_progress") {
    return (
      <Loader2
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-brand-500"
      />
    );
  }
  if (status === "review") {
    return (
      <Play
        aria-hidden="true"
        className="mt-0.5 h-5 w-5 shrink-0 text-amber-500"
      />
    );
  }
  return (
    <Circle
      aria-hidden="true"
      className="mt-0.5 h-5 w-5 shrink-0 text-ink-300"
    />
  );
}

function statusLabel(status: PhaseStatus): string {
  switch (status) {
    case "completed":
      return "Done";
    case "in_progress":
      return "In progress";
    case "review":
      return "Review";
    default:
      return "Not started";
  }
}
