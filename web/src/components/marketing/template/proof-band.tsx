/**
 * ProofBand — a quiet row of names or facts that vouch for the product
 * (G17 D5): programs we sit in, where the data is hosted, what the register
 * is built on. Text only — "empty until real" (SOURCE-OF-TRUTH): no logo
 * images that would need permission, no invented counts.
 *
 * Each item is a label with an optional sub-line and optional link. The
 * band reads as a single line on desktop and wraps to two on phones.
 *
 * Server component.
 */

import Link from "next/link";
import { cn } from "@/lib/utils";
import { EYEBROW, FOCUS_RING, MOTION } from "./primitives";

export interface ProofItem {
  label: string;
  sub?: string;
  href?: string;
}

export interface ProofBandProps {
  eyebrow?: string;
  items: readonly ProofItem[];
  ariaLabel?: string;
  className?: string;
}

export function ProofBand({ eyebrow, items, ariaLabel = "Proof points", className }: ProofBandProps) {
  return (
    <div className={cn("text-center", className)} data-testid="proof-band">
      {eyebrow ? <p className={cn(EYEBROW, "mb-5")}>{eyebrow}</p> : null}
      <ul
        aria-label={ariaLabel}
        className="flex flex-wrap items-stretch justify-center gap-x-8 gap-y-4"
      >
        {items.map((item) => {
          const inner = (
            <>
              <span className="font-display text-sm font-semibold text-primary sm:text-base">
                {item.label}
              </span>
              {item.sub ? <span className="text-xs text-muted">{item.sub}</span> : null}
            </>
          );
          const cls = "inline-flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-md px-1";
          return (
            <li key={item.label} className="flex">
              {item.href ? (
                <Link href={item.href} className={cn(cls, "hover:text-action", MOTION, FOCUS_RING)}>
                  {inner}
                </Link>
              ) : (
                <span className={cls}>{inner}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
