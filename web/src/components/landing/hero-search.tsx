"use client";

/**
 * HeroSearch — Google-style search-box hero for the BlockID.au homepage v2.
 *
 * The hero is the entire fold. It carries a single wordmark, a single-line
 * tagline (English + optional secondary Vietnamese line), a centered
 * pill-shaped search field, three quick-pick chips, and a small
 * "Free · No signup · 30-second result" reassurance strip. Zero pricing,
 * zero segments, zero FAQ.
 *
 * Submit behaviour:
 *  - If the input is non-empty, the form navigates to
 *    `/svi?query=<encoded>` when a /svi route ships. Neither /svi nor
 *    /search exist yet in web/src/app, so we currently route to
 *    `/pricing?utm_source=hero_search` as the graceful fallback.
 *
 * A11y:
 *  - <form role="search" aria-label="Startup search">
 *  - focus-visible rings meet 3:1 against navy (brand-cyan #22D3EE).
 *  - Mic icon is a stub (disabled, aria-label="Voice search — coming soon").
 *  - No autofocus on mount to avoid mobile keyboard shove.
 */

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mic, Search, X } from "lucide-react";

const SEARCH_DESTINATION = "/pricing?utm_source=hero_search";
const QUICK_PICKS: readonly string[] = [
  "Try Canva",
  "Try Atlassian",
  "Try Aussie Broadband",
];

function pickToQuery(chip: string): string {
  // "Try Canva" -> "Canva"
  return chip.replace(/^Try\s+/, "").trim();
}

export function HeroSearch() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState("");

  const submitDestination = useCallback((raw: string) => {
    const query = raw.trim();
    if (query.length === 0) {
      return SEARCH_DESTINATION;
    }
    const separator = SEARCH_DESTINATION.includes("?") ? "&" : "?";
    return `${SEARCH_DESTINATION}${separator}query=${encodeURIComponent(query)}`;
  }, []);

  const onSubmit = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      router.push(submitDestination(value));
    },
    [router, submitDestination, value],
  );

  const onChipClick = useCallback(
    (chip: string) => {
      const query = pickToQuery(chip);
      setValue(query);
      router.push(submitDestination(query));
    },
    [router, submitDestination],
  );

  const clearInput = useCallback(() => {
    setValue("");
    inputRef.current?.focus();
  }, []);

  const hasValue = useMemo(() => value.trim().length > 0, [value]);

  return (
    <section
      aria-labelledby="hero-search-heading"
      className="relative flex min-h-[85vh] w-full items-start justify-center px-4 pb-16 pt-16 md:min-h-[70vh] md:pt-20"
    >
      <div
        className="mx-auto flex w-full max-w-2xl flex-col items-center gap-8 opacity-0 [animation:hero-enter_200ms_ease-out_forwards]"
      >
        {/* Wordmark + tagline */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-baseline gap-1 text-4xl font-semibold tracking-tight text-brand-ink sm:text-5xl">
            BlockID<span className="text-brand-cyan">.au</span>
          </div>
          <h1
            id="hero-search-heading"
            className="max-w-xl text-balance text-base font-normal text-brand-ink-muted sm:text-lg"
          >
            Search any startup. Get an investor-ready score in 30 seconds.
          </h1>
          <p
            lang="vi"
            className="text-sm text-brand-ink/60"
          >
            Tim bat ky startup nao. Nhan diem so san sang goi von trong 30 giay.
          </p>
        </div>

        {/* Search field */}
        <form
          role="search"
          aria-label="Startup search"
          onSubmit={onSubmit}
          className="flex w-full flex-col items-center gap-4"
        >
          <label htmlFor="hero-search-input" className="sr-only">
            Enter a company name, ABN, or startup URL
          </label>
          <div className="group relative w-full">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-5 top-1/2 h-5 w-5 -translate-y-1/2 text-brand-navy/60"
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
              placeholder="Enter a company name, ABN, or startup URL"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className="h-14 w-full rounded-full border border-brand-navy/10 bg-white/95 pl-12 pr-24 text-base text-brand-navy placeholder:text-brand-navy/60 shadow-[0_1px_6px_rgba(15,23,42,0.35)] transition-all duration-200 hover:shadow-[0_1px_10px_rgba(34,211,238,0.25)] focus:border-brand-cyan focus:bg-white focus:outline-none focus:shadow-[0_2px_14px_rgba(34,211,238,0.45)] focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            />
            <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1">
              {hasValue ? (
                <button
                  type="button"
                  onClick={clearInput}
                  aria-label="Clear search"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full text-brand-navy/70 transition-colors duration-200 hover:bg-brand-navy/5 hover:text-brand-navy focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
                >
                  <X aria-hidden="true" className="h-4 w-4" />
                </button>
              ) : null}
              <button
                type="button"
                disabled
                aria-label="Voice search — coming soon"
                title="Voice search — coming soon"
                className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full text-brand-cyan/70 opacity-70 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan"
              >
                <Mic aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="inline-flex h-11 items-center justify-center rounded-full bg-brand-cyan px-6 text-sm font-semibold text-brand-navy shadow-sm transition-colors duration-200 hover:bg-brand-blue-bright focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
          >
            Search &amp; Score
          </button>
        </form>

        {/* Quick-pick chips */}
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
              className="inline-flex h-9 items-center justify-center rounded-full border border-brand-ink/15 bg-white/5 px-4 text-sm font-medium text-brand-ink-muted transition-colors duration-200 hover:border-brand-cyan/60 hover:bg-brand-cyan/10 hover:text-brand-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-cyan focus-visible:ring-offset-2 focus-visible:ring-offset-brand-navy"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Reassurance strip */}
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-brand-ink/60">
          Free &middot; No signup &middot; 30-second result
        </p>
      </div>

      <style jsx>{`
        @keyframes hero-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          div[class*="hero-enter"] {
            animation: none;
            opacity: 1;
            transform: none;
          }
        }
      `}</style>
    </section>
  );
}

export default HeroSearch;
