// Block 2 · Next best action — G13-W3-IA3 (spec §B.1 row 2, §B.2).
//
// Exactly ONE recommendation from the single recommender
// (`lib/nav/next-step-recommender.ts`): label, reason (benefit + expected
// SVI Δ / A$ where the server signals know it), the recommendation's own
// `ctaLabel` as the CTA, and the optional Money Finder secondary line for
// the first three phases. Rendered server-side from the phase + evidence
// reads the page already holds — no client fetch, no layout shift.
//
// Empty state (phase 0): the recommender already returns "Run your
// 8-dimension SVI evaluation" → /analyze (§B.4 row 2).
//
// Member view (§B.4): the owner's next action with "ask {owner}" copy; a
// viewer sees the step but the CTA is secondary.

import {
  Sparkles, FileText, BarChart3, Target, Banknote, PieChart, TrendingUp,
  Map, Rocket, DoorOpen, Layers, Users, Handshake, ArrowRight, type LucideIcon,
} from "lucide-react";
import { reasonForPhase, type RecommendedNextStep } from "@/lib/nav/next-step-recommender";
import type { GrowthPhaseId } from "@/lib/growth/phase-taxonomy";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";

const ICON_MAP: Record<RecommendedNextStep["icon"], LucideIcon> = {
  sparkles: Sparkles,
  "file-text": FileText,
  "bar-chart": BarChart3,
  target: Target,
  banknote: Banknote,
  "pie-chart": PieChart,
  "trending-up": TrendingUp,
  map: Map,
  rocket: Rocket,
  "door-open": DoorOpen,
  layers: Layers,
  users: Users,
  handshake: Handshake,
};

export interface NextBestActionProps {
  ctx: LandingContext;
  step: RecommendedNextStep;
  growthPhaseId: GrowthPhaseId | null;
  /** Member (non-owner) view — the owner's first name / email for "ask {owner}". */
  ownerLabel?: string | null;
  canEdit?: boolean;
}

export function formatAud(n: number): string {
  if (n >= 1_000_000) return `A$${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `A$${Math.round(n / 1_000)}k`;
  return `A$${Math.round(n).toLocaleString("en-AU")}`;
}

/** "+6 SVI pts" / "A$45k grant closes 30 Sep" — null when nothing is known. */
export function impactLine(step: RecommendedNextStep): string | null {
  const i = step.impact;
  if (!i) return null;
  const parts: string[] = [];
  if (typeof i.sviDelta === "number" && i.sviDelta > 0) parts.push(`+${i.sviDelta} SVI pts`);
  if (typeof i.moneyAud === "number" && i.moneyAud > 0) {
    let money = `${formatAud(i.moneyAud)}${i.moneyLabel ? ` · ${i.moneyLabel}` : ""}`;
    if (i.moneyClosesAt) {
      const d = new Date(i.moneyClosesAt);
      if (!Number.isNaN(d.getTime())) money += ` closes ${d.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}`;
    }
    parts.push(money);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function NextBestAction({ ctx, step, growthPhaseId, ownerLabel, canEdit = true }: NextBestActionProps) {
  const Icon = ICON_MAP[step.icon] ?? Sparkles;
  const impact = impactLine(step);
  const isStart = step.href === "/analyze";
  const memberNote = !canEdit ? `This is ${ownerLabel ?? "the owner"}'s next action — ask ${ownerLabel ?? "them"} to run it, or open it read-only.` : null;

  return (
    <LandingBlock
      name="next-best-action"
      order={2}
      title="Next best action"
      icon={Icon}
      span="wide"
      empty={isStart}
      className="border-action/30"
      aside={impact ? <span data-landing-impact className="rounded-full bg-bull/10 px-2.5 py-0.5 text-[11px] font-semibold text-bull">{impact}</span> : null}
      cta={
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <LandingCta
            block="next-best-action"
            href={step.href}
            ctx={ctx}
            action={isStart ? "start" : step.ctaLabel.toLowerCase().replace(/\s+/g, "_")}
            variant={canEdit ? "primary" : "secondary"}
            testId="landing-next-best-action-cta"
          >
            {step.ctaLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </LandingCta>
          {step.secondary ? (
            <LandingCta block="next-best-action" href={step.secondary.href} ctx={ctx} action="money_finder" variant="link" testId="landing-next-best-action-secondary">
              {step.secondary.label} →
            </LandingCta>
          ) : null}
        </div>
      }
    >
      <div data-tour="dashboard-spotlight">
        <p className="text-base font-semibold leading-snug text-primary">{step.label}</p>
        <p className="mt-1 text-sm leading-relaxed text-secondary">{step.reason}</p>
        <p className="mt-2 text-xs text-tertiary">{reasonForPhase(growthPhaseId)}</p>
        {memberNote ? (
          <p data-landing-member-note className="mt-3 rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-xs text-secondary">
            {memberNote}
          </p>
        ) : null}
      </div>
    </LandingBlock>
  );
}
