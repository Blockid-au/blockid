// Sticky mentor header — RSC. Renders founder identity + phase pill +
// consent chip + next-step banner + quick actions. Sparkline is a tiny
// inline SVG so we avoid pulling in a chart library.

import Link from "next/link";
import { CalendarPlus, NotebookPen, Target, UserCircle2 } from "lucide-react";
import {
  HEAT_LABEL,
  PHASE_LABEL,
  type EngagementHeat,
  type SviPhase,
} from "@/lib/mentor/journey-stages";

interface Props {
  founderId: string;
  displayName: string | null;
  startup: string | null;
  phase: SviPhase;
  heat: EngagementHeat;
  consentTier: "basic" | "reports" | "full" | null;
  sparkline: number[]; // last 6 SVI snapshots
  nextStep: string;
}

function Sparkline({ points }: { points: number[] }) {
  if (points.length === 0) {
    return <span className="text-xs text-ink-400">no snapshots</span>;
  }
  const w = 96;
  const h = 24;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = Math.max(1, max - min);
  const step = points.length > 1 ? w / (points.length - 1) : 0;
  const d = points
    .map((p, i) => {
      const x = i * step;
      const y = h - ((p - min) / span) * h;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="text-brand-600">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

const HEAT_COLOR: Record<EngagementHeat, string> = {
  hot: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  warm: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  cool: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200",
  cold: "bg-surface-200 text-ink-700 dark:bg-surface-800 dark:text-ink-300",
};

export function MentorHeader({
  founderId,
  displayName,
  startup,
  phase,
  heat,
  consentTier,
  sparkline,
  nextStep,
}: Props) {
  return (
    <header className="sticky top-0 z-20 border-b border-surface-200 bg-white/95 backdrop-blur dark:border-surface-700 dark:bg-surface-900/95">
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <UserCircle2 className="h-10 w-10 text-ink-400" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <h1 className="truncate text-base font-semibold text-ink-900 dark:text-ink-50">
              {displayName ?? "Unnamed founder"}
            </h1>
            {startup && (
              <span className="truncate text-sm text-ink-500">
                {startup}
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-800 dark:bg-brand-900/40 dark:text-brand-100">
              {PHASE_LABEL[phase]}
            </span>
            <span className={`rounded-full px-2 py-0.5 ${HEAT_COLOR[heat]}`}>
              {HEAT_LABEL[heat]}
            </span>
            <span className="rounded-full border border-surface-300 px-2 py-0.5 text-ink-600 dark:border-surface-600 dark:text-ink-300">
              Consent: {consentTier ?? "not set"}
            </span>
          </div>
        </div>
        <div className="hidden sm:block">
          <Sparkline points={sparkline} />
        </div>
        <div className="flex flex-wrap gap-1">
          <Link
            href={`/reseller/mentor/${founderId}/checkins`}
            className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2 py-1 text-xs text-ink-800 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-800 dark:text-ink-100"
          >
            <CalendarPlus className="h-3.5 w-3.5" /> Log check-in
          </Link>
          <Link
            href={`/reseller/mentor/${founderId}/notes`}
            className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2 py-1 text-xs text-ink-800 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-800 dark:text-ink-100"
          >
            <NotebookPen className="h-3.5 w-3.5" /> Add note
          </Link>
          <Link
            href={`/reseller/mentor/${founderId}/goals`}
            className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2 py-1 text-xs text-ink-800 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-800 dark:text-ink-100"
          >
            <Target className="h-3.5 w-3.5" /> Set goal
          </Link>
          <Link
            href={`/reseller/customers?open=${founderId}`}
            className="inline-flex items-center gap-1 rounded-md border border-surface-300 bg-white px-2 py-1 text-xs text-ink-600 hover:bg-surface-50 dark:border-surface-600 dark:bg-surface-800 dark:text-ink-300"
          >
            Open in Customers
          </Link>
        </div>
      </div>
      {nextStep && (
        <div className="border-t border-surface-100 bg-brand-50/60 px-4 py-2 text-xs text-brand-900 dark:border-surface-800 dark:bg-brand-900/20 dark:text-brand-100">
          <span className="font-medium">Next step:</span> {nextStep}
        </div>
      )}
    </header>
  );
}

export default MentorHeader;
