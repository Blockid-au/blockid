// Block 2 — G13-W4-IA4 (spec §C.1 row 2 + the advisor / accelerator table).
//
//   investor     "Deal flow matching my mandate" — top 5 from the v2 loader
//                (sector · stage · state · SVI · fit %) for the PRIMARY
//                mandate. An EMPTY mandate never reaches this block: the
//                landing puts block 4 in this slot instead (R11).
//   advisor      "Client movers" — top ±Δ this week across the roster.
//   accelerator  "Applications to review" — cohort startups without a score.
//
// Every variant has an empty state; one CTA each.

import Link from "next/link";
import { ChevronRight, Radar, TrendingUp, Inbox } from "lucide-react";
import { CANONICAL_STAGE_LABELS } from "@/lib/journey-vocabulary";
import { industryLabel } from "@/lib/taxonomy/startup-taxonomy";
import type { DealFlowSummary, EvaluatingSummary, LandingVariant } from "@/lib/investors/landing-data";
import { InvestorLandingCta, type InvestorLandingContext } from "../landing-cta";
import { DeltaText, InvestorBlock, SviPill } from "./landing-block";

export const DEALFLOW_EMPTY_NEVER = "Your mandate is saved — the nightly refresh scores every consenting startup against it. Matches land here tomorrow.";
export const DEALFLOW_EMPTY_NONE = "No startup clears your fit floor yet. Widen a sector, stage or state on the mandate to see more.";
export const DEALFLOW_NOT_MIGRATED = "Deal flow v2 is not enabled on this environment yet.";
export const MOVERS_EMPTY = "No client moved this week — movers appear as soon as a client's SVI changes.";
export const REVIEW_EMPTY = "Nothing waiting for review — every startup in your cohort has a score. Add the next intake to keep the pipeline full.";

export function stageLabel(key: string): string {
  return CANONICAL_STAGE_LABELS[key as keyof typeof CANONICAL_STAGE_LABELS]?.label_en ?? key;
}

export function DealflowBlock({ ctx, variant, dealflow, evaluating, slot = 2 }: { ctx: InvestorLandingContext; variant: LandingVariant; dealflow: DealFlowSummary; evaluating: EvaluatingSummary; slot?: 1 | 2 | 3 | 4 }) {
  if (variant === "advisor") return <ClientMovers ctx={ctx} data={evaluating} slot={slot} />;
  if (variant === "accelerator") return <ApplicationsToReview ctx={ctx} data={evaluating} slot={slot} />;

  const empty = dealflow.rows.length === 0;
  const emptyCopy = !dealflow.migrated ? DEALFLOW_NOT_MIGRATED : dealflow.neverComputed ? DEALFLOW_EMPTY_NEVER : DEALFLOW_EMPTY_NONE;
  return (
    <InvestorBlock
      name="dealflow"
      slot={slot}
      title="Deal flow matching my mandate"
      icon={Radar}
      span="wide"
      empty={empty}
      aside={dealflow.mandate ? <span className="max-w-[10rem] truncate text-[11px] text-tertiary" data-landing-mandate-label>{dealflow.mandate.label}</span> : undefined}
      cta={
        empty ? (
          <InvestorLandingCta block="dealflow" href="/workspace/investor/mandate" ctx={ctx} action="widen_mandate" variant="secondary" testId="landing-dealflow-cta">
            Review mandate
          </InvestorLandingCta>
        ) : (
          <InvestorLandingCta block="dealflow" href="/workspace/investor/dealflow" ctx={ctx} action="see_all" testId="landing-dealflow-cta">
            See all{dealflow.totalAboveFloor > dealflow.rows.length ? ` (${dealflow.totalAboveFloor})` : ""}
          </InvestorLandingCta>
        )
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{emptyCopy}</p>
      ) : (
        <ul className="divide-y divide-line-subtle" data-landing-dealflow-rows>
          {dealflow.rows.map((r) => (
            <li key={r.project_id}>
              <Link href={`/workspace/investor/startup/${r.project_id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-primary">{r.company_name ?? "Untitled startup"}</span>
                  <span className="block truncate text-[11px] text-tertiary">
                    {r.unclassified ? "Unclassified" : industryLabel(r.industry)} · {stageLabel(r.stage_key)} · {r.hq_state ?? "—"}
                  </span>
                </span>
                <SviPill score={r.svi} />
                <span className="w-12 text-right text-xs font-semibold tabular-nums text-action" data-landing-fit={r.fit}>
                  {Math.round(r.fit)}%
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-tertiary/60" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </InvestorBlock>
  );
}

function ClientMovers({ ctx, data, slot }: { ctx: InvestorLandingContext; data: EvaluatingSummary; slot: 1 | 2 | 3 | 4 }) {
  const empty = data.movers.length === 0;
  return (
    <InvestorBlock
      name="dealflow"
      slot={slot}
      title="Client movers"
      icon={TrendingUp}
      span="wide"
      empty={empty}
      cta={
        <InvestorLandingCta block="dealflow" href="/workspace/evaluations" ctx={ctx} action={empty ? "open_evaluations" : "see_movers"} variant={empty ? "secondary" : "primary"} testId="landing-dealflow-cta">
          {empty ? "Open client list" : "See all movers"}
        </InvestorLandingCta>
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{MOVERS_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-line-subtle" data-landing-mover-list>
          {data.movers.map((m) => (
            <li key={m.evaluationId}>
              <Link href={`/workspace/evaluations/${m.evaluationId}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken">
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-primary">{m.name}</span>
                <SviPill score={m.sviNow} />
                <DeltaText delta={m.delta} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </InvestorBlock>
  );
}

function ApplicationsToReview({ ctx, data, slot }: { ctx: InvestorLandingContext; data: EvaluatingSummary; slot: 1 | 2 | 3 | 4 }) {
  const rows = data.unscored.slice(0, 5);
  const empty = rows.length === 0;
  return (
    <InvestorBlock
      name="dealflow"
      slot={slot}
      title="Applications to review"
      icon={Inbox}
      span="wide"
      empty={empty}
      aside={!empty ? <span className="text-[11px] text-tertiary" data-landing-review-count={data.unscored.length}>{data.unscored.length} waiting</span> : undefined}
      cta={
        <InvestorLandingCta block="dealflow" href={empty ? "/workspace/evaluations?add=1" : "/workspace/evaluations"} ctx={ctx} action={empty ? "add_startup" : "review"} variant={empty ? "secondary" : "primary"} testId="landing-dealflow-cta">
          {empty ? "Add to cohort" : "Review applications"}
        </InvestorLandingCta>
      }
    >
      {empty ? (
        <p className="text-sm leading-relaxed text-secondary">{REVIEW_EMPTY}</p>
      ) : (
        <ul className="divide-y divide-line-subtle" data-landing-review-rows>
          {rows.map((r) => (
            <li key={r.id}>
              <Link href={`/workspace/evaluations/${r.id}`} className="-mx-2 flex items-center gap-2 rounded-lg px-2 py-2 transition-colors hover:bg-surface-sunken">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-medium text-primary">{r.projectName}</span>
                  <span className="block text-[11px] text-tertiary">Added {r.createdAt ? new Date(r.createdAt).toLocaleDateString("en-AU") : "—"}{r.state ? ` · ${r.state}` : ""}</span>
                </span>
                <SviPill score={null} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </InvestorBlock>
  );
}
