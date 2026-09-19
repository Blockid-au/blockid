/**
 * CtaBand — the close of every marketing page (G17 D5): one title, one
 * line, one primary button and at most one secondary. Sits directly above
 * the footer. `tone="dark"` self-scopes the token ramp so the band reads as
 * the page's one dark punctuation before the dark footer edge.
 *
 * Server component.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CtaRow } from "./cta-link";
import { CONTAINER, RHYTHM, TONE_CLASS, type Cta, type Tone } from "./primitives";

export interface CtaBandProps {
  id?: string;
  title: ReactNode;
  sub?: ReactNode;
  primary: Cta;
  secondary?: Cta;
  /** A small line under the buttons (a no-card-required note, a disclaimer). */
  footnote?: ReactNode;
  tone?: Tone;
  className?: string;
}

export function CtaBand({
  id = "cta",
  title,
  sub,
  primary,
  secondary,
  footnote,
  tone = "sunken",
  className,
}: CtaBandProps) {
  const ctas: Cta[] = secondary ? [primary, secondary] : [primary];
  return (
    <section
      id={id}
      aria-labelledby={`${id}-heading`}
      data-theme={tone === "dark" ? "dark" : undefined}
      className={cn("border-t border-line-subtle", TONE_CLASS[tone], RHYTHM.lg, className)}
    >
      <div className={cn(CONTAINER, "flex flex-col items-center text-center")}>
        <h2
          id={`${id}-heading`}
          className="max-w-2xl font-display text-3xl font-bold tracking-tight text-balance text-primary sm:text-4xl"
        >
          {title}
        </h2>
        {sub ? (
          <p className="mt-4 max-w-xl text-base leading-relaxed text-secondary sm:text-lg">{sub}</p>
        ) : null}
        <CtaRow ctas={ctas} align="center" className="mt-8" />
        {footnote ? <p className="mt-4 text-xs text-muted">{footnote}</p> : null}
      </div>
    </section>
  );
}
