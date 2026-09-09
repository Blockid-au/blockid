// Cross-links between published profiles.
//
// Pillar → cluster linking, in the plainest possible form: every profile page
// links to its sector siblings first and to the rest of the directory second,
// so no published page is an orphan and the sector facet is reachable from
// every leaf. Rendered from live rows only — there is no placeholder card and
// no invented company here.

import Link from "next/link";
import type { PublishedRow } from "@/lib/publish/store";
import { formatAud } from "@/lib/publish/profile";
import { SECTOR_LABELS } from "@/lib/svi-analysis";

export interface ProfileCardProps {
  row: PublishedRow;
}

export function ProfileCard({ row }: ProfileCardProps) {
  const sectorLabel = SECTOR_LABELS[row.sector] ?? row.sector;
  const valuation = row.svi?.valuation;
  return (
    <li className="rounded-2xl border border-line-subtle bg-surface-raised p-4 transition-colors hover:bg-surface-hover sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-base font-semibold text-primary">
            <Link
              href={`/listings/${row.slug}`}
              className="rounded underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
            >
              {row.company_name}
            </Link>
          </h3>
          <p className="mt-0.5 text-xs text-tertiary">
            {sectorLabel}
            {row.stage_label ? ` · ${row.stage_label} stage` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-lg font-semibold tabular-nums text-strong">
            {row.svi_total != null ? Math.round(row.svi_total) : "—"}
          </p>
          <p className="text-[11px] uppercase tracking-wider text-tertiary">
            Index
          </p>
        </div>
      </div>
      <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-secondary">
        {row.one_liner}
      </p>
      {valuation && valuation.mid > 0 && (
        <p className="mt-3 border-t border-line-subtle pt-3 text-xs text-secondary">
          Indicative valuation{" "}
          <span className="font-medium text-primary">
            {formatAud(valuation.low)} – {formatAud(valuation.high)}
          </span>
        </p>
      )}
    </li>
  );
}

export interface RelatedProfilesProps {
  rows: PublishedRow[];
  anchorSector?: string;
  heading: string;
  limit?: number;
}

export function RelatedProfiles({
  rows,
  anchorSector,
  heading,
  limit = 6,
}: RelatedProfilesProps) {
  if (rows.length === 0) return null;
  const ordered = anchorSector
    ? [
        ...rows.filter((r) => r.sector === anchorSector),
        ...rows.filter((r) => r.sector !== anchorSector),
      ]
    : rows;
  const shown = ordered.slice(0, limit);

  return (
    <section
      aria-labelledby="related-profiles-heading"
      className="mx-auto w-full max-w-4xl px-4 pb-16 sm:px-6"
    >
      <h2
        id="related-profiles-heading"
        className="font-display text-xl font-semibold text-strong"
      >
        {heading}
      </h2>
      <ul className="mt-4 grid gap-4 sm:grid-cols-2">
        {shown.map((row) => (
          <ProfileCard key={row.slug} row={row} />
        ))}
      </ul>
      <p className="mt-5 text-sm text-secondary">
        <Link
          href="/listings"
          className="rounded font-medium text-action underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
        >
          See the whole directory
        </Link>
      </p>
    </section>
  );
}
