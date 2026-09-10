/**
 * ProgramCard — one row of /funding/programs and /funding/programs/[capital]
 * (T0241). Name · operator · type · city · funding / equity / cost · status
 * chip · stage tags · summary · official link · "Add to my plan" into the
 * /funding intake (T0242). Server component.
 */

import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import type { AuProgramRow } from "@/lib/funding/seed-map";
import {
  capitalSlug,
  formatAudCompact,
  programTypeLabel,
  stageLabel,
} from "@/lib/funding/directory";
import { StatusChip } from "./status-chip";

export interface ProgramCardProps {
  program: AuProgramRow;
  /** Show the city when the list mixes capitals (the /funding/programs index). */
  showCity?: boolean;
}

export function programTerms(p: AuProgramRow): string[] {
  const out: string[] = [];
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) out.push(`${formatAudCompact(p.funding_aud)} funding`);
  if (p.equity_pct) out.push(`${p.equity_pct} equity`);
  if (p.cost_to_founder) out.push(p.cost_to_founder.toLowerCase() === "free" ? "Free to founders" : `Cost: ${p.cost_to_founder}`);
  if (typeof p.length_weeks === "number" && p.length_weeks > 0) out.push(`${p.length_weeks} weeks`);
  return out;
}

export function ProgramCard({ program: p, showCity = true }: ProgramCardProps) {
  const detailHref = `/funding/programs/${capitalSlug(p.capital)}/${encodeURIComponent(p.id)}`;
  const planHref = `/funding?program=${encodeURIComponent(p.id)}`;
  const terms = programTerms(p);
  return (
    <article
      data-program-id={p.id}
      data-status={p.status}
      className="flex flex-col gap-3 rounded-2xl border border-line-subtle bg-surface-raised p-5 transition-colors duration-200 hover:border-line"
    >
      <div className="min-w-0">
        <h3 className="font-display text-lg font-semibold leading-snug text-primary">
          <Link href={detailHref} className="hover:underline underline-offset-2">
            {p.name}
          </Link>
        </h3>
        <p className="mt-1 text-sm text-secondary">
          {p.operator ? <span>{p.operator} · </span> : null}
          <span>{programTypeLabel(p.program_type)}</span>
          {showCity ? <span> · {p.city}</span> : null}
        </p>
      </div>

      <StatusChip status={p.status} applications_close={p.applications_close} />

      {terms.length ? (
        <p className="text-sm font-medium text-primary">{terms.join(" · ")}</p>
      ) : null}

      {p.stage_tags.length ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Stages">
          {p.stage_tags.map((t) => (
            <li
              key={t}
              className="rounded-full border border-line-subtle bg-surface-sunken px-2 py-0.5 text-[11px] font-medium text-secondary"
            >
              {stageLabel(t)}
            </li>
          ))}
        </ul>
      ) : null}

      {p.summary ? <p className="text-sm leading-relaxed text-secondary">{p.summary}</p> : null}

      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm font-semibold">
        <a
          href={p.official_url}
          rel="nofollow noopener noreferrer"
          target="_blank"
          className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
        >
          Official page
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
          <span className="sr-only">(opens the official site in a new tab)</span>
        </a>
        {p.status === "closed" ? (
          <span className="text-xs font-medium text-bear">Closed — do not apply</span>
        ) : (
          <Link href={planHref} className="inline-flex items-center gap-1 text-action hover:text-action-hover">
            Add to my plan
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        )}
      </div>
    </article>
  );
}

export default ProgramCard;
