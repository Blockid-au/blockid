/**
 * FilterChips — one row of link chips per filter dimension (state, type,
 * stage …) for the directory list pages (T0241). Filtering is server-side
 * off `searchParams`; a chip is just a link that patches one key, so there
 * is no client state. Server component.
 */

import Link from "next/link";
import { filterHref } from "@/lib/funding/directory";

export interface FilterChipGroup {
  /** The searchParams key this group patches. */
  param: string;
  label: string;
  options: Array<{ value: string; label: string; count?: number }>;
}

export interface FilterChipsProps {
  base: string;
  current: Record<string, string | null>;
  groups: FilterChipGroup[];
}

export function FilterChips({ base, current, groups }: FilterChipsProps) {
  const anyActive = Object.values(current).some(Boolean);
  return (
    <div className="space-y-3" data-filter-chips>
      {groups.map((g) => {
        const active = current[g.param] ?? null;
        return (
          <div key={g.param} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0 text-xs font-semibold uppercase tracking-wide text-secondary">{g.label}</span>
            <Link
              href={filterHref(base, current, { [g.param]: null })}
              aria-current={active ? undefined : "true"}
              className={chipClass(!active)}
            >
              All
            </Link>
            {g.options.map((o) => {
              const isActive = active === o.value;
              return (
                <Link
                  key={o.value}
                  href={filterHref(base, current, { [g.param]: isActive ? null : o.value })}
                  aria-current={isActive ? "true" : undefined}
                  className={chipClass(isActive)}
                >
                  {o.label}
                  {typeof o.count === "number" ? (
                    <span className={isActive ? "ml-1 text-on-action/80" : "ml-1 text-secondary"}>{o.count}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        );
      })}
      {anyActive ? (
        <p className="text-xs">
          <Link href={base} className="font-semibold text-action underline-offset-2 hover:underline">
            Clear all filters
          </Link>
        </p>
      ) : null}
    </div>
  );
}

function chipClass(active: boolean): string {
  return `inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
    active
      ? "border-action bg-action text-on-action"
      : "border-line-subtle bg-surface-raised text-primary hover:border-line"
  }`;
}

export default FilterChips;
