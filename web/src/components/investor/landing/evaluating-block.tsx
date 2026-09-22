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
  investor: { title: "Businesses under review", add: "Add business", open: "Open evaluations", icon: Building2, unit: ["business", "businesses"] },
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
      aside={!empty && variant !== "investor" ? <SviPill score={data.avgSvi} /> : undefined}
      cta={
        <InvestorLandingCta block="evaluating" href={empty ? ADD_STARTUP_HREF : "/workspace/evaluations"} ctx={ctx} variant={variant === "investor" ? "secondary" : "primary"} action={empty ? "add_startup" : "open_evaluations"} testId="landing-evaluating-cta">
          {empty ? copy.add : copy.open}
        </InvestorLandingCta>
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{variant === "investor" ? "Add a business to keep its assessment, reports and evidence together." : EVALUATING_EMPTY}</p>
      ) : (
        <div className="space-y-3">
          <dl className="grid grid-cols-3 gap-3" data-landing-evaluating-stats>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-xs font-medium text-secondary">Tracked</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-count={data.count}>
                {data.count} <span className="text-xs font-normal text-secondary">{data.count === 1 ? copy.unit[0] : copy.unit[1]}</span>
              </dd>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-xs font-medium text-secondary">Avg SVI</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-avg-svi={data.avgSvi ?? ""}>
                {data.avgSvi != null ? data.avgSvi : "—"}
                {data.scored < data.count ? <span className="text-xs font-normal text-secondary"> · {data.count - data.scored} unscored</span> : null}
              </dd>
            </div>
            <div className="rounded-lg bg-surface-sunken p-3">
              <dt className="text-xs font-medium text-secondary">Movers this week</dt>
              <dd className="text-lg font-semibold text-primary" data-landing-movers={data.movers.length}>
                {data.movers.length}
              </dd>
            </div>
          </dl>
          {variant === "investor" ? (
            <div className="space-y-2" data-investor-review-list>
              <h3 className="text-sm font-semibold text-primary">Continue your reviews</h3>
              <ul className="divide-y divide-line-subtle">
                {data.rows.slice(0, 3).map((row) => <li key={row.id}>
                  <Link href={`/workspace/evaluations/${row.id}`} className="-mx-2 flex min-h-16 items-center gap-3 rounded-lg px-2 py-3 hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
                    <span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold text-primary">{row.projectName || row.label || "Business review"}</span><span className="mt-1 block text-xs text-secondary">Open assessment &amp; evidence</span></span>
                    <SviPill score={row.latestSvi} /><ChevronRight className="h-4 w-4 shrink-0 text-secondary" aria-hidden="true" />
                  </Link>
                </li>)}
              </ul>
              {data.rows.length > 3 ? <p className="text-xs text-secondary">Showing 3 of {data.count} businesses. Open evaluations to see the full list.</p> : null}
            </div>
          ) : data.movers.length > 0 ? (
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
          <details className="rounded-lg border border-line-subtle p-3">
            <summary className="flex min-h-11 cursor-pointer items-center text-xs font-medium text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">Access and sharing</summary>
            <p className="mt-2 text-xs leading-relaxed text-secondary" data-landing-consent>Consent: {consentLine(data.consent) || "none granted yet"}</p>
          </details>
        </div>
      )}
    </InvestorBlock>
  );
}
