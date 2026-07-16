import type { HTMLAttributes } from "react";

/**
 * TrustStrip — logo row shown beneath the Hero v2 headline.
 *
 * Server component. Renders a small heading and a row of placeholder
 * logo boxes. Real SVG marks land later once brand permission is
 * confirmed; until then we render name-only chips in a subdued style
 * that hover to full opacity, matching the luxury dark palette.
 */

const HEADLINE = "Trusted by founders raising from";

const LOGOS: readonly string[] = [
  "Antler",
  "Blackbird",
  "Startmate",
  "Airtree",
  "Skip Capital",
  "Blue Cloud",
];

type TrustStripProps = HTMLAttributes<HTMLDivElement>;

export function TrustStrip({ className = "", ...rest }: TrustStripProps) {
  return (
    <div className={className} {...rest}>
      <p className="text-center text-xs font-semibold uppercase tracking-[0.22em] text-brand-ink-muted">
        {HEADLINE}
      </p>
      <ul
        className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 sm:gap-x-12"
        aria-label="Investor and accelerator logos"
      >
        {LOGOS.map((name) => (
          <li key={name}>
            <span
              className="inline-flex h-10 items-center justify-center rounded-md border border-white/5 bg-white/[0.02] px-5 text-sm font-medium tracking-wide text-brand-ink/60 opacity-60 grayscale transition duration-300 hover:opacity-100 hover:text-brand-ink hover:grayscale-0"
              title={name}
            >
              {name}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
