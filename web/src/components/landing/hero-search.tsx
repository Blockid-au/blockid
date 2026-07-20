"use client";

/**
 * HeroSearch — fintech / unicorn-SaaS hero for the BlockID.au homepage v2.
 *
 * Layout (top → bottom, on purpose):
 *   1. Search input      ← THE first thing after the nav (user directive)
 *   2. Primary CTA
 *   3. Quick-pick chips  (Canva / Atlassian / Aussie Broadband)
 *   4. H1 headline + subhead (visually secondary, semantically primary)
 *   5. Reassurance strip ("Free · No signup · 30-second result")
 *
 * The search field IS the hook. Wordmark lives in the nav; there is no
 * separate wordmark inside the hero. Zero pricing, zero segments, zero FAQ.
 *
 * Submit:
 *   - Non-empty query → /svi?query=<encoded>
 *   - Empty          → /svi (route being created by a peer agent)
 *
 * A11y:
 *   - <form role="search" aria-label="Startup search">
 *   - Focus ring: 3px solid rgba(34,211,238,0.4) + soft outer glow.
 *     Contrast of ring vs deep-navy bg > 3:1 (WCAG 2.1 AA non-text).
 *   - Mic icon is a stub (disabled, labelled "coming soon").
 *   - No autofocus on mount to avoid mobile keyboard shove.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Search, X } from "lucide-react";
import { usePricingExperiment } from "@/lib/hooks/use-pricing-experiment";

const SEARCH_ROUTE = "/svi";
const HERO_CTA_CONTROL_COPY = "Search & Score";
const HERO_CTA_EXPERIMENT = "hero-cta-2026-07";

interface HeroCtaPayload {
  copy?: string;
}

const QUICK_PICKS: readonly string[] = [
  "Canva",
  "Atlassian",
  "Aussie Broadband",
];

export function HeroSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  // hero-cta-2026-07 (T0121/T0123): variant copy on the primary CTA.
  // Fall back to the historical "Search & Score" copy on loading / 404
  // so a broken experiment never blanks the button.
  const { payload: ctaPayload, recordConversion: recordHeroCtaConversion } =
    usePricingExperiment<HeroCtaPayload>(HERO_CTA_EXPERIMENT);
  const ctaCopy =
    typeof ctaPayload?.copy === "string" && ctaPayload.copy.trim().length > 0
      ? ctaPayload.copy
      : HERO_CTA_CONTROL_COPY;

  const submitDestination = useCallback((raw: string) => {
    const query = raw.trim();
    if (query.length === 0) {
      return SEARCH_ROUTE;
    }
    return `${SEARCH_ROUTE}?query=${encodeURIComponent(query)}`;
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      recordHeroCtaConversion();
      router.push(submitDestination(value));
    },
    [recordHeroCtaConversion, router, submitDestination, value],
  );

  const onChipClick = useCallback(
    (chip: string) => {
      setValue(chip);
      recordHeroCtaConversion();
      router.push(submitDestination(chip));
    },
    [recordHeroCtaConversion, router, submitDestination],
  );

  const clearInput = useCallback(() => {
    setValue("");
    inputRef.current?.focus();
  }, []);

  const hasValue = useMemo(() => value.trim().length > 0, [value]);

  return (
    <section
      aria-labelledby="hero-search-heading"
      className="fintech-hero-glow relative flex min-h-[90vh] w-full items-start justify-center px-4 pb-16 pt-12 md:min-h-[75vh] md:pt-24"
    >
      <div className="fintech-enter mx-auto flex w-full max-w-2xl flex-col items-center gap-6">
        {/* 1. Search field — AT THE TOP */}
        <form
          role="search"
          aria-label="Startup search"
          onSubmit={onSubmit}
          className="flex w-full flex-col items-center gap-4"
        >
          <label htmlFor="hero-search-input" className="sr-only">
            Enter a company name, website, or your idea
          </label>

          <div className="group relative w-full">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-500"
            />
            <input
              ref={inputRef}
              id="hero-search-input"
              name="query"
              type="search"
              inputMode="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder="Enter a company name, website, or your idea"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-16 w-full rounded-2xl border border-white/10 bg-white pl-12 pr-24 text-base text-slate-900 placeholder:text-slate-500 shadow-[0_10px_40px_-12px_rgba(0,0,0,0.6),0_0_0_1px_rgba(148,163,184,0.08)] transition-all duration-200 hover:shadow-[0_12px_44px_-10px_rgba(34,211,238,0.35),0_0_0_1px_rgba(34,211,238,0.25)] focus:outline-none focus:shadow-[0_0_0_3px_var(--fintech-focus-ring-soft),0_14px_50px_-10px_rgba(34,211,238,0.5)] focus-visible:outline-none"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {hasValue ? (
                <button
                  type="button"
                  onClick={clearInput}
                  aria-label="Clear search"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full text-slate-600 transition-colors duration-200 hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                disabled
                aria-label="Voice — coming soon"
                title="Voice — coming soon"
                className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-full text-slate-400 opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)]"
              >
                <Mic aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-[var(--fintech-accent)] px-8 text-sm font-semibold text-[var(--fintech-bg-primary)] shadow-[0_8px_24px_-8px_rgba(34,211,238,0.6)] transition-all duration-200 hover:bg-[var(--fintech-accent-hover)] hover:shadow-[0_12px_32px_-8px_rgba(34,211,238,0.7)] hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)] active:translate-y-0"
          >
            {ctaCopy}
          </button>
          <p className="text-[11px] text-[var(--fintech-ink-muted)]/80">
            Get the full report by email
          </p>
        </form>

        {/* 2. Quick-pick chips */}
        <div
          role="group"
          aria-label="Popular startups"
          className="flex flex-wrap items-center justify-center gap-2"
        >
          {QUICK_PICKS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChipClick(chip)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm font-medium text-[var(--fintech-ink-muted)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--fintech-accent)]/60 hover:bg-white/[0.08] hover:text-[var(--fintech-ink)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--fintech-focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--fintech-bg-primary)]"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* 3. Headline + subhead — semantic H1, visually secondary */}
        <div className="mt-4 flex flex-col items-center gap-3 text-center">
          <h1
            id="hero-search-heading"
            className="font-display max-w-xl text-balance text-2xl font-semibold tracking-tight text-[var(--fintech-ink)] sm:text-3xl"
          >
            Investor-ready score in{" "}
            <span className="bg-gradient-to-r from-[var(--fintech-accent)] to-[var(--fintech-accent-hot)] bg-clip-text text-transparent">
              30 seconds
            </span>
          </h1>
          <p className="max-w-lg text-balance text-base leading-relaxed text-[var(--fintech-ink-muted)]">
            Type a company name, website, or your idea and get an SVI grade
            backed by 13 real-world criteria. Free. No signup.
          </p>
        </div>

        {/* 4. Reassurance strip */}
        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[var(--fintech-ink-muted)]/80">
          Free &middot; No signup &middot; 30-second result
        </p>
      </div>
    </section>
  );
}

export default HeroSearch;
