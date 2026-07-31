// /showcase/atlassian/growth-phases — Step 4 of the Atlassian walkthrough.
//
// The 12-phase founder journey rendered as a strip of columns, one per
// PHASE_LABELS entry. Each column overlays:
//   - the phase snapshot (headline + atlassianMoment + source URL)
//   - the canonical-stage badge for that phase's 8-stage bucket
//   - every ATLASSIAN_DEMO.milestones[] entry whose phaseSlug matches, as
//     dots on a horizontal SVG timeline with year+title <title> hover
//   - the phase snapshot's sviAtThisPoint value as a mini SVG donut gauge
//
// Server component only — no auth, no I/O — pure fixture render.

import type { Metadata } from "next";
import Link from "next/link";

import {
  BenchmarkNotice,
  HumanReviewFlagsSection,
  PhaseBenchmarkPanel,
  StageBenchmarkSection,
} from "@/components/showcase/atlassian-benchmark";
import { AtlassianWalkthroughProvider } from "@/components/showcase/atlassian-walkthrough-provider";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";
import type { PhaseKey } from "@/lib/journey-map";
import {
  ATLASSIAN_DEMO,
  type AtlassianMilestone,
  type PhaseSnapshot,
} from "@/lib/showcase/atlassian/fixture";
import { PHASE_LABELS, PHASE_COUNT } from "@/lib/showcase/gallery";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Atlassian 12-phase growth map — Step 4 — BlockID Demo",
  description:
    "Every founder walks the same 12 phases from Vision to Exit. See exactly what Atlassian did at each one — with milestone timeline dots, canonical-stage badges, and SVI mini-gauges.",
};

interface PhaseColumn {
  phase: number;
  label: string;
  snapshot?: PhaseSnapshot;
  milestones: AtlassianMilestone[];
}

function buildColumns(): PhaseColumn[] {
  const columns: PhaseColumn[] = [];
  for (let phase = 1; phase <= PHASE_COUNT; phase += 1) {
    const label = PHASE_LABELS[phase]?.en ?? `Phase ${phase}`;
    const snapshot = ATLASSIAN_DEMO.phaseSnapshots.find(
      (s) => Number(s.phaseSlug) === phase,
    );
    const milestones = ATLASSIAN_DEMO.milestones.filter(
      (m) => Number(m.phaseSlug) === phase,
    );
    columns.push({ phase, label, snapshot, milestones });
  }
  return columns;
}

// SVI mini donut — 0..100 rendered as a 44px circle with a stroke arc.
function SviDonut({ value }: { value: number }) {
  const SIZE = 44;
  const STROKE = 6;
  const R = (SIZE - STROKE) / 2;
  const C = 2 * Math.PI * R;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * C;
  const color = pct >= 85 ? "#16a34a" : pct >= 70 ? "#eab308" : "#dc2626";
  return (
    <svg
      role="img"
      aria-label={`SVI at this point: ${pct}`}
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="shrink-0"
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        strokeWidth={STROKE}
        className="stroke-surface-200 dark:stroke-slate-700"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        strokeWidth={STROKE}
        stroke={color}
        strokeDasharray={`${dash} ${C - dash}`}
        strokeDashoffset={C / 4}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        strokeLinecap="round"
      />
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 4}
        textAnchor="middle"
        fontSize={12}
        fontWeight={700}
        fill="currentColor"
        className="fill-ink-800 dark:fill-slate-100"
      >
        {pct}
      </text>
    </svg>
  );
}

// Milestone timeline — dots spaced by min→max year within the column.
function MilestoneTimeline({ milestones }: { milestones: AtlassianMilestone[] }) {
  if (milestones.length === 0) return null;
  const WIDTH = 220;
  const HEIGHT = 30;
  const PAD = 8;
  const years = milestones.map((m) => m.year);
  const minY = Math.min(...years);
  const maxY = Math.max(...years);
  const span = Math.max(1, maxY - minY);
  return (
    <svg
      role="img"
      aria-label={`Milestone timeline ${minY} to ${maxY}`}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="h-8 w-full"
    >
      <line
        x1={PAD}
        y1={HEIGHT / 2}
        x2={WIDTH - PAD}
        y2={HEIGHT / 2}
        strokeWidth={2}
        className="stroke-surface-300 dark:stroke-slate-700"
      />
      {milestones.map((m, idx) => {
        const x =
          span === 0
            ? WIDTH / 2
            : PAD + ((m.year - minY) / span) * (WIDTH - PAD * 2);
        return (
          <g key={`${m.year}-${idx}`}>
            <circle
              cx={x}
              cy={HEIGHT / 2}
              r={4.5}
              className="fill-brand-600 dark:fill-emerald-400"
            >
              <title>
                {m.year} — {m.title}
              </title>
            </circle>
          </g>
        );
      })}
      <text
        x={PAD}
        y={HEIGHT - 2}
        fontSize={9}
        fill="currentColor"
        className="fill-ink-500 dark:fill-slate-500"
      >
        {minY}
      </text>
      <text
        x={WIDTH - PAD}
        y={HEIGHT - 2}
        textAnchor="end"
        fontSize={9}
        fill="currentColor"
        className="fill-ink-500 dark:fill-slate-500"
      >
        {maxY}
      </text>
    </svg>
  );
}

