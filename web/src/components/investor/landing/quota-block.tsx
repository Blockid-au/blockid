// Block 3 · "Reports quota / trial" — G13-W4-IA4 (spec §C.1 row 3).
//
// `report-quota.ts` (used / monthly cap or the whole-trial allowance),
// trial state (the same numbers `trial-report-banner.tsx` prints), the
// credits balance and the plan name. Accelerator variant adds the LP
// quarterly report line.
//
// Empty: no trial and no included reports → "1 free Trusted Business
// Report on trial" → Upgrade → /pricing?segment=evaluator.

import { FileCheck2 } from "lucide-react";
import type { ReportQuota } from "@/lib/evaluations/report-quota";
import type { LandingVariant, QuotaSummary } from "@/lib/investors/landing-data";
import { InvestorLandingCta, type InvestorLandingContext } from "../landing-cta";
import { InvestorBlock } from "./landing-block";

export const QUOTA_EMPTY = "1 free Trusted Business Report on trial — a card-required 7-day trial includes one full report, then your plan's monthly allowance.";
export const UPGRADE_HREF = "/pricing?segment=evaluator";
export const LP_REPORT_HREF = "/workspace/accelerator/quarterly-report";

/** Days left on the trial (same rule as trial-report-banner.tsx, which is a client module and cannot be called from RSC). */
export function trialDaysLeft(endsAt: string | null, now: Date = new Date()): number {
  if (!endsAt) return 0;
  const ms = Date.parse(endsAt) - now.getTime();
  if (!Number.isFinite(ms) || ms <= 0) return 0;
  return Math.ceil(ms / 86_400_000);
}

/** Pure: the quota line for the block (pinned by the test). */
export function quotaLine(q: ReportQuota, now: Date = new Date()): { headline: string; detail: string | null; empty: boolean } {
  if (q.trial?.active) {
    const used = Math.min(q.used, q.trial.allowance);
    const days = trialDaysLeft(q.trial.ends_at, now);
    return {
      headline: `${used}/${q.trial.allowance} trial report${q.trial.allowance === 1 ? "" : "s"} used`,
      detail: `Trial: ${days} day${days === 1 ? "" : "s"} left · ${q.trial.allowance} full Trusted Business Report${q.trial.allowance === 1 ? "" : "s"} included`,
      empty: false,
    };
  }
  if (q.unlimited) return { headline: `${q.used} this month · unlimited`, detail: null, empty: false };
  if (q.configured === false || q.limit <= 0) return { headline: "No included reports", detail: null, empty: true };
  return { headline: `${q.used}/${q.limit} reports this month`, detail: `${q.remaining} remaining`, empty: false };
}

export function QuotaBlock({ ctx, variant, data, now, slot = 3 }: { ctx: InvestorLandingContext; variant: LandingVariant; data: QuotaSummary; now?: Date; slot?: 1 | 2 | 3 | 4 }) {
  const line = quotaLine(data.quota, now);
  const empty = line.empty;
  return (
    <InvestorBlock
      name="quota"
      slot={slot}
      title="Reports quota / trial"
      icon={FileCheck2}
      span="third"
      empty={empty}
      aside={<span className="rounded-full bg-surface-sunken px-2 py-0.5 text-[11px] font-semibold text-secondary" data-landing-plan={data.planId ?? "free"}>{data.planLabel}</span>}
      cta={
        empty ? (
          <InvestorLandingCta block="quota" href={UPGRADE_HREF} ctx={ctx} action="upgrade" testId="landing-quota-cta">
            Upgrade
          </InvestorLandingCta>
        ) : (
          <InvestorLandingCta block="quota" href="/workspace/evaluations" ctx={ctx} action="buy_report" testId="landing-quota-cta">
            Buy report
          </InvestorLandingCta>
        )
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{QUOTA_EMPTY}</p>
      ) : (
        <dl className="space-y-2 text-sm" data-landing-quota-facts>
          <div>
            <dt className="sr-only">Included reports</dt>
            <dd className="font-semibold text-primary" data-landing-quota-used={data.quota.used}>{line.headline}</dd>
            {line.detail ? <dd className="text-xs text-secondary">{line.detail}</dd> : null}
          </div>
          <div className="flex items-center justify-between gap-2 border-t border-line-subtle pt-2 text-xs">
            <dt className="text-tertiary">Credits</dt>
            <dd className="font-semibold tabular-nums text-primary" data-landing-credits={data.credits}>{data.credits}</dd>
          </div>
        </dl>
      )}
      {variant === "accelerator" ? (
        <p className="mt-3 border-t border-line-subtle pt-2 text-xs text-secondary" data-landing-lp-report>
          LP quarterly report:{" "}
          <InvestorLandingCta block="quota" href={LP_REPORT_HREF} ctx={ctx} action="lp_report" variant="link">
            compose this quarter
          </InvestorLandingCta>
        </p>
      ) : null}
    </InvestorBlock>
  );
}
