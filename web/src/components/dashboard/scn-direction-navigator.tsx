import Link from "next/link";
import { ArrowRight, ChevronRight, MapPin, Navigation } from "lucide-react";

export interface DirectionStep {
  label: string;       // Short action label, e.g. "Set up cap table"
  detail: string;      // One-sentence why / how
  impact?: string;     // e.g. "+12 SVI"
  url: string;
  priority?: "P0" | "P1" | "P2";
}

interface Props {
  stageLabel: string;
  weakestLayer: string | null;   // e.g. "Traction & Revenue"
  steps: DirectionStep[];        // Expect 3 steps (next, then, then)
}

const PRIORITY_STYLE: Record<"P0" | "P1" | "P2", string> = {
  P0: "bg-red-50 text-red-700 ring-red-200",
  P1: "bg-amber-50 text-amber-700 ring-amber-200",
  P2: "bg-surface-50 text-ink-600 ring-surface-200",
};

/**
 * SCN DIRECTION navigator — Google-Maps-style "You are here → Next → Then → Then".
 *
 * Per the Startup Navigation System spec (.claude/goals/scn-startup-navigation-system.md)
 * this is the differentiator: a prioritized, sequenced Next-Best-Action engine driven
 * by the weakest SCN layer + stage. Crunchbase / PitchBook / Carta do not surface this.
 */
export function ScnDirectionNavigator({ stageLabel, weakestLayer, steps }: Props) {
  const [next, ...rest] = steps;
  const laterSteps = rest.slice(0, 2);

  return (
    <div className="rounded-2xl border border-brand-200 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Navigation className="h-4 w-4 text-brand-600" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          Startup Navigation · Your route
        </p>
      </div>

      {/* You are here */}
      <div className="flex items-start gap-3 rounded-xl bg-surface-50 px-4 py-3">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white">
          <MapPin className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">You are here</p>
          <p className="text-sm font-semibold text-ink-900">{stageLabel}</p>
          {weakestLayer && (
            <p className="mt-0.5 text-xs text-ink-500">
              Weakest layer: <span className="font-medium text-ink-700">{weakestLayer}</span>
            </p>
          )}
        </div>
      </div>

      {/* Next (hero step) */}
      {next && (
        <>
          <div className="ml-3.5 my-1 h-4 w-px bg-brand-200" aria-hidden />
          <div className="rounded-xl border-2 border-brand-300 bg-brand-50/60 p-4">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700 ring-2 ring-brand-300">
                <span className="text-xs font-bold">1</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-brand-700">Next</p>
                  {next.priority && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${PRIORITY_STYLE[next.priority]}`}>
                      {next.priority}
                    </span>
                  )}
                  {next.impact && (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      {next.impact}
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm font-semibold text-ink-900">{next.label}</p>
                <p className="mt-1 text-sm text-ink-600">{next.detail}</p>
                <Link
                  href={next.url}
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
                >
                  Start this step
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Then steps */}
      {laterSteps.length > 0 && (
        <div className="mt-2 space-y-2">
          {laterSteps.map((s, i) => (
            <div key={`${s.url}-${i}`}>
              <div className="ml-3.5 h-3 w-px bg-surface-200" aria-hidden />
              <Link
                href={s.url}
                className="group flex items-start gap-3 rounded-xl border border-surface-200 bg-white px-4 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30"
              >
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-100 text-ink-600 ring-1 ring-surface-200">
                  <span className="text-xs font-bold">{i + 2}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-500">Then</p>
                    {s.priority && (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ${PRIORITY_STYLE[s.priority]}`}>
                        {s.priority}
                      </span>
                    )}
                    {s.impact && (
                      <span className="text-[10px] font-medium text-emerald-600">{s.impact}</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm font-semibold text-ink-800">{s.label}</p>
                  <p className="mt-0.5 text-xs text-ink-500 line-clamp-2">{s.detail}</p>
                </div>
                <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-400 group-hover:text-brand-600" />
              </Link>
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[11px] text-ink-400">
        Sequenced from your weakest SCN layer · driver: {stageLabel}
      </p>
    </div>
  );
}
