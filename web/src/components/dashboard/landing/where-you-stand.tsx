// Block 1 · Where you stand — G13-W3-IA3 (spec §B.1 row 1, §B.4 row 1).
//
// Latest SVI (score ring), Δ vs the previous snapshot, AU cohort percentile,
// the canonical 12-phase label as a pill (never "Phase 7/12", §B.5) and the
// 8-dimension radar (the report-visuals radar the TBR uses). One CTA:
// "See full score" → /workspace/score.
//
// Empty state (no score yet): "No score yet. A free analysis takes 3
// minutes and gives you a baseline on 8 dimensions." → /analyze.

import { Compass } from "lucide-react";
import { SviScoreRing } from "@/components/svi/svi-score-ring";
import { VisualFigure } from "@/lib/report-visuals/react";
import { makeVisual } from "@/lib/report-visuals";
import { GROWTH_PHASE_LABELS, type GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import type { SVISubScore } from "@/lib/svi-analysis";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";

export interface WhereYouStandProps {
  ctx: LandingContext;
  sviScore: number | null;
  delta: number | null;
  percentile: number | null;
  growthPhaseId: GrowthPhaseId | null;
  /** Analysis `stageLabel` — shown when the project has no growth phase yet. */
  stageLabel?: string | null;
  subs?: ReadonlyArray<Pick<SVISubScore, "key" | "label" | "value">> | null;
  startupName?: string | null;
  scoredAt?: string | null;
  readOnly?: boolean;
}

export const WHERE_YOU_STAND_EMPTY = "No score yet. A free analysis takes 3 minutes and gives you a baseline on 8 dimensions.";

export function phasePill(growthPhaseId: GrowthPhaseId | null, stageLabel?: string | null): string | null {
  if (growthPhaseId) return GROWTH_PHASE_LABELS[growthPhaseId].en;
  return stageLabel?.trim() || null;
}

export function WhereYouStand({ ctx, sviScore, delta, percentile, growthPhaseId, stageLabel, subs, startupName, scoredAt }: WhereYouStandProps) {
  const pill = phasePill(growthPhaseId, stageLabel);
  const empty = sviScore == null;

  if (empty) {
    return (
      <LandingBlock
        name="where-you-stand"
        order={1}
        title="Where you stand"
        icon={Compass}
        span="wide"
        empty
        cta={
          <LandingCta block="where-you-stand" href="/analyze" ctx={ctx} action="run_analysis" testId="landing-where-you-stand-cta">
            Run analysis
          </LandingCta>
        }
      >
        <p className="text-sm leading-relaxed text-secondary">{WHERE_YOU_STAND_EMPTY}</p>
        {pill ? <p className="mt-3 text-xs text-tertiary">Declared phase: {pill}</p> : null}
      </LandingBlock>
    );
  }

  const axes = (subs ?? [])
    .filter((s) => typeof s.value === "number" && Number.isFinite(s.value))
    .slice(0, 8)
    .map((s) => ({ label: s.label, value: Math.max(0, Math.min(100, Math.round(s.value))) }));
  const radar =
    axes.length >= 3
      ? makeVisual({
          id: "landing-radar",
          kind: "radar",
          title: "8-dimension profile",
          agentId: "ceo",
          dataState: "real",
          data: { axes, max: 100, seriesLabel: startupName ?? "Your startup" },
          a11y: { title: "SVI dimension scores", tableFallback: axes.map((a) => ({ dimension: a.label, score: a.value })) },
          width: 320,
        })
      : null;

  const deltaLabel = delta == null || delta === 0 ? null : `${delta > 0 ? "+" : ""}${Math.round(delta)} vs last snapshot`;

  return (
    <LandingBlock
      name="where-you-stand"
      order={1}
      title="Where you stand"
      icon={Compass}
      span="wide"
      aside={pill ? <span className="rounded-full border border-line-subtle bg-surface-sunken px-2.5 py-0.5 text-[11px] font-semibold text-secondary">{pill}</span> : null}
      cta={
        <LandingCta block="where-you-stand" href="/workspace/score" ctx={ctx} action="see_score" testId="landing-where-you-stand-cta">
          See full score
        </LandingCta>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col items-center justify-center gap-2">
          <SviScoreRing score={sviScore} size={150} label="SVI" />
          <dl className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-secondary">
            {deltaLabel ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Change</dt>
                <dd data-landing-delta className={delta! > 0 ? "font-semibold text-bull" : "font-semibold text-bear"}>
                  {deltaLabel}
                </dd>
              </div>
            ) : null}
            {percentile != null ? (
              <div className="flex items-center gap-1">
                <dt className="sr-only">Cohort percentile</dt>
                <dd data-landing-percentile>Top {Math.max(1, 100 - percentile)}% of AU cohort</dd>
              </div>
            ) : null}
          </dl>
          {scoredAt ? <p className="text-[11px] text-tertiary">Scored {new Date(scoredAt).toLocaleDateString("en-AU")}</p> : null}
        </div>
        <div className="flex items-center justify-center">
          {radar ? (
            <VisualFigure spec={radar} caption={null} className="w-full max-w-[280px]" />
          ) : (
            <p className="text-xs text-tertiary">Dimension breakdown appears after your next analysis.</p>
          )}
        </div>
      </div>
    </LandingBlock>
  );
}
