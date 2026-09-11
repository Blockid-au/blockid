/**
 * DirectoryGroup — one capital / state section of a directory index
 * (S10-A). H2 links to the group's own page; a one-line count + coverage
 * note; the compact rows the page passes as children; a "See all N …" link;
 * and the remaining rows as name-only links inside a native `<details>` so
 * crawlers and keyboard users reach every detail URL without JS while the
 * initial paint stays small. `<summary>` is focusable by default. Server
 * component, no icons (SVG budget), semantic tokens only.
 */

import Link from "next/link";
import type { ReactNode } from "react";

export interface TailLink {
  href: string;
  name: string;
}

export interface DirectoryGroupProps {
  /** `data-*` hook for tests and analytics, e.g. `{ "data-capital-group": "Sydney" }`. */
  dataAttrs: Record<`data-${string}`, string>;
  headingId: string;
  heading: string;
  /** The group's own indexable page. */
  href: string;
  /** "45 programs · 12 open · also covers Wollongong". */
  note: string;
  /** Label for the link to `href`; omitted when null. */
  seeAllLabel: string | null;
  /** Rows after the visible ones (name-only links). */
  tail: TailLink[];
  /** `<summary>` copy — "All 45 programs in Sydney". */
  tailSummary: string;
  /** Lead line inside the `<details>` — "Continuing from the six above:". */
  tailLead?: string;
  /** Collapsed groups render no compact rows: the whole list sits in the `<details>`. */
  collapsed?: boolean;
  children?: ReactNode;
}

export function DirectoryGroup({
  dataAttrs,
  headingId,
  heading,
  href,
  note,
  seeAllLabel,
  tail,
  tailSummary,
  tailLead,
  collapsed = false,
  children,
}: DirectoryGroupProps) {
  return (
    <section {...dataAttrs} aria-labelledby={headingId} className="border-t border-line-subtle pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id={headingId} className="font-display text-2xl font-semibold tracking-tight text-primary">
          <Link href={href} className="underline-offset-4 hover:underline">
            {heading}
          </Link>
        </h2>
        <p className="text-sm text-secondary">{note}</p>
      </div>

      {collapsed ? null : children}

      {seeAllLabel ? (
        <p className="mt-3 text-sm font-semibold">
          <Link href={href} className="inline-flex min-h-11 items-center gap-1 text-action hover:text-action-hover">
            {seeAllLabel}
            <span aria-hidden="true">→</span>
          </Link>
        </p>
      ) : null}

      {tail.length ? (
        <details className="group mt-2 rounded-xl border border-line-subtle bg-surface-sunken" data-tail-count={tail.length}>
          <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-primary marker:text-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action">
            {tailSummary}
          </summary>
          <div className="px-4 pb-4">
            {tailLead ? <p className="mb-2 text-xs text-secondary">{tailLead}</p> : null}
            <ul className="columns-1 gap-x-6 text-sm sm:columns-2 [&>li]:break-inside-avoid [&>li]:py-1.5 [&_a]:text-primary [&_a]:underline-offset-2 [&_a]:hover:underline">
              {tail.map((t) => (
                <li key={t.href}>
                  <Link href={t.href}>{t.name}</Link>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </section>
  );
}

export default DirectoryGroup;
