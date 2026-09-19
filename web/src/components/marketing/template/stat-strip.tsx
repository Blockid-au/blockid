/**
 * StatStrip — four (2–6) numbers in a row with a label each (G17 D5). The
 * homepage proof strip; the numbers come from the build-time content JSONs,
 * never from a client fetch, so the band is static and CLS-free.
 *
 * Values are `tabular-nums` in the display face; a `hint` under the label
 * gives the source ("weekly backtest, n = 49") so no figure stands alone.
 * A stat with `href` links the whole tile (≥ 44 px). Markup is a list of
 * tiles (not a `<dl>`) so a linked tile stays valid HTML.
 *
 * Server component.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MOTION } from "./primitives";

export interface Stat {
  value: string;
  label: string;
  hint?: ReactNode;
  href?: string;
}

export interface StatStripProps {
  stats: readonly Stat[];
  /** One line under the strip — provenance, "as at" date. */
  caption?: ReactNode;
  ariaLabel?: string;
  className?: string;
}

const TILE =
  "flex h-full min-h-11 w-full flex-col rounded-xl border border-line-subtle bg-surface p-5 shadow-1";

export function StatStrip({
  stats,
  caption,
  ariaLabel = "Key figures",
  className,
}: StatStripProps) {
  return (
    <div className={className} data-testid="stat-strip">
      <ul
        aria-label={ariaLabel}
        className={cn(
          "grid gap-4 sm:gap-6",
          stats.length <= 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-4",
        )}
      >
        {stats.map((s) => {
          const body = (
            <>
              <p className="font-display text-3xl font-bold tracking-tight text-primary tabular-nums sm:text-4xl">
                {s.value}
              </p>
              <p className="mt-2 text-sm font-medium text-secondary">{s.label}</p>
              {s.hint ? <p className="mt-1 text-xs text-muted">{s.hint}</p> : null}
            </>
          );
          return (
            <li key={s.label} className="flex">
              {s.href ? (
                <Link
                  href={s.href}
                  className={cn(TILE, "hover:border-line hover:shadow-2", MOTION, FOCUS_RING)}
                >
                  {body}
                </Link>
              ) : (
                <div className={TILE}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
      {caption ? <p className="mt-4 text-xs leading-relaxed text-muted">{caption}</p> : null}
    </div>
  );
}
