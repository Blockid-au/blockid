"use client";

/**
 * HeroSection — the omnibox, and the three questions the page answers.
 *
 * FUNNEL PASS (2026-09-09). The hero now has to say three things and still
 * fit above the fold: what this is, what you get, and what it costs. It used
 * to carry two separate rows under the omnibox — three question anchors and
 * three trust points — which together took the vertical space of a section
 * and named no price at all. Both are replaced by ONE row: the three rungs of
 * the ladder, each with its price and its one-line gist, linking into the
 * full ladder further down. A visitor now knows what free gets them before
 * they type, which is the whole point of putting it here.
 *
 * The three questions are not lost — they are still the spine of the page and
 * still own their sections (#worth, #state, #next); they simply stopped
 * needing a row of their own in the hero, because the subheading already
 * names all three.
 *
 * REBUILD (2026-09-08, homepage visualisation rebuild). Two changes.
 *
 *   1. The headline used to sell one of the three questions. "Know what
 *      your company is worth before you walk into the room" is a good line
 *      about valuation and silent about the other two thirds of the
 *      product, and silent about investors entirely. It now says what the
 *      whole thing is for, and the three questions became the page's
 *      entry points — real anchors into the three sections that answer
 *      them — rather than a list crammed into the H1.
 *   2. The proof strip under the box is now a chart rather than a row of
 *      numbers: the MVP-stage run's four published readings as meters
 *      against the Australian average at that stage. Same data, same
 *      grammar as every other chart on the page.
 *
 * UNCHANGED, DELIBERATELY. `SmartIntake` wraps itself in
 * `AnimatedSearchFrame`, so the rotating conic ring lives here; it is a
 * standing founder request. The handoff is also untouched: the whole
 * submission — including a dropped File, which cannot be encoded in a URL —
 * is parked in `pending-intake` and claimed by AnalyzeRoot on mount, so
 * nothing is ever typed twice.
 *
 * COLOUR CONTRACT. SVI orange (#FF9F0A) is 2.33:1 on white — a graphic
 * accent only, never readable copy. Readable accents use `text-action`
 * (#1D4ED8, 8.59:1).
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";
import {
  pendingIntakeQuery,
  setPendingIntake,
} from "@/lib/analyze/pending-intake";
import {
  cohortBandsForRun,
  runById,
} from "@/components/marketing/homepage/sample-runs";
import { heroTierChips } from "@/components/marketing/homepage/tiers";

export function HeroSection() {
  const router = useRouter();
  const tiers = heroTierChips();
  const preview = runById("mvp");
  const previewBands = cohortBandsForRun(preview).filter(
    (b) => b.measured !== null,
  );

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    // Park the whole submission — including a dropped File, which cannot be
    // encoded in a URL — then navigate. /analyze claims it on mount and starts
    // the analysis immediately, so nothing is ever typed twice.
    setPendingIntake(payload);
    router.push(pendingIntakeQuery(payload));
  }

  return (
    <section
      id="top"
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-line-subtle bg-surface px-4 pb-12 pt-10 sm:pb-14 sm:pt-14"
    >
      {/* Soft brand wash behind the omnibox — decorative only, sits under
          the rotating ring without competing with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 42%, color-mix(in srgb, var(--color-svi-500) 8%, transparent) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-5 text-center">
        <p className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-sunken px-3 py-1 text-xs font-medium text-muted">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-svi-500" />
          Valuation, scoring and equity for Australian startups
        </p>

        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight text-primary sm:text-5xl lg:text-[3.5rem]"
          style={{ animationDelay: "40ms" }}
        >
          See your company{" "}
          <span className="text-action">the way an investor will.</span>
        </h1>

        <p
          className="animate-fade-in-up max-w-2xl text-balance text-base leading-relaxed text-secondary sm:text-lg"
          style={{ animationDelay: "80ms" }}
        >
          Paste a deck, a link, or three sentences. Your score, valuation range
          and next move appear on screen straight away — free, no account.
        </p>

        {/* The primary action. SmartIntake wraps itself in
            AnimatedSearchFrame, so the rotating ring lives here. */}
        <div
          className="animate-fade-in-up w-full max-w-3xl"
          style={{ animationDelay: "120ms" }}
        >
          <SmartIntake onSubmit={handleSmartSubmit} />
        </div>

        {/* The ladder, in one row. Price first because that is the thing a
            visitor is deciding about before they type anything; the gist
            second because a price with nothing attached is not an offer.
            Each links into the full ladder further down the page. */}
        <ol
          className="animate-fade-in-up grid w-full max-w-3xl gap-2 text-left sm:grid-cols-3"
          style={{ animationDelay: "150ms" }}
          aria-label="What it costs, and what you get"
          data-testid="hero-tier-strip"
        >
          {tiers.map((tier) => (
            <li key={tier.id}>
              <a
                href="#tiers"
                className="flex h-full flex-col gap-0.5 rounded-xl border border-line-subtle bg-surface-sunken px-3.5 py-2.5 transition-colors duration-200 hover:border-line hover:bg-surface-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <span className="font-sans text-sm font-semibold tabular-nums text-primary">
                  {tier.label}
                </span>
                <span className="text-xs leading-snug text-secondary">
                  {tier.gist}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </div>

      {/* Proof strip — a real anonymised MVP-stage run, drawn the same way
          every chart further down the page is drawn. */}
      <div
        className="animate-fade-in-up relative z-10 mx-auto mt-8 w-full max-w-3xl"
        style={{ animationDelay: "220ms" }}
      >
        <div className="rounded-2xl border border-line-subtle bg-surface-sunken px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-baseline gap-x-5 gap-y-2">
            <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
              A recent run
            </p>
            <p className="flex items-baseline gap-2">
              <span className="font-sans text-3xl font-semibold leading-none text-primary">
                {preview.sviScore}
              </span>
              <span className="text-xs font-medium uppercase tracking-wider text-muted">
                out of 100
              </span>
            </p>
            <p className="font-mono text-sm text-secondary tabular-nums">
              {preview.valuationLowLabel}
              <span className="mx-1 text-muted">–</span>
              {preview.valuationHighLabel}
            </p>
            <Link
              href="/reports/samples"
              className="ml-auto inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
            >
              See the report
              <ArrowRight size={14} aria-hidden />
            </Link>
          </div>

          <ul
            role="list"
            className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-2"
          >
            {previewBands.map((b) => (
              <li key={b.key} className="flex items-center gap-3">
                <span className="w-32 shrink-0 text-xs text-secondary">
                  {b.label}
                </span>
                <span className="relative mb-2 h-1.5 flex-1">
                  <span className="block h-full w-full overflow-hidden rounded-full bg-surface-hover">
                    <span
                      className="block h-full rounded-full bg-action"
                      style={{ width: `${b.measured}%` }}
                    />
                  </span>
                  {/* The cohort tick hangs below the bar: inside the fill it
                      is 1.13:1 and invisible. */}
                  <span
                    aria-hidden
                    className="absolute -bottom-1.5 h-1.5 w-px bg-line-strong"
                    style={{ left: `${b.avg}%` }}
                  />
                </span>
                <span className="w-6 shrink-0 text-right font-mono text-xs text-primary tabular-nums">
                  {b.measured}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-sm leading-snug text-muted">
            Two founders, 40 paying pilots, no round raised yet. The hairline
            on each bar is the Australian average at the same stage.
          </p>
        </div>
      </div>
    </section>
  );
}
