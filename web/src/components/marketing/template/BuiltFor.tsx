/**
 * BuiltFor — a centred row of text chips naming the kinds of organisation
 * a page is for (G21 P0-B): Accelerators · Incubators · Universities ·
 * Innovation Programs · Venture Studios · Funds. Text only — no logos
 * without permission ("empty until real", SOURCE-OF-TRUTH), no counts.
 *
 * Chips are `<li>`s in a labelled `<ul>`; when an item carries `href` the
 * chip is a link with the shared focus ring and a ≥ 44 px hit area,
 * otherwise a plain pill. Wraps to as many rows as a phone needs. Tokens
 * only. Server component.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { FOCUS_RING, MOTION } from "./primitives";

export interface BuiltForItem {
  label: string;
  href?: string;
}

export interface BuiltForProps {
  items: readonly BuiltForItem[];
  ariaLabel?: string;
  className?: string;
}

const CHIP =
  "inline-flex min-h-11 items-center rounded-full border border-line-subtle bg-surface px-5 text-sm font-semibold text-primary shadow-1";

export function BuiltFor({ items, ariaLabel = "Built for", className }: BuiltForProps) {
  return (
    <ul
      aria-label={ariaLabel}
      data-testid="built-for"
      className={cn("flex flex-wrap items-center justify-center gap-3", className)}
    >
      {items.map((item) => (
        <li key={item.label} className="flex">
          {item.href ? (
            <Link
              href={item.href}
              className={cn(CHIP, "hover:border-line hover:bg-surface-hover", MOTION, FOCUS_RING)}
            >
              {item.label}
            </Link>
          ) : (
            <span className={CHIP}>{item.label}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
