import { Compass, MapPin, TrendingUp } from "lucide-react";

interface Props {
  sviScore: number | null;
  stageLabel: string;
  percentile: number | null;
  valuationLabel: string;
}

/**
 * SCN POSITION hero — "Where am I?" answer at the top of the dashboard.
 *
 * Per Startup Navigation System spec (.claude/goals/scn-startup-navigation-system.md):
 * the Position answer (Startup Index + Stage + Top X% percentile vs AU peers) is the
 * headline, placed above valuation. This is the biggest market gap vs Crunchbase /
 * PitchBook / Carta, who answer Value but not Position.
 */
export function ScnPositionHero({ sviScore, stageLabel, percentile, valuationLabel }: Props) {
  const hasScore = sviScore != null;
  const indexDisplay = hasScore ? Math.round(sviScore!).toString() : "—";
  const topPctRaw = percentile != null ? 100 - percentile : null;
  const topPct =
    topPctRaw == null ? null : topPctRaw < 1 ? "<1" : Math.max(1, Math.round(topPctRaw)).toString();

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-surface-50 to-surface-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Compass className="h-4 w-4 text-brand-600" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          Startup Navigation System · Where you are
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Startup Index */}
        <div className="md:border-r md:border-brand-100 md:pr-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Startup Index</p>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-4xl font-bold text-ink-900">{indexDisplay}</span>
            <span className="text-sm font-medium text-ink-400">/ 200</span>
          </div>
          <p className="mt-1 text-xs text-ink-500">SVI · positioning score vs AU cohort</p>
        </div>

        {/* Stage */}
        <div className="md:border-r md:border-brand-100 md:pr-5">
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">Current stage</p>
          <div className="mt-1 flex items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-600" />
            <span className="text-2xl font-semibold text-ink-900">{stageLabel}</span>
          </div>
          <p className="mt-1 text-xs text-ink-500">You are here on the journey</p>
        </div>

        {/* Percentile vs AU peers */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wider text-ink-500">
            Ranking vs AU peers
          </p>
          <div className="mt-1 flex items-baseline gap-1.5">
            {topPct == null ? (
              <span className="text-2xl font-semibold text-ink-400">—</span>
            ) : (
              <>
                <span className="text-2xl font-bold text-emerald-600">Top {topPct}%</span>
                <TrendingUp className="h-4 w-4 text-emerald-500" />
              </>
            )}
          </div>
          <p className="mt-1 text-xs text-ink-500">of Australian startups at your stage</p>
        </div>
      </div>

      {hasScore && (
        <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-brand-100 pt-4 text-xs text-ink-500">
          <span>
            Estimated value: <span className="font-semibold text-ink-700">{valuationLabel}</span>
            <span className="ml-1 text-ink-400">(an output of your position, not the goal)</span>
          </span>
        </div>
      )}
    </div>
  );
}
