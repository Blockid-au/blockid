/**
 * PageHero — the top band of every marketing page (G17 D5). Eyebrow, the
 * page's ONE `<h1>`, a sub-line capped to a readable measure, up to two CTAs
 * and an optional visual slot (the homepage puts the search box there; a
 * solutions page might put a sample card).
 *
 * The H1 is the LCP element on purpose — no hero image, no background
 * picture — so the heading paints with the first font flush. The soft
 * accent wash behind the visual is a CSS gradient on a pointer-events-none
 * layer and costs nothing.
 *
 * Server component. Pages that need a client hero (the homepage's `?hero=`
 * arm swap) pass `title` as a client element; the band itself stays static.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CtaRow } from "./cta-link";
import { CONTAINER, EYEBROW, type Cta } from "./primitives";

export interface PageHeroProps {
  eyebrow?: string;
  title: ReactNode;
  sub?: ReactNode;
  /** Up to two CTAs: the first renders primary, the second secondary. */
  ctas?: readonly Cta[];
  /** Rendered under the CTAs, full width — the search box, a sample card. */
  visual?: ReactNode;
  /** A short line under the visual (the founder line on the homepage). */
  footnote?: ReactNode;
  align?: "center" | "start";
  /** Extra attributes for the H1 (the homepage stamps `data-hero-arm`). */
  titleProps?: Record<`data-${string}`, string | undefined>;
  className?: string;
}

export function PageHero({
  eyebrow,
  title,
  sub,
  ctas,
  visual,
  footnote,
  align = "center",
  titleProps,
  className,
}: PageHeroProps) {
  const centred = align === "center";
  return (
    <section
      aria-labelledby="page-hero-heading"
      className={cn(
        "relative overflow-hidden bg-surface pb-16 pt-14 sm:pb-24 sm:pt-20",
        className,
      )}
    >
      {visual ? (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_55%_45%_at_50%_45%,var(--color-accent-soft),transparent_70%)]"
        />
      ) : null}
      <div
        className={cn(
          CONTAINER,
          "relative z-10 flex flex-col gap-5",
          centred ? "items-center text-center" : "items-start",
        )}
      >
        {eyebrow ? (
          <p
            className={cn(
              EYEBROW,
              "inline-flex items-center gap-2 rounded-full bg-accent-soft px-3 py-1.5",
            )}
          >
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-600" />
            {eyebrow}
          </p>
        ) : null}
        <h1
          id="page-hero-heading"
          {...titleProps}
          className="max-w-4xl font-display text-4xl font-bold leading-[1.08] tracking-tight text-balance text-primary sm:text-5xl lg:text-6xl"
        >
          {title}
        </h1>
        {sub ? (
          <p className="max-w-2xl text-base leading-relaxed text-secondary text-balance sm:text-lg">
            {sub}
          </p>
        ) : null}
        {ctas && ctas.length > 0 ? (
          <CtaRow ctas={ctas} align={centred ? "center" : "start"} className="mt-1" />
        ) : null}
        {visual ? <div className="mt-4 w-full max-w-3xl">{visual}</div> : null}
        {footnote ? (
          <p className="text-sm text-muted">{footnote}</p>
        ) : null}
      </div>
    </section>
  );
}
