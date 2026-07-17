/**
 * MarketingSection — vertical-rhythm section wrapper used across marketing
 * pages. Two tones:
 *   - `default` — bare section on the deep-navy background.
 *   - `elevated` — fintech card treatment (elevated surface, subtle
 *     border, generous inner padding).
 *
 * Server component. Renders a semantic `<section>` element. If `title` is
 * supplied it wires an `aria-labelledby` so screen-reader users get the
 * heading anchor for free.
 */

import { useId, type ReactNode } from "react";

interface MarketingSectionProps {
  title?: string;
  kicker?: string;
  children: ReactNode;
  tone?: "default" | "elevated";
}

export function MarketingSection({
  title,
  kicker,
  children,
  tone = "default",
}: MarketingSectionProps) {
  const headingId = useId();
  const isElevated = tone === "elevated";

  return (
    <section
      aria-labelledby={title ? headingId : undefined}
      className="mx-auto max-w-5xl px-6 py-12 sm:py-16"
    >
      <div
        className={
          isElevated
            ? "rounded-3xl border border-[var(--fintech-border)] bg-[var(--fintech-bg-elevated)] p-8 sm:p-10"
            : ""
        }
      >
        {kicker ? (
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--fintech-accent)]">
            {kicker}
          </p>
        ) : null}
        {title ? (
          <h2
            id={headingId}
            className="mt-3 font-display text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            {title}
          </h2>
        ) : null}
        <div className={title || kicker ? "mt-8" : ""}>{children}</div>
      </div>
    </section>
  );
}

export default MarketingSection;
