/**
 * FeatureGrid — 2 / 3 / 4 cards, each one Lucide icon + title + one
 * sentence + optional link (G17 D5). Used for "Who it's for", "How it
 * works" (with `numbered`), feature lists on solutions pages.
 *
 * A card with `href` is ONE link (the whole card is the hit area, ≥ 44 px),
 * never a card with a small link inside it. Icons are `aria-hidden`; the
 * title carries the meaning.
 *
 * Server component.
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MOTION } from "./primitives";

export interface FeatureItem {
  /** Optional anchor on the card (`/features#cohort-percentile-scoring`); scroll-margin clears the nav. */
  id?: string;
  icon: LucideIcon;
  title: string;
  body: ReactNode;
  href?: string;
  /** Link label; defaults to the title. Shown only when `href` is set. */
  cta?: string;
  ctaId?: string;
}

export interface FeatureGridProps {
  items: readonly FeatureItem[];
  columns?: 2 | 3 | 4;
  /** Number the cards 1…n (a "How it works" list). */
  numbered?: boolean;
  /** Accessible name for the list. */
  ariaLabel?: string;
  className?: string;
}

const COLS: Readonly<Record<2 | 3 | 4, string>> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
};

const CARD =
  "flex h-full flex-col gap-4 rounded-xl border border-line-subtle bg-surface p-6 shadow-1";

export function FeatureGrid({
  items,
  columns = 3,
  numbered = false,
  ariaLabel,
  className,
}: FeatureGridProps) {
  const List = numbered ? "ol" : "ul";
  return (
    <List
      aria-label={ariaLabel}
      className={cn("grid gap-4 sm:gap-6", COLS[columns], className)}
    >
      {items.map((item, i) => {
        const Icon = item.icon;
        const inner = (
          <>
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"
              >
                <Icon size={22} strokeWidth={1.75} />
              </span>
              {numbered ? (
                <span className="font-mono text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Step {i + 1}
                </span>
              ) : null}
            </div>
            <h3 className="font-display text-lg font-semibold tracking-tight text-primary">
              {item.title}
            </h3>
            <p className="text-sm leading-relaxed text-secondary">{item.body}</p>
            {item.href ? (
              <span className="mt-auto inline-flex items-center gap-1.5 pt-1 text-sm font-semibold text-action">
                {item.cta ?? item.title}
                <ArrowRight size={16} aria-hidden />
              </span>
            ) : null}
          </>
        );
        return (
          <li key={item.title} id={item.id} className={cn("flex", item.id && "scroll-mt-24")}>
            {item.href ? (
              <Link
                href={item.href}
                data-cta-id={item.ctaId}
                className={cn(
                  CARD,
                  "w-full hover:border-line hover:shadow-2",
                  MOTION,
                  FOCUS_RING,
                )}
              >
                {inner}
              </Link>
            ) : (
              <div className={cn(CARD, "w-full")}>{inner}</div>
            )}
          </li>
        );
      })}
    </List>
  );
}
