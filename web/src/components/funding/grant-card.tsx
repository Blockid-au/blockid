/**
 * GrantCard — one row of the free /funding/grants directory (T0241).
 *
 * Shows exactly what the row says: name · provider · level / state · A$
 * range · status chip · stage tags · summary · "Official page" (the free
 * part, plan §5a) · "Am I eligible?" into the /funding intake (the paid
 * analysis, T0242). Server component.
 */

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { AuGrantRow } from "@/lib/funding/seed-map";
import {
  formatAudRange,
  fundingTypeLabel,
  levelLabel,
  stageLabel,
  stateLabel,
} from "@/lib/funding/directory";
import { StatusChip } from "./status-chip";

export interface GrantCardProps {
  grant: AuGrantRow;
}

export function GrantCard({ grant: g }: GrantCardProps) {
  const detailHref = `/funding/grants/${encodeURIComponent(g.id)}`;
  const eligibleHref = `/funding?grant=${encodeURIComponent(g.id)}`;
  return (
    <article
      data-grant-id={g.id}
      className="flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-5 transition-colors duration-200 hover:border-line"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-lg font-semibold leading-snug text-primary">
            <Link href={detailHref} className="hover:underline underline-offset-2">
              {g.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-secondary">
            {g.provider ? <span>{g.provider} · </span> : null}
            <span>
              {levelLabel(g.level)} · {stateLabel(g.state)}
            </span>
            <span> · {fundingTypeLabel(g.funding_type)}</span>
          </p>
        </div>
        <p className="shrink-0 font-display text-base font-semibold text-primary">
          {formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note)}
        </p>
      </div>

      <StatusChip status={g.status} closes_at={g.closes_at} next_round_note={g.next_round_note} />

      {g.stage_tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Stages">
          {g.stage_tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-line-subtle bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-secondary"
            >
              {stageLabel(t)}
            </li>
          ))}
        </ul>
      ) : null}

      {g.summary ? <p className="text-sm leading-relaxed text-secondary">{g.summary}</p> : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
        <a
          href={g.official_url}
          rel="nofollow noopener noreferrer"
          target="_blank"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          Official page
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">(opens the official site in a new tab)</span>
        </a>
        <Link
          href={eligibleHref}
          className="inline-flex items-center gap-1 text-action hover:text-action-hover"
        >
          Am I eligible?
          <ArrowRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      </div>
    </article>
  );
}

export default GrantCard;
