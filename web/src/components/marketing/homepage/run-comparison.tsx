/**
 * RunComparison — the three published runs as small multiples, so a
 * visitor can find themselves before typing anything.
 *
 * FORM (dataviz). Small multiples of the same four-bar chart, identical
 * scales across all three cards, which is the whole point: the reader
 * compares by position, not by re-reading axes. Each bar carries a
 * hairline at the Australian cohort average for that dimension at that
 * stage, so a bar means "ahead of peers" or "behind peers" rather than
 * just "a number". One data hue; the reference mark is grey.
 *
 * DATA. Scores, ranges and vignettes are the published anonymised runs,
 * unchanged. The cohort hairlines come from `lib/benchmarks.ts`.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

import {
  cohortBandsForRun,
  cohortStageLabel,
  SAMPLE_RUNS,
} from "./sample-runs";

export function RunComparison() {
  return (
    <ul role="list" className="grid gap-5 md:grid-cols-3">
      {SAMPLE_RUNS.map((run) => {
        const measured = cohortBandsForRun(run).filter(
          (b) => b.measured !== null,
        );
        return (
          <li
            key={run.id}
            className="flex flex-col rounded-2xl border border-line-subtle bg-surface p-5 shadow-xs"
          >
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              {run.stage}
            </p>

            <div className="mt-3 flex items-baseline gap-2">
              <span className="font-sans text-4xl font-semibold leading-none text-primary">
                {run.sviScore}
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                out of 100
              </span>
            </div>

            <p className="mt-2 font-mono text-sm text-secondary tabular-nums">
              {run.valuationLowLabel}
              <span className="mx-1 text-muted">–</span>
              {run.valuationHighLabel}
            </p>

            <ul role="list" className="mt-5 flex flex-col gap-2.5">
              {measured.map((b) => (
                <li key={b.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs text-secondary">{b.label}</span>
                    <span className="font-mono text-xs text-primary tabular-nums">
                      {b.measured}
                    </span>
                  </div>
                  <div
                    className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-hover"
                    role="img"
                    aria-label={`${b.label} scored ${b.measured}; the Australian ${cohortStageLabel(run).toLowerCase()}-stage average is ${b.avg}`}
                  >
                    <div
                      className="h-full rounded-full bg-action"
                      style={{ width: `${b.measured}%` }}
                    />
                    {/* Cohort average — a reference mark, so it stays grey. */}
                    <span
                      aria-hidden
                      className="absolute top-0 h-full w-px bg-line-strong"
                      style={{ left: `${b.avg}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>

            <p className="mt-5 flex-1 text-sm leading-relaxed text-secondary">
              {run.vignette}
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function RunComparisonLegend() {
  return (
    <p className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted">
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="h-2 w-5 rounded-full bg-action" />
        This run
      </span>
      <span className="inline-flex items-center gap-2">
        <span aria-hidden className="h-3 w-px bg-line-strong" />
        Australian average at the same stage
      </span>
      <Link
        href="/reports/samples"
        className="inline-flex items-center gap-1.5 rounded-md text-action transition-colors duration-200 hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
      >
        Read a full report
        <ArrowRight size={12} aria-hidden />
      </Link>
    </p>
  );
}
