/**
 * Prose — long-form copy (about, methodology, legal, changelog) on a 42rem
 * measure with the template's type scale (G17 D5). The descendant styles
 * live in `globals.css` under `.tpl-prose` (CSP: no inline styles); this
 * component only sets the measure and the class.
 *
 * Server component.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ProseProps {
  children: ReactNode;
  /** `narrow` = 42rem (reading), `wide` = 56rem (tables, code). */
  measure?: "narrow" | "wide";
  className?: string;
}

export function Prose({ children, measure = "narrow", className }: ProseProps) {
  return (
    <div
      className={cn(
        "tpl-prose text-base leading-relaxed text-secondary",
        measure === "narrow" ? "max-w-2xl" : "max-w-4xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