export default function AtlassianGrowthPhasesMirrorPage() {
  const columns = buildColumns();

  return (
    <AtlassianWalkthroughProvider stepNumber={4}>
      <div className="min-h-screen bg-surface-50 dark:bg-slate-950">
        <div className="container mx-auto max-w-6xl px-4 py-8">
          <nav className="mb-4 text-sm">
            <Link
              href="/showcase/atlassian"
              className="text-brand-700 hover:underline"
            >
              ← Atlassian landing
            </Link>
          </nav>

          <header className="mb-8">
            <p className="text-sm font-medium uppercase tracking-wide text-brand-700 dark:text-emerald-400">
              Step 4 — 12-phase growth map
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-ink-900 dark:text-slate-100">
              Twelve phases, one Australian founder journey
            </h1>
            <p className="mt-3 max-w-3xl text-base text-ink-700 dark:text-slate-300">
              The BlockID.au founder journey maps every startup onto the same
              twelve phases — Vision at 1, Exit at 12. Below each column shows
              what Atlassian did in that phase, the canonical VC-stage
              equivalent, the milestones on the timeline, and the S0–S5 stage
              the public record places that phase in.
            </p>
          </header>

          <div className="mb-8">
            <BenchmarkNotice />
          </div>

          <section
            aria-labelledby="phase-strip"
            className="mb-10"
          >
            <h2 id="phase-strip" className="sr-only">
              12-phase strip
            </h2>
            <div className="overflow-x-auto">
              <div className="grid min-w-[1080px] grid-cols-12 gap-3">
                {columns.map((col) => (
                  <article
                    key={col.phase}
                    id={`phase-${col.phase}`}
                    className="flex flex-col rounded-lg border border-surface-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-[10px] font-mono uppercase tracking-wide text-ink-500 dark:text-slate-400">
                        Phase {col.phase}
                      </div>
                      {col.snapshot?.sviAtThisPoint != null ? (
                        <SviDonut value={col.snapshot.sviAtThisPoint} />
                      ) : null}
                    </div>
                    <h3 className="mt-1 text-sm font-semibold text-ink-900 dark:text-slate-100">
                      {col.label}
                    </h3>
                    <div className="mt-2">
                      <CanonicalStageBadge phase={col.phase} />
                    </div>

                    {col.snapshot ? (
                      <>
                        <p className="mt-3 text-[11px] font-medium leading-snug text-brand-800 dark:text-emerald-300">
                          {col.snapshot.headline}
                        </p>
                        <p className="mt-2 text-[11px] leading-snug text-ink-700 dark:text-slate-300">
                          {col.snapshot.atlassianMoment}
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-[11px] italic text-ink-500 dark:text-slate-400">
                        No snapshot on file for this phase.
                      </p>
                    )}

                    <div className="mt-3 border-t border-surface-100 pt-2 dark:border-slate-800">
                      <div className="text-[10px] font-mono uppercase tracking-wide text-ink-500 dark:text-slate-400">
                        Milestones ({col.milestones.length})
                      </div>
                      <MilestoneTimeline milestones={col.milestones} />
                      {col.milestones.length > 0 ? (
                        <ul className="mt-1 space-y-0.5">
                          {col.milestones.map((m, idx) => (
                            <li
                              key={`${m.year}-${idx}`}
                              className="truncate text-[10px] text-ink-600 dark:text-slate-400"
                              title={`${m.year} — ${m.title}`}
                            >
                              <span className="font-mono text-ink-500 dark:text-slate-500">
                                {m.year}
                              </span>{" "}
                              {m.title}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <PhaseBenchmarkPanel ordinal={col.phase as PhaseKey} />

                    {col.snapshot?.sourceUrl ? (
                      <a
                        href={col.snapshot.sourceUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="mt-auto pt-3 text-[10px] opacity-60 hover:opacity-100 hover:underline"
                      >
                        Source ↗
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          </section>

          <section
            aria-labelledby="compare-cta"
            className="rounded-lg border border-brand-200 bg-brand-50 p-6 dark:border-emerald-900 dark:bg-emerald-950/30"
          >
            <h2
              id="compare-cta"
              className="text-lg font-semibold text-brand-900 dark:text-emerald-100"
            >
              Compare your own startup
            </h2>
            <p className="mt-2 text-sm text-brand-900 dark:text-emerald-100">
              You&apos;re currently in phase N of 12 — click your current phase
              above to see what Atlassian did here. Then open your own
              dashboard to see the equivalent tiles for your workspace.
            </p>
            <a
              href="/dashboard"
              className="mt-4 inline-block rounded bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
            >
              Open my dashboard →
            </a>
          </section>
        </div>
      </div>
    </AtlassianWalkthroughProvider>
  );
}
