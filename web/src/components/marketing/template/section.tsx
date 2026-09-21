/**
 * Section — the template's band (G17 D5, light-only since G26). Eyebrow +
 * H2 + lede over a `max-w-6xl` container on one of TWO grounds (`base`
 * white / `sunken` soft grey — alternate them; `tone="dark"` is a deprecated
 * alias of `sunken` and no longer scopes a dark ramp), with the 48 / 64 /
 * 96 px rhythm. Every marketing section on the site is one of these; page-local
 * `<section>` markup with its own padding is the thing D5 retires.
 *
 * `id` is required: the heading is `${id}-heading` (`headingId()`), which
 * is what `aria-labelledby` points at and what `/product#worth` deep links
 * scroll to (`scroll-mt-20` clears the sticky nav).
 *
 * Server component. Children are the section's body; `actions` render a
 * CTA row under the lede (or to the right of it in the `split` layout).
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CtaRow } from "./cta-link";
import {
  CONTAINER,
  EYEBROW,
  RHYTHM,
  TONE_CLASS,
  headingId,
  resolveTone,
  type Cta,
  type Rhythm,
  type Tone,
} from "./primitives";

export interface SectionProps {
  id: string;
  eyebrow?: string;
  title?: ReactNode;
  lede?: ReactNode;
  /** `start` (default) left-aligns the header to a 42rem measure; `center` centres it. */
  align?: "start" | "center";
  tone?: Tone;
  spacing?: Rhythm;
  /** Up to two CTAs rendered under the lede. */
  actions?: readonly Cta[];
  /** Adds a top hairline between two bands of the same tone. */
  divider?: boolean;
  /** Accessible name when the section has no visible title. */
  ariaLabel?: string;
  className?: string;
  children?: ReactNode;
}

export function Section({
  id,
  eyebrow,
  title,
  lede,
  align = "start",
  tone = "base",
  spacing = "md",
  actions,
  divider = true,
  ariaLabel,
  className,
  children,
}: SectionProps) {
  const hasHeader = Boolean(eyebrow || title || lede);
  const hid = headingId(id);
  return (
    <section
      id={id}
      aria-labelledby={title ? hid : undefined}
      aria-label={!title ? ariaLabel : undefined}
      data-tone={resolveTone(tone)}
      className={cn(
        "scroll-mt-20",
        TONE_CLASS[resolveTone(tone)],
        RHYTHM[spacing],
        divider && "border-t border-line-subtle",
        className,
      )}
    >
      <div className={CONTAINER}>
        {hasHeader ? (
          <div
            className={cn(
              "max-w-2xl",
              align === "center" && "mx-auto text-center",
            )}
          >
            {eyebrow ? <p className={EYEBROW}>{eyebrow}</p> : null}
            {title ? (
              <h2
                id={hid}
                className="mt-3 font-display text-3xl font-bold tracking-tight text-balance text-primary sm:text-4xl"
              >
                {title}
              </h2>
            ) : null}
            {lede ? (
              <p className="mt-4 text-base leading-relaxed text-secondary sm:text-lg">
                {lede}
              </p>
            ) : null}
            {actions && actions.length > 0 ? (
              <CtaRow ctas={actions} className="mt-6" align={align} />
            ) : null}
          </div>
        ) : null}
        {children ? (
          <div className={cn(hasHeader && "mt-10 sm:mt-12")}>{children}</div>
        ) : null}
      </div>
    </section>
  );
}
