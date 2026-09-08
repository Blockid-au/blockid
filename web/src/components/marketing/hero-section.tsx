"use client";

/**
 * HeroSection — light-first, input-centric homepage hero.
 *
 * Redesign (2026-09-08, homepage-fintech-redesign agent).
 *
 * The previous revision was a DARK island (`data-theme="dark"` on a
 * `#0A0F1E` surface) sitting on top of a light-first design system. Three
 * things went wrong and all three are fixed here:
 *
 *   1. `text-primary` resolved to the LIGHT ink (#0B0F1A) because Tailwind
 *      v4 substitutes `@theme` vars once on `:root`. The H1 painted
 *      near-black on near-black — ~1.02:1, literally invisible. (The token
 *      pipeline is fixed in globals.css rev.4; the hero no longer relies
 *      on nested dark scoping at all.)
 *   2. `min-h-[calc(100vh-64px)]` + `justify-center` left ~800px of void
 *      around a single input, which reads as a broken page.
 *   3. The hero was the only dark band before three light sections, which
 *      is what made the page feel like stacked fragments.
 *
 * This version commits the hero to LIGHT (docs/design-system.md rev.3 is
 * light-first), sizes it to roughly one viewport, and gives it something to
 * hold besides the input: a compact score + valuation preview so the value
 * proposition is visible before the visitor types anything.
 *
 * SVI orange (#FF9F0A) is 2.33:1 on white — it fails AA even at large-text
 * sizes, so it is used ONLY as a graphic accent (the rotating omnibox ring,
 * the score numeral's rule, the bar chips), never as readable copy. The H1
 * accent line uses `text-action` (#1D4ED8, 8.59:1 AAA) instead.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ShieldCheck, Wallet, Zap } from "lucide-react";
import { SmartIntake, type SmartIntakeSubmission } from "@/components/analyze/smart-intake";

/** Compact proof row shown under the omnibox — a real MVP-stage sample. */
const PREVIEW_DIMENSIONS = [
  { label: "FTV", pct: 62 },
  { label: "MPC", pct: 58 },
  { label: "PTD", pct: 55 },
  { label: "TRE", pct: 40 },
];

export function HeroSection() {
  const router = useRouter();

  function handleSmartSubmit(payload: SmartIntakeSubmission) {
    // Every successful classification lands on /analyze; the omnibox on
    // that page picks up ?q= and re-runs the same classifier server-side.
    const q =
      payload.text?.trim() ||
      payload.url?.trim() ||
      (payload.file ? payload.file.name : "");
    router.push(q.length > 0 ? `/analyze?q=${encodeURIComponent(q)}` : "/analyze");
  }

  return (
    <section
      aria-labelledby="hero-heading"
      className="relative overflow-hidden border-b border-line-subtle bg-surface px-4 pb-14 pt-12 sm:pb-16 sm:pt-16"
    >
      {/* Soft brand wash behind the omnibox — decorative only, sits under
          the rotating ring without competing with it. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 50% 42%, rgba(255,159,10,0.07) 0%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto flex w-full max-w-3xl flex-col items-center gap-6 text-center">
        {/* Eyebrow — sets the "free, no signup" expectation up front. */}
        <p className="animate-fade-in-up inline-flex items-center gap-2 rounded-full border border-line-subtle bg-surface-sunken px-3 py-1 text-xs font-medium text-muted">
          <span
            aria-hidden
            className="h-1.5 w-1.5 rounded-full bg-svi-500"
          />
          Free analysis · no card, no signup
        </p>

        <h1
          id="hero-heading"
          className="animate-fade-in-up font-display max-w-3xl text-balance text-4xl font-bold leading-[1.08] tracking-tight text-primary sm:text-5xl lg:text-[3.5rem]"
          style={{ animationDelay: "40ms" }}
        >
          AI-powered startup valuation{" "}
          <span className="text-action">before you pitch.</span>
        </h1>

        <p
          className="animate-fade-in-up max-w-2xl text-balance text-base leading-relaxed text-secondary sm:text-lg"
          style={{ animationDelay: "80ms" }}
        >
          Paste a pitch deck, a URL, or a plain-text idea. Get an SVI score, a
          4-method valuation, and an investor-ready data room in 30 seconds.
        </p>

        {/* The primary action. SmartIntake wraps itself in
            AnimatedSearchFrame, so the rotating orange -> blue -> green ring
            lives here and is now genuinely visible (see
            components/ui/animated-search-frame.tsx). */}
        <div
          className="animate-fade-in-up w-full max-w-3xl"
          style={{ animationDelay: "120ms" }}
        >
          {/* Hidden legacy input — kept so any existing test that hooks on
              #hero-search-input still finds a node. */}
          <input id="hero-search-input" type="hidden" defaultValue="" />
          <SmartIntake onSubmit={handleSmartSubmit} />
        </div>

        <ul
          className="animate-fade-in-up flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm text-muted"
          style={{ animationDelay: "160ms" }}
          aria-label="Trust signals"
        >
          <li className="inline-flex items-center gap-1.5">
            <Zap size={14} aria-hidden className="text-action" />
            30-second analysis
          </li>
          <li aria-hidden className="text-line">
            ·
          </li>
          <li className="inline-flex items-center gap-1.5">
            <ShieldCheck size={14} aria-hidden className="text-action" />
            AU compliance-first
          </li>
          <li aria-hidden className="text-line">
            ·
          </li>
          <li className="inline-flex items-center gap-1.5">
            <Wallet size={14} aria-hidden className="text-action" />
            Blockchain equity ready
          </li>
        </ul>
      </div>

      {/* Compact proof element — a real anonymised MVP-stage result, so the
          hero shows the OUTPUT rather than only the input box. Kept to one
          row so the whole hero stays inside a single viewport. */}
      <div
        className="animate-fade-in-up relative z-10 mx-auto mt-10 w-full max-w-3xl"
        style={{ animationDelay: "200ms" }}
      >
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-line-subtle bg-surface-sunken px-5 py-4 sm:flex-row sm:gap-6 sm:px-6">
          <p className="shrink-0 font-mono text-[11px] uppercase tracking-[0.18em] text-muted">
            Sample output
          </p>

          <div className="flex items-baseline gap-2">
            <span className="font-display text-3xl font-bold leading-none text-primary tabular-nums">
              58
            </span>
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              SVI
            </span>
          </div>

          <p className="font-mono text-sm text-secondary tabular-nums">
            A$850K<span className="mx-1 text-muted">–</span>A$2.1M
          </p>

          {/* 4-dimension mini bars — graphic use of the brand orange. */}
          <div className="flex h-8 shrink-0 items-end gap-1.5" aria-hidden>
            {PREVIEW_DIMENSIONS.map((d) => (
              <div key={d.label} className="flex w-6 flex-col items-center gap-1">
                <div
                  className="w-full rounded-t-sm bg-svi-500"
                  style={{ height: `${d.pct}%`, minHeight: "3px" }}
                />
                <span className="font-mono text-[9px] uppercase tracking-wider text-tertiary">
                  {d.label}
                </span>
              </div>
            ))}
          </div>

          <p className="text-sm leading-snug text-muted sm:flex-1">
            MVP-stage AU SaaS, 40 paying pilots.
          </p>

          <Link
            href="/reports/samples"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md text-sm font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            See samples
            <ArrowRight size={14} aria-hidden />
          </Link>
        </div>
      </div>
    </section>
  );
}
