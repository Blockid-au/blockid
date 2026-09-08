/**
 * SampleOutputs — three anonymised sample results shown below the fold
 * on the homepage so founders can see what "input → SVI + valuation"
 * actually produces before they type anything.
 *
 * Kept small on purpose: no fake screenshots, no photos, no logos. Each
 * card is typography + a 4-bar mini-chart representing the strongest and
 * weakest SVI dimensions for that stage.
 *
 * Added 2026-09-08 by the homepage-input-centric redesign agent.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";

interface Sample {
  stage: string;
  sviScore: number;
  valuationLow: string;
  valuationHigh: string;
  bars: { label: string; pct: number }[];
  vignette: string;
}

const SAMPLES: Sample[] = [
  {
    stage: "Idea stage",
    sviScore: 42,
    valuationLow: "A$180K",
    valuationHigh: "A$420K",
    bars: [
      { label: "FTV", pct: 55 },
      { label: "MPC", pct: 30 },
      { label: "PTD", pct: 15 },
      { label: "TRE", pct: 60 },
    ],
    vignette:
      "Solo founder, one-pager, no code yet. SVI flagged strong founder-team fit, weak market proof — action list starts with 5 customer interviews.",
  },
  {
    stage: "MVP stage",
    sviScore: 58,
    valuationLow: "A$850K",
    valuationHigh: "A$2.1M",
    bars: [
      { label: "FTV", pct: 62 },
      { label: "MPC", pct: 58 },
      { label: "PTD", pct: 55 },
      { label: "TRE", pct: 40 },
    ],
    vignette:
      "Two-founder AU SaaS, 40 paying pilots, no round yet. SVI slotted between pre-seed and seed; valuation range built off ARR run-rate plus 8-dim scoring.",
  },
  {
    stage: "Revenue stage",
    sviScore: 71,
    valuationLow: "A$4.2M",
    valuationHigh: "A$8.5M",
    bars: [
      { label: "FTV", pct: 70 },
      { label: "MPC", pct: 78 },
      { label: "PTD", pct: 65 },
      { label: "TRE", pct: 72 },
    ],
    vignette:
      "A$680K ARR, 14% MoM growth, 4-person team. SVI recommended raising a priced seed — dataroom checklist and cap-table sim generated in the same run.",
  },
];

export function SampleOutputs() {
  return (
    <section
      aria-labelledby="samples-heading"
      className="border-t bg-surface py-16"
      style={{ borderColor: "rgba(255,255,255,0.06)" }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="samples-heading"
            className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
          >
            See what other founders got
          </h2>
          <p className="mt-3 text-sm text-secondary sm:text-base">
            Three anonymised runs across the founder journey. Same input
            box, same 8-dimension scoring, different stages.
          </p>
        </div>

        <ul
          role="list"
          className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {SAMPLES.map((s) => (
            <li
              key={s.stage}
              className="flex flex-col rounded-xl border border-line-subtle bg-surface p-5"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
                {s.stage}
              </p>
              <div className="mt-3 flex items-baseline gap-2">
                <span className="font-display text-3xl font-bold text-primary">
                  {s.sviScore}
                </span>
                <span className="text-xs uppercase tracking-wider text-muted">
                  SVI
                </span>
              </div>
              <p className="mt-1 font-mono text-sm text-secondary">
                {s.valuationLow}
                <span className="mx-1 text-muted">–</span>
                {s.valuationHigh}
              </p>

              {/* Mini bar chart — 4 SVI dimensions, no external library. */}
              <div
                className="mt-4 flex h-16 items-end gap-2"
                aria-hidden
              >
                {s.bars.map((b) => (
                  <div
                    key={b.label}
                    className="flex flex-1 flex-col items-center gap-1"
                  >
                    <div
                      className="w-full rounded-t-sm"
                      style={{
                        height: `${b.pct}%`,
                        minHeight: "4px",
                        background:
                          "linear-gradient(180deg, #FF9F0A 0%, rgba(255,159,10,0.55) 100%)",
                      }}
                    />
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted">
                      {b.label}
                    </span>
                  </div>
                ))}
              </div>

              <p className="mt-4 flex-1 text-sm leading-relaxed text-secondary">
                {s.vignette}
              </p>
            </li>
          ))}
        </ul>

        <div className="mt-10 flex flex-col items-center gap-3">
          <Link
            href="/analyze"
            className="inline-flex items-center gap-1.5 rounded-md text-sm text-secondary transition-colors duration-200 hover:text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            Run yours in the box above
            <ArrowRight size={14} aria-hidden />
          </Link>
          <Link
            href="/reports/samples"
            className="inline-flex items-center gap-1.5 rounded-md text-xs text-muted transition-colors duration-200 hover:text-action focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            See more sample reports
            <ArrowRight size={12} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
