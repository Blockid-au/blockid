// Block 1 · "Startups I'm evaluating" — G13-W4-IA4 (spec §C.1 row 1).
//
// count · avg SVI · movers this week (top ±Δ from the evaluator progress
// over svi_index_snapshots) · consent-state summary. Advisor variant reads
// "Clients", accelerator "Cohort" — same data, persona copy.
//
// Empty: "Add your first startup — paste a website or pick from the
// Startup Index." → Add startup → /workspace/evaluations?add=1.

import Link from "next/link";
import { Building2, ChevronRight, Users, Layers } from "lucide-react";
import type { EvaluatingSummary, LandingVariant } from "@/lib/investors/landing-data";
import { InvestorLandingCta, type InvestorLandingContext } from "../landing-cta";
import { DeltaText, InvestorBlock, SviPill } from "./landing-block";

export const EVALUATING_EMPTY = "Add your first startup — paste a website or pick from the Startup Index.";
export const ADD_STARTUP_HREF = "/workspace/evaluations?add=1";

const COPY: Record<LandingVariant, { title: string; add: string; open: string; icon: typeof Building2; unit: [string, string] }> = {
  investor: { title: "Startups I'm evaluating", add: "Add startup", open: "Open evaluations", icon: Building2, unit: ["startup", "startups"] },
  advisor: { title: "Clients", add: "Add client", open: "Open client list", icon: Users, unit: ["client", "clients"] },
  accelerator: { title: "Cohort", add: "Add to cohort", open: "Open cohort", icon: Layers, unit: ["startup", "startups"] },
};

export function consentLine(c: EvaluatingSummary["consent"]): string {
  const parts: string[] = [];
  if (c.claimed) parts.push(`${c.claimed} claimed`);
  if (c.reports_shared) parts.push(`${c.reports_shared} sharing reports`);
  if (c.full_mentor) parts.push(`${c.full_mentor} full access`);
  if (c.attributed_only) parts.push(`${c.attributed_only} attributed only`);
  return parts.join(" · ");
}

export function EvaluatingBlock({ ctx, variant, data, slot = 1 }: { ctx: InvestorLandingContext; variant: LandingVariant; data: EvaluatingSummary; slot?: 1 | 2 | 3 | 4 }) {
  const copy = COPY[variant];
  const empty = data.count === 0;
  return (
    <InvestorBlock
      name="evaluating"
      slot={slot}
      title={copy.title}
      icon={copy.icon}
      span="wide"
      empty={empty}
      aside={!empty ? <SviPill score={data.avgSvi} /> : undefined}
      cta={
        <InvestorLandingCta block="evaluating" href={empty ? ADD_STARTUP_HREF : "/workspace/evaluations"} ctx={ctx} action={empty ? "add_startup" : "open_evaluations"} testId="landing-evaluating-cta">
          {empty ? copy.add : copy.open}
        </InvestorLandingCta>
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{EVALUATING_EMPTY}</p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-3" data-landing-evaluating-stats>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-[10px] uppercase tracking-wide text-tertiary">Tracked</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-count={data.count}>
                {data.count} <span className="text-xs font-normal text-secondary">{data.count === 1 ? copy.unit[0] : copy.unit[1]}</span>
              </dd>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-[10px] uppercase tracking-wide text-tertiary">Avg SVI</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-avg-svi={data.avgSvi ?? ""}>
                {data.avgSvi != null ? data.avgSvi : "—"}
                {data.scored < data.count ? <span className="text-xs font-normal text-secondary"> · {data.count - data.scored} unscored</span> : null}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-[10px] uppercase tracking-wide text-tertiary">Movers this week</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-movers={data.movers.length}>
                {data.movers.length}
              </dd>
            </div>
          </dl>
          {data.movers.length > 0 ? (
            <ul className="divide-y divide-line-subtle" data-landing-mover-list>
              {data.movers.map((m) => (
                <li key={m.evaluationId}>
                  <Link href={`/workspace/evaluations/${m.evaluationId}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-sunken">
                    <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{m.name}</span>
                    <SviPill score={m.sviNow} />
                    <DeltaText delta={m.delta} />
                    <ChevronRight className="h-4 w-4 shrink-0 text-tertiary/60" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-tertiary">No score moved this week.</p>
          )}
          <p className="text-[11px] text-tertiary" data-landing-consent>
            Consent: {consentLine(data.consent) || "none granted yet"}
          </p>
        </div>
      )}
    </InvestorBlock>
  );
}
