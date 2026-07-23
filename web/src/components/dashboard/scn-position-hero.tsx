import Link from "next/link";
import { Compass, MapPin, TrendingUp } from "lucide-react";
import { CanonicalStageBadge } from "@/components/showcase/canonical-stage-badge";

interface Props {
  sviScore: number | null;
  stageLabel: string;
  percentile: number | null;
  valuationLabel: string;
  /**
   * Founder-facing 6-phase key (0..5) — computed by the dashboard from the
   * SVI score. Optional so callers that don't have it (e.g. embed surfaces)
   * can omit it and the canonical badge simply won't render.
   *
   * H.21 parity: `phase6ToPhase12` maps this ordinal to a representative
   * 12-phase key so we can reuse {@link CanonicalStageBadge} verbatim —
   * the same component already mounted on the four showcase pages
   * (Atlassian, Canva, Xero, SafetyCulture) — instead of duplicating the
   * bucket lookup. Out-of-range ordinals collapse to `null`, which the
   * badge renders as nothing.
   */
  phase6?: number;
}

/**
 * Bridge the dashboard's 6-phase founder taxonomy (Idea/Validation/Equity/
 * Fundraise/Traction/Growth) to a representative 12-phase key that the
 * shared {@link CanonicalStageBadge} can bucket into the canonical 8-stage
 * VC vocabulary. Returns `null` when the ordinal is outside 0..5 so the
 * badge collapses to `null` — matching the badge's own out-of-range
 * behaviour.
 *
 * Mapping rationale (aligned with `journey-map.ts:PHASE_TO_STAGE`):
 *  - 0 Idea       → 1  (vision, canonical `idea`)
 *  - 1 Validation → 2  (customer_dev, canonical `validation`)
 *  - 2 Equity     → 6  (legal_equity, canonical `seed`)
 *  - 3 Fundraise  → 9  (investor_review, canonical `series_a`)
 *  - 4 Traction   → 10 (fundraise/term sheet, canonical `series_b_c`)
 *  - 5 Growth     → 11 (growth, canonical `late_stage`)
 */
export function phase6ToPhase12(phase6: number | null | undefined): number | null {
  if (phase6 == null || Number.isNaN(phase6)) return null;
  switch (phase6) {
    case 0:
      return 1;
    case 1:
      return 2;
    case 2:
      return 6;
    case 3:
      return 9;
    case 4:
      return 10;
    case 5:
      return 11;
    default:
      return null;
  }
}

/**
 * SCN POSITION hero — "Where am I?" answer at the top of the dashboard.
 *
 * Per Startup Navigation System spec (.claude/goals/scn-startup-navigation-system.md):
 * the Position answer (Startup Index + Stage + Top X% percentile vs AU peers) is the
 * headline, placed above valuation. This is the biggest market gap vs Crunchbase /
 * PitchBook / Carta, who answer Value but not Position.
 */
export function ScnPositionHero({
  sviScore,
  stageLabel,
  percentile,
  valuationLabel,
  phase6,
}: Props) {
  const hasScore = sviScore != null;
  const indexDisplay = hasScore ? Math.round(sviScore!).toString() : "—";
  const topPctRaw = percentile != null ? 100 - percentile : null;
  const topPct =
    topPctRaw == null ? null : topPctRaw < 1 ? "<1" : Math.max(1, Math.round(topPctRaw)).toString();
  const canonicalPhase12 = phase6ToPhase12(phase6);

  return (
    <div className="rounded-2xl border border-brand-200 bg-gradient-to-br from-brand-50 via-surface-50 to-surface-50 p-6 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Compass className="h-4 w-4 text-brand-600" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-brand-700">
          Startup Compass · Where you are
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
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <MapPin className="h-5 w-5 text-brand-600" />
            <span className="text-2xl font-semibold text-ink-900">{stageLabel}</span>
            {canonicalPhase12 != null && (
              <CanonicalStageBadge phase={canonicalPhase12} />
            )}
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

      <p className="mt-4 border-t border-brand-100 pt-3 text-[10px] leading-relaxed text-ink-400">
        Startup Compass is BlockID&apos;s synthesis overlay on Sean Ellis PMF, Porter Five Forces,
        T2D3, JTBD, and Bessemer BVP canonical stages —{" "}
        <Link href="/guide/scn" className="underline decoration-dotted hover:text-brand-600">
          framework citations
        </Link>
        .
      </p>
    </div>
  );
}
