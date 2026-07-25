/**
 * HowItWorksStep — one row of the vertical timeline.
 *
 * Server-rendered card composed of:
 *   - a numbered gold badge (col 1) with a client-only connector line
 *     underneath that draws in on scroll via IntersectionObserver
 *   - a card (cols 2-7) containing a lucide icon chip, headline, body,
 *     and a mini product screenshot with SVG-mock fallback
 *
 * Only the connector needs client-side JS. Everything else is static HTML.
 */

import type { LucideIcon } from "lucide-react";
import { HowItWorksConnector } from "./how-it-works-connector";

export interface HowItWorksStepScreenshot {
  readonly src: string;
  readonly alt: string;
}

export interface HowItWorksStepProps {
  readonly index: number;
  readonly Icon: LucideIcon;
  readonly title: string;
  readonly body: string;
  readonly screenshot: HowItWorksStepScreenshot;
  /** Hide the connector on the last step. */
  readonly isLast?: boolean;
}

export function HowItWorksStep({
  index,
  Icon,
  title,
  body,
  screenshot,
  isLast = false,
}: HowItWorksStepProps) {
  return (
    <li
      className={[
        // Mobile: 280px snap card. Desktop: 7-col timeline row.
        "relative w-[280px] shrink-0 snap-start md:w-auto md:shrink md:snap-align-none",
        "md:grid md:grid-cols-7 md:gap-6",
      ].join(" ")}
    >
      {/* Col 1 — numbered badge + connector (desktop only). */}
      <div className="hidden md:col-span-1 md:flex md:flex-col md:items-center">
        <div
          aria-hidden="true"
          className={[
            "flex h-11 w-11 items-center justify-center rounded-full",
            "bg-[var(--color-brand-gold)]/15 text-[var(--color-brand-gold)]",
            "ring-1 ring-inset ring-[var(--color-brand-gold)]/40",
            "font-display text-base font-semibold",
          ].join(" ")}
        >
          {index}
        </div>
        {!isLast ? <HowItWorksConnector /> : null}
      </div>

      {/* Card body — cols 2-7 on desktop, full width on mobile. */}
      <article
        className={[
          "h-full rounded-2xl border border-[var(--fintech-border)]",
          "bg-[var(--fintech-bg-elevated)] p-5",
          "md:col-span-6 md:p-6",
          "transition-shadow duration-200 hover:shadow-[0_16px_40px_-16px_rgba(15,27,71,0.35)]",
        ].join(" ")}
      >
        <header className="flex items-center gap-3">
          {/* Mobile: inline number chip replaces the timeline badge. */}
          <span
            aria-hidden="true"
            className={[
              "inline-flex h-8 w-8 items-center justify-center rounded-full",
              "bg-[var(--color-brand-gold)]/15 text-[var(--color-brand-gold)]",
              "ring-1 ring-inset ring-[var(--color-brand-gold)]/40",
              "font-display text-sm font-semibold md:hidden",
            ].join(" ")}
          >
            {index}
          </span>
          <span
            aria-hidden="true"
            className={[
              "inline-flex h-10 w-10 items-center justify-center rounded-xl",
              "bg-[var(--fintech-accent)]/10 text-[var(--fintech-accent)]",
              "ring-1 ring-inset ring-[var(--fintech-accent)]/25",
            ].join(" ")}
          >
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="font-display text-lg font-semibold text-[var(--fintech-ink)]">
            {title}
          </h3>
        </header>

        <p className="mt-3 text-sm leading-relaxed text-[var(--fintech-ink-muted)]">
          {body}
        </p>

        <div
          className={[
            "mt-4 aspect-[16/10] w-full overflow-hidden rounded-xl",
            "border border-[var(--fintech-border)]",
            "bg-[var(--fintech-surface)]",
          ].join(" ")}
        >
          {/* Native <img> — Next 16 Image is not required for a small
              SVG mock and avoids next/image config churn for an artwork
              asset that lives in /public/media. Server-rendered, zero JS. */}
          <img
            src={screenshot.src}
            alt={screenshot.alt}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      </article>
    </li>
  );
}

export default HowItWorksStep;
