/**
 * ProgramRow / GrantRow — the compact rows of the directory indexes (S10-A).
 * Name → detail page, type chip, stage chips and the deadline-ladder chip
 * (D-4 `deadlineStatus`), plus the one conversion link (plan / eligibility).
 * No inline SVGs and no summary text — the full card lives on the capital /
 * state views and the detail page.
 *
 * Styling sits on the host `<ul>` (`INDEX_ROWS_CLASS`, Tailwind parent
 * variants) rather than on every row, so 54 rows cost ~40 KB instead of
 * ~85 KB of repeated class strings — the whole point of the index diet.
 * Server components; semantic tokens only.
 */

import Link from "next/link";
import type { AuGrantRow, AuProgramRow } from "@/lib/funding/seed-map";
import {
  formatAudCompact,
  formatAudRange,
  fundingTypeLabel,
  levelLabel,
  programTypeLabel,
  stageLabel,
} from "@/lib/funding/directory";
import { grantPath, programPath } from "@/lib/funding/seo";
import { DeadlineChip } from "./deadline-chip";

/** Class list for the `<ul>` that hosts `ProgramRow` / `GrantRow` items. */
export const INDEX_ROWS_CLASS = [
  "mt-2 divide-y divide-line-subtle",
  // Row
  "[&>li]:flex [&>li]:flex-col [&>li]:gap-2 [&>li]:py-4 sm:[&>li]:flex-row sm:[&>li]:items-start sm:[&>li]:justify-between sm:[&>li]:gap-6",
  // Name → detail
  "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:leading-snug [&_h3]:text-primary [&_h3>a]:underline-offset-2 [&_h3>a]:hover:underline",
  // Meta line
  "[&_p]:mt-0.5 [&_p]:text-xs [&_p]:text-secondary",
  // Chips: first = type (action tint), rest = stages
  "[&_ul]:mt-1.5 [&_ul]:flex [&_ul]:flex-wrap [&_ul]:gap-1.5",
  "[&_ul>li]:rounded-full [&_ul>li]:border [&_ul>li]:border-line-subtle [&_ul>li]:bg-surface-sunken [&_ul>li]:px-2 [&_ul>li]:py-0.5 [&_ul>li]:text-[11px] [&_ul>li]:font-medium [&_ul>li]:text-secondary",
  "[&_ul>li:first-child]:border-action/30 [&_ul>li:first-child]:bg-action/10 [&_ul>li:first-child]:font-semibold [&_ul>li:first-child]:text-action",
  // Conversion link (44 px tap target on touch)
  "[&_[data-cta]]:inline-flex [&_[data-cta]]:min-h-11 [&_[data-cta]]:items-center [&_[data-cta]]:text-sm [&_[data-cta]]:font-semibold [&_[data-cta]]:text-action [&_[data-cta]]:hover:text-action-hover sm:[&_[data-cta]]:min-h-0",
].join(" ");

const ASIDE = "flex shrink-0 flex-col items-start gap-1 sm:items-end";

/**
 * Seed `equity_pct` is free text ("none", "12%", "≤8%", "SAFE 15% discount,
 * no cap", "n/a", "seed"…). Render only what reads as a term: a bare
 * percentage gets the "equity" noun, a longer instrument note stands as is,
 * "none" reads as "no equity", and unknowns ("n/a", "varies", "seed") are
 * left off the one-line meta.
 */
export function equityTerm(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  if (/^(none|no|nil|0|0%)$/i.test(v)) return "no equity";
  if (/^[≤<~]?\s*\d+(\.\d+)?%$/.test(v)) return `${v} equity`;
  if (/%|safe|warrant|note/i.test(v)) return v;
  return null;
}

export interface ProgramRowProps {
  program: AuProgramRow;
  /** Show the city when the list mixes cities (the index groups satellites under their capital). */
  showCity?: boolean;
  today?: Date;
}

export function ProgramRow({ program: p, showCity = true, today }: ProgramRowProps) {
  const meta: string[] = [];
  if (p.operator) meta.push(p.operator);
  if (showCity) meta.push(p.city);
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) meta.push(formatAudCompact(p.funding_aud));
  const equity = equityTerm(p.equity_pct);
  if (equity) meta.push(equity);
  return (
    <li data-program-id={p.id} data-status={p.status}>
      <div className="min-w-0">
        <h3>
          <Link href={programPath(p.capital, p.id)}>{p.name}</Link>
        </h3>
        {meta.length ? <p>{meta.join(" · ")}</p> : null}
        <ul aria-label="Type and stages">
          <li>{programTypeLabel(p.program_type)}</li>
          {p.stage_tags.map((t) => (
            <li key={t}>{stageLabel(t)}</li>
          ))}
        </ul>
      </div>
      <div className={ASIDE}>
        <DeadlineChip opens_at={p.applications_open} closes_at={p.applications_close} catalogue_status={p.status} today={today} />
        {p.status === "closed" ? null : (
          <Link data-cta href={`/funding?program=${encodeURIComponent(p.id)}`}>
            Add to my plan
          </Link>
        )}
      </div>
    </li>
  );
}

export interface GrantRowProps {
  grant: AuGrantRow;
  today?: Date;
}

export function GrantRow({ grant: g, today }: GrantRowProps) {
  const meta = [g.provider ?? levelLabel(g.level), formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note)];
  return (
    <li data-grant-id={g.id} data-status={g.status}>
      <div className="min-w-0">
        <h3>
          <Link href={grantPath(g.id)}>{g.name}</Link>
        </h3>
        <p>{meta.join(" · ")}</p>
        <ul aria-label="Type and stages">
          <li>{fundingTypeLabel(g.funding_type)}</li>
          {g.stage_tags.map((t) => (
            <li key={t}>{stageLabel(t)}</li>
          ))}
        </ul>
      </div>
      <div className={ASIDE}>
        <DeadlineChip
          opens_at={g.opens_at}
          closes_at={g.closes_at}
          rolling={g.application_window === "rolling"}
          catalogue_status={g.status}
          today={today}
        />
        <Link data-cta href={`/funding?grant=${encodeURIComponent(g.id)}`}>
          Am I eligible?
        </Link>
      </div>
    </li>
  );
}
