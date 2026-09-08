/**
 * HowItWorksSection — 4-step numbered process.
 * Server component.
 *
 * Fintech v2 (2026-09-08): 4 steps, weighted 3:1 AI:blockchain to match
 * the homepage's 70/30 story. Steps 01-03 are all about analysis; step 04
 * is where the platform's paid layer (tokenized equity on subscription)
 * enters. Copy is short — the depth lives on /how-it-works and /tokenize.
 *
 * Redesign (2026-09-08, homepage-fintech-redesign agent):
 *
 * This is the page's ONE dark punctuation band. It is deliberately dark
 * (the process explanation is the calm middle of the page and benefits
 * from a hard break between the two light proof sections), and it now
 * carries the GrowthPhaseStrip inside it so the two dark bands that used
 * to sit adjacent read as a single island rather than two stacked
 * fragments.
 *
 * Contrast fixes:
 *   - Step numbers were `#00D4FF` inside a `rgba(0,212,255,0.15)` chip on
 *     `#0A0F1E`. Rendered dark-blue-on-dark-navy and were barely legible.
 *     They are now `text-primary` (#F9FAFB inside the dark scope, which
 *     globals.css rev.4 finally resolves correctly) on a solid raised
 *     chip, with the SVI-amber rule as the accent instead of the ink.
 *   - Body copy moved off the inline `#94A3B8` (4.6:1 — passes, but is not
 *     token-bound) onto `text-muted`, which is `#CBD5E1` in the dark scope
 *     (11.6:1 on #0B0F1A).
 *   - The whole band uses `data-theme="dark"` + token classes only, so
 *     every text/background pair resolves against the dark palette. No
 *     half-scoping: there are no light-palette tokens left inside.
 */

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    number: "01",
    title: "Give it what you have",
    description:
      "A pitch deck, your website, or a few sentences. Whatever you hand over, it works out what stage the company is at before it scores anything.",
  },
  {
    number: "02",
    title: "It reads the thing properly",
    description:
      "Thirteen criteria across eight dimensions — team, market, product, traction, capital, risk, compliance and momentum — each scored against something specific in what you gave it.",
  },
  {
    number: "03",
    title: "You get a number and a range",
    description:
      "Berkus, the VC method, discounted cash flow and comparable companies, run side by side in Australian dollars, with the workings attached.",
  },
  {
    number: "04",
    title: "Then you decide what to do with it",
    description:
      "A ranked list of next moves, a data room drafted from your own answers, and — when the time comes — the share register itself.",
  },
];

export function HowItWorksSection({
  className,
  children,
}: {
  className?: string;
  /** Rendered inside the same dark band — used for the growth-phase strip
   *  so the page has ONE dark island instead of two adjacent ones. */
  children?: ReactNode;
}) {
  return (
    <section
      aria-labelledby="how-heading"
      data-theme="dark"
      className={cn(
        "border-y border-line-subtle bg-surface pb-4 pt-20 sm:pt-24",
        className,
      )}
    >
      <div className="mx-auto max-w-5xl px-6">
        <div className="mb-14 text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            How it works
          </p>
          <h2
            id="how-heading"
            className="font-display text-3xl font-bold tracking-tight text-primary sm:text-4xl"
          >
            What happens after you press the button
          </h2>
        </div>

        <ol className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.number} className="flex flex-col gap-4">
              <div className="flex items-center gap-3">
                {/* Number chip — solid raised surface + primary ink so the
                    numeral reads at AAA inside the dark scope. */}
                <span
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line bg-surface-raised font-display text-sm font-bold tabular-nums text-primary"
                  aria-hidden
                >
                  {step.number}
                </span>
                {/* Connector — decorative, replaces the old ink-coloured
                    gradient that competed with the numeral. */}
                {i < STEPS.length - 1 && (
                  <span
                    aria-hidden
                    className="hidden h-px flex-1 bg-line-subtle lg:block"
                  />
                )}
              </div>

              <div>
                <h3 className="mb-2 font-display text-lg font-semibold text-primary">
                  <span className="sr-only">{`Step ${i + 1}: `}</span>
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed text-muted">
                  {step.description}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>

      {children ? <div className="mt-16">{children}</div> : null}
    </section>
  );
}
