/**
 * CapitalPicker — the nine capital cards on /funding/programs and the
 * compact switcher on each capital page (T0241, G11-5 grouping: Brisbane =
 * Brisbane + Gold Coast + Sunshine Coast + Regional QLD, Sydney = Sydney +
 * Wollongong, Melbourne = Melbourne + Geelong, Hobart = Hobart + Launceston,
 * Remote = Australia-wide / online). Counts come from the rows. Server
 * component.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CAPITALS, type Capital } from "@/lib/funding/seed-map";
import { capitalDisplayName, capitalSlug } from "@/lib/funding/directory";

export interface CapitalPickerProps {
  counts: Record<Capital, { total: number; open: number }>;
  /** Highlight the current capital (compact variant). */
  current?: Capital | null;
  variant?: "cards" | "compact";
}

const INCLUDES: Partial<Record<Capital, string>> = {
  Sydney: "incl. Wollongong",
  Melbourne: "incl. Geelong",
  Brisbane: "incl. Gold Coast, Sunshine Coast, regional QLD",
  Hobart: "incl. Launceston",
  Remote: "online and national programs",
};

export function CapitalPicker({ counts, current = null, variant = "cards" }: CapitalPickerProps) {
  if (variant === "compact") {
    return (
      <nav aria-label="Capitals" className="flex flex-wrap gap-2">
        {CAPITALS.map((c) => {
          const active = c === current;
          return (
            <Link
              key={c}
              href={`/funding/programs/${capitalSlug(c)}`}
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                active
                  ? "border-action bg-action text-on-action"
                  : "border-line-subtle bg-surface-raised text-primary hover:border-line"
              }`}
            >
              {c}
              <span className={active ? "text-on-action/80" : "text-secondary"}>{counts[c]?.total ?? 0}</span>
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-capital-picker>
      {CAPITALS.map((c) => {
        const n = counts[c] ?? { total: 0, open: 0 };
        return (
          <li key={c}>
            <Link
              href={`/funding/programs/${capitalSlug(c)}`}
              className="group flex h-full flex-col rounded-2xl border border-line-subtle bg-surface-raised p-5 transition-colors duration-200 hover:border-line"
            >
              <span className="font-display text-lg font-semibold text-primary">{capitalDisplayName(c)}</span>
              {INCLUDES[c] ? <span className="mt-0.5 text-xs text-secondary">{INCLUDES[c]}</span> : null}
              <span className="mt-3 text-sm text-secondary">
                <strong className="font-semibold text-primary">{n.total}</strong> {n.total === 1 ? "program" : "programs"}
                {" · "}
                <strong className="font-semibold text-bull">{n.open}</strong> open
              </span>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-action group-hover:text-action-hover">
                See {c} calendar
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default CapitalPicker;
