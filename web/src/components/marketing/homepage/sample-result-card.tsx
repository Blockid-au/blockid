/**
 * SampleResultCard — the ONE sample result on the homepage (G17 D3 block
 * 4): score, valuation range, the strongest and weakest of the published
 * dimensions, and the two links out (the Investor Dossier demo, the sample
 * written report). Every figure comes from `sample-runs.ts`, the same
 * fixture the /samples gallery and /product draw from, so it cannot drift.
 *
 * NO `A$` PREFIX. The homepage carries no price strings (D3, pinned by
 * page.test.tsx as `/A\$\d/`); a valuation is not a price, but the same
 * regex would catch it, so the range is written `$850K – $2.1M` with a
 * separate `AUD` unit.
 *
 * RESERVED HEIGHT (CLS < 0.1): the card is `min-h-[22rem]` so the block
 * never grows after first paint; the bars are plain divs with percentage
 * widths — no measurement, no animation.
 *
 * Server component.
 */

import Link from "next/link";
import { ArrowRight, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MOTION } from "@/components/marketing/template/primitives";
import { cohortBandsForRun, cohortStageLabel, runById, type SampleRun } from "./sample-runs";

export const SAMPLE_CARD_LINKS = {
  dossier: { href: "/tbr/demo", label: "Open the Investor Dossier", ctaId: "home_sample_dossier" },
  report: { href: "/sample-business-report", label: "Read the written report", ctaId: "home_sample_report" },
} as const;

/** "A$850K" → "$850K" — the unit is rendered once, separately. */
export function stripAud(label: string): string {
  return label.replace(/^A\$/, "$");
}

/** The published dimensions of a run, weakest first. */
export function publishedDimensions(run: SampleRun) {
  return cohortBandsForRun(run)
    .filter((b): b is typeof b & { measured: number } => b.measured !== null)
    .sort((a, b) => a.measured - b.measured);
}

export interface SampleResultCardProps {
  runId?: SampleRun["id"];
  className?: string;
}

export function SampleResultCard({ runId = "mvp", className }: SampleResultCardProps) {
  const run = runById(runId);
  const dims = publishedDimensions(run);
  const weakest = dims[0]!;
  const strongest = dims[dims.length - 1]!;

  return (
    <article
      aria-labelledby="sample-result-heading"
      data-testid="sample-result-card"
      className={cn(
        "grid min-h-[22rem] gap-8 rounded-xl border border-line-subtle bg-surface p-6 shadow-2 sm:p-8 lg:grid-cols-[1fr_1.1fr] lg:gap-12",
        className,
      )}
    >
      <div className="flex flex-col">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          A real run · {run.stage} · anonymised
        </p>
        <h3 id="sample-result-heading" className="sr-only">
          Sample result: {run.stage}
        </h3>
        <p className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-6xl font-bold leading-none text-primary tabular-nums">
            {run.sviScore}
          </span>
          <span className="text-sm font-medium uppercase tracking-wider text-muted">out of 100</span>
        </p>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted">Valuation range</dt>
            <dd className="mt-1 font-mono text-base text-primary tabular-nums">
              {stripAud(run.valuationLowLabel)}
              <span className="mx-1 text-muted">–</span>
              {stripAud(run.valuationHighLabel)}
              <span className="ml-1.5 text-xs text-muted">AUD</span>
            </dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted">Top risk</dt>
            <dd className="mt-1 text-base font-medium text-primary">{weakest.label}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted">Strongest</dt>
            <dd className="mt-1 text-base font-medium text-primary">{strongest.label}</dd>
          </div>
          <div>
            <dt className="text-xs uppercase tracking-[0.14em] text-muted">Cohort</dt>
            <dd className="mt-1 text-base font-medium text-primary">AU · {cohortStageLabel(run)} stage</dd>
          </div>
        </dl>
        <p className="mt-5 text-sm leading-relaxed text-secondary">{run.vignette}</p>
        <div className="mt-auto flex flex-wrap gap-x-5 gap-y-2 pt-6">
          <Link
            href={SAMPLE_CARD_LINKS.dossier.href}
            data-cta-id={SAMPLE_CARD_LINKS.dossier.ctaId}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-semibold text-action hover:text-action-hover", MOTION, FOCUS_RING)}
          >
            <FileText size={16} aria-hidden />
            {SAMPLE_CARD_LINKS.dossier.label}
            <ArrowRight size={14} aria-hidden />
          </Link>
          <Link
            href={SAMPLE_CARD_LINKS.report.href}
            data-cta-id={SAMPLE_CARD_LINKS.report.ctaId}
            className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-md text-sm font-medium text-action hover:text-action-hover", MOTION, FOCUS_RING)}
          >
            {SAMPLE_CARD_LINKS.report.label}
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>

      {/* The published readings as meters against the AU cohort average —
          the same grammar as every chart on /product. */}
      <div className="rounded-lg bg-surface-sunken p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
          Published dimensions vs. the stage benchmark
        </p>
        <ul role="list" className="mt-4 space-y-3.5">
          {[...dims].reverse().map((b) => (
            <li key={b.key} className="flex items-center gap-3">
              <span className="w-36 shrink-0 text-sm text-secondary">{b.label}</span>
              <span className="relative mb-2 h-2 flex-1">
                <span className="block h-full w-full overflow-hidden rounded-full bg-surface-hover">
                  <span className="block h-full rounded-full bg-action" style={{ width: `${b.measured}%` }} />
                </span>
                {/* The cohort tick hangs below the bar: inside the fill it
                    is invisible. */}
                <span aria-hidden className="absolute -bottom-1.5 h-2 w-px bg-line-strong" style={{ left: `${b.avg}%` }} />
              </span>
              <span className="w-7 shrink-0 text-right font-mono text-sm text-primary tabular-nums">{b.measured}</span>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-xs leading-relaxed text-muted">
          Four of the eight dimensions are published for this run; the other four are held back with the company&rsquo;s identity. The hairline is the stage benchmark: comparable Australian startups at the same stage.
        </p>
      </div>
    </article>
  );
}
