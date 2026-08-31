import {
  Users,
  Target,
  Cog,
  TrendingUp,
  Landmark,
  Briefcase,
  Scale,
  Sparkles,
  ArrowRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Duplicated from svi-stream-analysis.tsx to keep this component server-only
// (that file is "use client"). Keep both in sync when adding dimensions.
const DIMS: Record<string, { label: string; short: string; Icon: LucideIcon; weight: number }> = {
  ftv: { label: "Founder & Team", short: "FTV", Icon: Users, weight: 15 },
  mpc: { label: "Market & Problem", short: "MPC", Icon: Target, weight: 18 },
  ptd: { label: "Product & Tech", short: "PTD", Icon: Cog, weight: 12 },
  tre: { label: "Traction & Revenue", short: "TRE", Icon: TrendingUp, weight: 20 },
  cgh: { label: "Cap Table & Governance", short: "CGH", Icon: Landmark, weight: 12 },
  iri: { label: "Investor Readiness", short: "IRI", Icon: Briefcase, weight: 10 },
  lco: { label: "Legal & Compliance", short: "LCO", Icon: Scale, weight: 8 },
  svm: { label: "Strategic Vision & Moat", short: "SVM", Icon: Sparkles, weight: 5 },
};

// Hand-tuned so weighted total = 63 (developing) with TRE + CGH as weakest —
// exactly the shape a real early-stage SaaS founder would see.
const SAMPLE_SCORES: Record<string, number> = {
  ftv: 72,
  mpc: 68,
  ptd: 75,
  tre: 45,
  cgh: 55,
  iri: 60,
  lco: 78,
  svm: 65,
};
const SAMPLE_TOTAL = 63;

function scoreBadgeClass(score: number): string {
  if (score >= 70) return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200";
  if (score >= 40) return "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200";
  return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
}

export function SampleSviCard() {
  const dimEntries = Object.entries(DIMS);
  // Fastest lift: lowest score, weight-tiebreak — matches svi-stream-analysis logic.
  const weakest = dimEntries
    .map(([key, meta]) => ({ key, ...meta, score: SAMPLE_SCORES[key] ?? 0 }))
    .sort((a, b) => (a.score - b.score) || (b.weight - a.weight))
    .slice(0, 2);

  return (
    <section
      role="figure"
      aria-label="Sample SVI report preview"
      className="rounded-2xl border border-ink-200 bg-white dark:bg-ink-900 dark:border-ink-800 p-5 md:p-6 space-y-5"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-brand-600 dark:text-brand-400" aria-hidden="true" />
          <h2 className="text-sm font-semibold text-ink-800 dark:text-ink-100 uppercase tracking-[0.14em]">
            Sample SVI report
          </h2>
        </div>
        <span className="inline-flex items-center rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 px-2.5 py-0.5 text-[11px] font-semibold text-amber-800 dark:text-amber-200">
          Sample — not a real company
        </span>
      </div>

      {/* Hero score */}
      <div className="flex items-baseline gap-3 flex-wrap">
        <span
          className="text-5xl md:text-6xl font-bold tabular-nums text-amber-700 dark:text-amber-300"
          aria-label="Sample SVI 63 out of 100"
        >
          {SAMPLE_TOTAL}
          <span className="text-2xl text-ink-500 dark:text-ink-400 font-normal">/100</span>
        </span>
        <div className="text-sm text-ink-600 dark:text-ink-400">
          <p className="font-medium text-ink-800 dark:text-ink-100">Aussie SaaS Co</p>
          <p className="text-xs">Seed · SaaS · Sydney</p>
        </div>
      </div>

      {/* Band legend */}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px]" aria-label="Score band legend">
        <span className="inline-flex items-center rounded-full px-2 py-0.5 border bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500">
          0–39 · Early
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 border bg-amber-100 border-amber-400 text-amber-800 dark:bg-amber-900/40 dark:border-amber-500 dark:text-amber-200 font-semibold">
          40–69 · Developing
        </span>
        <span className="inline-flex items-center rounded-full px-2 py-0.5 border bg-ink-50 border-ink-200 text-ink-500 dark:bg-ink-900 dark:border-ink-800 dark:text-ink-500">
          70–100 · Investor-ready
        </span>
      </div>

      {/* 8-dim grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {dimEntries.map(([key, meta]) => {
          const score = SAMPLE_SCORES[key] ?? 0;
          return (
            <div
              key={key}
              className="rounded-lg border border-ink-200 dark:border-ink-800 bg-ink-50/40 dark:bg-ink-950/30 px-3 py-2.5"
            >
              <div className="flex items-center gap-1.5 mb-1">
                <meta.Icon className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400 shrink-0" aria-hidden="true" />
                <span className="text-[11px] font-semibold text-ink-700 dark:text-ink-300 uppercase tracking-wider">
                  {meta.short}
                </span>
              </div>
              <p className="text-[11px] text-ink-500 dark:text-ink-500 leading-tight mb-1.5">
                {meta.label}
              </p>
              <div className="flex items-center justify-between gap-1">
                <span
                  className={cn(
                    "inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-bold tabular-nums",
                    scoreBadgeClass(score),
                  )}
                >
                  {score}
                </span>
                <span className="text-[10px] text-ink-400 dark:text-ink-500 tabular-nums">
                  {meta.weight}%
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Fastest lift */}
      <div className="rounded-lg bg-brand-50 dark:bg-brand-950/30 border border-brand-200 dark:border-brand-800 px-4 py-3 space-y-2">
        <p className="text-[11px] uppercase tracking-[0.14em] text-brand-700 dark:text-brand-300 font-semibold">
          Fastest way to lift this sample score
        </p>
        <ul className="space-y-1 text-sm">
          {weakest.map((w) => (
            <li key={w.key} className="flex items-center justify-between gap-3">
              <span className="text-ink-700 dark:text-ink-300">
                <span className="font-medium">{w.label}</span>{" "}
                <span className="text-ink-500 dark:text-ink-400 tabular-nums text-xs">
                  ({w.score}/100 · {w.weight}% weight)
                </span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-between gap-3 flex-wrap pt-1">
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Yours in ~60 seconds. Free preview, no credit card.
        </p>
        <a
          href="/score"
          className="inline-flex items-center justify-center gap-1.5 min-h-[44px] rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold px-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-ink-900 transition-colors"
        >
          Get your real SVI
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}
